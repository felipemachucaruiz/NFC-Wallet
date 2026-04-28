/**
 * Bank Topup Load Test
 *
 * Tests POST /api/topups under concurrent bank cashier load.
 * The server computes the new HMAC — this script just needs the NFC UID
 * and charge amount. Tests the full HTTP stack including attestation.
 *
 * Required env vars:
 *   DEMO_SECRET        — staff demo login secret
 *   EVENT_ID           — target event ID
 *   ATTESTATION_TOKEN  — pre-registered device attestation token
 *                        Seed one: INSERT INTO attestation_tokens (token_hash, expires_at)
 *                        VALUES (encode(sha256('loadtest-token'), 'hex'), NOW() + INTERVAL '1 day');
 *
 * Optional:
 *   VUS                — concurrent cashiers (default: 10)
 *   TOPUP_CENTS        — amount per topup (default: 50000 = $500 COP)
 *   BRACELET_COUNT     — test bracelets to create (default: 10)
 *   STAFF_API_URL      — override API base (default: https://prod.tapee.app)
 *   UPLOAD_TOKEN       — admin session token to save results to admin panel
 *
 * The setup endpoint creates test bracelets and the teardown cleans them up.
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";
import { loginAs } from "./shared/staff-auth.js";
import { computeScore, buildRecommendations, uploadResults } from "./shared/upload-results.js";
import { STAFF_API, ATTESTATION_TOKEN } from "./shared/config.js";

const errorRate   = new Rate("topup_error_rate");
const topupDuration = new Trend("topup_duration_ms", true);

const VUS         = parseInt(__ENV.VUS || "10");
const TOPUP_CENTS = parseInt(__ENV.TOPUP_CENTS || "50000");

export const options = {
  scenarios: {
    cashier_load: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "20s", target: VUS  },
        { duration: "90s", target: VUS  },
        { duration: "20s", target: 0    },
      ],
    },
  },
  thresholds: {
    topup_duration_ms: ["p(95)<2000"],
    topup_error_rate:  ["rate<0.02"],
  },
};

export function setup() {
  if (!ATTESTATION_TOKEN) throw new Error("Set ATTESTATION_TOKEN env var");
  const token = loginAs("bank");

  const setupRes = http.post(
    `${STAFF_API}/api/load-test/k6-setup`,
    JSON.stringify({ eventId: __ENV.EVENT_ID, braceletCount: VUS }),
    { headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } },
  );
  if (setupRes.status !== 200) throw new Error(`k6-setup failed: ${setupRes.body}`);

  const ctx = setupRes.json();
  return { token, runId: ctx.runId, bracelets: ctx.bracelets };
}

export default function ({ token, bracelets }) {
  const uid = bracelets[(__VU - 1) % bracelets.length].uid;

  const start = Date.now();
  const res = http.post(
    `${STAFF_API}/api/topups`,
    JSON.stringify({ nfcUid: uid, amount: TOPUP_CENTS, paymentMethod: "cash" }),
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-attestation-token": ATTESTATION_TOKEN,
      },
    },
  );
  topupDuration.add(Date.now() - start);

  const ok = res.status === 201 || res.status === 200;
  errorRate.add(!ok);
  check(res, { "topup accepted": () => ok });
  if (!ok) console.error(`VU ${__VU} topup failed: HTTP ${res.status} — ${res.body}`);

  sleep(0.5);
}

export function teardown({ token, runId, bracelets }) {
  http.post(
    `${STAFF_API}/api/load-test/k6-cleanup`,
    JSON.stringify({ runId, braceletUids: bracelets.map((b) => b.uid) }),
    { headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } },
  );
}

export function handleSummary(data) {
  const p50       = Math.round(data.metrics.topup_duration_ms?.values?.["p(50)"] ?? 0);
  const p95       = Math.round(data.metrics.topup_duration_ms?.values?.["p(95)"] ?? 0);
  const errorRt   = data.metrics.topup_error_rate?.values?.rate ?? 0;
  const iters     = data.metrics.iterations?.values?.count ?? 0;
  const rps       = data.metrics.iterations?.values?.rate ?? 0;
  const score     = computeScore(p50, p95, errorRt);
  const recs      = buildRecommendations(p50, p95, errorRt, rps);

  const results = { script: "topup", p50, p95, errorRate: errorRt, throughput: rps, txCount: iters, score, recommendations: recs };
  uploadResults("topup", results);

  const lines = [
    "", "══════════════════════════════════",
    "   Bank Topup Load Test — Summary  ",
    "══════════════════════════════════",
    `  Topups processed : ${iters}`,
    `  Throughput       : ${rps.toFixed(1)} req/s`,
    `  Latency p50/p95  : ${p50}ms / ${p95}ms`,
    `  Error rate       : ${(errorRt * 100).toFixed(2)}%`,
    `  Score            : ${score}/100`,
    "", ...recs, "══════════════════════════════════", "",
  ];
  return { stdout: lines.join("\n") };
}
