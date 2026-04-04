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
import { ATTENDEE_API_BASE_URL, API_BASE_URL } from "@/constants/domain";
import { clearSigningKeyCache } from "@/utils/signingKeyCache";
import { clearInMemoryCachedHmacSecret } from "@/contexts/OfflineQueueContext";

const TOKEN_KEY = "tapee_auth_token";

export type UserRole =
  | "attendee"
  | "bank"
  | "gate"
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
  /** "event_managed" = uses warehouse flows; "external" = self-managed inventory */
  merchantType?: string | null;
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

const STAFF_ROLES: readonly string[] = ["bank", "gate", "merchant_staff", "merchant_admin", "warehouse_admin", "event_admin", "admin"];

const getAuthBase = (role?: string): string =>
  role && STAFF_ROLES.includes(role) ? API_BASE_URL : ATTENDEE_API_BASE_URL;

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

  // Returns the user, null if session explicitly rejected (401/403), or "network_error" if unreachable.
  // Tries attendee-api first (fast path for attendees); on network errors also tries api-server
  // so staff tokens issued by api-server are also recognised.
  const fetchUser = useCallback(async (t: string): Promise<AuthUser | null | "network_error"> => {
    const tryFetch = async (baseUrl: string): Promise<AuthUser | null | "network_error"> => {
      try {
        const res = await fetch(`${baseUrl}/api/auth/user`, {
          headers: { Authorization: `Bearer ${t}` },
        });
        if (res.status === 401 || res.status === 403) return null;
        if (!res.ok) return "network_error";
        const body = await res.json() as { user: AuthUser | null };
        return body?.user ?? null;
      } catch {
        return "network_error";
      }
    };

    const attendeeResult = await tryFetch(ATTENDEE_API_BASE_URL);
    // Only short-circuit on a valid user object.
    // null means the attendee-api rejected the session (e.g. staff token) —
    // fall through to api-server so staff logins are always resolved.
    // "network_error" also falls through to api-server as a retry.
    if (attendeeResult !== null && attendeeResult !== "network_error") return attendeeResult;

    // Staff tokens are issued by api-server and may be unrecognised by
    // attendee-api; always check api-server as the final authority.
    return tryFetch(API_BASE_URL);
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
      const body = JSON.stringify({ identifier, password });
      const headers = { "Content-Type": "application/json" };

      // Try attendee-api first. Fall back to api-server when:
      //   403 → staff account ("must log in via staff portal")
      //   5xx → attendee-api unreachable / dev server down / proxy error
      //   any other non-2xx → unexpected error, always try api-server
      let res = await fetch(`${ATTENDEE_API_BASE_URL}/api/auth/login`, {
        method: "POST", headers, body,
      });
      const attendeeStatus = res.status;
      if (attendeeStatus < 200 || attendeeStatus > 299) {
        res = await fetch(`${API_BASE_URL}/api/auth/login`, {
          method: "POST", headers, body,
        });
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return (data as { error?: string }).error ?? "Invalid credentials";
      }
      const { token: sid } = await res.json() as { token: string };
      const u = await fetchUser(sid);
      if (!u) return "Could not load user profile";
      if (u === "network_error") return "Network error";
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
        // Route logout to the same service that issued the token
        const logoutBase = getAuthBase(user?.role ?? undefined);
        await fetch(`${logoutBase}/api/auth/logout`, {
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
  }, [user]);

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
