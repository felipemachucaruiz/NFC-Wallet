import { Router, type IRouter, type Request, type Response } from "express";
import { hashPassword } from "../lib/bcryptWorker";
import crypto, { randomUUID } from "crypto";
import multer from "multer";
import { Storage } from "@google-cloud/storage";
import { db, eventsTable, eventDaysTable, usersTable, promoterCompaniesTable, braceletsTable, transactionLogsTable, transactionLineItemsTable, merchantsTable, locationsTable, attendeeRefundRequestsTable, topUpsTable, venuesTable, convertToCOP, getExchangeRatesForDisplay } from "@workspace/db";
import { eq, sql, and, ilike, or, count, sum, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireRole";
import { uploadObject, isBucketConfigured } from "../lib/objectStorage";
import { z } from "zod";

function generateSlug(name: string, startsAt?: string | Date | null): string {
  let base = name
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (startsAt) {
    const year = new Date(startsAt).getFullYear();
    if (!base.includes(String(year))) {
      base = `${base}-${year}`;
    }
  }
  return base || "event";
}

async function ensureUniqueSlug(slug: string, excludeId?: string): Promise<string> {
  let candidate = slug;
  let suffix = 0;
  while (true) {
    const conditions = [eq(eventsTable.slug, candidate)];
    if (excludeId) conditions.push(sql`${eventsTable.id} != ${excludeId}`);
    const [existing] = await db.select({ id: eventsTable.id }).from(eventsTable).where(and(...conditions));
    if (!existing) return candidate;
    suffix++;
    candidate = `${slug}-${suffix}`;
  }
}

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
} as ConstructorParameters<typeof Storage>[0]);

const eventImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

export async function getEventInventoryMode(eventId: string): Promise<"location_based" | "centralized_warehouse"> {
  const [event] = await db
    .select({ inventoryMode: eventsTable.inventoryMode })
    .from(eventsTable)
    .where(eq(eventsTable.id, eventId));
  return event?.inventoryMode ?? "location_based";
}

function generateHmacSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}

function generateDesfireAesKey(): string {
  return crypto.randomBytes(16).toString("hex");
}

function generateUltralightCDesKey(): string {
  return crypto.randomBytes(16).toString("hex");
}

function verifyDesfireTransactionMac(
  aesKey: string,
  uid: string,
  counter: number,
  newBalance: number,
  mac: string,
): boolean {
  try {
    const keyBuf = Buffer.from(aesKey, "hex");
    const message = `${uid}:${counter}:${newBalance}`;
    const hmac = crypto.createHmac("sha256", keyBuf).update(message).digest("hex");
    return hmac.slice(0, 16) === mac.toLowerCase();
  } catch {
    return false;
  }
}

const router: IRouter = Router();

const createEventSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  venueAddress: z.string().optional(),
  currencyCode: z.enum(["COP", "MXN", "CLP", "ARS", "PEN", "UYU", "BOB", "BRL", "USD"]).optional().default("COP"),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  refundDeadline: z.string().optional(),
  platformCommissionRate: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  capacity: z.number().int().positive().optional(),
  promoterCompanyId: z.string().optional(),
  pulepId: z.string().optional(),
  nfcChipType: z.enum(["ntag_21x", "mifare_classic", "desfire_ev3", "mifare_ultralight_c"]).optional(),
  allowedNfcTypes: z.array(z.enum(["ntag_21x", "mifare_classic", "desfire_ev3", "mifare_ultralight_c"])).min(1).optional(),
  offlineSyncLimit: z.number().int().positive().optional(),
  maxOfflineSpendPerBracelet: z.number().int().positive().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  coverImageUrl: z.string().url().optional(),
  flyerImageUrl: z.string().url().optional(),
  longDescription: z.string().optional(),
  category: z.string().max(100).optional(),
  raceConfig: z.object({ sizes: z.array(z.string()) }).nullable().optional(),
  cityId: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  minAge: z.number().int().min(0).nullable().optional(),
  ticketingEnabled: z.boolean().optional(),
  nfcBraceletsEnabled: z.boolean().optional(),
  salesChannel: z.enum(["online", "door", "both"]).optional(),
  eventAdmin: z.object({
    email: z.string().email(),
    password: z.string().min(6),
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
  }).optional(),
});

const updateEventSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  venueAddress: z.string().optional(),
  currencyCode: z.enum(["COP", "MXN", "CLP", "ARS", "PEN", "UYU", "BOB", "BRL", "USD"]).optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  refundDeadline: z.string().nullable().optional(),
  active: z.boolean().optional(),
  platformCommissionRate: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  capacity: z.number().int().positive().nullable().optional(),
  promoterCompanyId: z.string().nullable().optional(),
  pulepId: z.string().nullable().optional(),
  inventoryMode: z.enum(["location_based", "centralized_warehouse"]).optional(),
  nfcChipType: z.enum(["ntag_21x", "mifare_classic", "desfire_ev3", "mifare_ultralight_c"]).optional(),
  allowedNfcTypes: z.array(z.enum(["ntag_21x", "mifare_classic", "desfire_ev3", "mifare_ultralight_c"])).min(1).optional(),
  offlineSyncLimit: z.number().int().positive().optional(),
  maxOfflineSpendPerBracelet: z.number().int().positive().optional(),
  bankPaymentMethods: z.array(z.string()).min(1).optional(),
  boxOfficePaymentMethods: z.array(z.string()).min(1).optional(),
  bankMinTopup: z.number().int().min(0).optional(),
  braceletActivationFee: z.number().int().min(0).optional(),
  ultralightCDesKey: z.string().regex(/^[0-9a-fA-F]{32}$/, "ultralightCDesKey must be 32 hex characters (16 bytes)").optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  coverImageUrl: z.string().nullable().optional(),
  flyerImageUrl: z.string().nullable().optional(),
  longDescription: z.string().nullable().optional(),
  descriptionEn: z.string().nullable().optional(),
  category: z.string().max(100).nullable().optional(),
  raceConfig: z.object({ sizes: z.array(z.string()) }).nullable().optional(),
  cityId: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  minAge: z.number().int().min(0).nullable().optional(),
  ticketingEnabled: z.boolean().optional(),
  nfcBraceletsEnabled: z.boolean().optional(),
  salesChannel: z.enum(["online", "door", "both"]).optional(),
  saleStartsAt: z.string().nullable().optional(),
  saleEndsAt: z.string().nullable().optional(),
  vimeoUrl: z.string().max(500).nullable().optional(),
  floatingGraphics: z.array(z.object({ url: z.string(), opacity: z.number().min(0).max(1) })).nullable().optional(),
  raceNumberStart: z.number().int().positive().nullable().optional(),
  raceNumberEnd: z.number().int().positive().nullable().optional(),
});

