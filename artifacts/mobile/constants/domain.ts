/**
 * Authoritative API domain for the Tapee backend.
 *
 * The hardcoded value is the permanent Replit dev domain for this project —
 * it never changes unless the Repl itself is deleted and recreated.
 *
 * The environment variable override lets you point to a different server
 * (e.g. a production deployment) without rebuilding, but it MUST be set
 * at Metro bundle time to take effect.  If it is missing or undefined at
 * bundle time the fallback ensures the app always works.
 *
 * ATTENDEE_API_BASE_URL — points to the dedicated attendee-api service.
 * Falls back to API_BASE_URL so development works without extra config.
 */
const FALLBACK_DOMAIN =
  "2814f499-7dcc-4ff4-930a-005c0a1f5aa1-00-354suhrpt8x73.riker.replit.dev";

const raw: string = process.env.EXPO_PUBLIC_DOMAIN ?? "";

export const API_DOMAIN: string =
  raw && raw !== "undefined" ? raw : FALLBACK_DOMAIN;

export const API_BASE_URL: string = `https://${API_DOMAIN}`;

const rawAttendeeDomain: string = process.env.EXPO_PUBLIC_ATTENDEE_DOMAIN ?? "";

export const ATTENDEE_API_BASE_URL: string =
  rawAttendeeDomain && rawAttendeeDomain !== "undefined"
    ? `https://${rawAttendeeDomain}`
    : API_BASE_URL;
