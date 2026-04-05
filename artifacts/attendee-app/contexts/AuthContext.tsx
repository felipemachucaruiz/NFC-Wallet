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
import { useQueryClient } from "@tanstack/react-query";
import { API_BASE_URL } from "@/constants/domain";

const TOKEN_KEY = "tapee_attendee_auth_token";

export interface AuthUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  role: string;
  merchantId: string | null;
  emailVerified?: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  sessionExpired: boolean;
  clearSessionExpired: () => void;
  login: (identifier: string, password: string, keepMeLoggedIn?: boolean) => Promise<string | null>;
  register: (email: string, password: string, firstName: string, lastName: string, phone?: string) => Promise<string | null>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  /** Intercept a 401 response: attempt a token refresh, return new token or null */
  handleUnauthorized: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

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

async function fetchCurrentUser(token: string): Promise<AuthUser | null | "network_error"> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/user`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401 || res.status === 403) return null;
    if (!res.ok) return "network_error";
    const data = await res.json() as { user?: AuthUser };
    return data.user ?? null;
  } catch {
    return "network_error";
  }
}

const RETRY_COUNT = 4;
const RETRY_DELAY_MS = 2000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  const queryClient = useQueryClient();
  const tokenRef = useRef<string | null>(null);
  // Promise queue: when a refresh is in-flight, concurrent 401 callers await
  // the same promise instead of returning null immediately.
  const refreshPromiseRef = useRef<Promise<string | null> | null>(null);

  const setAuthToken = useCallback((t: string | null) => {
    tokenRef.current = t;
    setToken(t);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const stored = await getStoredToken();
      if (stored) {
        let result: AuthUser | null | "network_error" = "network_error";
        for (let attempt = 0; attempt <= RETRY_COUNT; attempt++) {
          if (!mounted) return;
          if (attempt > 0) {
            await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          }
          result = await fetchCurrentUser(stored);
          if (result !== "network_error") break;
        }
        if (mounted) {
          if (result && result !== "network_error") {
            setAuthToken(stored);
            setUser(result as AuthUser);
          } else if (result === null) {
            await clearToken();
          }
        }
      }
      if (mounted) setIsLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  const login = useCallback(async (identifier: string, password: string, keepMeLoggedIn = true): Promise<string | null> => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return (body as { error?: string }).error ?? "Credenciales incorrectas";
      }
      const { token: sid } = await res.json() as { token: string };
      const u = await fetchCurrentUser(sid);
      if (!u) return "No se pudo cargar el perfil";
      if (u === "network_error") return "Error de red";
      if (u.role !== "attendee") return "StaffNotAllowed";
      if (keepMeLoggedIn) await storeToken(sid);
      setAuthToken(sid);
      setUser(u as AuthUser);
      return null;
    } catch {
      return "Error de red";
    }
  }, [setAuthToken]);

  const register = useCallback(async (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    phone?: string
  ): Promise<string | null> => {
    try {
      // Step 1: Create the account
      const createRes = await fetch(`${API_BASE_URL}/api/auth/create-account`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, firstName, lastName, phone }),
      });
      if (!createRes.ok) {
        const body = await createRes.json().catch(() => ({}));
        return (body as { error?: string }).error ?? "Error al registrarse";
      }

      // Step 2: Auto-login to get a session token
      const loginRes = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: email, password }),
      });
      if (!loginRes.ok) {
        return "Cuenta creada. Por favor inicia sesión.";
      }
      const { token: sid } = await loginRes.json() as { token: string };
      const u = await fetchCurrentUser(sid);
      if (!u) return "No se pudo cargar el perfil";
      if (u === "network_error") return "Error de red";
      await storeToken(sid);
      setAuthToken(sid);
      setUser(u as AuthUser);
      return null;
    } catch {
      return "Error de red";
    }
  }, [setAuthToken]);

  const logout = useCallback(async () => {
    try {
      const t = tokenRef.current;
      if (t) {
        await fetch(`${API_BASE_URL}/api/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${t}` },
        });
      }
    } catch {}
    queryClient.clear();
    await clearToken();
    setAuthToken(null);
    setUser(null);
  }, [setAuthToken, queryClient]);

  const refreshUser = useCallback(async () => {
    const t = tokenRef.current;
    if (!t) return;
    const result = await fetchCurrentUser(t);
    if (result && result !== "network_error") {
      setUser(result as AuthUser);
    }
  }, []);

  const clearSessionExpired = useCallback(() => {
    setSessionExpired(false);
  }, []);

  /**
   * Called by API hooks when they receive a 401.
   * Attempts a silent token refresh via /api/auth/refresh.
   * Concurrent callers share the same in-flight refresh promise so only one
   * refresh request is ever made at a time; all callers get the new token.
   * If the refresh fails, clears the session and sets sessionExpired=true.
   */
  const handleUnauthorized = useCallback((): Promise<string | null> => {
    // If a refresh is already in progress, wait for it instead of firing another
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const doRefresh = async (): Promise<string | null> => {
      try {
        const currentToken = tokenRef.current;
        if (!currentToken) {
          setSessionExpired(true);
          setAuthToken(null);
          setUser(null);
          await clearToken();
          return null;
        }

        const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
          method: "POST",
          headers: { Authorization: `Bearer ${currentToken}` },
        });

        if (res.ok) {
          const data = await res.json() as { token?: string };
          if (data.token) {
            await storeToken(data.token);
            setAuthToken(data.token);
            const userResult = await fetchCurrentUser(data.token);
            if (userResult && userResult !== "network_error") {
              setUser(userResult as AuthUser);
            }
            return data.token;
          }
        }

        // Refresh failed — session is truly expired
        queryClient.clear();
        await clearToken();
        setAuthToken(null);
        setUser(null);
        setSessionExpired(true);
        return null;
      } catch {
        // Network error during refresh — don't force logout, caller handles gracefully
        return null;
      } finally {
        refreshPromiseRef.current = null;
      }
    };

    refreshPromiseRef.current = doRefresh();
    return refreshPromiseRef.current;
  }, [setAuthToken, queryClient]);

  return (
    <AuthContext.Provider value={{
      user,
      token,
      isLoading,
      isAuthenticated: !!user,
      sessionExpired,
      clearSessionExpired,
      login,
      register,
      logout,
      refreshUser,
      handleUnauthorized,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
