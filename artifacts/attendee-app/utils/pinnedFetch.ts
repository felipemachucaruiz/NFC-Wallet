/**
 * pinnedFetch — fetch wrapper for Tapee Attendee API calls with 30s timeout.
 *
 * SSL/TLS certificate pinning is handled at the OS level via Android's
 * Network Security Config (res/xml/network_security_config.xml), which pins
 * the Let's Encrypt R12 and R13 intermediate public keys for prod.tapee.app
 * and attendee.tapee.app. This approach covers ALL network calls (including
 * the raw fetch() calls in AuthContext) without any JS library involvement.
 *
 * This file is a thin wrapper that:
 *  a) Routes all API calls through a single testable function.
 *  b) Enforces a 30-second timeout (React Native's built-in fetch has none).
 */

const FETCH_TIMEOUT_MS = 30_000;

export const pinnedFetch: typeof fetch = (input, init) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(input, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
};
