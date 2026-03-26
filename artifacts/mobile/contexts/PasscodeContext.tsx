import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import * as SecureStore from "expo-secure-store";
import { AppState, type AppStateStatus, Platform } from "react-native";

const PASSCODE_KEY = "@tapee_passcode";
const PIN_SKIP_KEY = "@tapee_pin_skip_remaining";
const LOCK_AFTER_MS = 30_000; // 30 seconds in background
const SKIP_COUNT = 3; // logins to suppress after "Not now"

interface PasscodeContextValue {
  hasPasscode: boolean;
  isLocked: boolean;
  shouldShowPinPrompt: boolean;
  lock: () => void;
  unlock: (code: string) => Promise<boolean>;
  setPasscode: (code: string) => Promise<void>;
  clearPasscode: () => Promise<void>;
  skipPinPrompt: () => Promise<void>;
  /** Returns true if the PIN prompt should be shown this login. */
  onLoginAttempted: () => Promise<boolean>;
}

const PasscodeContext = createContext<PasscodeContextValue | null>(null);

// ── Storage helpers ───────────────────────────────────────────────────────────

const storePasscode = async (code: string) => {
  if (Platform.OS === "web") { localStorage.setItem(PASSCODE_KEY, code); return; }
  await SecureStore.setItemAsync(PASSCODE_KEY, code);
};

const loadPasscode = async (): Promise<string | null> => {
  try {
    if (Platform.OS === "web") return localStorage.getItem(PASSCODE_KEY);
    return await SecureStore.getItemAsync(PASSCODE_KEY);
  } catch { return null; }
};

const deletePasscode = async () => {
  try {
    if (Platform.OS === "web") { localStorage.removeItem(PASSCODE_KEY); return; }
    await SecureStore.deleteItemAsync(PASSCODE_KEY);
  } catch {}
};

const loadSkipRemaining = async (): Promise<number> => {
  try {
    if (Platform.OS === "web") {
      const v = localStorage.getItem(PIN_SKIP_KEY);
      return v ? parseInt(v, 10) : 0;
    }
    const v = await SecureStore.getItemAsync(PIN_SKIP_KEY);
    return v ? parseInt(v, 10) : 0;
  } catch { return 0; }
};

const saveSkipRemaining = async (n: number) => {
  try {
    if (Platform.OS === "web") { localStorage.setItem(PIN_SKIP_KEY, String(n)); return; }
    await SecureStore.setItemAsync(PIN_SKIP_KEY, String(n));
  } catch {}
};

const clearSkipRemaining = async () => {
  try {
    if (Platform.OS === "web") { localStorage.removeItem(PIN_SKIP_KEY); return; }
    await SecureStore.deleteItemAsync(PIN_SKIP_KEY);
  } catch {}
};

// ── Provider ──────────────────────────────────────────────────────────────────

export function PasscodeProvider({
  children,
  isAuthenticated,
}: {
  children: React.ReactNode;
  isAuthenticated: boolean;
}) {
  const [storedCode, setStoredCode] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [skipRemaining, setSkipRemaining] = useState<number>(0);
  const backgroundAt = useRef<number | null>(null);

  useEffect(() => {
    loadPasscode().then((code) => {
      setStoredCode(code);
      if (code && isAuthenticated) setIsLocked(true);
    });
    loadSkipRemaining().then(setSkipRemaining);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) setIsLocked(false);
  }, [isAuthenticated]);

  useEffect(() => {
    const handler = (nextState: AppStateStatus) => {
      if (nextState === "background" || nextState === "inactive") {
        backgroundAt.current = Date.now();
      } else if (nextState === "active") {
        const elapsed = backgroundAt.current
          ? Date.now() - backgroundAt.current
          : Infinity;
        if (elapsed >= LOCK_AFTER_MS && storedCode && isAuthenticated) {
          setIsLocked(true);
        }
        backgroundAt.current = null;
      }
    };
    const sub = AppState.addEventListener("change", handler);
    return () => sub.remove();
  }, [storedCode, isAuthenticated]);

  const lock = useCallback(() => {
    if (storedCode) setIsLocked(true);
  }, [storedCode]);

  const unlock = useCallback(async (code: string): Promise<boolean> => {
    if (code === storedCode) {
      setIsLocked(false);
      return true;
    }
    return false;
  }, [storedCode]);

  const setPasscode = useCallback(async (code: string) => {
    await storePasscode(code);
    setStoredCode(code);
    setIsLocked(false);
    // Clear skip counter once PIN is configured — never prompt again
    await clearSkipRemaining();
    setSkipRemaining(0);
  }, []);

  const clearPasscode = useCallback(async () => {
    await deletePasscode();
    setStoredCode(null);
    setIsLocked(false);
  }, []);

  /**
   * Call this right after a successful login (with rememberMe, no passcode).
   * If skipsRemaining > 0, decrements it — which suppresses the prompt this login.
   * If skipsRemaining === 0, leaves it at 0 — prompt will show.
   */
  const onLoginAttempted = useCallback(async (): Promise<boolean> => {
    const current = await loadSkipRemaining();
    if (current > 0) {
      const next = current - 1;
      await saveSkipRemaining(next);
      setSkipRemaining(next);
      return false; // still suppressed — do not show prompt
    }
    return true; // no skips remaining — show prompt
  }, []);

  /**
   * Call this when the user taps "Not now" on the PIN setup prompt.
   * Suppresses the prompt for the next SKIP_COUNT logins.
   */
  const skipPinPrompt = useCallback(async () => {
    await saveSkipRemaining(SKIP_COUNT);
    setSkipRemaining(SKIP_COUNT);
  }, []);

  // Prompt is shown only when no passcode is set AND no skips remain
  const shouldShowPinPrompt = !storedCode && skipRemaining === 0;

  return (
    <PasscodeContext.Provider
      value={{
        hasPasscode: !!storedCode,
        isLocked,
        shouldShowPinPrompt,
        lock,
        unlock,
        setPasscode,
        clearPasscode,
        skipPinPrompt,
        onLoginAttempted,
      }}
    >
      {children}
    </PasscodeContext.Provider>
  );
}

export function usePasscode(): PasscodeContextValue {
  const ctx = useContext(PasscodeContext);
  if (!ctx) throw new Error("usePasscode must be used within PasscodeProvider");
  return ctx;
}