const SAFE_EVENT_FIELDS = {
  id: eventsTable.id,
  name: eventsTable.name,
  description: eventsTable.description,
  venueAddress: eventsTable.venueAddress,
  startsAt: eventsTable.startsAt,
  endsAt: eventsTable.endsAt,
  refundDeadline: eventsTable.refundDeadline,
  active: eventsTable.active,
  currencyCode: eventsTable.currencyCode,
  capacity: eventsTable.capacity,
  platformCommissionRate: eventsTable.platformCommissionRate,
  promoterCompanyId: eventsTable.promoterCompanyId,
  promoterCompanyName: promoterCompaniesTable.companyName,
  pulepId: eventsTable.pulepId,
  inventoryMode: eventsTable.inventoryMode,
  nfcChipType: eventsTable.nfcChipType,
  allowedNfcTypes: eventsTable.allowedNfcTypes,
  offlineSyncLimit: eventsTable.offlineSyncLimit,
  maxOfflineSpendPerBracelet: eventsTable.maxOfflineSpendPerBracelet,
  bankPaymentMethods: eventsTable.bankPaymentMethods,
  boxOfficePaymentMethods: eventsTable.boxOfficePaymentMethods,
  bankMinTopup: eventsTable.bankMinTopup,
  braceletActivationFee: eventsTable.braceletActivationFee,
  latitude: eventsTable.latitude,
  longitude: eventsTable.longitude,
  coverImageUrl: eventsTable.coverImageUrl,
  flyerImageUrl: eventsTable.flyerImageUrl,
  longDescription: eventsTable.longDescription,
  descriptionEn: eventsTable.descriptionEn,
  category: eventsTable.category,
  raceConfig: eventsTable.raceConfig,
  cityId: eventsTable.cityId,
  tags: eventsTable.tags,
  minAge: eventsTable.minAge,
  ticketingEnabled: eventsTable.ticketingEnabled,
  nfcBraceletsEnabled: eventsTable.nfcBraceletsEnabled,
  salesChannel: eventsTable.salesChannel,
  saleStartsAt: eventsTable.saleStartsAt,
  saleEndsAt: eventsTable.saleEndsAt,
  floatingGraphicUrl: eventsTable.floatingGraphicUrl,
  floatingGraphics: eventsTable.floatingGraphics,
  vimeoUrl: eventsTable.vimeoUrl,
  raceNumberStart: eventsTable.raceNumberStart,
  raceNumberEnd: eventsTable.raceNumberEnd,
  createdAt: eventsTable.createdAt,
  updatedAt: eventsTable.updatedAt,
};

router.get("/events", requireAuth, async (req: Request, res: Response) => {
  const user = req.user!;
  const promoterCompanyIdFilter = req.query.promoterCompanyId as string | undefined;

  if (user.role === "event_admin") {
    const userCompanyId = (user as { promoterCompanyId?: string | null }).promoterCompanyId;
    if (userCompanyId) {
      const companyEvents = await db
        .select(SAFE_EVENT_FIELDS)
        .from(eventsTable)
        .leftJoin(promoterCompaniesTable, eq(eventsTable.promoterCompanyId, promoterCompaniesTable.id))
        .where(eq(eventsTable.promoterCompanyId, userCompanyId));
      res.json({ events: companyEvents });
      return;
    }
    if (!user.eventId) {
      res.json({ events: [] });
      return;
    }
    const [event] = await db
      .select(SAFE_EVENT_FIELDS)
      .from(eventsTable)
      .leftJoin(promoterCompaniesTable, eq(eventsTable.promoterCompanyId, promoterCompaniesTable.id))
      .where(eq(eventsTable.id, user.eventId));
    res.json({ events: event ? [event] : [] });
    return;
  }

  const baseQuery = db
    .select(SAFE_EVENT_FIELDS)
    .from(eventsTable)
    .leftJoin(promoterCompaniesTable, eq(eventsTable.promoterCompanyId, promoterCompaniesTable.id));

  const events = promoterCompanyIdFilter
    ? await baseQuery.where(eq(eventsTable.promoterCompanyId, promoterCompanyIdFilter))
    : await baseQuery;

  res.json({ events });
});

router.get("/events/:eventId", requireAuth, async (req: Request, res: Response) => {
  const eventId = req.params.eventId as string;
  const user = req.user!;

  if (user.role === "event_admin") {
    const userCompanyId = (user as { promoterCompanyId?: string | null }).promoterCompanyId;
    const ownsSingleEvent = user.eventId === eventId;
    if (!userCompanyId && !ownsSingleEvent) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
    if (userCompanyId) {
      const [eventForCompany] = await db
        .select({ promoterCompanyId: eventsTable.promoterCompanyId })
        .from(eventsTable)
        .where(eq(eventsTable.id, eventId));
      if (!eventForCompany || eventForCompany.promoterCompanyId !== userCompanyId) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
    }
  }

  const [row] = await db
    .select({
      ...SAFE_EVENT_FIELDS,
      hasHmacSecret: eventsTable.hmacSecret,
      hasDesfireKey: eventsTable.desfireAesKey,
      hasUltralightCKey: eventsTable.ultralightCDesKey,
    })
    .from(eventsTable)
    .leftJoin(promoterCompaniesTable, eq(eventsTable.promoterCompanyId, promoterCompaniesTable.id))
    .where(eq(eventsTable.id, eventId));
  if (!row) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  const { hasHmacSecret, hasDesfireKey, hasUltralightCKey, ...rest } = row;
  res.json({ ...rest, hasHmacSecret: !!hasHmacSecret, hasDesfireKey: !!hasDesfireKey, hasUltralightCKey: !!hasUltralightCKey });
});

router.post("/events", requireRole("admin"), async (req: Request, res: Response) => {
  const parsed = createEventSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { name, description, venueAddress, currencyCode, startsAt, endsAt, refundDeadline, platformCommissionRate, capacity, promoterCompanyId, pulepId, nfcChipType, allowedNfcTypes, offlineSyncLimit, maxOfflineSpendPerBracelet, latitude, longitude, coverImageUrl, flyerImageUrl, longDescription, category, raceConfig: createRaceConfig, cityId: createCityId, tags, minAge, ticketingEnabled, nfcBraceletsEnabled, salesChannel, eventAdmin } = parsed.data;

  if (refundDeadline && endsAt) {
    const deadlineDate = new Date(refundDeadline);
    const endsDate = new Date(endsAt);
    const minDeadline = new Date(endsDate.getTime() + 15 * 24 * 60 * 60 * 1000);
    if (deadlineDate < minDeadline) {
      res.status(400).json({ error: "Refund deadline must be at least 15 days after event end date" });
      return;
    }
  }

  // Pre-validate event admin email uniqueness BEFORE inserting event (atomicity)
  let normalizedAdminEmail: string | null = null;
  let adminPasswordHash: string | null = null;
  if (eventAdmin) {
    normalizedAdminEmail = eventAdmin.email.toLowerCase().trim();
    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, normalizedAdminEmail));
    if (existing) {
      res.status(409).json({ error: "Event admin email already registered" });
      return;
    }
    adminPasswordHash = await hashPassword(eventAdmin.password, 10);
  }

  const hmacSecret = generateHmacSecret();
  const slug = await ensureUniqueSlug(generateSlug(name, startsAt));

  // Use a transaction to create event + admin atomically
  const result = await db.transaction(async (tx) => {
    const [event] = await tx
      .insert(eventsTable)
      .values({
        name,
        slug,
        description,
        venueAddress,
        currencyCode: currencyCode ?? "COP",
        startsAt: startsAt ? new Date(startsAt) : undefined,
        endsAt: endsAt ? new Date(endsAt) : undefined,
        refundDeadline: refundDeadline ? new Date(refundDeadline) : undefined,
        platformCommissionRate: platformCommissionRate ?? "0",
        capacity: capacity ?? null,
        promoterCompanyId: promoterCompanyId ?? null,
        pulepId: pulepId ?? null,
        nfcChipType: nfcChipType ?? "ntag_21x",
        allowedNfcTypes: allowedNfcTypes ?? [nfcChipType ?? "ntag_21x"],
        hmacSecret,
        offlineSyncLimit: offlineSyncLimit ?? 500000,
        maxOfflineSpendPerBracelet: maxOfflineSpendPerBracelet ?? 200000,
        ...(latitude !== undefined && latitude !== null && { latitude: String(latitude) }),
        ...(longitude !== undefined && longitude !== null && { longitude: String(longitude) }),
        ...(coverImageUrl !== undefined && { coverImageUrl }),
        ...(flyerImageUrl !== undefined && { flyerImageUrl }),
        ...(longDescription !== undefined && { longDescription }),
        ...(category !== undefined && { category }),
        ...(createRaceConfig !== undefined && { raceConfig: createRaceConfig }),
        ...(createCityId !== undefined && { cityId: createCityId }),
        ...(tags !== undefined && { tags }),
        ...(minAge !== undefined && { minAge }),
        ...(ticketingEnabled !== undefined && { ticketingEnabled }),
        ...(nfcBraceletsEnabled !== undefined && { nfcBraceletsEnabled }),
        ...(salesChannel !== undefined && { salesChannel }),
      })
      .returning();

    let createdAdmin = null;
    if (eventAdmin && normalizedAdminEmail && adminPasswordHash) {
      const [adminUser] = await tx
        .insert(usersTable)
        .values({
          email: normalizedAdminEmail,
          passwordHash: adminPasswordHash,
          firstName: eventAdmin.firstName ?? null,
          lastName: eventAdmin.lastName ?? null,
          role: "event_admin",
          eventId: event.id,
        })
        .returning();
      createdAdmin = { id: adminUser.id, email: adminUser.email, role: adminUser.role };
    }

    if (event.ticketingEnabled) {
      const eventDate = event.startsAt
        ? event.startsAt.toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];
      await tx
        .insert(eventDaysTable)
        .values({
          eventId: event.id,
          date: eventDate,
          label: "Day 1",
          displayOrder: 0,
        });
    }

    return { event, createdAdmin };
  });

  const { hmacSecret: _secret, ...eventWithoutSecret } = result.event;
  res.status(201).json({ ...eventWithoutSecret, eventAdmin: result.createdAdmin });
});

