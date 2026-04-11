/**
 * Authoritative API domain for the Tapee Attendee backend.
 *
 * Production domain hardcoded as the fallback so the app always points
 * to attendee.tapee.app on Railway even if EXPO_PUBLIC_ATTENDEE_DOMAIN
 * is not set at bundle time.
 */
const PRODUCTION_ATTENDEE_DOMAIN = "attendee.tapee.app";

const rawAttendeeDomain: string = process.env.EXPO_PUBLIC_ATTENDEE_DOMAIN ?? "";

export const API_DOMAIN: string =
  rawAttendeeDomain && rawAttendeeDomain !== "undefined"
    ? rawAttendeeDomain
    : PRODUCTION_ATTENDEE_DOMAIN;

// In production: https://attendee.tapee.app
export const API_BASE_URL: string = `https://${API_DOMAIN}`;

const PRODUCTION_STAFF_DOMAIN = "prod.tapee.app";
export const STAFF_API_BASE_URL: string = `https://${PRODUCTION_STAFF_DOMAIN}`;

export const WOMPI_PUBLIC_KEY: string =
  process.env.EXPO_PUBLIC_WOMPI_PUBLIC_KEY ?? "";

export const WOMPI_BASE_URL: string =
  process.env.EXPO_PUBLIC_WOMPI_BASE_URL ?? "https://sandbox.wompi.co/v1";
