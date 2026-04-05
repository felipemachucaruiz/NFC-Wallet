import rateLimit from "express-rate-limit";
import { type Request } from "express";

/**
 * Resolve the key for rate limiting.
 *
 * We deliberately use the raw TCP socket address rather than req.ip so that
 * rate limiting cannot be bypassed via a forged X-Forwarded-For header.
 * When TRUSTED_PROXY=true is set (production, behind Replit mTLS proxy),
 * we fall back to req.ip so that the real client IP is used instead of the
 * proxy's address.
 */
function keyGenerator(req: Request): string {
  if (process.env.TRUSTED_PROXY === "true") {
    return req.ip ?? req.socket.remoteAddress ?? "unknown";
  }
  return req.socket.remoteAddress ?? "unknown";
}

export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  message: { error: "Too many authentication attempts. Please try again later." },
});
