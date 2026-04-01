import { Router, type IRouter, type Request, type Response } from "express";
import { db, eventsTable, merchantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireRole } from "../middlewares/requireRole";

const router: IRouter = Router();

router.get(
  "/auth/signing-key",
  requireRole("bank", "merchant_staff", "merchant_admin", "admin", "event_admin"),
  async (req: Request, res: Response) => {
    const proto = req.headers["x-forwarded-proto"] ?? (req.secure ? "https" : "http");
    const isHttps = proto === "https" || (Array.isArray(proto) && proto[0] === "https");
    if (!isHttps && process.env.NODE_ENV === "production") {
      res.status(403).json({ error: "HTTPS required to access signing key" });
      return;
    }

    const user = req.user!;

    // admin role (no event scope) uses the global HMAC_SECRET
    if (user.role === "admin") {
      const hmacSecret = process.env.HMAC_SECRET;
      if (!hmacSecret) {
        res.status(500).json({ error: "HMAC_SECRET not configured" });
        return;
      }
      res.json({ hmacSecret });
      return;
    }

    // Resolve eventId from user or merchant chain
    let eventId: string | null = user.eventId ?? null;
    if (!eventId && user.merchantId) {
      const [merchant] = await db
        .select({ eventId: merchantsTable.eventId })
        .from(merchantsTable)
        .where(eq(merchantsTable.id, user.merchantId));
      eventId = merchant?.eventId ?? null;
    }

    if (!eventId) {
      res.status(400).json({ error: "User is not assigned to an event" });
      return;
    }

    const [event] = await db
      .select({
        hmacSecret: eventsTable.hmacSecret,
        offlineSyncLimit: eventsTable.offlineSyncLimit,
        maxOfflineSpendPerBracelet: eventsTable.maxOfflineSpendPerBracelet,
        nfcChipType: eventsTable.nfcChipType,
        desfireAesKey: eventsTable.desfireAesKey,
      })
      .from(eventsTable)
      .where(eq(eventsTable.id, eventId));

    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    if (event.hmacSecret) {
      // Event has its own key (standard path)
      const response: Record<string, unknown> = {
        hmacSecret: event.hmacSecret,
        offlineSyncLimit: event.offlineSyncLimit,
        maxOfflineSpendPerBracelet: event.maxOfflineSpendPerBracelet,
        nfcChipType: event.nfcChipType,
      };
      if (event.nfcChipType === "desfire_ev3" && event.desfireAesKey) {
        response.desfireAesKey = event.desfireAesKey;
      }
      res.json(response);
      return;
    }

    // Legacy fallback: event exists but has no per-event key (migration path only)
    const hmacSecret = process.env.HMAC_SECRET;
    if (!hmacSecret) {
      res.status(500).json({ error: "HMAC_SECRET not configured and event has no per-event key" });
      return;
    }
    res.json({
      hmacSecret,
      offlineSyncLimit: event.offlineSyncLimit,
      maxOfflineSpendPerBracelet: event.maxOfflineSpendPerBracelet,
      nfcChipType: event.nfcChipType,
    });
  },
);

export default router;
