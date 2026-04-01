import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useCallback,
  useState,
} from "react";
import { setAttestationTokenGetter } from "@workspace/api-client-react";
import { useAttestation } from "@/hooks/useAttestation";
import { useAuth } from "@/contexts/AuthContext";

interface AttestationContextValue {
  isAttested: boolean;
  isVerifying: boolean;
  attestationError: string | null;
  retryAttestation: () => Promise<void>;
}

const AttestationContext = createContext<AttestationContextValue | null>(null);

export function AttestationProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const { verifyDevice, getAttestationToken, isVerifying, attestationError } = useAttestation();
  const [isAttested, setIsAttested] = useState(false);

  // Register the attestation token getter with the API client so it is
  // automatically attached to every request as X-Attestation-Token.
  useEffect(() => {
    setAttestationTokenGetter(() => getAttestationToken());
    return () => {
      setAttestationTokenGetter(null);
    };
  }, [getAttestationToken]);

  const runAttestation = useCallback(async () => {
    const token = await verifyDevice();
    setIsAttested(!!token);
  }, [verifyDevice]);

  // Verify device when the user authenticates
  useEffect(() => {
    if (isAuthenticated) {
      runAttestation();
    } else {
      setIsAttested(false);
    }
  }, [isAuthenticated, runAttestation]);

  // Periodically re-verify (slightly before the 1-hour server cache expires)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!isAuthenticated) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    // Re-attest every 55 minutes so we never hit the server with an expired token
    intervalRef.current = setInterval(runAttestation, 55 * 60 * 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isAuthenticated, runAttestation]);

  const retryAttestation = useCallback(async () => {
    await runAttestation();
  }, [runAttestation]);

  return (
    <AttestationContext.Provider
      value={{ isAttested, isVerifying, attestationError, retryAttestation }}
    >
      {children}
    </AttestationContext.Provider>
  );
}

export function useAttestationContext(): AttestationContextValue {
  const ctx = useContext(AttestationContext);
  if (!ctx) throw new Error("useAttestationContext must be used within AttestationProvider");
  return ctx;
}
