import { Router } from "express";
import { pool } from "@workspace/db";
import { requireRole } from "../middlewares/requireRole";

const router = Router();

router.get(
  "/api/local-servers",
  requireRole("admin"),
  async (_req, res, next) => {
    try {
      const { rows } = await pool.query<{
        server_id: string;
        cpu_load_percent: number | null;
        memory_used_mb: number | null;
        memory_total_mb: number | null;
        process_uptime_s: number | null;
        events_loaded: number | null;
        bracelets_loaded: number | null;
        merchants_loaded: number | null;
        users_loaded: number | null;
        railway_latency_ms: number | null;
        railway_connected: boolean | null;
        last_seed_at: Date | null;
        last_balance_sync_at: Date | null;
        reported_at: Date;
      }>(`
        SELECT server_id, cpu_load_percent, memory_used_mb, memory_total_mb,
               process_uptime_s, events_loaded, bracelets_loaded, merchants_loaded,
               users_loaded, railway_latency_ms, railway_connected,
               last_seed_at, last_balance_sync_at, reported_at
        FROM local_server_heartbeats
        ORDER BY reported_at DESC
      `);
      res.json({ servers: rows });
    } catch (err: unknown) {
      // Table doesn't exist yet — no local server has connected
      const pg = err as { code?: string };
      if (pg.code === "42P01") { res.json({ servers: [] }); return; }
      next(err);
    }
  },
);

export default router;
