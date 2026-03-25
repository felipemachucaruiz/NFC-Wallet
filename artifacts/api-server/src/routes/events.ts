import { Router, type IRouter, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { db, eventsTable, usersTable, promoterCompaniesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireRole";
import { z } from "zod";

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
});

router.get("/events", requireAuth, async (req: Request, res: Response) => {
  if (req.user!.role === "event_admin") {
    if (!req.user!.eventId) {
      res.json({ events: [] });
      return;
    }
    const [event] = await db
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.id, req.user!.eventId));
    res.json({ events: event ? [event] : [] });
    return;
  }
  const events = await db.select().from(eventsTable);
  res.json({ events });
});

router.get("/events/:eventId", requireAuth, async (req: Request, res: Response) => {
  const eventId = req.params.eventId as string;

  if (req.user!.role === "event_admin" && req.user!.eventId !== eventId) {
    res.status(403).json({ error: "Access denied" });
    return;
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
  res.json(row);
});

router.post("/events", requireRole("admin"), async (req: Request, res: Response) => {
  const parsed = createEventSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { name, description, venueAddress, startsAt, endsAt, platformCommissionRate, capacity, promoterCompanyId, pulepId, eventAdmin } = parsed.data;

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

  res.status(201).json({ ...result.event, eventAdmin: result.createdAdmin });
});

router.patch("/events/:eventId", requireRole("admin", "event_admin"), async (req: Request, res: Response) => {
  const eventId = req.params.eventId as string;

  if (req.user!.role === "event_admin" && req.user!.eventId !== eventId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const parsed = updateEventSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { name, description, venueAddress, startsAt, endsAt, active, platformCommissionRate, capacity, promoterCompanyId, pulepId } = parsed.data;

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
  res.json(event);
});

export default router;
