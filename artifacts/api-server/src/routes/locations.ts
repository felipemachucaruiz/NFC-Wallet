import { Router, type IRouter, type Request, type Response } from "express";
import { db, locationsTable, userLocationAssignmentsTable, usersTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireRole";
import { assertLocationAccess, isMerchantScoped } from "../lib/ownershipGuards";
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
  const user = req.user!;

  if (isMerchantScoped(user)) {
    if (!user.merchantId) {
      res.json({ locations: [] });
      return;
    }
    if (user.role === "merchant_staff") {
      const assignments = await db
        .select({ locationId: userLocationAssignmentsTable.locationId })
        .from(userLocationAssignmentsTable)
        .where(eq(userLocationAssignmentsTable.userId, (user as { id: string }).id));
      const assignedIds = assignments.map((a) => a.locationId);
      if (assignedIds.length === 0) {
        res.json({ locations: [] });
        return;
      }
      const locations = await db
        .select()
        .from(locationsTable)
        .where(
          and(
            eq(locationsTable.merchantId, user.merchantId),
            inArray(locationsTable.id, assignedIds),
          ),
        );
      res.json({ locations });
      return;
    }
    const locations = await db
      .select()
      .from(locationsTable)
      .where(eq(locationsTable.merchantId, user.merchantId));
    res.json({ locations });
    return;
  }

  if (user.role === "event_admin") {
    if (!user.eventId) {
      res.json({ locations: [] });
      return;
    }
    const { merchantId } = req.query as { merchantId?: string };
    const conditions = [eq(locationsTable.eventId, user.eventId)];
    if (merchantId) conditions.push(eq(locationsTable.merchantId, merchantId));
    const locations = await db.select().from(locationsTable).where(and(...conditions));
    res.json({ locations });
    return;
  }

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
  requireRole("admin", "merchant_admin", "event_admin"),
  async (req: Request, res: Response) => {
    const parsed = createLocationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const user = req.user!;
    if (user.role === "merchant_admin") {
      if (!user.merchantId || parsed.data.merchantId !== user.merchantId) {
        res.status(403).json({ error: "Access denied: can only create locations for your own merchant" });
        return;
      }
    }

    if (user.role === "event_admin") {
      if (!user.eventId || parsed.data.eventId !== user.eventId) {
        res.status(403).json({ error: "Access denied: can only create locations for your event" });
        return;
      }
    }

    const [location] = await db
      .insert(locationsTable)
      .values(parsed.data)
      .returning();
    res.status(201).json(location);
  },
);