router.patch("/events/:eventId", requireRole("admin", "event_admin"), async (req: Request, res: Response) => {
  const eventId = req.params.eventId as string;
  const user = req.user!;

  if (user.role === "event_admin") {
    const userCompanyId = (user as { promoterCompanyId?: string | null }).promoterCompanyId;
    const ownsSingleEvent = user.eventId === eventId;
    if (!userCompanyId && !ownsSingleEvent) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
    if (userCompanyId) {
      const [eventForCompany] = await db
        .select({ promoterCompanyId: eventsTable.promoterCompanyId })
        .from(eventsTable)
        .where(eq(eventsTable.id, eventId));
      if (!eventForCompany || eventForCompany.promoterCompanyId !== userCompanyId) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
    }
  }

  const parsed = updateEventSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { name, description, venueAddress, currencyCode, startsAt, endsAt, refundDeadline, active, platformCommissionRate, capacity, promoterCompanyId, pulepId, inventoryMode, nfcChipType, allowedNfcTypes, offlineSyncLimit, maxOfflineSpendPerBracelet, bankPaymentMethods, boxOfficePaymentMethods, bankMinTopup, braceletActivationFee, ultralightCDesKey, latitude, longitude, coverImageUrl, flyerImageUrl, longDescription, descriptionEn, category, raceConfig, cityId, tags, minAge, ticketingEnabled, nfcBraceletsEnabled, salesChannel, saleStartsAt, saleEndsAt, vimeoUrl, floatingGraphics, raceNumberStart, raceNumberEnd } = parsed.data;

  if (refundDeadline !== undefined && refundDeadline !== null) {
    const resolvedEndsAt = endsAt ?? (await db.select({ endsAt: eventsTable.endsAt }).from(eventsTable).where(eq(eventsTable.id, eventId)))[0]?.endsAt;
    if (resolvedEndsAt) {
      const deadlineDate = new Date(refundDeadline);
      const endsDate = typeof resolvedEndsAt === "string" ? new Date(resolvedEndsAt) : resolvedEndsAt;
      const minDeadline = new Date(endsDate.getTime() + 15 * 24 * 60 * 60 * 1000);
      if (deadlineDate < minDeadline) {
        res.status(400).json({ error: "Refund deadline must be at least 15 days after event end date" });
        return;
      }
    }
  }

  let slugUpdate: string | undefined;
  if (name !== undefined || startsAt !== undefined) {
    const resolvedName = name ?? (await db.select({ name: eventsTable.name }).from(eventsTable).where(eq(eventsTable.id, eventId)))[0]?.name;
    const resolvedStartsAt = startsAt ?? (await db.select({ startsAt: eventsTable.startsAt }).from(eventsTable).where(eq(eventsTable.id, eventId)))[0]?.startsAt;
    if (resolvedName) {
      slugUpdate = await ensureUniqueSlug(generateSlug(resolvedName, resolvedStartsAt), eventId);
    }
  }

  const updateData: Record<string, unknown> = {
    ...(name !== undefined && { name }),
    ...(slugUpdate !== undefined && { slug: slugUpdate }),
    ...(description !== undefined && { description }),
    ...(venueAddress !== undefined && { venueAddress }),
    ...(currencyCode !== undefined && { currencyCode }),
    ...(startsAt !== undefined && { startsAt: new Date(startsAt) }),
    ...(endsAt !== undefined && { endsAt: new Date(endsAt) }),
    ...(refundDeadline !== undefined && { refundDeadline: refundDeadline !== null ? new Date(refundDeadline) : null }),
    ...(active !== undefined && { active }),
    ...(capacity !== undefined && { capacity }),
    ...(promoterCompanyId !== undefined && { promoterCompanyId }),
    ...(pulepId !== undefined && { pulepId }),
    ...(inventoryMode !== undefined && { inventoryMode }),
    ...(nfcChipType !== undefined && { nfcChipType }),
    ...(allowedNfcTypes !== undefined && { allowedNfcTypes }),
    ...(offlineSyncLimit !== undefined && { offlineSyncLimit }),
    ...(maxOfflineSpendPerBracelet !== undefined && { maxOfflineSpendPerBracelet }),
    ...(bankPaymentMethods !== undefined && { bankPaymentMethods }),
    ...(boxOfficePaymentMethods !== undefined && { boxOfficePaymentMethods }),
    ...(bankMinTopup !== undefined && { bankMinTopup }),
    ...(braceletActivationFee !== undefined && { braceletActivationFee }),
    ...(ultralightCDesKey !== undefined && { ultralightCDesKey }),
    ...(latitude !== undefined && { latitude: latitude !== null ? String(latitude) : null }),
    ...(longitude !== undefined && { longitude: longitude !== null ? String(longitude) : null }),
    ...(coverImageUrl !== undefined && { coverImageUrl }),
    ...(flyerImageUrl !== undefined && { flyerImageUrl }),
    ...(longDescription !== undefined && { longDescription }),
    ...(descriptionEn !== undefined && { descriptionEn }),
    ...(category !== undefined && { category }),
    ...(raceConfig !== undefined && { raceConfig }),
    ...(cityId !== undefined && { cityId }),
    ...(tags !== undefined && { tags }),
    ...(minAge !== undefined && { minAge }),
    ...(ticketingEnabled !== undefined && { ticketingEnabled }),
    ...(nfcBraceletsEnabled !== undefined && { nfcBraceletsEnabled }),
    ...(salesChannel !== undefined && { salesChannel }),
    ...(saleStartsAt !== undefined && { saleStartsAt: saleStartsAt !== null ? new Date(saleStartsAt) : null }),
    ...(saleEndsAt !== undefined && { saleEndsAt: saleEndsAt !== null ? new Date(saleEndsAt) : null }),
    ...(vimeoUrl !== undefined && { vimeoUrl }),
    ...(floatingGraphics !== undefined && { floatingGraphics }),
    ...(raceNumberStart !== undefined && { raceNumberStart }),
    ...(raceNumberEnd !== undefined && { raceNumberEnd }),
    updatedAt: new Date(),
  };

  if (platformCommissionRate !== undefined && req.user!.role === "admin") {
    updateData.platformCommissionRate = platformCommissionRate;
  }

  const [event] = await db
    .update(eventsTable)
    .set(updateData)
    .where(eq(eventsTable.id, eventId))
    .returning();
  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  if (venueAddress !== undefined || latitude !== undefined || longitude !== undefined) {
    const venueUpdate: Record<string, unknown> = {};
    if (venueAddress !== undefined) venueUpdate.address = venueAddress;
    if (latitude !== undefined) venueUpdate.latitude = latitude !== null ? String(latitude) : null;
    if (longitude !== undefined) venueUpdate.longitude = longitude !== null ? String(longitude) : null;
    if (Object.keys(venueUpdate).length > 0) {
      await db
        .update(venuesTable)
        .set(venueUpdate)
        .where(eq(venuesTable.eventId, eventId));
    }
  }

  if (ticketingEnabled === true) {
    const existingDays = await db
      .select({ id: eventDaysTable.id })
      .from(eventDaysTable)
      .where(eq(eventDaysTable.eventId, eventId))
      .limit(1);
    if (existingDays.length === 0) {
      const eventDate = event.startsAt
        ? event.startsAt.toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];
      await db.insert(eventDaysTable).values({
        eventId,
        date: eventDate,
        label: "Day 1",
        displayOrder: 0,
      });
    }
  }

  const { hmacSecret: _secret, ...eventWithoutSecret } = event;
  res.json({ ...eventWithoutSecret, hasHmacSecret: !!_secret });
});

