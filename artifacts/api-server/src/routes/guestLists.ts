import { Router, type IRouter, type Request, type Response } from "express";
import { db, eventsTable, guestListsTable, guestListEntriesTable } from "@workspace/db";
import { eq, and, asc, desc, sql } from "drizzle-orm";
import { requireRole } from "../middlewares/requireRole";
import { requireTicketingEnabled } from "../middlewares/featureGating";
import { z } from "zod";
import crypto from "crypto";

const router: IRouter = Router();

async function canAccessEvent(req: Request, eventId: string): Promise<boolean> {
  const user = req.user!;
  if (user.role === "admin") return true;
  if (user.role === "event_admin") {
    const userCompanyId = (user as { promoterCompanyId?: string | null }).promoterCompanyId;
    if (userCompanyId) {
      const [event] = await db
        .select({ promoterCompanyId: eventsTable.promoterCompanyId })
        .from(eventsTable)
        .where(eq(eventsTable.id, eventId));
      return !!event && event.promoterCompanyId === userCompanyId;
    }
    return (user as { eventId?: string | null }).eventId === eventId;
  }
  return false;
}

function generateSlug(): string {
  return crypto.randomBytes(12).toString("base64url");
}

const isoDatetime = z.string().refine((val) => !isNaN(Date.parse(val)), { message: "Invalid datetime" });

const createSchema = z.object({
  name: z.string().min(1).max(255),
  maxGuests: z.number().int().min(1),
  isPublic: z.boolean().optional().default(false),
  expiresAt: isoDatetime.nullable().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  maxGuests: z.number().int().min(1).optional(),
  isPublic: z.boolean().optional(),
  status: z.enum(["active", "closed"]).optional(),
  expiresAt: isoDatetime.nullable().optional(),
});

router.get(
  "/events/:eventId/guest-lists",
  requireRole("admin", "event_admin"),
  requireTicketingEnabled((req) => req.params.eventId as string),
  async (req: Request, res: Response) => {
    const eventId = req.params.eventId as string;
    if (!(await canAccessEvent(req, eventId))) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const lists = await db
      .select()
      .from(guestListsTable)
      .where(eq(guestListsTable.eventId, eventId))
      .orderBy(desc(guestListsTable.createdAt));

    res.json({ guestLists: lists });
  },
);

router.get(
  "/events/:eventId/guest-lists/:listId",
  requireRole("admin", "event_admin"),
  requireTicketingEnabled((req) => req.params.eventId as string),
  async (req: Request, res: Response) => {
    const eventId = req.params.eventId as string;
    const listId = req.params.listId as string;
    if (!(await canAccessEvent(req, eventId))) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const [list] = await db
      .select()
      .from(guestListsTable)
      .where(and(eq(guestListsTable.id, listId), eq(guestListsTable.eventId, eventId)));

    if (!list) {
      res.status(404).json({ error: "Guest list not found" });
      return;
    }

    res.json({ guestList: list });
  },
);

router.post(
  "/events/:eventId/guest-lists",
  requireRole("admin", "event_admin"),
  requireTicketingEnabled((req) => req.params.eventId as string),
  async (req: Request, res: Response) => {
    const eventId = req.params.eventId as string;
    if (!(await canAccessEvent(req, eventId))) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      return;
    }

    const { name, maxGuests, isPublic, expiresAt } = parsed.data;

    const [created] = await db
      .insert(guestListsTable)
      .values({
        eventId,
        name,
        slug: generateSlug(),
        maxGuests,
        isPublic,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      })
      .returning();

    res.status(201).json({ guestList: created });
  },
);

router.patch(
  "/events/:eventId/guest-lists/:listId",
  requireRole("admin", "event_admin"),
  requireTicketingEnabled((req) => req.params.eventId as string),
  async (req: Request, res: Response) => {
    const eventId = req.params.eventId as string;
    const listId = req.params.listId as string;
    if (!(await canAccessEvent(req, eventId))) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      return;
    }

    if (parsed.data.maxGuests !== undefined) {
      const [existing] = await db
        .select({ currentCount: guestListsTable.currentCount })
        .from(guestListsTable)
        .where(and(eq(guestListsTable.id, listId), eq(guestListsTable.eventId, eventId)));

      if (!existing) {
        res.status(404).json({ error: "Guest list not found" });
        return;
      }

      if (parsed.data.maxGuests < existing.currentCount) {
        res.status(400).json({ error: `Cannot set max guests below current signup count (${existing.currentCount})` });
        return;
      }
    }

    const updates: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.maxGuests !== undefined) updates.maxGuests = parsed.data.maxGuests;
    if (parsed.data.isPublic !== undefined) updates.isPublic = parsed.data.isPublic;
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;
    if (parsed.data.expiresAt !== undefined) {
      updates.expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    const [updated] = await db
      .update(guestListsTable)
      .set(updates)
      .where(and(eq(guestListsTable.id, listId), eq(guestListsTable.eventId, eventId)))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Guest list not found" });
      return;
    }

    res.json({ guestList: updated });
  },
);

router.delete(
  "/events/:eventId/guest-lists/:listId",
  requireRole("admin", "event_admin"),
  requireTicketingEnabled((req) => req.params.eventId as string),
  async (req: Request, res: Response) => {
    const eventId = req.params.eventId as string;
    const listId = req.params.listId as string;
    if (!(await canAccessEvent(req, eventId))) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const [list] = await db
      .select()
      .from(guestListsTable)
      .where(and(eq(guestListsTable.id, listId), eq(guestListsTable.eventId, eventId)));

    if (!list) {
      res.status(404).json({ error: "Guest list not found" });
      return;
    }

    await db.delete(guestListEntriesTable).where(eq(guestListEntriesTable.guestListId, listId));
    await db.delete(guestListsTable).where(eq(guestListsTable.id, listId));

    res.json({ success: true });
  },
);

router.get(
  "/events/:eventId/guest-lists/:listId/entries",
  requireRole("admin", "event_admin"),
  requireTicketingEnabled((req) => req.params.eventId as string),
  async (req: Request, res: Response) => {
    const eventId = req.params.eventId as string;
    const listId = req.params.listId as string;
    if (!(await canAccessEvent(req, eventId))) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const [list] = await db
      .select()
      .from(guestListsTable)
      .where(and(eq(guestListsTable.id, listId), eq(guestListsTable.eventId, eventId)));

    if (!list) {
      res.status(404).json({ error: "Guest list not found" });
      return;
    }

    const entries = await db
      .select()
      .from(guestListEntriesTable)
      .where(eq(guestListEntriesTable.guestListId, listId))
      .orderBy(asc(guestListEntriesTable.createdAt));

    res.json({ entries });
  },
);

export default router;