router.get("/locations/:locationId", requireAuth, async (req: Request, res: Response) => {
  const user = req.user!;
  const locationId = req.params.locationId as string;

  if (isMerchantScoped(user)) {
    const result = await assertLocationAccess(locationId, user);
    if ("error" in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json(result.location);
    return;
  }

  const [location] = await db
    .select()
    .from(locationsTable)
    .where(eq(locationsTable.id, locationId));
  if (!location) {
    res.status(404).json({ error: "Location not found" });
    return;
  }

  // event_admin: verify location belongs to their event
  if (user.role === "event_admin") {
    if (!user.eventId || location.eventId !== user.eventId) {
      res.status(403).json({ error: "Location does not belong to your event" });
      return;
    }
  }

  res.json(location);
});

router.patch(
  "/locations/:locationId",
  requireRole("admin", "merchant_admin", "event_admin"),
  async (req: Request, res: Response) => {
    const parsed = updateLocationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const locationId = req.params.locationId as string;
    const user = req.user!;

    if (user.role === "merchant_admin") {
      const result = await assertLocationAccess(locationId, user);
      if ("error" in result) {
        res.status(result.status).json({ error: result.error });
        return;
      }
    }

    // event_admin: verify location belongs to their event
    if (user.role === "event_admin") {
      if (!user.eventId) {
        res.status(403).json({ error: "No event associated with your account" });
        return;
      }
      const [loc] = await db
        .select({ id: locationsTable.id, eventId: locationsTable.eventId })
        .from(locationsTable)
        .where(eq(locationsTable.id, locationId));
      if (!loc || loc.eventId !== user.eventId) {
        res.status(403).json({ error: "Location does not belong to your event" });
        return;
      }
    }

    const [location] = await db
      .update(locationsTable)
      .set(parsed.data)
      .where(eq(locationsTable.id, locationId))
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
  requireRole("admin", "merchant_admin", "event_admin"),
  async (req: Request, res: Response) => {
    const parsed = assignUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const locationId = req.params.locationId as string;
    const user = req.user!;

    if (user.role === "merchant_admin") {
      const result = await assertLocationAccess(locationId, user);
      if ("error" in result) {
        res.status(result.status).json({ error: result.error });
        return;
      }
    }

    // event_admin: verify location belongs to their event AND target user belongs to their event
    if (user.role === "event_admin") {
      if (!user.eventId) {
        res.status(403).json({ error: "No event associated with your account" });
        return;
      }
      const [loc] = await db
        .select({ id: locationsTable.id, eventId: locationsTable.eventId })
        .from(locationsTable)
        .where(eq(locationsTable.id, locationId));
      if (!loc || loc.eventId !== user.eventId) {
        res.status(403).json({ error: "Location does not belong to your event" });
        return;
      }
      // Validate the target user belongs to this event
      const [targetUser] = await db
        .select({ id: usersTable.id, eventId: usersTable.eventId })
        .from(usersTable)
        .where(eq(usersTable.id, parsed.data.userId));
      if (!targetUser || targetUser.eventId !== user.eventId) {
        res.status(403).json({ error: "User does not belong to your event" });
        return;
      }
    }

    const existing = await db
      .select()
      .from(userLocationAssignmentsTable)
      .where(
        and(
          eq(userLocationAssignmentsTable.userId, parsed.data.userId),
          eq(userLocationAssignmentsTable.locationId, locationId),
        ),
      );
    if (existing.length === 0) {
      await db.insert(userLocationAssignmentsTable).values({
        userId: parsed.data.userId,
        locationId,
      });
    }
    res.json({ success: true });
  },
);

router.delete(
  "/locations/:locationId/staff",
  requireRole("admin", "merchant_admin", "event_admin"),
  async (req: Request, res: Response) => {
    const parsed = assignUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const locationId = req.params.locationId as string;
    const user = req.user!;

    if (user.role === "merchant_admin") {
      const result = await assertLocationAccess(locationId, user);
      if ("error" in result) {
        res.status(result.status).json({ error: result.error });
        return;
      }
    }

    // event_admin: verify location belongs to their event AND target user belongs to their event
    if (user.role === "event_admin") {
      if (!user.eventId) {
        res.status(403).json({ error: "No event associated with your account" });
        return;
      }
      const [loc] = await db
        .select({ id: locationsTable.id, eventId: locationsTable.eventId })
        .from(locationsTable)
        .where(eq(locationsTable.id, locationId));
      if (!loc || loc.eventId !== user.eventId) {
        res.status(403).json({ error: "Location does not belong to your event" });
        return;
      }
      // Validate the target user belongs to this event
      const [targetUser] = await db
        .select({ id: usersTable.id, eventId: usersTable.eventId })
        .from(usersTable)
        .where(eq(usersTable.id, parsed.data.userId));
      if (!targetUser || targetUser.eventId !== user.eventId) {
        res.status(403).json({ error: "User does not belong to your event" });
        return;
      }
    }

    await db
      .delete(userLocationAssignmentsTable)
      .where(
        and(
          eq(userLocationAssignmentsTable.userId, parsed.data.userId),
          eq(userLocationAssignmentsTable.locationId, locationId),
        ),
      );
    res.json({ success: true });
  },
);

export default router;
