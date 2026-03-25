import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable, merchantsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireRole, requireAuth } from "../middlewares/requireRole";
import { z } from "zod";

const router: IRouter = Router();

const userRoles = ["attendee", "bank", "merchant_staff", "merchant_admin", "warehouse_admin", "event_admin", "admin"] as const;
const eventAdminAllowedRoles = ["attendee", "bank", "merchant_staff", "merchant_admin", "warehouse_admin"] as const;

router.get("/users", requireRole("admin", "event_admin"), async (req: Request, res: Response) => {
  if (req.user!.role === "event_admin") {
    if (!req.user!.eventId) {
      res.json({ users: [] });
      return;
    }
    const users = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.eventId, req.user!.eventId));
    // event_admin cannot manage other event_admin accounts — exclude them from the list
    res.json({ users: users.filter((u) => u.role !== "event_admin") });
    return;
  }
  const users = await db.select().from(usersTable);
  res.json({ users });
});

router.patch(
  "/users/:userId/role",
  requireRole("admin", "event_admin"),
  async (req: Request, res: Response) => {
    const schema = z.object({
      role: z.enum(userRoles),
      merchantId: z.string().nullable().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    const isEventAdmin = req.user!.role === "event_admin";

    if (isEventAdmin) {
      if (!(eventAdminAllowedRoles as readonly string[]).includes(parsed.data.role)) {
        res.status(403).json({ error: "Event admins cannot assign this role" });
        return;
      }
      if (!req.user!.eventId) {
        res.status(403).json({ error: "No event associated with your account" });
        return;
      }
      const [targetUser] = await db
        .select()
        .from(usersTable)
        .where(and(eq(usersTable.id, req.params.userId as string), eq(usersTable.eventId, req.user!.eventId)));
      if (!targetUser) {
        res.status(404).json({ error: "User not found in your event" });
        return;
      }
      // event_admin cannot manage other event_admin accounts
      if (targetUser.role === "event_admin") {
        res.status(403).json({ error: "Event admins cannot modify other event admin accounts" });
        return;
      }
    }

    const updates: Record<string, unknown> = {
      role: parsed.data.role,
      updatedAt: new Date(),
    };

    if (parsed.data.merchantId !== undefined) {
      // If event_admin is assigning a merchantId, validate it belongs to their event
      if (isEventAdmin && parsed.data.merchantId) {
        const [merchant] = await db
          .select({ id: merchantsTable.id, eventId: merchantsTable.eventId })
          .from(merchantsTable)
          .where(eq(merchantsTable.id, parsed.data.merchantId));
        if (!merchant || merchant.eventId !== req.user!.eventId) {
          res.status(403).json({ error: "Merchant does not belong to your event" });
          return;
        }
      }
      updates.merchantId = parsed.data.merchantId;
    }

    const [user] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, req.params.userId as string))
      .returning();

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json(user);
  },
);

router.patch(
  "/users/:userId/event",
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const schema = z.object({
      eventId: z.string().nullable(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    const [user] = await db
      .update(usersTable)
      .set({ eventId: parsed.data.eventId, updatedAt: new Date() })
      .where(eq(usersTable.id, req.params.userId as string))
      .returning();

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json(user);
  },
);

router.get("/users/me", requireAuth, async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.user.id));
  if (!user) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(user);
});

export default router;
