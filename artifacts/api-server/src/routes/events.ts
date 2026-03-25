import { Router, type IRouter, type Request, type Response } from "express";
import { db, eventsTable } from "@workspace/db";
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
});

const updateEventSchema = createEventSchema.partial().extend({
  active: z.boolean().optional(),
});

router.get("/events", requireAuth, async (_req: Request, res: Response) => {
  const events = await db.select().from(eventsTable);
  res.json({ events });
});

router.get("/events/:eventId", requireAuth, async (req: Request, res: Response) => {
  const [event] = await db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.id, req.params.eventId as string));
  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }
  res.json(event);
});

router.post("/events", requireRole("admin"), async (req: Request, res: Response) => {
  const parsed = createEventSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { name, description, venueAddress, startsAt, endsAt } = parsed.data;
  const [event] = await db
    .insert(eventsTable)
    .values({
      name,
      description,
      venueAddress,
      startsAt: startsAt ? new Date(startsAt) : undefined,
      endsAt: endsAt ? new Date(endsAt) : undefined,
    })
    .returning();
  res.status(201).json(event);
});

router.patch("/events/:eventId", requireRole("admin"), async (req: Request, res: Response) => {
  const parsed = updateEventSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { name, description, venueAddress, startsAt, endsAt, active } = parsed.data;
  const [event] = await db
    .update(eventsTable)
    .set({
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(venueAddress !== undefined && { venueAddress }),
      ...(startsAt !== undefined && { startsAt: new Date(startsAt) }),
      ...(endsAt !== undefined && { endsAt: new Date(endsAt) }),
      ...(active !== undefined && { active }),
      updatedAt: new Date(),
    })
    .where(eq(eventsTable.id, req.params.eventId as string))
    .returning();
  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }
  res.json(event);
});

export default router;
