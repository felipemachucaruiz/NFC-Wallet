import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

let SecureStore: typeof import("expo-secure-store") | null = null;
try {
  SecureStore = require("expo-secure-store");
} catch {
  SecureStore = null;
}
import { useQueryClient } from "@tanstack/react-query";
import { API_BASE_URL } from "@/constants/domain";

const TOKEN_KEY = "tapee_attendee_auth_token";

export interface AuthUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone?: string | null;
  profileImageUrl: string | null;
  role: string;
  merchantId: string | null;
  emailVerified?: boolean;
  dateOfBirth?: string | null;
  sex?: string | null;
  idDocument?: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  sessionExpired: boolean;
  clearSessionExpired: () => void;
  googleClientId: string | null;
  login: (identifier: string, password: string, keepMeLoggedIn?: boolean) => Promise<string | null>;
  register: (email: string, password: string, firstName: string, lastName: string, phone?: string) => Promise<string | null>;
  loginWithGoogle: (idToken: string) => Promise<string | null>;
  loginWithSessionToken: (sessionToken: string) => Promise<string | null>;
  sendWhatsAppOtp: (phone: string) => Promise<{ expiresIn: number }>;
  verifyWhatsAppOtp: (phone: string, code: string) => Promise<string | null>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  /** Intercept a 401 response: attempt a token refresh, return new token or null */
  handleUnauthorized: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const getStoredToken = async (): Promise<string | null> => {
  try {
    if (Platform.OS === "web") return localStorage.getItem(TOKEN_KEY);
    if (SecureStore) return await SecureStore.getItemAsync(TOKEN_KEY);
    return await AsyncStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

const storeToken = async (token: string): Promise<void> => {
  try {
    if (Platform.OS === "web") { localStorage.setItem(TOKEN_KEY, token); return; }
    if (SecureStore) { await SecureStore.setItemAsync(TOKEN_KEY, token); return; }
    await AsyncStorage.setItem(TOKEN_KEY, token);
  } catch {}
};

const clearToken = async (): Promise<void> => {
  try {
    if (Platform.OS === "web") { localStorage.removeItem(TOKEN_KEY); return; }
    if (SecureStore) { await SecureStore.deleteItemAsync(TOKEN_KEY); return; }
    await AsyncStorage.removeItem(TOKEN_KEY);
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
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);

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
    fetch(`${API_BASE_URL}/api/auth/providers`)
      .then((r) => r.json())
      .then((d: { providers?: { google?: string } }) => {
        if (d.providers?.google) setGoogleClientId(d.providers.google);
      })
      .catch(() => {});
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

  const loginWithGoogle = useCallback(async (idToken: string): Promise<string | null> => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: idToken }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return (body as { error?: string }).error ?? "Google login failed";
      }
      const { token: sid } = await res.json() as { token: string };
      const u = await fetchCurrentUser(sid);
      if (!u) return "No se pudo cargar el perfil";
      if (u === "network_error") return "Error de red";
      if (u.role !== "attendee") return "StaffNotAllowed";
      await storeToken(sid);
      setAuthToken(sid);
      setUser(u as AuthUser);
      return null;
    } catch {
      return "Error de red";
    }
  }, [setAuthToken]);

  const loginWithSessionToken = useCallback(async (sessionToken: string): Promise<string | null> => {
    try {
      const u = await fetchCurrentUser(sessionToken);
      if (!u) return "No se pudo cargar el perfil";
      if (u === "network_error") return "Error de red";
      if (u.role !== "attendee") return "StaffNotAllowed";
      await storeToken(sessionToken);
      setAuthToken(sessionToken);
      setUser(u as AuthUser);
      return null;
    } catch {
      return "Error de red";
    }
  }, [setAuthToken]);

  const sendWhatsAppOtp = useCallback(async (phone: string): Promise<{ expiresIn: number }> => {
    const res = await fetch(`${API_BASE_URL}/api/auth/whatsapp-otp/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error ?? "Failed to send OTP");
    }
    return res.json() as Promise<{ expiresIn: number }>;
  }, []);

  const verifyWhatsAppOtp = useCallback(async (phone: string, code: string): Promise<string | null> => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/whatsapp-otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return (body as { error?: string }).error ?? "Código incorrecto";
      }
      const { token: sid } = await res.json() as { token: string };
      const u = await fetchCurrentUser(sid);
      if (!u) return "No se pudo cargar el perfil";
      if (u === "network_error") return "Error de red";
      if (u.role !== "attendee") return "StaffNotAllowed";
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
      googleClientId,
      login,
      register,
      loginWithGoogle,
      loginWithSessionToken,
      sendWhatsAppOtp,
      verifyWhatsAppOtp,
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