router.get(
  "/events/:eventId/payment-config",
  requireAuth,
  async (req: Request, res: Response) => {
    const eventId = req.params.eventId as string;
    const [event] = await db
      .select({
        bankPaymentMethods: eventsTable.bankPaymentMethods,
        boxOfficePaymentMethods: eventsTable.boxOfficePaymentMethods,
        bankMinTopup: eventsTable.bankMinTopup,
        braceletActivationFee: eventsTable.braceletActivationFee,
      })
      .from(eventsTable)
      .where(eq(eventsTable.id, eventId));
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    res.json({
      bankPaymentMethods: event.bankPaymentMethods ?? ["cash", "card_external", "nequi_transfer", "bancolombia_transfer", "other"],
      boxOfficePaymentMethods: event.boxOfficePaymentMethods ?? ["gate_cash", "gate_transfer", "gate_card", "gate_nequi"],
      bankMinTopup: event.bankMinTopup ?? 0,
      braceletActivationFee: event.braceletActivationFee ?? 3000,
    });
  },
);

router.post(
  "/events/:eventId/rotate-signing-key",
  requireRole("admin", "event_admin"),
  async (req: Request, res: Response) => {
    const eventId = req.params.eventId as string;

    if (req.user!.role === "event_admin" && req.user!.eventId !== eventId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const [event] = await db
      .select({ id: eventsTable.id })
      .from(eventsTable)
      .where(eq(eventsTable.id, eventId));

    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const newSecret = generateHmacSecret();

    await db
      .update(eventsTable)
      .set({ hmacSecret: newSecret, updatedAt: new Date() })
      .where(eq(eventsTable.id, eventId));

    // Invalidate all POS sessions for users belonging to this event by deleting their sessions.
    // Sessions store user data as JSONB; delete rows where sess->'user'->>'eventId' matches.
    await db.execute(
      sql`DELETE FROM sessions WHERE sess->'user'->>'eventId' = ${eventId}`
    );

    res.json({ success: true, rotatedAt: new Date().toISOString() });
  }
);

router.post(
  "/events/:eventId/generate-desfire-key",
  requireRole("admin", "event_admin"),
  async (req: Request, res: Response) => {
    const eventId = req.params.eventId as string;
    const user = req.user!;

    if (user.role === "event_admin" && user.eventId !== eventId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const [event] = await db
      .select({ id: eventsTable.id, nfcChipType: eventsTable.nfcChipType })
      .from(eventsTable)
      .where(eq(eventsTable.id, eventId));

    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    if (event.nfcChipType !== "desfire_ev3") {
      res.status(400).json({ error: "Event is not configured for DESFire EV3" });
      return;
    }

    const newKey = generateDesfireAesKey();

    await db
      .update(eventsTable)
      .set({ desfireAesKey: newKey, updatedAt: new Date() })
      .where(eq(eventsTable.id, eventId));

    res.json({ success: true, generatedAt: new Date().toISOString() });
  }
);

router.post(
  "/events/:eventId/generate-ultralight-c-key",
  requireRole("admin", "event_admin"),
  async (req: Request, res: Response) => {
    const eventId = req.params.eventId as string;
    const user = req.user!;

    if (user.role === "event_admin" && user.eventId !== eventId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const [event] = await db
      .select({ id: eventsTable.id, nfcChipType: eventsTable.nfcChipType, allowedNfcTypes: eventsTable.allowedNfcTypes })
      .from(eventsTable)
      .where(eq(eventsTable.id, eventId));

    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const isConfigured =
      event.nfcChipType === "mifare_ultralight_c" ||
      (Array.isArray(event.allowedNfcTypes) && (event.allowedNfcTypes as string[]).includes("mifare_ultralight_c"));

    if (!isConfigured) {
      res.status(400).json({ error: "Event is not configured for MIFARE Ultralight C" });
      return;
    }

    const newKey = generateUltralightCDesKey();

    await db
      .update(eventsTable)
      .set({ ultralightCDesKey: newKey, updatedAt: new Date() })
      .where(eq(eventsTable.id, eventId));

    res.json({ success: true, generatedAt: new Date().toISOString() });
  }
);

router.post(
  "/events/:eventId/validate-desfire-mac",
  requireRole("admin", "event_admin", "merchant_admin", "merchant_staff"),
  async (req: Request, res: Response) => {
    const eventId = req.params.eventId as string;
    const user = req.user!;

    if (
      (user.role === "event_admin" && user.eventId !== eventId) ||
      (user.role === "merchant_admin" || user.role === "merchant_staff") && user.eventId !== eventId
    ) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const parsed = z.object({
      uid: z.string().min(1),
      counter: z.number().int().min(0),
      newBalance: z.number().int().min(0),
      transactionMac: z.string().min(1),
    }).safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [event] = await db
      .select({ desfireAesKey: eventsTable.desfireAesKey, nfcChipType: eventsTable.nfcChipType })
      .from(eventsTable)
      .where(eq(eventsTable.id, eventId));

    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    if (event.nfcChipType !== "desfire_ev3") {
      res.status(400).json({ error: "Event is not configured for DESFire EV3" });
      return;
    }

    if (!event.desfireAesKey) {
      res.status(400).json({ error: "DESFire AES key not configured for this event" });
      return;
    }

    const { uid, counter, newBalance, transactionMac } = parsed.data;
    const valid = verifyDesfireTransactionMac(event.desfireAesKey, uid, counter, newBalance, transactionMac);

    res.json({ valid, uid, counter, newBalance });
  }
);

router.get(
  "/events/:eventId/flagged-bracelets",
  requireRole("admin", "event_admin"),
  async (req: Request, res: Response) => {
    const eventId = req.params.eventId as string;

    if (req.user!.role === "event_admin" && req.user!.eventId !== eventId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const flagged = await db
      .select()
      .from(braceletsTable)
      .where(and(eq(braceletsTable.eventId, eventId), eq(braceletsTable.flagged, true)));

    res.json({ flaggedBracelets: flagged });
  }
);

router.get(
  "/events/:eventId/bracelets",
  requireRole("admin", "event_admin"),
  async (req: Request, res: Response) => {
    const eventId = req.params.eventId as string;
    const user = req.user!;

    if (user.role === "event_admin") {
      const userCompanyId = (user as { promoterCompanyId?: string | null }).promoterCompanyId;
      const ownsSingleEvent = user.eventId === eventId;
      if (!userCompanyId && !ownsSingleEvent) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
      if (userCompanyId) {
        const [eventForCompany] = await db
          .select({ promoterCompanyId: eventsTable.promoterCompanyId })
          .from(eventsTable)
          .where(eq(eventsTable.id, eventId));
        if (!eventForCompany || eventForCompany.promoterCompanyId !== userCompanyId) {
          res.status(403).json({ error: "Access denied" });
          return;
        }
      }
    }

    const page = Math.max(1, parseInt(req.query.page as string ?? "1", 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string ?? "50", 10) || 50));
    const search = req.query.search as string | undefined;
    const offset = (page - 1) * limit;

    const conditions = [eq(braceletsTable.eventId, eventId)];
    if (search) {
      conditions.push(
        or(
          ilike(braceletsTable.nfcUid, `%${search}%`),
          ilike(braceletsTable.attendeeName, `%${search}%`),
        )!
      );
    }

    const whereClause = and(...conditions);

    const [totalRow] = await db
      .select({ total: count() })
      .from(braceletsTable)
      .where(whereClause);

    const bracelets = await db
      .select()
      .from(braceletsTable)
      .where(whereClause)
      .orderBy(braceletsTable.createdAt)
      .limit(limit)
      .offset(offset);

    res.json({ bracelets, total: totalRow?.total ?? 0, page, limit });
  }
);

router.get(
  "/all-transactions",
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const page = Math.max(1, parseInt(req.query.page as string ?? "1", 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string ?? "50", 10) || 50));
    const search = req.query.search as string | undefined;
    const offset = (page - 1) * limit;

    const whereClause = search
      ? or(
          ilike(transactionLogsTable.braceletUid, `%${search}%`),
          ilike(merchantsTable.name, `%${search}%`),
        )
      : undefined;

    const baseQuery = db
      .select({
        id: transactionLogsTable.id,
        braceletUid: transactionLogsTable.braceletUid,
        locationId: transactionLogsTable.locationId,
        merchantId: transactionLogsTable.merchantId,
        eventId: transactionLogsTable.eventId,
        grossAmount: transactionLogsTable.grossAmount,
        tipAmount: transactionLogsTable.tipAmount,
        commissionAmount: transactionLogsTable.commissionAmount,
        netAmount: transactionLogsTable.netAmount,
        newBalance: transactionLogsTable.newBalance,
        counter: transactionLogsTable.counter,
        performedByUserId: transactionLogsTable.performedByUserId,
        offlineCreatedAt: transactionLogsTable.offlineCreatedAt,
        syncedAt: transactionLogsTable.syncedAt,
        createdAt: transactionLogsTable.createdAt,
        merchantName: merchantsTable.name,
        locationName: locationsTable.name,
        eventName: eventsTable.name,
      })
      .from(transactionLogsTable)
      .leftJoin(merchantsTable, eq(transactionLogsTable.merchantId, merchantsTable.id))
      .leftJoin(locationsTable, eq(transactionLogsTable.locationId, locationsTable.id))
      .leftJoin(eventsTable, eq(transactionLogsTable.eventId, eventsTable.id));

    const countBase = db
      .select({ total: count() })
      .from(transactionLogsTable)
      .leftJoin(merchantsTable, eq(transactionLogsTable.merchantId, merchantsTable.id));

    const [txRowsResult, totalRowResult] = await Promise.all([
      (whereClause ? baseQuery.where(whereClause) : baseQuery)
        .orderBy(sql`${transactionLogsTable.createdAt} DESC`)
        .limit(limit)
        .offset(offset),
      whereClause ? countBase.where(whereClause) : db.select({ total: count() }).from(transactionLogsTable),
    ]);

    const txRows = txRowsResult;
    const [totalRow] = totalRowResult;

    const txIds = txRows.map((r) => r.id);
    const lineItemsMap = new Map<string, { id: string; productId: string | null; productName: string | null; unitPrice: number; quantity: number; ivaAmount: number }[]>();
    if (txIds.length > 0) {
      const lineItems = await db
        .select({
          id: transactionLineItemsTable.id,
          transactionLogId: transactionLineItemsTable.transactionLogId,
          productId: transactionLineItemsTable.productId,
          productName: transactionLineItemsTable.productNameSnapshot,
          unitPrice: transactionLineItemsTable.unitPriceSnapshot,
          quantity: transactionLineItemsTable.quantity,
          ivaAmount: transactionLineItemsTable.ivaAmount,
        })
        .from(transactionLineItemsTable)
        .where(inArray(transactionLineItemsTable.transactionLogId, txIds));
      for (const li of lineItems) {
        if (!lineItemsMap.has(li.transactionLogId)) {
          lineItemsMap.set(li.transactionLogId, []);
        }
        lineItemsMap.get(li.transactionLogId)!.push({
          id: li.id,
          productId: li.productId,
          productName: li.productName,
          unitPrice: li.unitPrice,
          quantity: li.quantity,
          ivaAmount: li.ivaAmount,
        });
      }
    }

    const transactions = txRows.map((tx) => ({
      ...tx,
      lineItems: lineItemsMap.get(tx.id) ?? [],
    }));

    res.json({ transactions, total: totalRow?.total ?? 0, page, limit });
  }
);

router.get(
  "/all-top-ups",
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const page = Math.max(1, parseInt(req.query.page as string ?? "1", 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string ?? "50", 10) || 50));
    const search = req.query.search as string | undefined;
    const offset = (page - 1) * limit;

    const whereClause = search ? ilike(topUpsTable.braceletUid, `%${search}%`) : undefined;

    const baseQuery = db
      .select({
        id: topUpsTable.id,
        braceletUid: topUpsTable.braceletUid,
        amount: topUpsTable.amount,
        paymentMethod: topUpsTable.paymentMethod,
        status: topUpsTable.status,
        newBalance: topUpsTable.newBalance,
        performedByUserId: topUpsTable.performedByUserId,
        createdAt: topUpsTable.createdAt,
        offlineCreatedAt: topUpsTable.offlineCreatedAt,
        performedByName: usersTable.firstName,
        eventName: eventsTable.name,
      })
      .from(topUpsTable)
      .leftJoin(braceletsTable, eq(topUpsTable.braceletUid, braceletsTable.nfcUid))
      .leftJoin(eventsTable, eq(braceletsTable.eventId, eventsTable.id))
      .leftJoin(usersTable, eq(topUpsTable.performedByUserId, usersTable.id));

    const [rowsResult, totalRowResult] = await Promise.all([
      (whereClause ? baseQuery.where(whereClause) : baseQuery)
        .orderBy(sql`${topUpsTable.createdAt} DESC`)
        .limit(limit)
        .offset(offset),
      whereClause
        ? db.select({ total: count() }).from(topUpsTable).where(whereClause)
        : db.select({ total: count() }).from(topUpsTable),
    ]);

    const [totalRow] = totalRowResult;

    res.json({ topUps: rowsResult, total: totalRow?.total ?? 0, page, limit });
  }
);

