import http from "k6/http";
import { STAFF_API, DEMO_SECRET } from "./config.js";

/**
 * Authenticate as a demo staff user and return the session token.
 * Requires DEMO_SECRET env var and a running staff API with demo accounts seeded.
 */
export function loginAs(role) {
  const res = http.post(
    `${STAFF_API}/api/auth/demo-login`,
    JSON.stringify({ role, secret: DEMO_SECRET }),
    { headers: { "Content-Type": "application/json" } },
  );
  if (res.status !== 200) {
    throw new Error(`Demo login failed for role '${role}': HTTP ${res.status} — ${res.body}`);
  }
  const token = res.json("token");
  if (!token) throw new Error(`Demo login for '${role}' returned no token`);
  return token;
}
