/**
 * Ticket Card Payment Load Test — Wompi Sandbox
 *
 * Tests the full ticket purchase flow with real Wompi card payments:
 *   1. Tokenize test card via Wompi's /tokens/cards endpoint
 *   2. POST /tickets/purchase with paymentMethod="card"
 *   3. Poll /tickets/orders/:orderId/status until APPROVED or timeout
 *
 * Uses Wompi sandbox which always approves the test card immediately.
 *
 * Test card (sandbox):
 *   Number : 4242 4242 4242 4242
 *   Expiry : 08/31
 *   CVC    : 454
 *
 * Required env vars:
 *   BUYER_EMAIL        — attendee account email (pre-seeded with known password)
 *   BUYER_PASSWORD     — attendee account password
 *   EVENT_ID           — target event ID
 *   TICKET_TYPE_ID     — paid ticket type (price > 0) for the event
 *   WOMPI_PUBLIC_KEY   — Wompi sandbox public key (pub_test_...)
 *
 * Optional:
 *   VUS                — concurrent buyers (default: 20)
 *   ATTENDEE_API_URL   — override API base (default: https://attendee.tapee.app)
 *   UPLOAD_TOKEN       — admin token to save results
 *   UPLOAD_EVENT_ID    — event ID for the result record (defaults to EVENT_ID)
 *
 * IMPORTANT: Run this test against a staging/test event. Each successful purchase
 * creates real order records in the DB. Use a ticket type with a high quantity
 * (or unlimited) to avoid 409 sold-out responses.
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";
import { loginAttendee } from "./shared/attendee-auth.js";
import { fetchWompiTokens, tokenizeCard } from "./shared/wompi.js";
import { computeScore, buildRecommendations, uploadResults } from "./shared/upload-results.js";
import { ATTENDEE_API } from "./shared/config.js";

const purchaseSuccess = new Counter("card_purchase_success");
const purchasePending = new Counter("card_purchase_pending");
const purchaseError   = new Counter("card_purchase_error");
const errorRate       = new Rate("card_error_rate");
const purchaseDuration = new Trend("card_purchase_duration_ms", true);
const pollDuration     = new Trend("card_poll_duration_ms", true);

const VUS = parseInt(__ENV.VUS || "20");

// Wompi sandbox test card
const TEST_CARD = {
  number:      "4242424242424242",
  exp_month:   "08",
  exp_year:    "31",
  cvc:         "454",
  card_holder: "Load Test",
};

export const options = {
  scenarios: {
    ticket_buyers: {
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
    card_purchase_duration_ms: ["p(95)<8000"],  // card payments are slower than NFC
    card_error_rate:            ["rate<0.05"],
  },
};

export function setup() {
  const email     = __ENV.BUYER_EMAIL;
  const password  = __ENV.BUYER_PASSWORD;
  const publicKey = __ENV.WOMPI_PUBLIC_KEY;
  const eventId   = __ENV.EVENT_ID;
  const ttId      = __ENV.TICKET_TYPE_ID;

  if (!email || !password) throw new Error("Set BUYER_EMAIL and BUYER_PASSWORD");
  if (!publicKey) throw new Error("Set WOMPI_PUBLIC_KEY (pub_test_... from Railway env)");
  if (!eventId || !ttId)   throw new Error("Set EVENT_ID and TICKET_TYPE_ID");

  const token = loginAttendee(email, password);

  // Tokenize once — Wompi sandbox tokens are reusable for testing
  const cardToken = tokenizeCard(publicKey, TEST_CARD);

  // Fetch acceptance tokens — required by Wompi for every transaction
  const { acceptanceToken, personalAuthToken } = fetchWompiTokens(publicKey);

  return { token, cardToken, acceptanceToken, personalAuthToken, eventId, ticketTypeId: ttId };
}

export default function ({ token, cardToken, acceptanceToken, personalAuthToken, eventId, ticketTypeId }) {
  const vu = __VU;

  const start = Date.now();
  const res = http.post(
    `${ATTENDEE_API}/api/tickets/purchase`,
    JSON.stringify({
      eventId,
      paymentMethod: "card",
      cardToken,
      installments: 1,
      attendees: [{
        name:         `LoadTest Buyer ${vu}`,
        email:        `loadtest+buyer${vu}@tapee.app`,
        ticketTypeId,
      }],
      // Note: acceptanceToken / personalAuthToken are passed server-side via fetchWompiTokens()
      // Our server calls fetchWompiTokens internally — we only send cardToken here.
    }),
    { headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } },
  );
  purchaseDuration.add(Date.now() - start);

  if (res.status === 409) {
    // Sold out — expected if ticket type has limited inventory
    purchaseError.add(1);
    errorRate.add(true);
    return;
  }

  if (res.status !== 200 && res.status !== 201) {
    purchaseError.add(1);
    errorRate.add(true);
    console.error(`VU ${vu} purchase failed: HTTP ${res.status} — ${res.body}`);
    return;
  }

  errorRate.add(false);
  const orderId = res.json("orderId");
  const status  = res.json("status");

  if (status === "confirmed") {
    purchaseSuccess.add(1);
    check(res, { "order confirmed": () => true });
    return;
  }

  if (status === "pending" && orderId) {
    // Poll for payment confirmation (Wompi sandbox approves near-instantly)
    let confirmed = false;
    for (let i = 0; i < 5; i++) {
      sleep(1);
      const pollStart = Date.now();
      const pollRes = http.get(
        `${ATTENDEE_API}/api/tickets/orders/${orderId}/status`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      pollDuration.add(Date.now() - pollStart);

      const pollStatus = pollRes.json("status");
      if (pollStatus === "confirmed") {
        purchaseSuccess.add(1);
        confirmed = true;
        break;
      }
      if (pollStatus === "cancelled" || pollStatus === "failed") {
        break;
      }
    }
    if (!confirmed) {
      purchasePending.add(1); // still pending after polling — Wompi may be slow in sandbox
    }
  } else {
    purchasePending.add(1);
  }
}

export function handleSummary(data) {
  const p50      = Math.round(data.metrics.card_purchase_duration_ms?.values?.["p(50)"] ?? 0);
  const p95      = Math.round(data.metrics.card_purchase_duration_ms?.values?.["p(95)"] ?? 0);
  const success  = data.metrics.card_purchase_success?.values?.count  ?? 0;
  const pending  = data.metrics.card_purchase_pending?.values?.count  ?? 0;
  const errors   = data.metrics.card_purchase_error?.values?.count    ?? 0;
  const errorRt  = data.metrics.card_error_rate?.values?.rate         ?? 0;
  const rps      = data.metrics.iterations?.values?.rate               ?? 0;
  const pollP95  = Math.round(data.metrics.card_poll_duration_ms?.values?.["p(95)"] ?? 0);
  const score    = computeScore(p50, p95, errorRt);
  const recs     = buildRecommendations(p50, p95, errorRt, rps);

  const results = {
    script: "ticket-card-payment", p50, p95,
    errorRate: errorRt, throughput: rps,
    txCount: success + pending + errors,
    successCount: success, pendingCount: pending, errorCount: errors,
    pollP95, score, recommendations: recs,
  };
  uploadResults("ticket-card-payment", results);

  const lines = [
    "", "══════════════════════════════════════════════",
    "   Ticket Card Payment (Wompi) — Summary     ",
    "══════════════════════════════════════════════",
    `  Purchases confirmed  : ${success}`,
    `  Purchases pending    : ${pending} (Wompi still processing)`,
    `  Errors               : ${errors}`,
    `  Throughput           : ${rps.toFixed(1)} orders/s`,
    `  Purchase p50/p95     : ${p50}ms / ${p95}ms`,
    `  Polling p95          : ${pollP95}ms`,
    `  Score                : ${score}/100`,
    "", ...recs, "══════════════════════════════════════════════", "",
  ];
  return { stdout: lines.join("\n") };
}
