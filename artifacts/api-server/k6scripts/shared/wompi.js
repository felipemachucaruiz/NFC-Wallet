/**
 * Wompi payment gateway helpers for k6 load tests.
 * Compatible with both sandbox (https://sandbox.wompi.co/v1) and production.
 * Base URL is read from WOMPI_BASE_URL env var (defaults to sandbox).
 */

import http from "k6/http";

const WOMPI_BASE = __ENV.WOMPI_BASE_URL || "https://sandbox.wompi.co/v1";

/**
 * Fetch presigned acceptance tokens required in every Wompi transaction.
 * These tokens are short-lived — fetch once in setup() and reuse per test run.
 *
 * @param {string} publicKey  Wompi public key (WOMPI_PUBLIC_KEY env var)
 */
export function fetchWompiTokens(publicKey) {
  const res = http.get(`${WOMPI_BASE}/merchants/${publicKey}`);
  if (res.status !== 200) {
    throw new Error(`Wompi /merchants fetch failed: HTTP ${res.status} — ${res.body}`);
  }
  const acceptanceToken    = res.json("data.presigned_acceptance.acceptance_token");
  const personalAuthToken  = res.json("data.presigned_personal_data_auth.acceptance_token");
  if (!acceptanceToken || !personalAuthToken) {
    throw new Error("Wompi acceptance tokens missing — check WOMPI_PUBLIC_KEY");
  }
  return { acceptanceToken, personalAuthToken };
}

/**
 * Tokenize a card via Wompi's /tokens/cards endpoint.
 * The returned token is single-use per Wompi API spec.
 *
 * Note: Wompi sandbox token are reusable for testing — the same token
 * can be submitted multiple times and will always return APPROVED.
 *
 * @param {string} publicKey  Wompi public key (used as Bearer for tokenization)
 * @param {{ number, exp_month, exp_year, cvc, card_holder }} card
 */
export function tokenizeCard(publicKey, card) {
  const res = http.post(
    `${WOMPI_BASE}/tokens/cards`,
    JSON.stringify(card),
    { headers: { "Content-Type": "application/json", Authorization: `Bearer ${publicKey}` } },
  );
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`Wompi card tokenization failed: HTTP ${res.status} — ${res.body}`);
  }
  const token = res.json("data.id");
  if (!token) throw new Error(`Wompi card token missing from response: ${res.body}`);
  return token;
}
