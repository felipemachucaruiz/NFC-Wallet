import { Router, type IRouter, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db, eventsTable, usersTable, promoterCompaniesTable, braceletsTable, transactionLogsTable, transactionLineItemsTable, merchantsTable, locationsTable } from "@workspace/db";
import { eq, sql, and, ilike, or, count } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireRole";
import { z } from "zod";

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

const router: IRouter = Router();

const createEventSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  venueAddress: z.string().optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  platformCommissionRate: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  capacity: z.number().int().positive().optional(),
  promoterCompanyId: z.string().optional(),
  pulepId: z.string().optional(),
  nfcChipType: z.enum(["ntag_21x", "mifare_classic"]).optional(),
  offlineSyncLimit: z.number().int().positive().optional(),
  maxOfflineSpendPerBracelet: z.number().int().positive().optional(),
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
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  active: z.boolean().optional(),
  platformCommissionRate: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  capacity: z.number().int().positive().nullable().optional(),
  promoterCompanyId: z.string().nullable().optional(),
  pulepId: z.string().nullable().optional(),
  inventoryMode: z.enum(["location_based", "centralized_warehouse"]).optional(),
  nfcChipType: z.enum(["ntag_21x", "mifare_classic"]).optional(),
  offlineSyncLimit: z.number().int().positive().optional(),
  maxOfflineSpendPerBracelet: z.number().int().positive().optional(),
});

const SAFE_EVENT_FIELDS = {
  id: eventsTable.id,
  name: eventsTable.name,
  description: eventsTable.description,
  venueAddress: eventsTable.venueAddress,
  startsAt: eventsTable.startsAt,
  endsAt: eventsTable.endsAt,
  active: eventsTable.active,
  capacity: eventsTable.capacity,
  platformCommissionRate: eventsTable.platformCommissionRate,
  promoterCompanyId: eventsTable.promoterCompanyId,
  promoterCompanyName: promoterCompaniesTable.companyName,
  pulepId: eventsTable.pulepId,
  inventoryMode: eventsTable.inventoryMode,
  nfcChipType: eventsTable.nfcChipType,
  offlineSyncLimit: eventsTable.offlineSyncLimit,
  maxOfflineSpendPerBracelet: eventsTable.maxOfflineSpendPerBracelet,
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
      id: eventsTable.id,
      name: eventsTable.name,
      description: eventsTable.description,
      venueAddress: eventsTable.venueAddress,
      startsAt: eventsTable.startsAt,
      endsAt: eventsTable.endsAt,
      active: eventsTable.active,
      capacity: eventsTable.capacity,
      platformCommissionRate: eventsTable.platformCommissionRate,
      promoterCompanyId: eventsTable.promoterCompanyId,
      promoterCompanyName: promoterCompaniesTable.companyName,
      pulepId: eventsTable.pulepId,
      inventoryMode: eventsTable.inventoryMode,
      nfcChipType: eventsTable.nfcChipType,
      offlineSyncLimit: eventsTable.offlineSyncLimit,
      maxOfflineSpendPerBracelet: eventsTable.maxOfflineSpendPerBracelet,
      hasHmacSecret: eventsTable.hmacSecret,
      createdAt: eventsTable.createdAt,
      updatedAt: eventsTable.updatedAt,
    })
    .from(eventsTable)
    .leftJoin(promoterCompaniesTable, eq(eventsTable.promoterCompanyId, promoterCompaniesTable.id))
    .where(eq(eventsTable.id, eventId));
  if (!row) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  const { hasHmacSecret, ...rest } = row;
  res.json({ ...rest, hasHmacSecret: !!hasHmacSecret });
});

router.post("/events", requireRole("admin"), async (req: Request, res: Response) => {
  const parsed = createEventSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { name, description, venueAddress, startsAt, endsAt, platformCommissionRate, capacity, promoterCompanyId, pulepId, nfcChipType, offlineSyncLimit, maxOfflineSpendPerBracelet, eventAdmin } = parsed.data;

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
    adminPasswordHash = await bcrypt.hash(eventAdmin.password, 12);
  }

  const hmacSecret = generateHmacSecret();

  // Use a transaction to create event + admin atomically
  const result = await db.transaction(async (tx) => {
    const [event] = await tx
      .insert(eventsTable)
      .values({
        name,
        description,
        venueAddress,
        startsAt: startsAt ? new Date(startsAt) : undefined,
        endsAt: endsAt ? new Date(endsAt) : undefined,
        platformCommissionRate: platformCommissionRate ?? "0",
        capacity: capacity ?? null,
        promoterCompanyId: promoterCompanyId ?? null,
        pulepId: pulepId ?? null,
        nfcChipType: nfcChipType ?? "ntag_21x",
        hmacSecret,
        offlineSyncLimit: offlineSyncLimit ?? 500000,
        maxOfflineSpendPerBracelet: maxOfflineSpendPerBracelet ?? 200000,
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
  const { name, description, venueAddress, startsAt, endsAt, active, platformCommissionRate, capacity, promoterCompanyId, pulepId, inventoryMode, nfcChipType, offlineSyncLimit, maxOfflineSpendPerBracelet } = parsed.data;

  const updateData: Record<string, unknown> = {
    ...(name !== undefined && { name }),
    ...(description !== undefined && { description }),
    ...(venueAddress !== undefined && { venueAddress }),
    ...(startsAt !== undefined && { startsAt: new Date(startsAt) }),
    ...(endsAt !== undefined && { endsAt: new Date(endsAt) }),
    ...(active !== undefined && { active }),
    ...(capacity !== undefined && { capacity }),
    ...(promoterCompanyId !== undefined && { promoterCompanyId }),
    ...(pulepId !== undefined && { pulepId }),
    ...(inventoryMode !== undefined && { inventoryMode }),
    ...(nfcChipType !== undefined && { nfcChipType }),
    ...(offlineSyncLimit !== undefined && { offlineSyncLimit }),
    ...(maxOfflineSpendPerBracelet !== undefined && { maxOfflineSpendPerBracelet }),
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

  const { hmacSecret: _secret, ...eventWithoutSecret } = event;
  res.json({ ...eventWithoutSecret, hasHmacSecret: !!_secret });
});

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
        grossAmountCop: transactionLogsTable.grossAmountCop,
        commissionAmountCop: transactionLogsTable.commissionAmountCop,
        netAmountCop: transactionLogsTable.netAmountCop,
        newBalanceCop: transactionLogsTable.newBalanceCop,
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
    const lineItemsMap = new Map<string, { id: string; productId: string | null; productName: string | null; unitPrice: number; quantity: number; ivaAmountCop: number }[]>();
    if (txIds.length > 0) {
      const lineItems = await db
        .select({
          id: transactionLineItemsTable.id,
          transactionLogId: transactionLineItemsTable.transactionLogId,
          productId: transactionLineItemsTable.productId,
          productName: transactionLineItemsTable.productNameSnapshot,
          unitPrice: transactionLineItemsTable.unitPriceSnapshot,
          quantity: transactionLineItemsTable.quantity,
          ivaAmountCop: transactionLineItemsTable.ivaAmountCop,
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
          ivaAmountCop: li.ivaAmountCop,
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

export default router;
