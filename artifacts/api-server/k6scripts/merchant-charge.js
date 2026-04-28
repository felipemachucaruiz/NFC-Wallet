/**
 * Merchant Charge Load Test
 *
 * Simulates concurrent POS terminals charging bracelets via POST /api/transactions/log.
 * Each VU owns one bracelet and fires charges with real HMAC signatures, testing the
 * full HTTP stack: auth, attestation, HMAC verification, inventory deduction, and DB locking.
 *
 * Required env vars:
 *   DEMO_SECRET        — staff demo login secret
 *   EVENT_ID           — target event ID (must have at least one merchant with products)
 *   ATTESTATION_TOKEN  — pre-registered attestation token
 *
 * Optional:
 *   VUS                — concurrent POS terminals (default: 15)
 *   DURATION_SECS      — test duration in seconds (default: 120)
 *   CHARGE_CENTS       — charge per transaction (default: 8000 = $80 COP)
 *   STAFF_API_URL      — override API base (default: https://prod.tapee.app)
 *   UPLOAD_TOKEN       — admin token to save results to admin panel
 *
 * Note: The k6-setup endpoint seeds test bracelets and returns the event's signing key.
 * Each VU tracks its own bracelet balance/counter and computes HMACs locally.
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";
import { hmac } from "k6/crypto";
import { loginAs } from "./shared/staff-auth.js";
import { computeScore, buildRecommendations, uploadResults } from "./shared/upload-results.js";
import { STAFF_API, ATTESTATION_TOKEN } from "./shared/config.js";

const chargeSuccess  = new Counter("charge_success");
const chargeError    = new Counter("charge_error");
const errorRate      = new Rate("charge_error_rate");
const chargeDuration = new Trend("charge_duration_ms", true);

const VUS          = parseInt(__ENV.VUS || "15");
const DURATION     = parseInt(__ENV.DURATION_SECS || "120");
const CHARGE_CENTS = parseInt(__ENV.CHARGE_CENTS || "8000");

// Per-VU mutable state (each VU has its own copy — NOT shared between VUs)
let _vuBracelet   = null; // { uid, balance, counter }
let _locationId   = null;
let _productId    = null;
let _signingKey   = null;
let _token        = null;

export const options = {
  scenarios: {
    pos_load: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "20s",            target: VUS  },
        { duration: `${DURATION}s`,   target: VUS  },
        { duration: "20s",            target: 0    },
      ],
    },
  },
  thresholds: {
    charge_duration_ms: ["p(95)<2000"],
    charge_error_rate:  ["rate<0.02"],
  },
};

export function setup() {
  if (!ATTESTATION_TOKEN) throw new Error("Set ATTESTATION_TOKEN env var");
  const token = loginAs("merchant_staff");

  const setupRes = http.post(
    `${STAFF_API}/api/load-test/k6-setup`,
    JSON.stringify({ eventId: __ENV.EVENT_ID, braceletCount: VUS }),
    { headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } },
  );
  if (setupRes.status !== 200) throw new Error(`k6-setup failed: ${setupRes.body}`);

  const ctx = setupRes.json();
  if (!ctx.locationId) throw new Error("No active location found for event — seed a merchant with products first");
  if (!ctx.products?.length) throw new Error("No active products found for event");
  if (!ctx.signingKey) throw new Error("No signing key returned — check HMAC_SECRET or event config");

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
  // Initialize per-VU state on first iteration
  if (!_vuBracelet) {
    const idx = (__VU - 1) % data.bracelets.length;
    _vuBracelet  = { ...data.bracelets[idx] };
    _locationId  = data.locationId;
    _productId   = data.productId;
    _signingKey  = data.signingKey;
    _token       = data.token;
  }

  const uid        = _vuBracelet.uid;
  const newBalance = _vuBracelet.balance - CHARGE_CENTS;
  const newCounter = _vuBracelet.counter + 1;

  if (newBalance < 0) {
    // Bracelet drained — refill virtually for sustained load testing
    _vuBracelet.balance = 10_000_000;
    return;
  }

  // KDF-format HMAC: HMAC-SHA256(signingKey, "balance:counter:uid")
  const sig = hmac("sha256", _signingKey, `${newBalance}:${newCounter}:${uid}`, "hex");

  const body = JSON.stringify({
    idempotencyKey: `LT_${uid}_${newCounter}_${Date.now()}`,
    nfcUid:         uid,
    locationId:     _locationId,
    newBalance,
    counter:        newCounter,
    hmac:           sig,
    lineItems:      [{ productId: _productId, quantity: 1 }],
  });

  const start = Date.now();
  const res = http.post(
    `${STAFF_API}/api/transactions/log`,
    body,
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${_token}`,
        "x-attestation-token": ATTESTATION_TOKEN,
      },
    },
  );
  chargeDuration.add(Date.now() - start);

  const ok = res.status === 201;
  errorRate.add(!ok);

  if (ok) {
    chargeSuccess.add(1);
    _vuBracelet.balance = newBalance;
    _vuBracelet.counter = newCounter;
  } else {
    chargeError.add(1);
    if (res.status !== 409) { // 409 = duplicate idempotency key (benign)
      console.error(`VU ${__VU} charge failed: HTTP ${res.status} — ${res.body}`);
    }
  }

  sleep(0.2);
}

export function teardown(data) {
  http.post(
    `${STAFF_API}/api/load-test/k6-cleanup`,
    JSON.stringify({ runId: data.runId, braceletUids: data.bracelets.map((b) => b.uid) }),
    { headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.token}` } },
  );
}

export function handleSummary(data) {
  const p50       = Math.round(data.metrics.charge_duration_ms?.values?.["p(50)"] ?? 0);
  const p95       = Math.round(data.metrics.charge_duration_ms?.values?.["p(95)"] ?? 0);
  const p99       = Math.round(data.metrics.charge_duration_ms?.values?.["p(99)"] ?? 0);
  const success   = data.metrics.charge_success?.values?.count  ?? 0;
  const errors    = data.metrics.charge_error?.values?.count    ?? 0;
  const errorRt   = data.metrics.charge_error_rate?.values?.rate ?? 0;
  const rps       = data.metrics.iterations?.values?.rate        ?? 0;
  const score     = computeScore(p50, p95, errorRt);
  const recs      = buildRecommendations(p50, p95, errorRt, rps);

  const results = {
    script: "merchant-charge", p50, p95, p99,
    errorRate: errorRt, throughput: rps,
    txCount: success + errors, successCount: success, errorCount: errors,
    score, recommendations: recs,
  };
  uploadResults("merchant-charge", results);

  const lines = [
    "", "════════════════════════════════════════",
    "   Merchant Charge Load Test — Summary  ",
    "════════════════════════════════════════",
    `  Charges succeeded : ${success}`,
    `  Charges failed    : ${errors}`,
    `  Throughput        : ${rps.toFixed(1)} tx/s`,
    `  Latency p50/p95   : ${p50}ms / ${p95}ms`,
    `  Latency p99       : ${p99}ms`,
    `  Error rate        : ${(errorRt * 100).toFixed(2)}%`,
    `  Score             : ${score}/100`,
    "", ...recs, "════════════════════════════════════════", "",
  ];
  return { stdout: lines.join("\n") };
}
