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
const LOCK_AFTER_MS = 30_000; // 30 seconds in background

interface PasscodeContextValue {
  hasPasscode: boolean;
  isLocked: boolean;
  lock: () => void;
  unlock: (code: string) => Promise<boolean>;
  setPasscode: (code: string) => Promise<void>;
  clearPasscode: () => Promise<void>;
}

const PasscodeContext = createContext<PasscodeContextValue | null>(null);

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

export function PasscodeProvider({
  children,
  isAuthenticated,
}: {
  children: React.ReactNode;
  isAuthenticated: boolean;
}) {
  const [storedCode, setStoredCode] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const backgroundAt = useRef<number | null>(null);

  useEffect(() => {
    loadPasscode().then((code) => {
      setStoredCode(code);
      if (code && isAuthenticated) setIsLocked(true);
    });
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
  }, []);

  const clearPasscode = useCallback(async () => {
    await deletePasscode();
    setStoredCode(null);
    setIsLocked(false);
  }, []);

  return (
    <PasscodeContext.Provider
      value={{
        hasPasscode: !!storedCode,
        isLocked,
        lock,
        unlock,
        setPasscode,
        clearPasscode,
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