router.get(
  "/events/:eventId/transactions",
  requireRole("admin", "event_admin"),
  async (req: Request, res: Response) => {
    const eventId = req.params.eventId as string;
    const user = req.user!;

    if (user.role === "event_admin") {
      const userCompanyId = (user as { promoterCompanyId?: string | null }).promoterCompanyId;
      const ownsSingleEvent = user.eventId === eventId;
      if (!userCompanyId && !ownsSingleEvent) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
      if (userCompanyId) {
        const [eventForCompany] = await db
          .select({ promoterCompanyId: eventsTable.promoterCompanyId })
          .from(eventsTable)
          .where(eq(eventsTable.id, eventId));
        if (!eventForCompany || eventForCompany.promoterCompanyId !== userCompanyId) {
          res.status(403).json({ error: "Access denied" });
          return;
        }
      }
    }

    const page = Math.max(1, parseInt(req.query.page as string ?? "1", 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string ?? "50", 10) || 50));
    const merchantId = req.query.merchantId as string | undefined;
    const search = req.query.search as string | undefined;
    const offset = (page - 1) * limit;

    const conditions = [eq(transactionLogsTable.eventId, eventId)];
    if (merchantId) {
      conditions.push(eq(transactionLogsTable.merchantId, merchantId));
    }
    if (search) {
      conditions.push(
        or(
          ilike(transactionLogsTable.braceletUid, `%${search}%`),
          ilike(merchantsTable.name, `%${search}%`),
        )!
      );
    }

    const whereClause = and(...conditions);

    const countQuery = db
      .select({ total: count() })
      .from(transactionLogsTable)
      .where(whereClause);
    const [totalRow] = await (search
      ? countQuery.leftJoin(merchantsTable, eq(transactionLogsTable.merchantId, merchantsTable.id))
      : countQuery);

    const txRows = await db
      .select({
        id: transactionLogsTable.id,
        idempotencyKey: transactionLogsTable.idempotencyKey,
        braceletUid: transactionLogsTable.braceletUid,
        locationId: transactionLogsTable.locationId,
        merchantId: transactionLogsTable.merchantId,
        eventId: transactionLogsTable.eventId,
        grossAmount: transactionLogsTable.grossAmount,
        tipAmount: transactionLogsTable.tipAmount,
        commissionAmount: transactionLogsTable.commissionAmount,
        netAmount: transactionLogsTable.netAmount,
        newBalance: transactionLogsTable.newBalance,
        counter: transactionLogsTable.counter,
        performedByUserId: transactionLogsTable.performedByUserId,
        offlineCreatedAt: transactionLogsTable.offlineCreatedAt,
        syncedAt: transactionLogsTable.syncedAt,
        createdAt: transactionLogsTable.createdAt,
        merchantName: merchantsTable.name,
        locationName: locationsTable.name,
      })
      .from(transactionLogsTable)
      .leftJoin(merchantsTable, eq(transactionLogsTable.merchantId, merchantsTable.id))
      .leftJoin(locationsTable, eq(transactionLogsTable.locationId, locationsTable.id))
      .where(whereClause)
      .orderBy(sql`${transactionLogsTable.createdAt} DESC`)
      .limit(limit)
      .offset(offset);

    const txIds = txRows.map((r) => r.id);
    const lineItemsMap = new Map<string, { id: string; productId: string | null; productName: string | null; unitPrice: number; quantity: number; ivaAmount: number }[]>();
    if (txIds.length > 0) {
      const lineItems = await db
        .select({
          id: transactionLineItemsTable.id,
          transactionLogId: transactionLineItemsTable.transactionLogId,
          productId: transactionLineItemsTable.productId,
          productName: transactionLineItemsTable.productNameSnapshot,
          unitPrice: transactionLineItemsTable.unitPriceSnapshot,
          quantity: transactionLineItemsTable.quantity,
          ivaAmount: transactionLineItemsTable.ivaAmount,
        })
        .from(transactionLineItemsTable)
        .where(sql`${transactionLineItemsTable.transactionLogId} = ANY(ARRAY[${sql.join(txIds.map(id => sql`${id}`), sql`, `)}]::text[])`);
      for (const li of lineItems) {
        if (!lineItemsMap.has(li.transactionLogId)) {
          lineItemsMap.set(li.transactionLogId, []);
        }
        lineItemsMap.get(li.transactionLogId)!.push({
          id: li.id,
          productId: li.productId,
          productName: li.productName,
          unitPrice: li.unitPrice,
          quantity: li.quantity,
          ivaAmount: li.ivaAmount,
        });
      }
    }

    const transactions = txRows.map((tx) => {
      const items = lineItemsMap.get(tx.id) ?? [];
      return {
        ...tx,
        itemCount: items.length,
        items,
      };
    });

    res.json({ transactions, total: totalRow?.total ?? 0, page, limit });
  }
);

