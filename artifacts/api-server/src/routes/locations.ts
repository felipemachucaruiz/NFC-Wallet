import { Router, type IRouter, type Request, type Response } from "express";
import { db, locationsTable, userLocationAssignmentsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireRole";
import { z } from "zod";

const router: IRouter = Router();

const createLocationSchema = z.object({
  merchantId: z.string().min(1),
  eventId: z.string().min(1),
  name: z.string().min(1),
});

const updateLocationSchema = z.object({
  name: z.string().min(1).optional(),
  active: z.boolean().optional(),
});

const assignUserSchema = z.object({
  userId: z.string().min(1),
});

router.get("/locations", requireAuth, async (req: Request, res: Response) => {
  const { merchantId, eventId } = req.query as { merchantId?: string; eventId?: string };
  const conditions = [];
  if (merchantId) conditions.push(eq(locationsTable.merchantId, merchantId));
  if (eventId) conditions.push(eq(locationsTable.eventId, eventId));
  const locations = await db
    .select()
    .from(locationsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined);
  res.json({ locations });
});

router.post(
  "/locations",
  requireRole("admin", "merchant_admin"),
  async (req: Request, res: Response) => {
    const parsed = createLocationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [location] = await db
      .insert(locationsTable)
      .values(parsed.data)
      .returning();
    res.status(201).json(location);
  },
);

router.get("/locations/:locationId", requireAuth, async (req: Request, res: Response) => {
  const [location] = await db
    .select()
    .from(locationsTable)
    .where(eq(locationsTable.id, req.params.locationId as string));
  if (!location) {
    res.status(404).json({ error: "Location not found" });
    return;
  }
  res.json(location);
});

router.patch(
  "/locations/:locationId",
  requireRole("admin", "merchant_admin"),
  async (req: Request, res: Response) => {
    const parsed = updateLocationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [location] = await db
      .update(locationsTable)
      .set(parsed.data)
      .where(eq(locationsTable.id, req.params.locationId as string))
      .returning();
    if (!location) {
      res.status(404).json({ error: "Location not found" });
      return;
    }
    res.json(location);
  },
);

router.post(
  "/locations/:locationId/staff",
  requireRole("admin", "merchant_admin"),
  async (req: Request, res: Response) => {
    const parsed = assignUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const existing = await db
      .select()
      .from(userLocationAssignmentsTable)
      .where(
        and(
          eq(userLocationAssignmentsTable.userId, parsed.data.userId),
          eq(userLocationAssignmentsTable.locationId, req.params.locationId as string),
        ),
      );
    if (existing.length === 0) {
      await db.insert(userLocationAssignmentsTable).values({
        userId: parsed.data.userId,
        locationId: req.params.locationId as string,
      });
    }
    res.json({ success: true });
  },
);

router.delete(
  "/locations/:locationId/staff",
  requireRole("admin", "merchant_admin"),
  async (req: Request, res: Response) => {
    const parsed = assignUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    await db
      .delete(userLocationAssignmentsTable)
      .where(
        and(
          eq(userLocationAssignmentsTable.userId, parsed.data.userId),
          eq(userLocationAssignmentsTable.locationId, req.params.locationId as string),
        ),
      );
    res.json({ success: true });
  },
);

export default router;
