import { type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";
import { logger } from "../lib/logger";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CacheEntry {
  expiresAt: number;
}

// In-memory attestation token cache: token hash → expiry
const attestationCache = new Map<string, CacheEntry>();

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function isTokenCached(token: string): boolean {
  const key = hashToken(token);
  const entry = attestationCache.get(key);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    attestationCache.delete(key);
    return false;
  }
  return true;
}

export function cacheAttestationToken(token: string): void {
  const key = hashToken(token);
  attestationCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS });
}

function isValidDevModeHeader(header: string): boolean {
  const devSecret = process.env.ATTESTATION_DEV_SECRET;
  if (!devSecret) return false;
  const expected = crypto
    .createHmac("sha256", devSecret)
    .update("dev-mode")
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(header, "utf8"),
    Buffer.from(expected, "utf8")
  );
}

export function requireAttestation(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Graceful degradation: dev/test bypass via signed header
  const devModeHeader = req.headers["x-dev-mode"] as string | undefined;
  if (devModeHeader) {
    try {
      if (isValidDevModeHeader(devModeHeader)) {
        next();
        return;
      }
    } catch {
      // Invalid header format — fall through to normal attestation check
    }
  }

  // In development without ATTESTATION_DEV_SECRET, skip attestation entirely
  if (process.env.NODE_ENV !== "production" && !process.env.ATTESTATION_DEV_SECRET) {
    next();
    return;
  }

  const attestationToken = req.headers["x-attestation-token"] as string | undefined;

  if (!attestationToken) {
    logger.warn(
      { path: req.path, method: req.method, ip: req.ip },
      "attestation_rejected: missing token",
    );
    res.status(403).json({
      error: "Device attestation required. This device or environment is not trusted.",
    });
    return;
  }

  if (!isTokenCached(attestationToken)) {
    logger.warn(
      { path: req.path, method: req.method, ip: req.ip },
      "attestation_rejected: token not verified",
    );
    res.status(403).json({
      error: "Attestation token is invalid or expired. Please re-verify your device.",
    });
    return;
  }

  next();
}
