/**
 * Authoritative API domain for the Tapee backend.
 *
 * Production domain is hardcoded as the fallback so the app always
 * points to Railway even if EXPO_PUBLIC_DOMAIN is not set at bundle time.
 *
 * ATTENDEE_API_BASE_URL — points to the dedicated attendee-api service.
 */
const PRODUCTION_DOMAIN = "prod.tapee.app";
const ATTENDEE_PRODUCTION_DOMAIN = "attendee.tapee.app";

const raw: string = process.env.EXPO_PUBLIC_DOMAIN ?? "";

export const API_DOMAIN: string =
  raw && raw !== "undefined" ? raw : PRODUCTION_DOMAIN;

export const API_BASE_URL: string = `https://${API_DOMAIN}`;

const rawAttendeeDomain: string = process.env.EXPO_PUBLIC_ATTENDEE_DOMAIN ?? "";

export const ATTENDEE_API_BASE_URL: string =
  rawAttendeeDomain && rawAttendeeDomain !== "undefined"
    ? `https://${rawAttendeeDomain}`
    : `https://${ATTENDEE_PRODUCTION_DOMAIN}`;

// Runtime-mutable staff API URL — updated when a local server is configured.
// Auth calls (login, demoLogin) must use this instead of the hardcoded API_BASE_URL
// so that sessions are created on whichever server the app is pointed at.
let _currentStaffApiUrl: string = API_BASE_URL;
export function setCurrentStaffApiUrl(url: string | null): void {
  _currentStaffApiUrl = url ?? API_BASE_URL;
}
export function getCurrentStaffApiUrl(): string {
  return _currentStaffApiUrl;
}
