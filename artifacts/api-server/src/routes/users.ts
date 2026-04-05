import { Router, type IRouter, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, merchantsTable, accessZonesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireRole, requireAuth } from "../middlewares/requireRole";
import { z } from "zod";

const router: IRouter = Router();

const userRoles = ["attendee", "bank", "gate", "merchant_staff", "merchant_admin", "warehouse_admin", "event_admin", "admin"] as const;
const eventAdminAllowedRoles = ["attendee", "bank", "gate", "merchant_staff", "merchant_admin", "warehouse_admin"] as const;

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
      gateZoneId: z.string().nullable().optional(),
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

    if (parsed.data.gateZoneId !== undefined) {
      updates.gateZoneId = parsed.data.gateZoneId;
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

router.patch(
  "/users/:userId/promoter-company",
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const schema = z.object({ promoterCompanyId: z.string().nullable() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    const [user] = await db
      .update(usersTable)
      .set({ promoterCompanyId: parsed.data.promoterCompanyId, updatedAt: new Date() })
      .where(eq(usersTable.id, req.params.userId as string))
      .returning({ id: usersTable.id });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({ success: true });
  },
);

router.patch(
  "/users/:userId/password",
  requireRole("admin", "event_admin"),
  async (req: Request, res: Response) => {
    const schema = z.object({ newPassword: z.string().min(6) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Password must be at least 6 characters" });
      return;
    }

    const isEventAdmin = req.user!.role === "event_admin";
    if (isEventAdmin) {
      if (!req.user!.eventId) {
        res.status(403).json({ error: "No event associated with your account" });
        return;
      }
      const [target] = await db
        .select()
        .from(usersTable)
        .where(and(eq(usersTable.id, req.params.userId as string), eq(usersTable.eventId, req.user!.eventId)));
      if (!target) {
        res.status(404).json({ error: "User not found in your event" });
        return;
      }
      if (target.role === "event_admin") {
        res.status(403).json({ error: "Cannot modify another event admin" });
        return;
      }
    }

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    const [updated] = await db
      .update(usersTable)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(usersTable.id, req.params.userId as string))
      .returning({ id: usersTable.id });

    if (!updated) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({ success: true });
  },
);

/**
 * @summary List merchant_staff for the logged-in merchant_admin's merchant
 */
router.get(
  "/merchant/staff",
  requireRole("merchant_admin"),
  async (req: Request, res: Response) => {
    const merchantId = req.user!.merchantId;
    if (!merchantId) {
      res.status(403).json({ error: "No merchant associated with your account" });
      return;
    }
    const staff = await db
      .select({
        id: usersTable.id,
        username: usersTable.username,
        email: usersTable.email,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        role: usersTable.role,
        createdAt: usersTable.createdAt,
      })
      .from(usersTable)
      .where(and(eq(usersTable.merchantId, merchantId), eq(usersTable.role, "merchant_staff")));
    res.json({ staff });
  },
);

/**
 * @summary Create a new merchant_staff user for the logged-in merchant_admin
 */
router.post(
  "/merchant/staff",
  requireRole("merchant_admin"),
  async (req: Request, res: Response) => {
    const schema = z.object({
      username: z.string().min(3),
      password: z.string().min(6),
      firstName: z.string().min(1).optional(),
      lastName: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
      return;
    }
    const merchantId = req.user!.merchantId;
    if (!merchantId) {
      res.status(403).json({ error: "No merchant associated with your account" });
      return;
    }
    const { username, password, firstName, lastName } = parsed.data;
    const normalizedUsername = username.trim().toLowerCase();
    const [dup] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.username, normalizedUsername));
    if (dup) {
      res.status(409).json({ error: "Username already taken" });
      return;
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const [newUser] = await db
      .insert(usersTable)
      .values({
        username: normalizedUsername,
        passwordHash,
        firstName: firstName ?? null,
        lastName: lastName ?? null,
        role: "merchant_staff",
        merchantId,
        eventId: req.user!.eventId ?? null,
      })
      .returning({
        id: usersTable.id,
        username: usersTable.username,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        role: usersTable.role,
      });
    res.status(201).json(newUser);
  },
);

/**
 * @summary Reset password for a merchant_staff belonging to the merchant_admin's merchant
 */
router.patch(
  "/merchant/staff/:userId/password",
  requireRole("merchant_admin"),
  async (req: Request, res: Response) => {
    const schema = z.object({ newPassword: z.string().min(6) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Password must be at least 6 characters" });
      return;
    }
    const merchantId = req.user!.merchantId;
    if (!merchantId) {
      res.status(403).json({ error: "No merchant associated with your account" });
      return;
    }
    const [target] = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.id, req.params.userId as string), eq(usersTable.merchantId, merchantId), eq(usersTable.role, "merchant_staff")));
    if (!target) {
      res.status(404).json({ error: "Staff member not found" });
      return;
    }
    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    await db
      .update(usersTable)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(usersTable.id, req.params.userId as string));
    res.json({ success: true });
  },
);