/**
 * GET /events/:eventId/top-ups
 * List top-ups for an event (joined through bracelets).
 */
router.get(
  "/events/:eventId/top-ups",
  requireRole("admin", "event_admin"),
  async (req: Request, res: Response) => {
    const eventId = req.params.eventId as string;
    const user = req.user!;

    if (user.role === "event_admin") {
      const userCompanyId = (user as { promoterCompanyId?: string | null }).promoterCompanyId;
      const ownsSingleEvent = user.eventId === eventId;
      if (!userCompanyId && !ownsSingleEvent) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
      if (userCompanyId) {
        const [eventForCompany] = await db
          .select({ promoterCompanyId: eventsTable.promoterCompanyId })
          .from(eventsTable)
          .where(eq(eventsTable.id, eventId));
        if (!eventForCompany || eventForCompany.promoterCompanyId !== userCompanyId) {
          res.status(403).json({ error: "Access denied" });
          return;
        }
      }
    }

    const page = Math.max(1, parseInt(req.query.page as string ?? "1", 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string ?? "50", 10) || 50));
    const search = req.query.search as string | undefined;
    const offset = (page - 1) * limit;

    const conditions = [eq(braceletsTable.eventId, eventId)];
    if (search) {
      conditions.push(ilike(topUpsTable.braceletUid, `%${search}%`));
    }

    const whereClause = and(...conditions);

    const [totalRow] = await db
      .select({ total: count() })
      .from(topUpsTable)
      .innerJoin(braceletsTable, eq(topUpsTable.braceletUid, braceletsTable.nfcUid))
      .where(whereClause);

    const rows = await db
      .select({
        id: topUpsTable.id,
        braceletUid: topUpsTable.braceletUid,
        amount: topUpsTable.amount,
        paymentMethod: topUpsTable.paymentMethod,
        status: topUpsTable.status,
        newBalance: topUpsTable.newBalance,
        performedByUserId: topUpsTable.performedByUserId,
        createdAt: topUpsTable.createdAt,
        offlineCreatedAt: topUpsTable.offlineCreatedAt,
        performedByName: usersTable.firstName,
      })
      .from(topUpsTable)
      .innerJoin(braceletsTable, eq(topUpsTable.braceletUid, braceletsTable.nfcUid))
      .leftJoin(usersTable, eq(topUpsTable.performedByUserId, usersTable.id))
      .where(whereClause)
      .orderBy(sql`${topUpsTable.createdAt} DESC`)
      .limit(limit)
      .offset(offset);

    res.json({ topUps: rows, total: totalRow?.total ?? 0, page, limit });
  }
);

