const FALLBACK_DOMAIN =
  "2814f499-7dcc-4ff4-930a-005c0a1f5aa1-00-354suhrpt8x73.riker.replit.dev";

const raw: string = process.env.EXPO_PUBLIC_DOMAIN ?? "";

export const API_DOMAIN: string =
  raw && raw !== "undefined" ? raw : FALLBACK_DOMAIN;

// All attendee-api routes sit under the /attendee-api path on the Replit proxy
export const API_BASE_URL: string = `https://${API_DOMAIN}/attendee-api`;
