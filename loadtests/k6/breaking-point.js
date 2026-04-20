/**
 * Breaking Point Test
 *
 * Steps up concurrent POS terminals from 2 to 40 in stages of 2, measuring
 * p95 latency and error rate at each level. Automatically aborts when
 * p95 > 1000ms or error rate > 5%, identifying the system's breaking point.
 *
 * Required env vars:
 *   DEMO_SECRET        — staff demo login secret
 *   EVENT_ID           — target event ID
 *   ATTESTATION_TOKEN  — pre-registered attestation token
 *
 * Optional:
 *   P95_THRESHOLD_MS   — abort threshold for p95 (default: 1000)
 *   STAFF_API_URL      — override API base
 *   UPLOAD_TOKEN       — admin token to save results
 *
 * The test reports the breaking point (VU count where degradation started)
 * and recommends how many Railway replicas are needed.
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";
import { hmac } from "k6/crypto";
import { loginAs } from "./shared/staff-auth.js";
import { computeScore, buildRecommendations, uploadResults } from "./shared/upload-results.js";
import { STAFF_API, ATTESTATION_TOKEN } from "./shared/config.js";

const errorRate      = new Rate("bp_error_rate");
const chargeDuration = new Trend("bp_charge_duration_ms", true);

const P95_THRESHOLD = parseInt(__ENV.P95_THRESHOLD_MS || "1000");
const CHARGE_CENTS  = 8000;
const MAX_VUS       = 40;

let _vuBracelet  = null;
let _locationId  = null;
let _productId   = null;
let _signingKey  = null;
let _token       = null;

export const options = {
  scenarios: {
    breaking_point: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 2  },
        { duration: "30s", target: 4  },
        { duration: "30s", target: 6  },
        { duration: "30s", target: 8  },
        { duration: "30s", target: 10 },
        { duration: "30s", target: 15 },
        { duration: "30s", target: 20 },
        { duration: "30s", target: 25 },
        { duration: "30s", target: 30 },
        { duration: "30s", target: 40 },
      ],
      gracefulStop: "10s",
    },
  },
  thresholds: {
    // abortOnFail stops the test as soon as p95 or error rate exceeds threshold.
    // The max VU count at that point is the breaking point.
    bp_charge_duration_ms: [{ threshold: `p(95)<${P95_THRESHOLD}`, abortOnFail: true, delayAbortEval: "30s" }],
    bp_error_rate:         [{ threshold: "rate<0.05",              abortOnFail: true, delayAbortEval: "30s" }],
  },
};

export function setup() {
  if (!ATTESTATION_TOKEN) throw new Error("Set ATTESTATION_TOKEN env var");
  const token = loginAs("merchant_staff");

  const setupRes = http.post(
    `${STAFF_API}/api/load-test/k6-setup`,
    JSON.stringify({ eventId: __ENV.EVENT_ID, braceletCount: MAX_VUS }),
    { headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } },
  );
  if (setupRes.status !== 200) throw new Error(`k6-setup failed: ${setupRes.body}`);

  const ctx = setupRes.json();
  if (!ctx.locationId) throw new Error("No active location found for event");
  if (!ctx.products?.length) throw new Error("No active products found for event");

  return {
    token,
    runId:      ctx.runId,
    bracelets:  ctx.bracelets,
    locationId: ctx.locationId,
    productId:  ctx.products[0].id,
    signingKey: ctx.signingKey,
  };
}

export default function (data) {
  if (!_vuBracelet) {
    const idx   = (__VU - 1) % data.bracelets.length;
    _vuBracelet = { ...data.bracelets[idx] };
    _locationId = data.locationId;
    _productId  = data.productId;
    _signingKey = data.signingKey;
    _token      = data.token;
  }

  const uid        = _vuBracelet.uid;
  const newBalance = _vuBracelet.balance - CHARGE_CENTS;
  const newCounter = _vuBracelet.counter + 1;

  if (newBalance < 0) { _vuBracelet.balance = 10_000_000; return; }

  const sig = hmac("sha256", _signingKey, `${newBalance}:${newCounter}:${uid}`, "hex");

  const start = Date.now();
  const res = http.post(
    `${STAFF_API}/api/transactions/log`,
    JSON.stringify({
      idempotencyKey: `BP_${uid}_${newCounter}_${Date.now()}`,
      nfcUid: uid, locationId: _locationId, newBalance, counter: newCounter,
      hmac: sig, lineItems: [{ productId: _productId, quantity: 1 }],
    }),
    {
      headers: {
        "Content-Type": "application/json",
        Authorization:  `Bearer ${_token}`,
        "x-attestation-token": ATTESTATION_TOKEN,
      },
    },
  );
  chargeDuration.add(Date.now() - start);

  const ok = res.status === 201;
  errorRate.add(!ok);
  check(res, { "charge accepted": () => ok });

  if (ok) {
    _vuBracelet.balance = newBalance;
    _vuBracelet.counter = newCounter;
  }

  sleep(0.1);
}

export function teardown(data) {
  http.post(
    `${STAFF_API}/api/load-test/k6-cleanup`,
    JSON.stringify({ runId: data.runId, braceletUids: data.bracelets.map((b) => b.uid) }),
    { headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.token}` } },
  );
}

export function handleSummary(data) {
  const p50      = Math.round(data.metrics.bp_charge_duration_ms?.values?.["p(50)"] ?? 0);
  const p95      = Math.round(data.metrics.bp_charge_duration_ms?.values?.["p(95)"] ?? 0);
  const p99      = Math.round(data.metrics.bp_charge_duration_ms?.values?.["p(99)"] ?? 0);
  const errorRt  = data.metrics.bp_error_rate?.values?.rate ?? 0;
  const rps      = data.metrics.iterations?.values?.rate    ?? 0;
  const maxVus   = Math.round(data.metrics.vus?.values?.max ?? 0);

  // If abortOnFail triggered, maxVus is the breaking point
  const thresholdTripped =
    (data.metrics.bp_charge_duration_ms?.thresholds?.["p(95)<" + P95_THRESHOLD]?.ok === false) ||
    (data.metrics.bp_error_rate?.thresholds?.["rate<0.05"]?.ok === false);

  const breakingPoint = thresholdTripped ? maxVus : null;
  const recommendedReplicas = breakingPoint ? Math.max(2, Math.ceil(breakingPoint / 10)) : 1;

  const score = computeScore(p50, p95, errorRt) - (breakingPoint && breakingPoint < 10 ? 20 : 0);
  const recs  = buildRecommendations(p50, p95, errorRt, rps);
  if (breakingPoint) {
    recs.push(`⚠️  Breaking point: ${breakingPoint} cajeros simultáneos`);
    recs.push(`🔧 Réplicas recomendadas: ${recommendedReplicas}`);
  } else {
    recs.push(`✅ Sin breaking point hasta ${maxVus} cajeros — sistema robusto.`);
  }

  const results = {
    script: "breaking-point", p50, p95, p99,
    errorRate: errorRt, throughput: rps, breakingPoint,
    recommendedReplicas, score, recommendations: recs,
  };
  uploadResults("breaking-point", results);

  const lines = [
    "", "═══════════════════════════════════════",
    "   Breaking Point Test — Summary       ",
    "═══════════════════════════════════════",
    `  Max VUs reached   : ${maxVus}`,
    breakingPoint
      ? `  ⚠️  Breaking point  : ${breakingPoint} POS simultáneos`
      : `  ✅ No breaking point up to ${maxVus} POS`,
    `  Throughput        : ${rps.toFixed(1)} tx/s`,
    `  Latency p50/p95   : ${p50}ms / ${p95}ms`,
    `  Error rate        : ${(errorRt * 100).toFixed(2)}%`,
    `  Score             : ${score}/100`,
    "", ...recs, "═══════════════════════════════════════", "",
  ];
  return { stdout: lines.join("\n") };
}
