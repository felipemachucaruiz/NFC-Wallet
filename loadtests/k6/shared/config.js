// Base URLs — override via env vars when targeting a specific environment
export const STAFF_API = __ENV.STAFF_API_URL || "https://prod.tapee.app";
export const ATTENDEE_API = __ENV.ATTENDEE_API_URL || "https://attendee.tapee.app";

// Secrets
export const DEMO_SECRET = __ENV.DEMO_SECRET || "";
export const ATTESTATION_TOKEN = __ENV.ATTESTATION_TOKEN || "";
export const HMAC_SECRET = __ENV.HMAC_SECRET || "";
