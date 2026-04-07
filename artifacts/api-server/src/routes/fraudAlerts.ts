import { Router, type IRouter, type Request, type Response } from "express";
import { db, fraudAlertsTable, braceletsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireRole } from "../middlewares/requireRole";
import { z } from "zod";
import type { AuthUser } from "@workspace/api-zod";
import Expo from "expo-server-sdk";

const router: IRouter = Router();

router.get(
  "/fraud-alerts",
  requireRole("admin", "event_admin"),
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { eventId, status, severity } = req.query as Record<string, string | undefined>;
    const user = req.user as AuthUser;

    const conditions = [];

    if (user.role === "event_admin") {
      if (!user.eventId) {
        res.json({ alerts: [] });
        return;
      }
      conditions.push(eq(fraudAlertsTable.eventId, user.eventId));
      if (eventId && eventId !== user.eventId) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
    } else {
      if (eventId) conditions.push(eq(fraudAlertsTable.eventId, eventId));
    }

    if (status && ["open", "reviewed", "dismissed"].includes(status)) {
      conditions.push(eq(fraudAlertsTable.status, status as "open" | "reviewed" | "dismissed"));
    }

    if (severity && ["low", "medium", "high", "critical"].includes(severity)) {
      conditions.push(eq(fraudAlertsTable.severity, severity as "low" | "medium" | "high" | "critical"));
    }

    const alerts = await db
      .select()
      .from(fraudAlertsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(fraudAlertsTable.createdAt);

    res.json({ alerts: alerts.reverse() });
  },
);

router.patch(
  "/fraud-alerts/:id",
  requireRole("admin", "event_admin"),
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

    const id = req.params.id as string;
    const user = req.user as AuthUser;

    const schema = z.object({
      status: z.enum(["open", "reviewed", "dismissed"]),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [existing] = await db
      .select()
      .from(fraudAlertsTable)
      .where(eq(fraudAlertsTable.id, id));

    if (!existing) {
      res.status(404).json({ error: "Alert not found" });
      return;
    }

    if (user.role === "event_admin" && existing.eventId !== user.eventId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const [updated] = await db
      .update(fraudAlertsTable)
      .set({ status: parsed.data.status, updatedAt: new Date() })
      .where(eq(fraudAlertsTable.id, id))
      .returning();

    res.json(updated);
  },
);

router.post(
  "/fraud-alerts/report",
  requireRole("bank", "merchant_staff", "merchant_admin", "event_admin", "admin"),
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

    const user = req.user as AuthUser;

    const schema = z.object({
      nfcUid: z.string().min(1),
      reason: z.enum(["wrong_balance", "strange_behavior", "damaged_bracelet", "other"]),
      notes: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { nfcUid, reason, notes } = parsed.data;

    // Always resolve event from the bracelet record — never trust the client-supplied eventId
    const [bracelet] = await db
      .select()
      .from(braceletsTable)
      .where(eq(braceletsTable.nfcUid, nfcUid));

    const resolvedEventId = bracelet?.eventId ?? null;

    if (!resolvedEventId) {
      res.status(400).json({ error: "Bracelet not found or not assigned to an event" });
      return;
    }

    // event_admin can only report bracelets belonging to their own event
    if (user.role === "event_admin" && user.eventId !== resolvedEventId) {
      res.status(403).json({ error: "Access denied: bracelet belongs to a different event" });
      return;
    }

    // bank / merchant_staff / merchant_admin must be assigned to the same event
    if (
      (user.role === "bank" || user.role === "merchant_staff" || user.role === "merchant_admin") &&
      user.eventId &&
      user.eventId !== resolvedEventId
    ) {
      res.status(403).json({ error: "Access denied: bracelet belongs to a different event" });
      return;
    }

    const reasonLabels: Record<string, string> = {
      wrong_balance: "incorrect balance",
      strange_behavior: "strange behavior",
      damaged_bracelet: "damaged bracelet",
      other: "other reason",
    };

    const description = `Manual report by staff: ${reasonLabels[reason] ?? reason}${notes ? ` — ${notes}` : ""}. Bracelet UID: ${nfcUid}.`;

    const [alert] = await db
      .insert(fraudAlertsTable)
      .values({
        eventId: resolvedEventId,
        type: "manual_report",
        severity: "medium",
        entityType: "bracelet",
        entityId: nfcUid,
        description,
        reportedBy: user.id,
        status: "open",
      })
      .returning();

    res.status(201).json(alert);
  },
);

router.post(
  "/push-token",
  requireRole("bank", "merchant_staff", "merchant_admin", "event_admin", "admin"),
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

    const user = req.user as AuthUser;

    const schema = z.object({ token: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid push token" });
      return;
    }

    if (!Expo.isExpoPushToken(parsed.data.token)) {
      res.status(400).json({ error: "Not a valid Expo push token" });
      return;
    }

    await db
      .update(usersTable)
      .set({ expoPushToken: parsed.data.token, updatedAt: new Date() })
      .where(eq(usersTable.id, user.id));

    res.json({ ok: true });
  },
);

export default router;
