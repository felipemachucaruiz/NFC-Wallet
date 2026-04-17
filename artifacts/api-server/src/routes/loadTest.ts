import { Router, type Request, type Response } from "express";
import * as Sentry from "@sentry/node";
import { pool } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/requireRole";
import { logger } from "../lib/logger";

const router = Router();

const RAILWAY_TOKEN = process.env.RAILWAY_TOKEN ?? "c740310a-d7c4-47b2-8f83-a1e962a6c194";
const RAILWAY_ENV_ID = "5fc61a5e-6eda-42da-9975-76a4a9f27dec";
const RAILWAY_GQL = "https://backboard.railway.app/graphql/v2";

const RAILWAY_SERVICES: Record<string, { id: string; label: string }> = {
  "tapee-staff":    { id: "aa2eab58-2a82-45b9-b1bf-2a36da29698d", label: "Tapee Staff (API)" },
  "tapee-attendee": { id: "be3fe07b-32e3-4e6b-a816-f596b8bf7dd6", label: "Tapee Wallet (Attendee API)" },
};

// UX-based baseline thresholds at 1 replica (calibrated April 2026 load tests)
const BASE_P95_1R = 1000;   // ms — p95 at 100 users, 1 replica
const BASE_RPS_1R = 35;     // req/s sustainable, 1 replica

type Thresholds = { excellent: number; good: number; acceptable: number; bad: number };

