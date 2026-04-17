import { useCallback, useRef, useState } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { API_BASE_URL, ATTENDEE_API_BASE_URL } from "@/constants/domain";
import { extractErrorMessage } from "@/utils/errorMessage";

const ATTESTATION_TTL_MS = 60 * 60 * 1000; // 1 hour — matches server-side cache

interface AttestationState {
  token: string | null;
  verifiedAt: number | null;
}

interface AttestationResult {
  verified: boolean;
  cachedUntil?: string;
}

function getPlatform(): "android" | "ios" | "web" {
  if (Platform.OS === "android") return "android";
  if (Platform.OS === "ios") return "ios";
  return "web";
}

async function getNativeAttestationToken(nonce: string): Promise<string | null> {
  try {
    if (Platform.OS === "android") {
      // expo-play-integrity is not bundled — we use a dynamic require so this
      // gracefully falls back to null on builds that lack the native module.
      // The actual package would need to be installed via eas build.
      const playIntegrity = (await import("expo-play-integrity").catch(() => null)) as {
        getIntegrityToken?: (nonce: string) => Promise<string>;
      } | null;
      if (playIntegrity?.getIntegrityToken) {
        return await playIntegrity.getIntegrityToken(nonce);
      }
    } else if (Platform.OS === "ios") {
      // expo-app-attest is not bundled — same graceful-fallback approach.
      const appAttest = (await import("expo-app-attest").catch(() => null)) as {
        generateKey?: () => Promise<string>;
        attestKey?: (keyId: string, challenge: string) => Promise<string>;
      } | null;
      if (appAttest?.generateKey && appAttest.attestKey) {
        const keyId = await appAttest.generateKey();
        return await appAttest.attestKey(keyId, nonce);
      }
    }
  } catch {
    // Native attestation unavailable on this build / device
  }
  return null;
}

export function useAttestation() {
  const stateRef = useRef<AttestationState>({ token: null, verifiedAt: null });
  const [isVerifying, setIsVerifying] = useState(false);
  const [attestationError, setAttestationError] = useState<string | null>(null);

  const isTokenValid = useCallback((): boolean => {
    const { token, verifiedAt } = stateRef.current;
    if (!token || !verifiedAt) return false;
    return Date.now() - verifiedAt < ATTESTATION_TTL_MS;
  }, []);

  const getAttestationToken = useCallback((): string | null => {
    if (isTokenValid()) return stateRef.current.token;
    return null;
  }, [isTokenValid]);

  /**
   * Verifies the device with the server. Skips if a valid cached token exists.
   * Pass force=true to bypass the local cache and always re-verify with the server
   * (needed when the server restarted and wiped its in-memory attestation cache).
   * Returns the attestation token on success, or null if unavailable / failed.
   */
  const verifyDevice = useCallback(async (force = false): Promise<string | null> => {
    if (!force && isTokenValid()) {
      return stateRef.current.token;
    }

    setIsVerifying(true);
    setAttestationError(null);

    try {
      const nonce = Math.random().toString(36).substring(2) + Date.now().toString(36);

      // Attempt to get a native attestation token from the OS
      let nativeToken = await getNativeAttestationToken(nonce);

      // On dev/web builds there is no native token — use the app version as a
      // synthetic token so the server can identify the build.
      if (!nativeToken) {
        const appVersion = Constants.expoConfig?.version ?? "unknown";
        const buildId = Constants.expoConfig?.ios?.buildNumber
          ?? Constants.expoConfig?.android?.versionCode?.toString()
          ?? "0";
        nativeToken = `dev-${getPlatform()}-${appVersion}-${buildId}-${nonce}`;
      }

      const platform = getPlatform();

      // Verify against the staff API (no auth required on that endpoint).
      // This populates the staff API's in-memory token cache so that
      // the signing-key endpoint (requireAttestation) can authorize the request.
      const staffRes = await fetch(`${API_BASE_URL}/api/attestation/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: nativeToken, platform, nonce }),
      });

      // Also try the attendee API in parallel (best-effort, not required for the staff app).
      fetch(`${ATTENDEE_API_BASE_URL}/api/attestation/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: nativeToken, platform, nonce }),
      }).catch(() => {});

      if (!staffRes.ok) throw new Error(`Attestation failed: ${staffRes.status}`);
      const result = await staffRes.json() as AttestationResult;

      if (result.verified) {
        stateRef.current = { token: nativeToken, verifiedAt: Date.now() };
        setIsVerifying(false);
        return nativeToken;
      }

      setAttestationError("Device verification failed");
      setIsVerifying(false);
      return null;
    } catch (err: unknown) {
      const message = extractErrorMessage(err, "Attestation request failed");
      setAttestationError(message);
      setIsVerifying(false);
      return null;
    }
  }, [isTokenValid]);

  return {
    verifyDevice,
    getAttestationToken,
    isTokenValid,
    isVerifying,
    attestationError,
  };
}
