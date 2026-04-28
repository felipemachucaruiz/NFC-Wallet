/**
 * Ticket Sold-Out Race Condition Test
 *
 * Fires N concurrent purchase requests against a near-sold-out ticket type.
 * Verifies that the inventory guard holds — no more than EXPECTED_CAPACITY
 * orders are confirmed regardless of concurrency.
 *
 * Required env vars:
 *   BUYER_EMAIL        — attendee account email (pre-seeded in DB)
 *   BUYER_PASSWORD     — attendee account password
 *   EVENT_ID           — target event ID
 *   TICKET_TYPE_ID     — ticket type with limited free inventory
 *   EXPECTED_CAPACITY  — number of tickets available (for summary check)
 *
 * Optional:
 *   VUS                — concurrent virtual users (default: 50)
 *   ATTENDEE_API_URL   — override API base (default: https://attendee.tapee.app)
 *
 * Setup:
 *   1. Create a test event with a free ticket type (price = 0, quantity = e.g. 5)
 *   2. Create a test attendee account with known email/password
 *   3. Run: k6 run -e BUYER_EMAIL=... -e BUYER_PASSWORD=... -e EVENT_ID=... \
 *             -e TICKET_TYPE_ID=... -e EXPECTED_CAPACITY=5 ticket-soldout.js
 */

import http from "k6/http";
import { check } from "k6";
import { Counter, Trend } from "k6/metrics";
import { loginAttendee } from "./shared/attendee-auth.js";
import { ATTENDEE_API } from "./shared/config.js";

const purchaseSuccess = new Counter("purchase_success");
const purchaseSoldOut = new Counter("purchase_soldout");
const purchaseError = new Counter("purchase_error");
const purchaseDuration = new Trend("purchase_duration_ms", true);

export const options = {
  scenarios: {
    soldout_rush: {
      // All VUs fire simultaneously — maximum contention on inventory row lock
      executor: "shared-iterations",
      vus: parseInt(__ENV.VUS || "50"),
      iterations: parseInt(__ENV.VUS || "50"),
      maxDuration: "60s",
    },
  },
  thresholds: {
    purchase_duration_ms: ["p(95)<5000"],
    // Any status other than 200/201 or 409 is a bug
    purchase_error: ["count==0"],
  },
};

export function setup() {
  const email = __ENV.BUYER_EMAIL;
  const password = __ENV.BUYER_PASSWORD;
  const eventId = __ENV.EVENT_ID;
  const ticketTypeId = __ENV.TICKET_TYPE_ID;

  if (!email || !password) throw new Error("Set BUYER_EMAIL and BUYER_PASSWORD");
  if (!eventId || !ticketTypeId) throw new Error("Set EVENT_ID and TICKET_TYPE_ID");

  const token = loginAttendee(email, password);
  return { token, eventId, ticketTypeId };
}

export default function ({ token, eventId, ticketTypeId }) {
  const vu = __VU;

  const body = JSON.stringify({
    eventId,
    paymentMethod: "free",
    attendees: [
      {
        name: `LoadTest VU${vu}`,
        email: `loadtest+vu${vu}@tapee.app`,
        ticketTypeId,
      },
    ],
  });

  const start = Date.now();
  const res = http.post(
    `${ATTENDEE_API}/api/tickets/purchase`,
    body,
    { headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } },
  );
  purchaseDuration.add(Date.now() - start);

  if (res.status === 200 || res.status === 201) {
    const status = res.json("status");
    purchaseSuccess.add(1);
    check(res, {
      "order confirmed or pending": () => status === "confirmed" || status === "pending",
    });
  } else if (res.status === 409) {
    // Inventory exhausted — expected once capacity is filled
    purchaseSoldOut.add(1);
    check(res, {
      "409 has error field": () => res.json("error") !== undefined,
    });
  } else {
    purchaseError.add(1);
    console.error(`Unexpected HTTP ${res.status} for VU ${vu}: ${res.body}`);
  }
}

export function handleSummary(data) {
  const success = data.metrics.purchase_success?.values?.count ?? 0;
  const soldout = data.metrics.purchase_soldout?.values?.count ?? 0;
  const errors = data.metrics.purchase_error?.values?.count ?? 0;
  const capacity = parseInt(__ENV.EXPECTED_CAPACITY || "0");
  const p50 = Math.round(data.metrics.purchase_duration_ms?.values?.["p(50)"] ?? 0);
  const p95 = Math.round(data.metrics.purchase_duration_ms?.values?.["p(95)"] ?? 0);

  const lines = [
    "",
    "══════════════════════════════════════════════",
    "   Ticket Sold-Out Race Condition — Summary   ",
    "══════════════════════════════════════════════",
    `  Purchases succeeded : ${success}`,
    `  Sold-out (409)      : ${soldout}`,
    `  Unexpected errors   : ${errors}`,
    `  Latency p50 / p95   : ${p50}ms / ${p95}ms`,
  ];

  if (capacity > 0) {
    lines.push("");
    if (success > capacity) {
      lines.push(`  ❌ RACE CONDITION DETECTED`);
      lines.push(`     ${success} orders succeeded but capacity was ${capacity}`);
      lines.push(`     Inventory overbooked by ${success - capacity} ticket(s)`);
    } else if (success === capacity) {
      lines.push(`  ✅ Inventory respected — exactly ${capacity}/${capacity} tickets sold`);
    } else if (success < capacity && soldout > 0) {
      lines.push(`  ⚠️  Only ${success}/${capacity} tickets sold (${soldout} got 409)`);
      lines.push(`     Possible: some requests raced into an already-locked row`);
    } else if (success < capacity) {
      lines.push(`  ⚠️  Only ${success}/${capacity} capacity filled — test may not have saturated inventory`);
    }
  }

  lines.push("══════════════════════════════════════════════", "");
  return { stdout: lines.join("\n") };
}