function computeThresholds(replicas: number): Thresholds {
  // Scale acceptable p95 linearly with replicas, keep UX minimums
  const acceptable = Math.max(500, Math.round(BASE_P95_1R / Math.max(1, replicas)));
  return {
    excellent: Math.round(acceptable / 5),
    good:      Math.round(acceptable / 2),
    acceptable,
    bad:       Math.round(acceptable * 1.5),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function railwayGql(query: string): Promise<{ data?: Record<string, unknown> }> {
  const res = await fetch(RAILWAY_GQL, {
    method: "POST",
    headers: { "Authorization": `Bearer ${RAILWAY_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  return res.json() as Promise<{ data?: Record<string, unknown> }>;
}

async function getRailwayReplicas(serviceId: string): Promise<number> {
  const data = await railwayGql(
    `{ serviceInstance(environmentId: "${RAILWAY_ENV_ID}", serviceId: "${serviceId}") { numReplicas } }`
  );
  const inst = data?.data?.serviceInstance as { numReplicas?: number } | undefined;
  return inst?.numReplicas ?? 1;
}

async function setRailwayReplicas(serviceId: string, n: number): Promise<boolean> {
  const data = await railwayGql(
    `mutation { serviceInstanceUpdate(environmentId: "${RAILWAY_ENV_ID}", serviceId: "${serviceId}", input: { numReplicas: ${n} }) }`
  );
  return data?.data?.serviceInstanceUpdate === true;
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// Conservative default: 1-replica thresholds used inside runners
// The handler always overrides with live Railway values after the test finishes.
const DEFAULT_THRESHOLDS = computeThresholds(1);

function calcScore(p50: number, p95: number, errorRate: number, t: Thresholds = DEFAULT_THRESHOLDS): number {
  let score = 100;
  if (p95 > t.bad)        score -= 40;
  else if (p95 > t.acceptable) score -= 25;
  else if (p95 > t.good)  score -= 10;
  if (p50 > t.acceptable) score -= 20;
  else if (p50 > t.good)  score -= 10;
  score -= Math.min(40, Math.floor(errorRate * 400));
  return Math.max(0, score);
}

function recommendations(
  p50: number, p95: number, errorRate: number, _throughput: number,
  currentReplicas = 1, t: Thresholds = DEFAULT_THRESHOLDS, breakingPoint?: number,
): string[] {
  const recs: string[] = [];
  const maxRPS = BASE_RPS_1R * currentReplicas;

  if (errorRate > 0.05)
    recs.push("❌ Tasa de error >5% — revisar logs del servidor para errores de DB o timeout.");

  if (p95 > t.bad) {
    const neededReplicas = Math.ceil(currentReplicas * (p95 / t.bad));
    recs.push(`❌ P95 crítico con ${currentReplicas} réplica(s) — escalar a ${neededReplicas} réplicas.`);
  } else if (p95 > t.acceptable) {
    recs.push(`⚠️  P95 elevado — sistema bajo presión con ${currentReplicas} réplica(s); agregar 1 réplica extra.`);
  }

  if (p50 > t.good)
    recs.push("⚠️  Latencia promedio alta — revisar índices en transaction_logs.");

  if (breakingPoint) {
    const neededForBP = Math.max(currentReplicas + 1, Math.ceil(breakingPoint / 10));
    recs.push(`⚠️  Breaking point a ${breakingPoint} cajeros — se recomiendan ${neededForBP} réplicas.`);
  }

  if (errorRate === 0 && p95 < t.good)
    recs.push(`✅ Sistema saludable con ${currentReplicas} réplica(s) — capacidad estimada ~${maxRPS} RPS.`);

  return recs;
}

// ── SSE helper ────────────────────────────────────────────────────────────────

function sseWrite(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ── Setup / cleanup test data ─────────────────────────────────────────────────

async function setupTestBracelets(runId: string, count: number, eventId: string, balanceCents: number): Promise<string[]> {
  const uids: string[] = Array.from({ length: count }, (_, i) => `LOADTEST_${runId}_${i}`);
  for (const uid of uids) {
    await pool.query(
      `INSERT INTO bracelets (nfc_uid, event_id, last_known_balance, last_counter)
       VALUES ($1, $2, $3, 0)
       ON CONFLICT (nfc_uid) DO UPDATE SET last_known_balance = $3, last_counter = 0`,
      [uid, eventId, balanceCents],
    );
  }
  return uids;
}

async function cleanupTestData(runId: string) {
  const prefix = `LOADTEST_${runId}_%`;
  await pool.query(`DELETE FROM transaction_logs WHERE bracelet_uid LIKE $1`, [prefix]);
  await pool.query(`DELETE FROM top_ups WHERE nfc_uid LIKE $1`, [prefix]);
  await pool.query(`DELETE FROM bracelets WHERE nfc_uid LIKE $1`, [prefix]);
}

// ── Single simulated charge (bypasses NFC/HMAC for load testing) ──────────────

async function simulateCharge(braceletUid: string, amountCents: number, eventId: string): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const t0 = Date.now();
  try {
    const { rows } = await pool.query<{ last_known_balance: number; last_counter: number }>(
      `SELECT last_known_balance, last_counter FROM bracelets WHERE nfc_uid = $1 FOR UPDATE`,
      [braceletUid],
    );
    if (!rows[0]) return { ok: false, latencyMs: Date.now() - t0, error: "bracelet_not_found" };
    const { last_known_balance, last_counter } = rows[0];
    if (last_known_balance < amountCents) return { ok: false, latencyMs: Date.now() - t0, error: "insufficient_balance" };
    const newBalance = last_known_balance - amountCents;
    const newCounter = last_counter + 1;
    await pool.query(
      `UPDATE bracelets SET last_known_balance = $1, last_counter = $2 WHERE nfc_uid = $3`,
      [newBalance, newCounter, braceletUid],
    );
    await pool.query(
      `INSERT INTO transaction_logs (bracelet_uid, event_id, gross_amount, net_amount, new_balance, counter, performed_by_user_id)
       VALUES ($1, $2, $3, $3, $4, $5, 'LOADTEST')`,
      [braceletUid, eventId, amountCents, newBalance, newCounter],
    );
    return { ok: true, latencyMs: Date.now() - t0 };
  } catch (err: unknown) {
    return { ok: false, latencyMs: Date.now() - t0, error: String(err) };
  }
}

// ── Test runners ──────────────────────────────────────────────────────────────

async function runHealthCheck(res: Response, _runId: string, eventId: string) {
  const apiBase = process.env.API_SELF_URL ?? "http://localhost:3000";
  const endpoints = [
    { name: "health",      url: `${apiBase}/api/health` },
    { name: "events",      url: `${apiBase}/api/events` },
    { name: "bracelets",   url: `${apiBase}/api/bracelets?eventId=${eventId}&limit=1` },
  ];

  const endpointResults: Record<string, { p50: number; p95: number; p99: number; errors: number }> = {};
  const ROUNDS = 10;

  for (const ep of endpoints) {
    sseWrite(res, "progress", { phase: "checking", message: `Probando ${ep.name}...`, progress: 30 });
    const latencies: number[] = [];
    let errors = 0;
    for (let i = 0; i < ROUNDS; i++) {
      const t0 = Date.now();
      try {
        const r = await fetch(ep.url, { headers: { Authorization: `Bearer LOADTEST` } });
        if (!r.ok) errors++;
      } catch { errors++; }
      latencies.push(Date.now() - t0);
      await new Promise((r) => setTimeout(r, 50));
    }
    endpointResults[ep.name] = { p50: percentile(latencies, 50), p95: percentile(latencies, 95), p99: percentile(latencies, 99), errors };
  }

  const allLatencies = Object.values(endpointResults).flatMap((e) => [e.p50]);
  const avgP50 = allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length;
  const avgP95 = Object.values(endpointResults).map((e) => e.p95).reduce((a, b) => a + b, 0) / Object.keys(endpointResults).length;
  const totalErrors = Object.values(endpointResults).reduce((a, e) => a + e.errors, 0);
  const errorRate = totalErrors / (endpoints.length * ROUNDS);
  const score = calcScore(avgP50, avgP95, errorRate);

  return { endpoints: endpointResults, p50: avgP50, p95: avgP95, errorRate, score, recommendations: recommendations(avgP50, avgP95, errorRate, 0) };
}

async function runLoadTest(res: Response, runId: string, eventId: string, concurrency: number, durationSeconds: number) {
  const CHARGE_AMOUNT = 5000; // 50 COP per charge
  const INITIAL_BALANCE = 10_000_000; // 100,000 COP per bracelet

  sseWrite(res, "progress", { phase: "setup", message: `Creando ${concurrency} pulseras de prueba...`, progress: 5 });
  const uids = await setupTestBracelets(runId, concurrency, eventId, INITIAL_BALANCE);

  const latencies: number[] = [];
  let successCount = 0;
  let errorCount = 0;
  const endTime = Date.now() + durationSeconds * 1000;
  let txCount = 0;

  sseWrite(res, "progress", { phase: "running", message: `Ejecutando ${concurrency} cajeros virtuales por ${durationSeconds}s...`, progress: 20 });

  while (Date.now() < endTime) {
    const batch = uids.map((uid) => simulateCharge(uid, CHARGE_AMOUNT, eventId));
    const results = await Promise.all(batch);
    for (const r of results) {
      latencies.push(r.latencyMs);
      if (r.ok) successCount++; else errorCount++;
      txCount++;
    }
    const elapsed = Date.now() - (endTime - durationSeconds * 1000);
    const progress = Math.min(90, 20 + Math.floor((elapsed / (durationSeconds * 1000)) * 70));
    const throughput = txCount / (elapsed / 1000);
    sseWrite(res, "metric", { txCount, throughput: throughput.toFixed(1), p50: percentile(latencies, 50), p95: percentile(latencies, 95), errors: errorCount });
    sseWrite(res, "progress", { phase: "running", progress, message: `${txCount} tx | ${throughput.toFixed(0)} tx/s | p95=${percentile(latencies, 95)}ms` });
    await new Promise((r) => setTimeout(r, 100));
  }

  const elapsed = durationSeconds;
  const throughput = txCount / elapsed;
  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const p99 = percentile(latencies, 99);
  const errorRate = errorCount / Math.max(1, txCount);
  const score = calcScore(p50, p95, errorRate);

  sseWrite(res, "progress", { phase: "cleanup", message: "Limpiando datos de prueba...", progress: 95 });
  await cleanupTestData(runId);

  return { txCount, successCount, errorCount, throughput, p50, p95, p99, errorRate, score, recommendations: recommendations(p50, p95, errorRate, throughput) };
}

async function runBalanceIntegrity(res: Response, runId: string, eventId: string, concurrency: number) {
  const INITIAL_BALANCE = 10_000_000;
  const CHARGE_AMOUNT = 10000;
  const ROUNDS = 30;

  sseWrite(res, "progress", { phase: "setup", message: "Creando pulsera de prueba con saldo inicial...", progress: 10 });
  const [uid] = await setupTestBracelets(runId, 1, eventId, INITIAL_BALANCE);

  sseWrite(res, "progress", { phase: "running", message: `Ejecutando ${concurrency} cobros concurrentes × ${ROUNDS} rondas...`, progress: 30 });

  const latencies: number[] = [];
  let successCount = 0;
  let errorCount = 0;
  const expectedDeductions: number[] = [];

  for (let round = 0; round < ROUNDS; round++) {
    const batch = Array.from({ length: concurrency }, () => simulateCharge(uid, CHARGE_AMOUNT, eventId));
    const results = await Promise.all(batch);
    for (const r of results) {
      latencies.push(r.latencyMs);
      if (r.ok) { successCount++; expectedDeductions.push(CHARGE_AMOUNT); }
      else errorCount++;
    }
    sseWrite(res, "progress", { phase: "running", progress: 30 + Math.floor((round / ROUNDS) * 55), message: `Ronda ${round + 1}/${ROUNDS} — ${successCount} éxitos, ${errorCount} errores` });
  }

  sseWrite(res, "progress", { phase: "verifying", message: "Verificando integridad de saldo...", progress: 90 });

  const { rows } = await pool.query<{ last_known_balance: number }>(
    `SELECT last_known_balance FROM bracelets WHERE nfc_uid = $1`, [uid]
  );
  const finalBalance = rows[0]?.last_known_balance ?? 0;
  const totalDeducted = expectedDeductions.reduce((a, b) => a + b, 0);
  const expectedFinal = INITIAL_BALANCE - totalDeducted;
  const balanceMatch = finalBalance === expectedFinal;

  sseWrite(res, "progress", { phase: "cleanup", message: "Limpiando...", progress: 97 });
  await cleanupTestData(runId);

  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const errorRate = errorCount / Math.max(1, successCount + errorCount);
  const integrityScore = balanceMatch ? 100 : 0;
  const score = Math.floor((calcScore(p50, p95, errorRate) * 0.4) + (integrityScore * 0.6));

  const recs = recommendations(p50, p95, errorRate, 0);
  if (!balanceMatch) recs.unshift(`❌ INTEGRIDAD FALLIDA — saldo esperado: ${expectedFinal}, real: ${finalBalance}. Posible race condition.`);
  else recs.unshift("✅ Integridad de saldo confirmada — no se detectaron race conditions.");

  return { successCount, errorCount, p50, p95, errorRate, balanceMatch, expectedFinal, finalBalance, score, recommendations: recs };
}

async function runBreakingPoint(res: Response, runId: string, eventId: string) {
  const CHARGE_AMOUNT = 5000;
  const INITIAL_BALANCE = 100_000_000;
  const STEP_DURATION_MS = 8000;
  const MAX_CONCURRENCY = 40;
  const P95_THRESHOLD = 1000;
  const ERROR_RATE_THRESHOLD = 0.05;

  let breakingPoint: number | null = null;
  const stepsData: Array<{ concurrency: number; throughput: number; p50: number; p95: number; errorRate: number }> = [];

  for (let concurrency = 2; concurrency <= MAX_CONCURRENCY; concurrency += 2) {
    sseWrite(res, "progress", { phase: "ramping", message: `Probando ${concurrency} cajeros simultáneos...`, progress: Math.floor((concurrency / MAX_CONCURRENCY) * 85) });

    const uids = await setupTestBracelets(`${runId}_bp${concurrency}`, concurrency, eventId, INITIAL_BALANCE);
    const latencies: number[] = [];
    let successCount = 0;
    let errorCount = 0;
    const stepEnd = Date.now() + STEP_DURATION_MS;

    while (Date.now() < stepEnd) {
      const results = await Promise.all(uids.map((uid) => simulateCharge(uid, CHARGE_AMOUNT, eventId)));
      for (const r of results) {
        latencies.push(r.latencyMs);
        if (r.ok) successCount++; else errorCount++;
      }
    }

    const p50 = percentile(latencies, 50);
    const p95 = percentile(latencies, 95);
    const errorRate = errorCount / Math.max(1, successCount + errorCount);
    const throughput = (successCount + errorCount) / (STEP_DURATION_MS / 1000);
    stepsData.push({ concurrency, throughput, p50, p95, errorRate });

    sseWrite(res, "metric", { concurrency, throughput: throughput.toFixed(1), p50, p95, errorRate: (errorRate * 100).toFixed(1) });
    await cleanupTestData(`${runId}_bp${concurrency}`);

    if ((p95 > P95_THRESHOLD || errorRate > ERROR_RATE_THRESHOLD) && !breakingPoint) {
      breakingPoint = concurrency;
      sseWrite(res, "progress", { phase: "ramping", message: `⚠️ Breaking point detectado en ${concurrency} cajeros (p95=${p95}ms, errors=${(errorRate*100).toFixed(1)}%)`, progress: 88 });
      break;
    }
  }

  const lastStep = stepsData[stepsData.length - 1];
  const p50 = lastStep?.p50 ?? 0;
  const p95 = lastStep?.p95 ?? 0;
  const errorRate = lastStep?.errorRate ?? 0;
  const maxThroughput = Math.max(...stepsData.map((s) => s.throughput));

  const recommendedReplicas = breakingPoint
    ? Math.ceil((breakingPoint * 1.3) / (stepsData[0]?.throughput ?? 10))
    : 1;

  const score = calcScore(p50, p95, errorRate) - (breakingPoint && breakingPoint < 10 ? 20 : 0);
  const recs = recommendations(p50, p95, errorRate, maxThroughput, breakingPoint ? stepsData.find(s => s.concurrency === breakingPoint)?.throughput : undefined);
  if (breakingPoint) {
    recs.push(`📊 Breaking point: ${breakingPoint} cajeros simultáneos (${(stepsData.find(s => s.concurrency === breakingPoint)?.throughput ?? 0).toFixed(0)} tx/s)`);
    recs.push(`🔧 Réplicas recomendadas para el evento: ${recommendedReplicas}`);
  } else {
    recs.push(`✅ Sin breaking point hasta ${MAX_CONCURRENCY} cajeros (${maxThroughput.toFixed(0)} tx/s máximo)`);
  }

  return { breakingPoint, steps: stepsData, maxThroughput, recommendedReplicas, p50, p95, errorRate, score, recommendations: recs };
}

// ── Expo Push helper ──────────────────────────────────────────────────────────

async function sendExpoPush(tokens: string[], data: Record<string, unknown>, body: string) {
  if (tokens.length === 0) return;
  const messages = tokens.map((to) => ({
    to, sound: "default" as const, title: "🧪 Prueba de dispositivo",
    body, data, priority: "high" as const,
  }));
  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/vnd.expo.itunes-receipt+json" },
      body: JSON.stringify(messages),
    });
  } catch (err) {
    logger.warn({ err }, "Expo push send failed");
  }
}

// In-memory map for long-poll waiters: userId → resolve callback
const pendingPolls = new Map<string, (run: Record<string, unknown>) => void>();

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /load-test/runs — list historical runs
router.get("/load-test/runs", requireAuth, requireRole("admin"), async (_req: Request, res: Response) => {
  const { rows } = await pool.query(
    `SELECT id, event_id, test_type, status, score, results, created_at, completed_at,
            (SELECT name FROM events WHERE id = event_id) AS event_name
     FROM load_test_runs ORDER BY created_at DESC LIMIT 50`
  );
  res.json({ runs: rows });
});

// GET /load-test/railway/status — current replica counts
router.get("/load-test/railway/status", requireAuth, requireRole("admin"), async (_req: Request, res: Response) => {
  const statuses: Record<string, number> = {};
  for (const [key, svc] of Object.entries(RAILWAY_SERVICES)) {
    statuses[key] = await getRailwayReplicas(svc.id);
  }
  res.json({ services: statuses, servicesMeta: RAILWAY_SERVICES });
});

// POST /load-test/railway/scale — scale a service
router.post("/load-test/railway/scale", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const { service, replicas } = req.body as { service: string; replicas: number };
  const svc = RAILWAY_SERVICES[service];
  if (!svc) { res.status(400).json({ error: "Unknown service" }); return; }
  if (!Number.isInteger(replicas) || replicas < 1 || replicas > 10) { res.status(400).json({ error: "replicas must be 1-10" }); return; }
  const ok = await setRailwayReplicas(svc.id, replicas);
  if (ok) {
    logger.info({ service, replicas, user: (req as any).user?.id }, "Railway scale applied");
    res.json({ ok: true, service: svc.label, replicas });
  } else {
    res.status(500).json({ error: "Railway scaling failed" });
  }
});

// POST /load-test/runs — start a test run (SSE stream)
router.post("/load-test/runs", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const { testType, eventId, concurrency = 5, durationSeconds = 30 } = req.body as {
    testType: "health_check" | "load_test" | "balance_integrity" | "breaking_point";
    eventId: string;
    concurrency?: number;
    durationSeconds?: number;
  };

  if (!testType || !eventId) { res.status(400).json({ error: "testType and eventId required" }); return; }

  // Create run record
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO load_test_runs (event_id, test_type, config, status, started_at)
     VALUES ($1, $2, $3, 'running', NOW()) RETURNING id`,
    [eventId, testType, JSON.stringify({ concurrency, durationSeconds })],
  );
  const runId = rows[0].id;

  // Setup SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  sseWrite(res, "start", { runId, testType, eventId });

  // Fetch live Railway state before running — used for dynamic thresholds
  sseWrite(res, "progress", { phase: "setup", progress: 0, message: "Consultando estado de Railway..." });
  const liveReplicas = await getRailwayReplicas(RAILWAY_SERVICES["tapee-staff"].id).catch(() => 1);
  const liveThresholds = computeThresholds(liveReplicas);
  sseWrite(res, "infrastructure", { replicas: liveReplicas, thresholds: liveThresholds });

  // Sentry transaction
  const sentryTx = Sentry.startInactiveSpan({ name: `load-test:${testType}`, op: "load-test" });

  try {
    let results: Record<string, unknown> = {};

    sseWrite(res, "progress", { phase: "setup", progress: 2, message: `${liveReplicas} réplica(s) activa(s) — iniciando prueba...` });

    if (testType === "health_check") {
      results = await runHealthCheck(res, runId, eventId);
    } else if (testType === "load_test") {
      results = await runLoadTest(res, runId, eventId, Math.min(concurrency, 20), Math.min(durationSeconds, 120));
    } else if (testType === "balance_integrity") {
      results = await runBalanceIntegrity(res, runId, eventId, Math.min(concurrency, 15));
    } else if (testType === "breaking_point") {
      results = await runBreakingPoint(res, runId, eventId);
    }

    // Override score and recommendations with live Railway context
    const p50 = (results.p50 as number) ?? 0;
    const p95 = (results.p95 as number) ?? 0;
    const errorRate = (results.errorRate as number) ?? 0;
    const breakingPoint = (results.breakingPoint as number | null) ?? undefined;
    results.score = calcScore(p50, p95, errorRate, liveThresholds);
    results.recommendations = [
      ...(results.recommendations as string[] ?? []).filter((r: string) => r.startsWith("✅ Integridad") || r.startsWith("❌ INTEGRIDAD")),
      ...recommendations(p50, p95, errorRate, 0, liveReplicas, liveThresholds, breakingPoint),
    ];
    results.currentReplicas = liveReplicas;
    results.thresholds = liveThresholds;

    const score = results.score as number;

    await pool.query(
      `UPDATE load_test_runs SET status = 'completed', score = $1, results = $2, completed_at = NOW() WHERE id = $3`,
      [score, JSON.stringify(results), runId],
    );

    Sentry.setMeasurement("load_test.score", score, "none");
    Sentry.setMeasurement("load_test.p95", p95, "millisecond");
    Sentry.setMeasurement("load_test.error_rate", errorRate, "ratio");
    Sentry.setMeasurement("load_test.replicas", liveReplicas, "none");

    sseWrite(res, "complete", { runId, score, results });
    logger.info({ runId, testType, score, liveReplicas }, "Load test completed");
  } catch (err) {
    logger.error({ err, runId }, "Load test failed");
    Sentry.captureException(err);
    await pool.query(`UPDATE load_test_runs SET status = 'failed', completed_at = NOW() WHERE id = $1`, [runId]);
    sseWrite(res, "error", { runId, error: String(err) });
  } finally {
    sentryTx.end();
    res.end();
  }
});

// ── Device Test Routes ────────────────────────────────────────────────────────

// POST /load-test/device-test/start — admin triggers test, push sent to devices
router.post("/load-test/device-test/start", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const { eventId, numCharges = 10, chargeAmountCents = 5000 } = req.body as {
    eventId: string; numCharges?: number; chargeAmountCents?: number;
  };
  if (!eventId) { res.status(400).json({ error: "eventId required" }); return; }

  const { rows: runRows } = await pool.query<{ id: string }>(
    `INSERT INTO device_test_runs (event_id, status, config) VALUES ($1, 'pending', $2) RETURNING id`,
    [eventId, JSON.stringify({ numCharges, chargeAmountCents })],
  );
  const runId = runRows[0].id;

  // Pre-create a test bracelet with enough balance for all devices
  const braceletUid = `DEVTEST_${runId}`;
  await pool.query(
    `INSERT INTO bracelets (nfc_uid, event_id, last_known_balance, last_counter)
     VALUES ($1, $2, $3, 0)
     ON CONFLICT (nfc_uid) DO UPDATE SET last_known_balance = $3, last_counter = 0`,
    [braceletUid, eventId, numCharges * chargeAmountCents * 100],
  );

  const { rows: users } = await pool.query<{ id: string; expo_push_token: string }>(
    `SELECT id, expo_push_token FROM users
     WHERE event_id = $1 AND expo_push_token IS NOT NULL
       AND role IN ('bank', 'event_admin', 'merchant_staff')`,
    [eventId],
  );

  const tokens = users.map((u) => u.expo_push_token).filter(Boolean);
  const pushData = { type: "device_test", runId, eventId, braceletUid, numCharges, chargeAmountCents };
  await sendExpoPush(tokens, pushData, `${numCharges} cobros de prueba listos. Abre la app para ejecutar.`);

  // Wake any waiting long-poll listeners
  for (const [uid, resolve] of pendingPolls.entries()) {
    resolve({ id: runId, config: pushData });
    pendingPolls.delete(uid);
  }

  logger.info({ runId, eventId, devicesNotified: tokens.length }, "Device test started");
  res.json({ runId, devicesNotified: tokens.length, braceletUid });
});

// GET /load-test/device-test/pending — long poll fallback (45 s max)
router.get("/load-test/device-test/pending", requireAuth, async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { id: string; eventId?: string } }).user!;

  const { rows } = await pool.query<{ id: string; config: unknown }>(
    `SELECT id, config FROM device_test_runs
     WHERE status = 'pending' AND event_id = $1
       AND created_at > NOW() - INTERVAL '5 minutes'
     ORDER BY created_at DESC LIMIT 1`,
    [user.eventId ?? ""],
  );
  if (rows[0]) { res.json({ run: rows[0] }); return; }

  const timer = setTimeout(() => {
    pendingPolls.delete(user.id);
    res.status(204).end();
  }, 45_000);

  pendingPolls.set(user.id, (run) => {
    clearTimeout(timer);
    res.json({ run });
  });

  req.on("close", () => {
    clearTimeout(timer);
    pendingPolls.delete(user.id);
  });
});