/**
 * GET /events/:eventId/pending-refund-count
 * Returns the count of pending attendee refund requests for an event.
 * Used as a preflight check before closing an event.
 */
router.get(
  "/events/:eventId/pending-refund-count",
  requireRole("admin", "event_admin"),
  async (req: Request, res: Response) => {
    const { eventId } = req.params as { eventId: string };

    if (req.user!.role === "event_admin" && req.user!.eventId !== eventId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const [row] = await db
      .select({ pendingRefundCount: count() })
      .from(attendeeRefundRequestsTable)
      .where(
        and(
          eq(attendeeRefundRequestsTable.eventId, eventId),
          eq(attendeeRefundRequestsTable.status, "pending")
        )
      );

    res.json({ pendingRefundCount: Number(row?.pendingRefundCount ?? 0) });
  }
);

/**
 * POST /events/:eventId/close
 * Admin-only: close an event.
 * - Checks for pending refund requests (returns 409 if any, unless ?force=true)
 * - Sets event.active = false
 * - Flags all bracelets in the event (flagged = true, flagReason = "Evento cerrado")
 * - Creates pending attendee_refund_request records for every bracelet with balance > 0
 */
router.post(
  "/events/:eventId/close",
  requireRole("admin", "event_admin"),
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { eventId } = req.params as { eventId: string };

    if (req.user.role === "event_admin" && req.user.eventId !== eventId) {
      res.status(403).json({ error: "Forbidden: cannot close another event" });
      return;
    }

    const [event] = await db
      .select({ id: eventsTable.id, active: eventsTable.active, name: eventsTable.name })
      .from(eventsTable)
      .where(eq(eventsTable.id, eventId));

    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    if (!event.active) {
      res.status(409).json({ error: "Event is already closed" });
      return;
    }

    const force = req.query.force === "true";

    // Count pending refund requests for this event
    const [pendingRow] = await db
      .select({ pendingRefundCount: count() })
      .from(attendeeRefundRequestsTable)
      .where(
        and(
          eq(attendeeRefundRequestsTable.eventId, eventId),
          eq(attendeeRefundRequestsTable.status, "pending")
        )
      );
    const pendingRefundCount = Number(pendingRow?.pendingRefundCount ?? 0);

    if (pendingRefundCount > 0 && !force) {
      res.status(409).json({
        error: `Cannot close event: ${pendingRefundCount} pending refund request(s) must be resolved before closing.`,
        pendingRefundCount,
      });
      return;
    }

    if (pendingRefundCount > 0 && force) {
      console.error(JSON.stringify({
        level: "AUDIT",
        action: "FORCE_CLOSE_EVENT",
        eventId,
        eventName: event.name,
        actorUserId: req.user.id,
        pendingRefundCount,
        timestamp: new Date().toISOString(),
      }));
    }

    // Perform the close in a DB transaction for atomicity
    const result = await db.transaction(async (tx) => {
      // 1. Mark event as inactive
      await tx
        .update(eventsTable)
        .set({ active: false, updatedAt: new Date() })
        .where(eq(eventsTable.id, eventId));

      // 2. Get all bracelets for this event
      const bracelets = await tx
        .select()
        .from(braceletsTable)
        .where(eq(braceletsTable.eventId, eventId));

      // 3. Flag all bracelets and collect those with a remaining balance
      const braceletsWithBalance = bracelets.filter((b) => b.lastKnownBalance > 0);

      if (bracelets.length > 0) {
        await tx
          .update(braceletsTable)
          .set({
            flagged: true,
            flagReason: "Evento cerrado",
            updatedAt: new Date(),
          })
          .where(eq(braceletsTable.eventId, eventId));
      }

      // 4. Create pending refund requests for bracelets with balance > 0
      let refundRequestsCreated = 0;
      for (const bracelet of braceletsWithBalance) {
        // Only create if no pending refund request already exists for this bracelet+event
        const [existing] = await tx
          .select({ id: attendeeRefundRequestsTable.id })
          .from(attendeeRefundRequestsTable)
          .where(
            and(
              eq(attendeeRefundRequestsTable.braceletUid, bracelet.nfcUid),
              eq(attendeeRefundRequestsTable.eventId, eventId),
              eq(attendeeRefundRequestsTable.status, "pending"),
            ),
          );

        if (!existing) {
          // Use attendeeUserId if linked, otherwise use the system admin performing the close
          const attendeeUserId = bracelet.attendeeUserId ?? req.user.id;
          await tx.insert(attendeeRefundRequestsTable).values({
            attendeeUserId,
            braceletUid: bracelet.nfcUid,
            eventId,
            amount: bracelet.lastKnownBalance,
            refundMethod: "cash",
            notes: "Solicitud automática generada al cerrar el evento",
            status: "pending",
          });
          refundRequestsCreated++;
        }
      }

      return {
        braceletsFlagged: bracelets.length,
        refundRequestsCreated,
      };
    });

    res.json({
      success: true,
      eventId,
      braceletsFlagged: result.braceletsFlagged,
      refundRequestsCreated: result.refundRequestsCreated,
    });
  }
);

/**
 * GET /events/:eventId/settlement-report
 * Generate or retrieve a settlement report per merchant for an event.
 * Returns gross sales, commissions, tips, and net payout per merchant.
 * Accessible by admin and event_admin. Supports ?format=csv for CSV download.
 */
