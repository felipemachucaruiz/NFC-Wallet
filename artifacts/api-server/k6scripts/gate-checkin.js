/**
 * Gate Check-In Rush Test
 *
 * Simulates a burst of simultaneous gate entries at event doors-open.
 * Tests the full HTTP stack end-to-end (unlike the internal server-side load tests
 * which bypass HTTP and go directly to the DB).
 *
 * Required env vars:
 *   DEMO_SECRET        — staff demo login secret
 *   EVENT_ID           — target event ID
 *   QR_TOKENS          — comma-separated list of pre-seeded QR token strings
 *                        (generate via the attendee app or seeded tickets in the DB)
 *
 * Optional:
 *   VUS                — peak concurrent gate scanners (default: 15)
 *   STAFF_API_URL      — override API base (default: https://prod.tapee.app)
 *
 * Setup:
 *   1. Seed test tickets and extract their qrToken values from the DB:
 *      SELECT token FROM tickets WHERE event_id = '<id>' LIMIT 100;
 *   2. Run: k6 run -e DEMO_SECRET=... -e EVENT_ID=... \
 *             -e QR_TOKENS=tok1,tok2,...,tokN gate-checkin.js
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";
import { SharedArray } from "k6/data";
import { loginAs } from "./shared/staff-auth.js";
import { STAFF_API } from "./shared/config.js";

const errorRate = new Rate("checkin_error_rate");
const checkinDuration = new Trend("checkin_duration_ms", true);

const qrTokens = new SharedArray("qr_tokens", () => {
  const raw = __ENV.QR_TOKENS || "";
  if (!raw) return [];
  return raw.split(",").map((t) => t.trim()).filter(Boolean);
});

export const options = {
  scenarios: {
    gate_rush: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "20s", target: parseInt(__ENV.VUS || "15") }, // ramp up (gates open)
        { duration: "2m",  target: parseInt(__ENV.VUS || "15") }, // sustained peak
        { duration: "20s", target: 0 },                           // ramp down
      ],
    },
  },
  thresholds: {
    checkin_duration_ms: ["p(95)<2000"],
    checkin_error_rate: ["rate<0.02"],
  },
};

export function setup() {
  if (qrTokens.length === 0) {
    throw new Error("No QR tokens loaded — set QR_TOKENS env var (comma-separated)");
  }
  const token = loginAs("gate");
  return { token };
}

export default function ({ token }) {
  // Rotate through available QR tokens — in production each is single-use,
  // but for benchmarking latency the server will return ALREADY_CHECKED_IN
  // which still exercises the full auth/validation path.
  const qrToken = qrTokens[(__VU - 1) % qrTokens.length];
  const braceletNfcUid = `BENCH_${String(__VU).padStart(6, "0")}_${__ITER}`;

  const start = Date.now();
  const res = http.post(
    `${STAFF_API}/api/gate/ticket-checkin`,
    JSON.stringify({ qrToken, braceletNfcUid }),
    { headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } },
  );
  checkinDuration.add(Date.now() - start);

  // Accept 200 (success) and known business errors (already checked in, invalid token)
  // as non-errors — we're benchmarking latency, not testing logic here.
  const isOk = res.status === 200
    || res.status === 400  // invalid qr token
    || res.status === 409; // already checked in

  errorRate.add(!isOk);
  check(res, { "responded within 2s": () => res.timings.duration < 2000 });

  sleep(0.1);
}