// POST /load-test/device-test/fire-charge — one charge fired by a real device
router.post("/load-test/device-test/fire-charge", requireAuth, async (req: Request, res: Response) => {
  const { braceletUid, amountCents, eventId } = req.body as {
    braceletUid: string; amountCents: number; eventId: string;
  };
  if (!braceletUid?.startsWith("DEVTEST_")) {
    res.status(400).json({ error: "Invalid bracelet for device test" }); return;
  }
  const result = await simulateCharge(braceletUid, amountCents, eventId);
  res.json(result);
});

// POST /load-test/device-test/results — device reports aggregated results
router.post("/load-test/device-test/results", requireAuth, async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { id: string } }).user!;
  const { runId, deviceName, latencies, successCount, errorCount } = req.body as {
    runId: string; deviceName: string; latencies: number[];
    successCount: number; errorCount: number;
  };

  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);

  await pool.query(
    `INSERT INTO device_test_results
       (run_id, user_id, device_name, latencies, success_count, error_count, p50, p95)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (run_id, user_id) DO UPDATE
       SET latencies = $4, success_count = $5, error_count = $6, p50 = $7, p95 = $8,
           completed_at = NOW()`,
    [runId, user.id, deviceName, JSON.stringify(latencies), successCount, errorCount, p50, p95],
  );

  await pool.query(
    `UPDATE device_test_runs SET status = 'running' WHERE id = $1 AND status = 'pending'`,
    [runId],
  );

  res.json({ ok: true, p50, p95 });
});

