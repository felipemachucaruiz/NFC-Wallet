const FALLBACK_DOMAIN =
  "2814f499-7dcc-4ff4-930a-005c0a1f5aa1-00-354suhrpt8x73.riker.replit.dev";
const FALLBACK_PATH = "/attendee-api";

const rawDomain: string = process.env.EXPO_PUBLIC_DOMAIN ?? "";
const rawAttendeeDomain: string = process.env.EXPO_PUBLIC_ATTENDEE_DOMAIN ?? "";

export const API_DOMAIN: string =
  rawAttendeeDomain && rawAttendeeDomain !== "undefined"
    ? rawAttendeeDomain
    : rawDomain && rawDomain !== "undefined"
      ? `${rawDomain}${FALLBACK_PATH}`
      : `${FALLBACK_DOMAIN}${FALLBACK_PATH}`;

// In production: https://attendee.tapee.app
// In dev (Replit proxy): https://<replit-domain>/attendee-api
export const API_BASE_URL: string = `https://${API_DOMAIN}`;