router.get(
  "/events/:eventId/settlement-report",
  requireRole("admin", "event_admin"),
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { eventId } = req.params as { eventId: string };
    const format = req.query.format as string | undefined;

    if (req.user.role === "event_admin" && req.user.eventId !== eventId) {
      res.status(403).json({ error: "Forbidden: cannot access another event's settlement report" });
      return;
    }

    const [event] = await db
      .select({ id: eventsTable.id, name: eventsTable.name, active: eventsTable.active, currencyCode: eventsTable.currencyCode })
      .from(eventsTable)
      .where(eq(eventsTable.id, eventId));

    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const eventCurrency = event.currencyCode ?? "COP";

    // Get all merchants for this event
    const merchants = await db
      .select()
      .from(merchantsTable)
      .where(eq(merchantsTable.eventId, eventId));

    // Compute per-merchant aggregates from transaction logs
    const merchantRows = await db
      .select({
        merchantId: transactionLogsTable.merchantId,
        grossSales: sum(transactionLogsTable.grossAmount),
        tips: sum(transactionLogsTable.tipAmount),
        commissions: sum(transactionLogsTable.commissionAmount),
        netPayout: sum(transactionLogsTable.netAmount),
        transactionCount: count(),
      })
      .from(transactionLogsTable)
      .where(eq(transactionLogsTable.eventId, eventId))
      .groupBy(transactionLogsTable.merchantId);

    const merchantMap = new Map(merchants.map((m) => [m.id, m]));
    const aggregateMap = new Map(merchantRows.map((r) => [r.merchantId, r]));

    const report = merchants.map((merchant) => {
      const agg = aggregateMap.get(merchant.id);
      return {
        merchantId: merchant.id,
        merchantName: merchant.name,
        commissionRatePercent: merchant.commissionRatePercent,
        grossSales: Number(agg?.grossSales ?? 0),
        tips: Number(agg?.tips ?? 0),
        commissions: Number(agg?.commissions ?? 0),
        netPayout: Number(agg?.netPayout ?? 0),
        transactionCount: Number(agg?.transactionCount ?? 0),
      };
    });

    // Totals row
    const totals = {
      grossSales: report.reduce((s, r) => s + r.grossSales, 0),
      tips: report.reduce((s, r) => s + r.tips, 0),
      commissions: report.reduce((s, r) => s + r.commissions, 0),
      netPayout: report.reduce((s, r) => s + r.netPayout, 0),
      transactionCount: report.reduce((s, r) => s + r.transactionCount, 0),
    };

    void merchantMap;

    // Top-up totals for this event
    const bracelets = await db
      .select({ nfcUid: braceletsTable.nfcUid })
      .from(braceletsTable)
      .where(eq(braceletsTable.eventId, eventId));
    const braceletUids = bracelets.map((b) => b.nfcUid);
    let totalTopUps = 0;
    let topUpCount = 0;
    let totalActivationFees = 0;
    let activatedBraceletCount = 0;
    if (braceletUids.length > 0) {
      const [topUpAgg] = await db
        .select({
          total: sum(topUpsTable.amount),
          cnt: count(),
          fees: sum(topUpsTable.activationFeeAmount),
        })
        .from(topUpsTable)
        .where(inArray(topUpsTable.braceletUid, braceletUids));
      totalTopUps = Number(topUpAgg?.total ?? 0);
      topUpCount = Number(topUpAgg?.cnt ?? 0);
      totalActivationFees = Number(topUpAgg?.fees ?? 0);
    }
    if (bracelets.length > 0) {
      const [activatedAgg] = await db
        .select({ cnt: count() })
        .from(braceletsTable)
        .where(and(eq(braceletsTable.eventId, eventId), sql`${braceletsTable.activatedAt} IS NOT NULL`));
      activatedBraceletCount = Number(activatedAgg?.cnt ?? 0);
    }

    // Refund deductions (approved attendee refund requests)
    const [refundAgg] = await db
      .select({ total: sum(attendeeRefundRequestsTable.amount) })
      .from(attendeeRefundRequestsTable)
      .where(and(
        eq(attendeeRefundRequestsTable.eventId, eventId),
        eq(attendeeRefundRequestsTable.status, "approved"),
      ));
    const totalRefunds = Number(refundAgg?.total ?? 0);

    // Net settlement owed to the promoter = gross sales - platform commissions - refunds - activation fees
    const netSettlement = totals.grossSales - totals.commissions - totalRefunds - totalActivationFees;

    if (format === "csv") {
      const header = "merchantId,merchantName,commissionRatePercent,grossSales,tips,commissions,netPayout,transactionCount\n";
      const csvRows = report.map((r) =>
        [r.merchantId, `"${r.merchantName.replace(/"/g, '""')}"`, r.commissionRatePercent, r.grossSales, r.tips, r.commissions, r.netPayout, r.transactionCount].join(",")
      ).join("\n");
      const totalsRow = `"TOTAL","","",${totals.grossSales},${totals.tips},${totals.commissions},${totals.netPayout},${totals.transactionCount}`;
      const csv = header + csvRows + "\n" + totalsRow;

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="settlement-${eventId}.csv"`);
      res.send(csv);
      return;
    }

    let copConversion: { rate: number; copTotals: typeof totals } | null = null;
    if (eventCurrency !== "COP") {
      const rateInfo = await convertToCOP(1, eventCurrency);
      if (rateInfo) {
        copConversion = {
          rate: rateInfo.rate,
          copTotals: {
            grossSales: Math.round(totals.grossSales * rateInfo.rate),
            tips: Math.round(totals.tips * rateInfo.rate),
            commissions: Math.round(totals.commissions * rateInfo.rate),
            netPayout: Math.round(totals.netPayout * rateInfo.rate),
            transactionCount: totals.transactionCount,
          },
        };
      }
    }

    res.json({
      eventId,
      eventName: event.name,
      eventClosed: !event.active,
      currencyCode: eventCurrency,
      generatedAt: new Date().toISOString(),
      merchants: report,
      totals,
      copConversion,
      totalTopUps,
      topUpCount,
      totalRefunds,
      totalActivationFees,
      activatedBraceletCount,
      netSettlement,
      braceletCount: bracelets.length,
    });
  }
);

router.post(
  "/events/:eventId/image/:imageType",
  requireRole("admin", "event_admin"),
  eventImageUpload.single("image"),
  async (req: Request, res: Response) => {
    const eventId = req.params.eventId as string;
    const imageType = req.params.imageType as string;

    if (imageType !== "cover" && imageType !== "flyer" && imageType !== "floating_graphic") {
      res.status(400).json({ error: "imageType must be 'cover', 'flyer', or 'floating_graphic'" });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: "No image file provided" });
      return;
    }

    if (!req.file.mimetype.startsWith("image/")) {
      res.status(400).json({ error: "Only image files are allowed" });
      return;
    }

    const user = req.user!;
    const [event] = await db.select({ id: eventsTable.id }).from(eventsTable).where(eq(eventsTable.id, eventId));
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    if (user.role === "event_admin" && user.eventId !== eventId) {
      res.status(403).json({ error: "Event does not belong to your account" });
      return;
    }

    try {
      let imageUrl: string;
      const prefix = `event-images/${eventId}`;

      if (isBucketConfigured()) {
        const key = `${prefix}/${imageType}-${randomUUID()}`;
        imageUrl = await uploadObject(key, req.file.buffer, req.file.mimetype);
      } else {
        const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
        if (!bucketId) {
          res.status(500).json({ error: "No image storage configured" });
          return;
        }
        const objectName = `${prefix}/${imageType}-${randomUUID()}`;
        const bucket = objectStorageClient.bucket(bucketId);
        const file = bucket.file(objectName);
        await file.save(req.file.buffer, {
          metadata: { contentType: req.file.mimetype },
          resumable: false,
        });
        imageUrl = `/api/storage/objects/${objectName}`;
      }

      const updateData =
        imageType === "cover"
          ? { coverImageUrl: imageUrl, updatedAt: new Date() }
          : imageType === "flyer"
          ? { flyerImageUrl: imageUrl, updatedAt: new Date() }
          : { floatingGraphicUrl: imageUrl, updatedAt: new Date() };

      await db.update(eventsTable).set(updateData).where(eq(eventsTable.id, eventId));

      res.json({ imageUrl });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[events] image upload error:", msg);
      res.status(500).json({ error: `Failed to upload image: ${msg}` });
    }
  },
);

router.post("/events/backfill-slugs", requireRole("admin"), async (_req: Request, res: Response) => {
  const events = await db
    .select({ id: eventsTable.id, name: eventsTable.name, startsAt: eventsTable.startsAt, slug: eventsTable.slug })
    .from(eventsTable)
    .where(sql`${eventsTable.slug} IS NULL`);

  const results: { id: string; name: string; slug: string }[] = [];
  for (const event of events) {
    const slug = await ensureUniqueSlug(generateSlug(event.name, event.startsAt));
    await db.update(eventsTable).set({ slug }).where(eq(eventsTable.id, event.id));
    results.push({ id: event.id, name: event.name, slug });
  }

  res.json({ updated: results.length, events: results });
});

export default router;
