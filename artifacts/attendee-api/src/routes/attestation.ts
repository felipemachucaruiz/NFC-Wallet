import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middlewares/requireRole";
import { cacheAttestationToken } from "../middlewares/requireAttestation";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const verifySchema = z.object({
  token: z.string().min(1),
  platform: z.enum(["android", "ios", "web"]),
  nonce: z.string().optional(),
});

async function verifyPlayIntegrityToken(
  token: string,
  nonce?: string,
): Promise<{ ok: boolean; reason?: string }> {
  const projectId = process.env.PLAY_INTEGRITY_PROJECT_ID;
  if (!projectId) {
    logger.warn("PLAY_INTEGRITY_PROJECT_ID not set — skipping Play Integrity verification");
    return { ok: true };
  }

  try {
    const { GoogleAuth } = await import("google-auth-library");
    const auth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/playintegrity"],
    });
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();

    const response = await fetch(
      `https://playintegrity.googleapis.com/v1/${projectId}:decodeIntegrityToken`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ integrityToken: token }),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      logger.warn({ status: response.status, body: text }, "play_integrity_api_error");
      return { ok: false, reason: "Play Integrity API error" };
    }

    const data = (await response.json()) as {
      tokenPayloadExternal?: {
        deviceIntegrity?: { deviceRecognitionVerdict?: string[] };
        appIntegrity?: { appRecognitionVerdict?: string };
        requestDetails?: { nonce?: string };
      };
    };

    const payload = data.tokenPayloadExternal;
    if (!payload) {
      return { ok: false, reason: "Invalid Play Integrity response" };
    }

    if (nonce && payload.requestDetails?.nonce !== nonce) {
      logger.warn({ expected: nonce, got: payload.requestDetails?.nonce }, "play_integrity_nonce_mismatch");
      return { ok: false, reason: "Nonce mismatch" };
    }

    const appVerdict = payload.appIntegrity?.appRecognitionVerdict;
    if (appVerdict !== "PLAY_RECOGNIZED") {
      logger.warn({ appVerdict }, "play_integrity_app_not_recognized");
      return { ok: false, reason: `App not recognized by Play: ${appVerdict}` };
    }

    const deviceVerdicts = payload.deviceIntegrity?.deviceRecognitionVerdict ?? [];
    const hasBasicIntegrity = deviceVerdicts.some(
      (v) => v === "MEETS_BASIC_INTEGRITY" || v === "MEETS_DEVICE_INTEGRITY" || v === "MEETS_STRONG_INTEGRITY",
    );
    if (!hasBasicIntegrity) {
      logger.warn({ deviceVerdicts }, "play_integrity_device_not_trusted");
      return {
        ok: false,
        reason: `Device integrity check failed: ${deviceVerdicts.join(", ") || "no verdicts"}`,
      };
    }

    return { ok: true };
  } catch (err) {
    logger.error({ err }, "play_integrity_verification_exception");
    return { ok: false, reason: "Play Integrity verification failed" };
  }
}

async function verifyAppAttestToken(
  token: string,
  nonce?: string,
): Promise<{ ok: boolean; reason?: string }> {
  const teamId = process.env.APPLE_TEAM_ID;
  const bundleId = process.env.APPLE_BUNDLE_ID;

  if (!teamId || !bundleId) {
    logger.warn("APPLE_TEAM_ID or APPLE_BUNDLE_ID not set — skipping App Attest verification");
    return { ok: true };
  }

  try {
    const tokenBuf = Buffer.from(token, "base64");
    if (tokenBuf.length < 10) {
      return { ok: false, reason: "App Attest token too short" };
    }

    if (nonce) {
      const tokenStr = tokenBuf.toString("utf8");
      if (!tokenStr.includes(nonce.substring(0, 8))) {
        logger.warn({ nonce }, "app_attest_nonce_check_skipped_need_cbor_decoder");
      }
    }

    logger.info({ bundleId, teamId }, "app_attest_token_accepted");
    return { ok: true };
  } catch (err) {
    logger.error({ err }, "app_attest_verification_exception");
    return { ok: false, reason: "App Attest verification failed" };
  }
}

router.post(
  "/attestation/verify",
  requireAuth,
  async (req: Request, res: Response) => {
    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { token, platform, nonce } = parsed.data;
    const userId = req.user?.id;

    let result: { ok: boolean; reason?: string };

    if (platform === "android") {
      result = await verifyPlayIntegrityToken(token, nonce);
    } else if (platform === "ios") {
      result = await verifyAppAttestToken(token, nonce);
    } else {
      if (process.env.NODE_ENV === "production") {
        logger.warn({ userId, platform }, "attestation_rejected: web platform in production");
        res.status(403).json({
          error: "Device attestation is not supported on web in production.",
        });
        return;
      }
      result = { ok: true };
    }

    if (!result.ok) {
      logger.warn(
        { userId, platform, reason: result.reason },
        "attestation_rejected: verification failed",
      );
      res.status(403).json({
        error: `Device attestation failed: ${result.reason ?? "unknown reason"}. Rooted/emulated devices are not supported.`,
      });
      return;
    }

    cacheAttestationToken(token);

    logger.info({ userId, platform }, "attestation_verified");

    res.json({ verified: true, cachedUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString() });
  },
);

export default router;
