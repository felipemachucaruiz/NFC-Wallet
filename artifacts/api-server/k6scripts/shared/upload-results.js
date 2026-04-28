/**
 * Helpers for k6 handleSummary — compute score, build recommendations,
 * and optionally upload results to the admin panel.
 *
 * Uploading is opt-in via UPLOAD_TOKEN env var. If not set, results are
 * only printed to stdout. Set UPLOAD_TOKEN to a valid admin session token.
 */

import http from "k6/http";
import { STAFF_API } from "./config.js";

/**
 * Compute a 0–100 score from performance metrics.
 * Mirrors the server-side calcScore() in loadTest.ts.
 */
export function computeScore(p50, p95, errorRate) {
  let score = 100;
  if      (p95 > 1500) score -= 40;
  else if (p95 > 1000) score -= 25;
  else if (p95 >  500) score -= 10;
  if      (p50 > 1000) score -= 20;
  else if (p50 >  500) score -= 10;
  score -= Math.min(40, Math.floor(errorRate * 400));
  return Math.max(0, score);
}

/**
 * Build Spanish-language recommendations from metrics.
 */
export function buildRecommendations(p50, p95, errorRate, throughput) {
  const recs = [];
  if (errorRate > 0.05)
    recs.push("❌ Tasa de error >5% — revisar logs del servidor para errores de DB o timeout.");
  if (p95 > 1500)
    recs.push("❌ P95 crítico (>1.5s) — escalar réplicas o investigar consultas lentas.");
  else if (p95 > 1000)
    recs.push("⚠️  P95 elevado (>1s) — sistema bajo presión; considerar escalar.");
  if (p50 > 500)
    recs.push("⚠️  Latencia promedio alta — revisar índices en transaction_logs / bracelets.");
  if (errorRate === 0 && p95 < 500)
    recs.push(`✅ Sistema saludable — capacidad estimada ~${Math.round(throughput || 0)} RPS.`);
  return recs;
}

/**
 * Upload results to the admin panel history.
 * Reads UPLOAD_TOKEN and EVENT_ID from env vars — silent if UPLOAD_TOKEN not set.
 *
 * @param {string} script   Script name (e.g. "merchant-charge")
 * @param {object} results  Results object: { p50, p95, errorRate, throughput, score, txCount, ... }
 */
export function uploadResults(script, results) {
  const token   = __ENV.UPLOAD_TOKEN;
  const eventId = __ENV.UPLOAD_EVENT_ID || __ENV.EVENT_ID || null;
  if (!token) return;

  const res = http.post(
    `${STAFF_API}/api/load-test/k6-results`,
    JSON.stringify({ script, eventId, results }),
    { headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } },
  );
  if (res.status !== 200) {
    console.warn(`[upload] HTTP ${res.status} — ${res.body}`);
  } else {
    console.log(`[upload] Results saved (runId=${res.json("runId")}, score=${res.json("score")})`);
  }
}
