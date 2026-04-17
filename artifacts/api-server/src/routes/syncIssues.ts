import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";

const router = Router();

const reportSchema = z.object({
  localId: z.string().min(1),
  nfcUid: z.string().min(1),
  type: z.enum(["charge", "topup"]),
  amount: z.number().int(),
  failReason: z.string().optional(),
  failCount: z.number().int().min(1),
  occurredAt: z.string().optional(),
});

// Mobile: report a permanently-blocked item
router.post("/api/sync-issues", async (req: Request, res: Response) => {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { localId, nfcUid, type, amount, failReason, failCount, occurredAt } = parsed.data;
  try {
    await pool.query(
      `INSERT INTO device_sync_issues (local_id, user_id, nfc_uid, type, amount, fail_reason, fail_count, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, local_id) DO UPDATE SET
         fail_count = EXCLUDED.fail_count,
         fail_reason = EXCLUDED.fail_reason,
         updated_at = NOW()`,
      [localId, req.user.id, nfcUid, type, amount, failReason ?? null, failCount, occurredAt ? new Date(occurredAt) : null],
    );
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "sync_issues_report_failed");
    res.status(500).json({ error: "Failed to report sync issue" });
  }
});

// Mobile: poll which of my local items were dismissed by an admin
router.get("/api/sync-issues/my-dismissed", async (req: Request, res: Response) => {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const { rows } = await pool.query<{ local_id: string }>(
      `SELECT local_id FROM device_sync_issues WHERE user_id = $1 AND dismissed_at IS NOT NULL`,
      [req.user.id],
    );
    res.json({ localIds: rows.map((r) => r.local_id) });
  } catch (err) {
    logger.error({ err }, "sync_issues_dismissed_fetch_failed");
    res.status(500).json({ error: "Failed to fetch dismissed items" });
  }
});

// Admin / event_admin: list all active issues with user info
router.get("/api/sync-issues/admin", async (req: Request, res: Response) => {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const role = req.user.role as string;
  if (role !== "admin" && role !== "event_admin") {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  try {
    let query: string;
    let params: unknown[];

    if (role === "admin") {
      query = `
        SELECT
          dsi.id, dsi.local_id, dsi.nfc_uid, dsi.type, dsi.amount,
          dsi.fail_reason, dsi.fail_count, dsi.occurred_at, dsi.reported_at,
          u.id AS user_id, u.first_name, u.last_name, u.email,
          e.name AS event_name
        FROM device_sync_issues dsi
        JOIN users u ON u.id = dsi.user_id
        LEFT JOIN events e ON e.id = u.event_id
        WHERE dsi.dismissed_at IS NULL
        ORDER BY dsi.reported_at DESC
      `;
      params = [];
    } else {
      query = `
        SELECT
          dsi.id, dsi.local_id, dsi.nfc_uid, dsi.type, dsi.amount,
          dsi.fail_reason, dsi.fail_count, dsi.occurred_at, dsi.reported_at,
          u.id AS user_id, u.first_name, u.last_name, u.email,
          e.name AS event_name
        FROM device_sync_issues dsi
        JOIN users u ON u.id = dsi.user_id
        LEFT JOIN events e ON e.id = u.event_id
        WHERE dsi.dismissed_at IS NULL
          AND u.event_id = (SELECT event_id FROM users WHERE id = $1)
        ORDER BY dsi.reported_at DESC
      `;
      params = [req.user.id];
    }

    const { rows } = await pool.query(query, params);
    res.json({ issues: rows });
  } catch (err) {
    logger.error({ err }, "sync_issues_list_failed");
    res.status(500).json({ error: "Failed to fetch sync issues" });
  }
});

// Admin / event_admin: dismiss a single issue
router.patch("/api/sync-issues/:id/dismiss", async (req: Request, res: Response) => {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const role = req.user.role as string;
  if (role !== "admin" && role !== "event_admin") {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const { id } = req.params;
  try {
    const { rowCount } = await pool.query(
      `UPDATE device_sync_issues
       SET dismissed_at = NOW(), dismissed_by_user_id = $1
       WHERE id = $2 AND dismissed_at IS NULL`,
      [req.user.id, id],
    );
    if (!rowCount) { res.status(404).json({ error: "Issue not found or already dismissed" }); return; }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "sync_issues_dismiss_failed");
    res.status(500).json({ error: "Failed to dismiss issue" });
  }
});

// Admin / event_admin: dismiss ALL active issues in scope
router.post("/api/sync-issues/dismiss-all", async (req: Request, res: Response) => {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const role = req.user.role as string;
  if (role !== "admin" && role !== "event_admin") {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  try {
    let query: string;
    let params: unknown[];

    if (role === "admin") {
      query = `UPDATE device_sync_issues SET dismissed_at = NOW(), dismissed_by_user_id = $1 WHERE dismissed_at IS NULL`;
      params = [req.user.id];
    } else {
      query = `
        UPDATE device_sync_issues SET dismissed_at = NOW(), dismissed_by_user_id = $1
        WHERE dismissed_at IS NULL
          AND user_id IN (
            SELECT id FROM users
            WHERE event_id = (SELECT event_id FROM users WHERE id = $1)
          )
      `;
      params = [req.user.id];
    }

    const { rowCount } = await pool.query(query, params);
    res.json({ ok: true, dismissed: rowCount ?? 0 });
  } catch (err) {
    logger.error({ err }, "sync_issues_dismiss_all_failed");
    res.status(500).json({ error: "Failed to dismiss all issues" });
  }
});

export default router;