// POST /load-test/device-test/complete — device signals it finished
router.post("/load-test/device-test/complete", requireAuth, async (req: Request, res: Response) => {
  const { runId } = req.body as { runId: string };
  const { rows } = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt FROM device_test_results WHERE run_id = $1`, [runId],
  );
  if (Number(rows[0]?.cnt) > 0) {
    await pool.query(
      `UPDATE device_test_runs SET status = 'completed', completed_at = NOW() WHERE id = $1`,
      [runId],
    );
    await pool.query(
      `DELETE FROM transaction_logs WHERE bracelet_uid = $1`, [`DEVTEST_${runId}`],
    );
    await pool.query(`DELETE FROM bracelets WHERE nfc_uid = $1`, [`DEVTEST_${runId}`]);
  }
  res.json({ ok: true });
});

// GET /load-test/device-test/runs — list runs with per-device results
router.get("/load-test/device-test/runs", requireAuth, requireRole("admin"), async (_req: Request, res: Response) => {
  const { rows } = await pool.query(
    `SELECT r.id, r.event_id, r.status, r.config, r.created_at, r.completed_at,
            e.name AS event_name,
            COALESCE(
              json_agg(
                json_build_object(
                  'userId', dr.user_id, 'deviceName', dr.device_name,
                  'p50', dr.p50, 'p95', dr.p95,
                  'successCount', dr.success_count, 'errorCount', dr.error_count,
                  'completedAt', dr.completed_at
                ) ORDER BY dr.completed_at
              ) FILTER (WHERE dr.id IS NOT NULL),
              '[]'
            ) AS device_results
     FROM device_test_runs r
     LEFT JOIN events e ON e.id = r.event_id
     LEFT JOIN device_test_results dr ON dr.run_id = r.id
     GROUP BY r.id, e.name
     ORDER BY r.created_at DESC LIMIT 20`,
  );
  res.json({ runs: rows });
});

export default router;
