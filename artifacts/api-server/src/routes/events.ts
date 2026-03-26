import { Router, type IRouter, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db, eventsTable, usersTable, promoterCompaniesTable, braceletsTable } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
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
  const { name, description, venueAddress, startsAt, endsAt, platformCommissionRate, capacity, promoterCompanyId, pulepId, offlineSyncLimit, maxOfflineSpendPerBracelet, eventAdmin } = parsed.data;

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
  const { name, description, venueAddress, startsAt, endsAt, active, platformCommissionRate, capacity, promoterCompanyId, pulepId, inventoryMode, offlineSyncLimit, maxOfflineSpendPerBracelet } = parsed.data;

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

export default router;
