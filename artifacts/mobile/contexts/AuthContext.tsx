import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { getCurrentAuthUser } from "@workspace/api-client-react";
import { API_BASE_URL } from "@/constants/domain";
import { clearSigningKeyCache } from "@/utils/signingKeyCache";
import { clearInMemoryCachedHmacSecret } from "@/contexts/OfflineQueueContext";

const TOKEN_KEY = "@auth_token";

export type UserRole =
  | "attendee"
  | "bank"
  | "merchant_staff"
  | "merchant_admin"
  | "warehouse_admin"
  | "event_admin"
  | "admin";

export interface AuthUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  role: UserRole;
  merchantId: string | null;
  eventId?: string | null;
  promoterCompanyId?: string | null;
  merchantName?: string | null;
  eventName?: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (identifier: string, password: string, rememberMe?: boolean) => Promise<string | null>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const getApiBase = (): string => API_BASE_URL;

const getStoredToken = async (): Promise<string | null> => {
  try {
    if (Platform.OS === "web") return localStorage.getItem(TOKEN_KEY);
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
};

const storeToken = async (token: string): Promise<void> => {
  try {
    if (Platform.OS === "web") { localStorage.setItem(TOKEN_KEY, token); return; }
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } catch {}
};

const clearToken = async (): Promise<void> => {
  try {
    if (Platform.OS === "web") { localStorage.removeItem(TOKEN_KEY); return; }
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {}
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    setAuthTokenGetter(() => tokenRef.current);
  }, []);

  const setAuthToken = useCallback((t: string | null) => {
    tokenRef.current = t;
    setToken(t);
  }, []);

  // Returns the user, null if session explicitly rejected (401), or "network_error" if unreachable
  const fetchUser = useCallback(async (t: string): Promise<AuthUser | null | "network_error"> => {
    try {
      tokenRef.current = t;
      const resp = await getCurrentAuthUser();
      if (resp?.user) return resp.user as AuthUser;
      return null;
    } catch (err: unknown) {
      // Distinguish 401/403 (session genuinely invalid) from network failures
      if (err && typeof err === "object" && "status" in err) {
        const status = (err as { status: number }).status;
        if (status === 401 || status === 403) return null;
      }
      return "network_error";
    }
  }, []);

  // On startup: try to restore session with up to RETRY_COUNT retries
  // so a brief API server restart doesn't force the user to log in again.
  const RETRY_COUNT = 4;
  const RETRY_DELAY_MS = 2000;

  useEffect(() => {
    let mounted = true;
    (async () => {
      const stored = await getStoredToken();
      if (stored) {
        let result: AuthUser | null | "network_error" = "network_error";
        for (let attempt = 0; attempt <= RETRY_COUNT; attempt++) {
          if (!mounted) return;
          if (attempt > 0) {
            // Wait before retrying
            await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          }
          result = await fetchUser(stored);
          if (result !== "network_error") break; // Got a definitive answer
        }
        if (mounted) {
          if (result && result !== "network_error") {
            // Session is valid — restore the user
            setAuthToken(stored);
            setUser(result as AuthUser);
          } else if (result === null) {
            // Server explicitly rejected session (401) — clear it
            await clearToken();
          }
          // Still "network_error" after all retries: keep the token stored,
          // show login so user can proceed (token will be re-validated next launch)
        }
      }
      if (mounted) setIsLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  const login = useCallback(async (identifier: string, password: string, rememberMe = true): Promise<string | null> => {
    try {
      const res = await fetch(`${getApiBase()}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return (body as { error?: string }).error ?? "Invalid credentials";
      }
      const { token: sid } = await res.json() as { token: string };
      const u = await fetchUser(sid);
      if (!u) return "Could not load user profile";
      if (rememberMe) {
        await storeToken(sid);
      } else {
        await clearToken();
      }
      setAuthToken(sid);
      setUser(u);
      return null;
    } catch {
      return "Network error";
    }
  }, [fetchUser, setAuthToken]);

  const logout = useCallback(async () => {
    try {
      const t = tokenRef.current;
      if (t) {
        await fetch(`${getApiBase()}/api/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${t}` },
        });
      }
    } catch {}
    await clearToken();
    await clearSigningKeyCache();
    clearInMemoryCachedHmacSecret();
    setAuthToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const t = tokenRef.current;
    if (!t) return;
    const result = await fetchUser(t);
    if (result && result !== "network_error") setUser(result);
  }, [fetchUser]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
