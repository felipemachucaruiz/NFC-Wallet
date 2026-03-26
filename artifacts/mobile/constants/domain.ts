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
 */
const FALLBACK_DOMAIN =
  "2814f499-7dcc-4ff4-930a-005c0a1f5aa1-00-354suhrpt8x73.riker.replit.dev";

const raw: string = process.env.EXPO_PUBLIC_DOMAIN ?? "";

export const API_DOMAIN: string =
  raw && raw !== "undefined" ? raw : FALLBACK_DOMAIN;

export const API_BASE_URL: string = `https://${API_DOMAIN}`;