/**
 * @summary Remove a merchant_staff member from the merchant
 */
router.delete(
  "/merchant/staff/:userId",
  requireRole("merchant_admin"),
  async (req: Request, res: Response) => {
    const merchantId = req.user!.merchantId;
    if (!merchantId) {
      res.status(403).json({ error: "No merchant associated with your account" });
      return;
    }
    const [target] = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.id, req.params.userId as string), eq(usersTable.merchantId, merchantId), eq(usersTable.role, "merchant_staff")));
    if (!target) {
      res.status(404).json({ error: "Staff member not found" });
      return;
    }
    await db.delete(usersTable).where(eq(usersTable.id, req.params.userId as string));
    res.json({ success: true });
  },
);

/**
 * PATCH /users/:userId/gate-zone
 * Assign or clear the gate zone for a gate/wristband staff user.
 * The zoneId must belong to the same event as the user.
 * Restricted to admin and event_admin.
 */
router.patch(
  "/users/:userId/gate-zone",
  requireRole("admin", "event_admin"),
  async (req: Request, res: Response) => {
    const schema = z.object({ gateZoneId: z.string().nullable() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    const { userId } = req.params as { userId: string };
    const { gateZoneId } = parsed.data;

    const [targetUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId));

    if (!targetUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const isEventAdmin = req.user!.role === "event_admin";
    if (isEventAdmin) {
      if (targetUser.eventId !== req.user!.eventId) {
        res.status(403).json({ error: "Access denied: user does not belong to your event" });
        return;
      }
    }

    if (gateZoneId) {
      const [zone] = await db
        .select()
        .from(accessZonesTable)
        .where(eq(accessZonesTable.id, gateZoneId));

      if (!zone) {
        res.status(404).json({ error: "Access zone not found" });
        return;
      }

      if (isEventAdmin && zone.eventId !== req.user!.eventId) {
        res.status(403).json({ error: "Access denied: zone does not belong to your event" });
        return;
      }

      if (targetUser.eventId && zone.eventId !== targetUser.eventId) {
        res.status(422).json({ error: "Zone does not belong to the same event as the user" });
        return;
      }
    }

    const [updated] = await db
      .update(usersTable)
      .set({ gateZoneId, updatedAt: new Date() })
      .where(eq(usersTable.id, userId))
      .returning();

    res.json(updated);
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

/**
 * DELETE /users/:userId
 * Permanently delete a user. Admin can delete any user; event_admin can only
 * delete users that belong to their own event.
 */
router.delete(
  "/users/:userId",
  requireRole("admin", "event_admin"),
  async (req: Request, res: Response) => {
    const userId = req.params.userId as string;

    const [target] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!target) {
      res.status(404).json({ error: "Usuario no encontrado" });
      return;
    }

    if (req.user!.role === "event_admin") {
      if (target.eventId !== req.user!.eventId) {
        res.status(403).json({ error: "Solo puedes eliminar usuarios de tu propio evento" });
        return;
      }
    }

    // Prevent self-deletion
    if (target.id === req.user!.id) {
      res.status(400).json({ error: "No puedes eliminarte a ti mismo" });
      return;
    }

    await db.delete(usersTable).where(eq(usersTable.id, userId));
    res.json({ success: true });
  },
);

/**
 * PATCH /users/:userId/block
 * Block or unblock a user. Admin can target any user; event_admin only their event users.
 */
router.patch(
  "/users/:userId/block",
  requireRole("admin", "event_admin"),
  async (req: Request, res: Response) => {
    const userId = req.params.userId as string;
    const schema = z.object({ isBlocked: z.boolean() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Se requiere isBlocked (boolean)" });
      return;
    }

    const [target] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!target) {
      res.status(404).json({ error: "Usuario no encontrado" });
      return;
    }

    if (req.user!.role === "event_admin") {
      if (target.eventId !== req.user!.eventId) {
        res.status(403).json({ error: "Solo puedes gestionar usuarios de tu propio evento" });
        return;
      }
    }

    if (target.id === req.user!.id) {
      res.status(400).json({ error: "No puedes bloquearte a ti mismo" });
      return;
    }

    const [updated] = await db
      .update(usersTable)
      .set({ isBlocked: parsed.data.isBlocked, updatedAt: new Date() })
      .where(eq(usersTable.id, userId))
      .returning({ id: usersTable.id, isBlocked: usersTable.isBlocked });

    res.json(updated);
  },
);

/**
 * POST /users/:userId/suspend
 * Suspend a user without deleting them. Preserves all historical data.
 * Admin can target any user; event_admin only their event users.
 */
router.post(
  "/users/:userId/suspend",
  requireRole("admin", "event_admin"),
  async (req: Request, res: Response) => {
    const userId = req.params.userId as string;

    const [target] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!target) {
      res.status(404).json({ error: "Usuario no encontrado" });
      return;
    }

    if (req.user!.role === "event_admin") {
      if (target.eventId !== req.user!.eventId) {
        res.status(403).json({ error: "Solo puedes gestionar usuarios de tu propio evento" });
        return;
      }
      if (target.role === "event_admin") {
        res.status(403).json({ error: "No puedes suspender a otro event admin" });
        return;
      }
    }

    if (target.id === req.user!.id) {
      res.status(400).json({ error: "No puedes suspenderte a ti mismo" });
      return;
    }

    const [updated] = await db
      .update(usersTable)
      .set({ isSuspended: true, updatedAt: new Date() })
      .where(eq(usersTable.id, userId))
      .returning({ id: usersTable.id, isSuspended: usersTable.isSuspended });

    res.json(updated);
  },
);

/**
 * POST /users/:userId/unsuspend
 * Re-activate a previously suspended user.
 */
router.post(
  "/users/:userId/unsuspend",
  requireRole("admin", "event_admin"),
  async (req: Request, res: Response) => {
    const userId = req.params.userId as string;

    const [target] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!target) {
      res.status(404).json({ error: "Usuario no encontrado" });
      return;
    }

    if (req.user!.role === "event_admin") {
      if (target.eventId !== req.user!.eventId) {
        res.status(403).json({ error: "Solo puedes gestionar usuarios de tu propio evento" });
        return;
      }
    }

    const [updated] = await db
      .update(usersTable)
      .set({ isSuspended: false, updatedAt: new Date() })
      .where(eq(usersTable.id, userId))
      .returning({ id: usersTable.id, isSuspended: usersTable.isSuspended });

    res.json(updated);
  },
);

/**
 * Create a new user account (admin/event_admin only).
 * Used by the staff app to create event_admin client accounts.
 */
router.post(
  "/auth/create-account",
  requireRole("admin", "event_admin"),
  async (req: Request, res: Response) => {
    const schema = z
      .object({
        firstName: z.string().min(1),
        lastName: z.string().optional(),
        email: z.string().email().optional(),
        username: z.string().min(3).optional(),
        password: z.string().min(6),
        role: z.enum(["attendee", "bank", "gate", "merchant_staff", "merchant_admin", "warehouse_admin", "event_admin"]),
        eventId: z.string().optional(),
        gateZoneId: z.string().nullable().optional(),
        merchantId: z.string().nullable().optional(),
      })
      .refine((d) => d.email || d.username, {
        message: "Debes proporcionar email o nombre de usuario",
      });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
      return;
    }

    const { firstName, lastName, email, username, password, role, eventId, gateZoneId, merchantId } = parsed.data;

    const isEventAdmin = req.user!.role === "event_admin";
    if (isEventAdmin) {
      if (!(eventAdminAllowedRoles as readonly string[]).includes(role)) {
        res.status(403).json({ error: "Event admins cannot create this role" });
        return;
      }
      if (eventId && eventId !== req.user!.eventId) {
        res.status(403).json({ error: "Event admins can only create users for their own event" });
        return;
      }
    }

    if (email) {
      const [dup] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.email, email.toLowerCase().trim()));
      if (dup) {
        res.status(409).json({ error: "El email ya está registrado" });
        return;
      }
    }

    if (username) {
      const [dup] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.username, username.trim().toLowerCase()));
      if (dup) {
        res.status(409).json({ error: "El nombre de usuario ya está en uso" });
        return;
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [newUser] = await db
      .insert(usersTable)
      .values({
        firstName: firstName.trim(),
        lastName: lastName?.trim() ?? null,
        email: email ? email.toLowerCase().trim() : null,
        username: username ? username.trim().toLowerCase() : null,
        passwordHash,
        role,
        eventId: eventId ?? (isEventAdmin ? (req.user!.eventId ?? null) : null),
        gateZoneId: gateZoneId ?? null,
        merchantId: merchantId ?? null,
      })
      .returning({
        id: usersTable.id,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: usersTable.email,
        username: usersTable.username,
        role: usersTable.role,
        eventId: usersTable.eventId,
        gateZoneId: usersTable.gateZoneId,
      });

    res.status(201).json(newUser);
  },
);

export default router;
