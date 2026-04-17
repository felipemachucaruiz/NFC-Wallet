import { type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function isTokenCached(token: string): Promise<boolean> {
  const key = hashToken(token);
  try {
    const { rows } = await pool.query<{ token_hash: string }>(
      `SELECT token_hash FROM attestation_tokens WHERE token_hash = $1 AND expires_at > NOW() LIMIT 1`,
      [key],
    );
    return rows.length > 0;
  } catch (err) {
    logger.error({ err }, "attestation_db_check_failed — falling back to deny");
    return false;
  }
}

export async function cacheAttestationToken(token: string): Promise<void> {
  const key = hashToken(token);
  const expiresAt = new Date(Date.now() + CACHE_TTL_MS);
  try {
    await pool.query(
      `INSERT INTO attestation_tokens (token_hash, expires_at)
       VALUES ($1, $2)
       ON CONFLICT (token_hash) DO UPDATE SET expires_at = $2`,
      [key, expiresAt],
    );
  } catch (err) {
    logger.error({ err }, "attestation_db_cache_failed");
  }
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

  isTokenCached(attestationToken).then((cached) => {
    if (!cached) {
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
  }).catch((err) => {
    logger.error({ err }, "attestation_check_exception");
    res.status(403).json({
      error: "Attestation check failed. Please re-verify your device.",
    });
  });
}
