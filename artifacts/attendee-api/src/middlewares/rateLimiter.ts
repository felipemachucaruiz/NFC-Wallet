import rateLimit from "express-rate-limit";
import { type Request } from "express";

/**
 * Resolve the key for rate limiting.
 *
 * We deliberately use the raw TCP socket address rather than req.ip so that
 * rate limiting cannot be bypassed via a forged X-Forwarded-For header.
 * When TRUSTED_PROXY=true is set (production, behind Replit mTLS proxy),
 * we fall back to req.ip so that the real client IP is used instead of the
 * proxy's address. This matches the same env-gate pattern as the api-server
 * IP allowlist middleware.
 */
function keyGenerator(req: Request): string {
  if (process.env.TRUSTED_PROXY === "true") {
    return req.ip ?? req.socket.remoteAddress ?? "unknown";
  }
  return req.socket.remoteAddress ?? "unknown";
}

export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  message: { error: "Too many requests. Please try again later." },
});

export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  message: { error: "Too many authentication attempts. Please try again later." },
});

/**
 * Strict limiter for the public bracelet-lookup endpoint.
 * 10 requests per minute per IP — prevents UID enumeration attacks.
 */
export const braceletLookupLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  message: { error: "Too many bracelet lookup requests. Please try again later." },
});

/**
 * Dedicated rate limiter for the payment status polling endpoint.
 * 1 request per 2 seconds per user/bracelet (keyed by user ID when authenticated,
 * falling back to IP). This prevents polling abuse.
 */
export const paymentStatusLimiter = rateLimit({
  windowMs: 2 * 1000,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => {
    const user = (req as Request & { user?: { id?: string } }).user;
    if (user?.id) return `user:${user.id}`;
    if (process.env.TRUSTED_PROXY === "true") {
      return req.ip ?? req.socket.remoteAddress ?? "unknown";
    }
    return req.socket.remoteAddress ?? "unknown";
  },
  message: { error: "Too many payment status requests. Please wait before polling again." },
});
