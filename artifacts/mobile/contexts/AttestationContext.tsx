import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useCallback,
  useState,
} from "react";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
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
  const { verifyDevice, initAttestation, getAttestationToken, isTokenValid, isVerifying, attestationError } = useAttestation();
  const [isAttested, setIsAttested] = useState(false);
  // Tracks whether initAttestation (storage hydration) has been called this session.
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    setAttestationTokenGetter(() => getAttestationToken());
    return () => {
      setAttestationTokenGetter(null);
    };
  }, [getAttestationToken]);

  const runAttestation = useCallback(async (force = false) => {
    let token: string | null;
    if (!hasInitializedRef.current) {
      // First run: try SecureStore before hitting the network.
      hasInitializedRef.current = true;
      token = await initAttestation();
    } else {
      token = await verifyDevice(force);
    }
    setIsAttested(!!token);
  }, [verifyDevice, initAttestation]);

  // Attest on login, reset on logout.
  useEffect(() => {
    if (isAuthenticated) {
      runAttestation();
    } else {
      hasInitializedRef.current = false;
      setIsAttested(false);
    }
  }, [isAuthenticated, runAttestation]);

  // Re-attest every 55 min to stay ahead of the 1-hour server cache expiry.
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!isAuthenticated) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => runAttestation(), 55 * 60 * 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isAuthenticated, runAttestation]);

  // Re-attest when the app returns to the foreground (catches tokens that expired
  // while the device was backgrounded / sleeping).
  useEffect(() => {
    if (!isAuthenticated) return;
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" && !isTokenValid()) runAttestation();
    });
    return () => sub.remove();
  }, [isAuthenticated, isTokenValid, runAttestation]);

  // Re-attest when connectivity transitions from offline → online.
  // Using a transition check (wasConnected === false) avoids re-attesting on the
  // initial subscription fire when the token is already valid.
  useEffect(() => {
    if (!isAuthenticated) return;
    let wasConnected: boolean | null = null;
    const unsub = NetInfo.addEventListener((state) => {
      const isConnected = state.isConnected ?? false;
      if (isConnected && wasConnected === false && !isTokenValid()) {
        runAttestation();
      }
      wasConnected = isConnected;
    });
    return () => unsub();
  }, [isAuthenticated, isTokenValid, runAttestation]);

  const retryAttestation = useCallback(async () => {
    await runAttestation(true);
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
