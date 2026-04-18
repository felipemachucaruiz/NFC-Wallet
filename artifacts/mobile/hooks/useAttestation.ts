import { useCallback, useRef, useState } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { API_BASE_URL, ATTENDEE_API_BASE_URL } from "@/constants/domain";
import { extractErrorMessage } from "@/utils/errorMessage";

const ATTESTATION_TTL_MS = 60 * 60 * 1000; // 1 hour — matches server-side cache
const STORAGE_KEY = "tapee_att";

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
      const playIntegrity = (await import("expo-play-integrity").catch(() => null)) as {
        getIntegrityToken?: (nonce: string) => Promise<string>;
      } | null;
      if (playIntegrity?.getIntegrityToken) {
        return await playIntegrity.getIntegrityToken(nonce);
      }
    } else if (Platform.OS === "ios") {
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
  // Deduplicates concurrent verifyDevice calls — callers share the same promise.
  const inflightRef = useRef<Promise<string | null> | null>(null);
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
   *
   * Concurrent calls share the same in-flight promise — no duplicate network requests.
   */
  const verifyDevice = useCallback(async (force = false): Promise<string | null> => {
    if (!force && isTokenValid()) return stateRef.current.token;

    // Return the in-flight promise to all concurrent callers.
    if (inflightRef.current) return inflightRef.current;

    const doVerify = async (): Promise<string | null> => {
      setIsVerifying(true);
      setAttestationError(null);

      try {
        const nonce = Math.random().toString(36).substring(2) + Date.now().toString(36);

        let nativeToken = await getNativeAttestationToken(nonce);

        if (!nativeToken) {
          const appVersion = Constants.expoConfig?.version ?? "unknown";
          const buildId = Constants.expoConfig?.ios?.buildNumber
            ?? Constants.expoConfig?.android?.versionCode?.toString()
            ?? "0";
          nativeToken = `dev-${getPlatform()}-${appVersion}-${buildId}-${nonce}`;
        }

        const platform = getPlatform();

        const staffRes = await fetch(`${API_BASE_URL}/api/attestation/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: nativeToken, platform, nonce }),
        });

        fetch(`${ATTENDEE_API_BASE_URL}/api/attestation/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: nativeToken, platform, nonce }),
        }).catch(() => {});

        if (!staffRes.ok) throw new Error(`Attestation failed: ${staffRes.status}`);
        const result = await staffRes.json() as AttestationResult;

        if (result.verified) {
          const newState = { token: nativeToken, verifiedAt: Date.now() };
          stateRef.current = newState;
          // Persist so cold starts (app kill + relaunch) skip the network round-trip.
          SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(newState)).catch(() => {});
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
    };

    inflightRef.current = doVerify();
    const result = await inflightRef.current;
    inflightRef.current = null;
    return result;
  }, [isTokenValid]);

  /**
   * Hydrates from SecureStore on first launch (no network if the stored token is
   * still valid), then falls through to a full verifyDevice if it's expired.
   * Call this once on login instead of verifyDevice.
   */
  const initAttestation = useCallback(async (): Promise<string | null> => {
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AttestationState;
        if (parsed.token && parsed.verifiedAt && Date.now() - parsed.verifiedAt < ATTESTATION_TTL_MS) {
          stateRef.current = parsed;
          return parsed.token;
        }
      }
    } catch {
      // Ignore storage errors — fall through to network verify
    }
    return verifyDevice(true);
  }, [verifyDevice]);

  return {
    verifyDevice,
    initAttestation,
    getAttestationToken,
    isTokenValid,
    isVerifying,
    attestationError,
  };
}
