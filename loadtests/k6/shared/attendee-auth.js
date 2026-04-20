import http from "k6/http";
import { ATTENDEE_API } from "./config.js";

/**
 * Authenticate as an attendee and return the session token.
 * @param {string} identifier  Email or username of the test account
 * @param {string} password    Account password
 */
export function loginAttendee(identifier, password) {
  const res = http.post(
    `${ATTENDEE_API}/api/auth/login`,
    JSON.stringify({ identifier, password }),
    { headers: { "Content-Type": "application/json" } },
  );
  if (res.status !== 200) {
    throw new Error(`Attendee login failed for '${identifier}': HTTP ${res.status} — ${res.body}`);
  }
  const token = res.json("token");
  if (!token) throw new Error(`Attendee login for '${identifier}' returned no token`);
  return token;
}
