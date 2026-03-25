import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
import { Platform } from "react-native";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import {
  exchangeMobileAuthorizationCode,
  logoutMobileSession,
  getCurrentAuthUser,
} from "@workspace/api-client-react";

WebBrowser.maybeCompleteAuthSession();

const TOKEN_KEY = "@auth_token";
const REPLIT_OIDC_ISSUER = "https://replit.com/oidc";

export type UserRole =
  | "attendee"
  | "bank"
  | "merchant_staff"
  | "merchant_admin"
  | "warehouse_admin"
  | "admin";

export interface AuthUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  role: UserRole;
  merchantId: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const getStoredToken = async (): Promise<string | null> => {
  try {
    if (Platform.OS === "web") {
      return localStorage.getItem(TOKEN_KEY);
    }
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
};

const storeToken = async (token: string): Promise<void> => {
  try {
    if (Platform.OS === "web") {
      localStorage.setItem(TOKEN_KEY, token);
      return;
    }
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } catch {}
};

const clearToken = async (): Promise<void> => {
  try {
    if (Platform.OS === "web") {
      localStorage.removeItem(TOKEN_KEY);
      return;
    }
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

  const fetchUser = useCallback(async (t: string): Promise<AuthUser | null> => {
    try {
      tokenRef.current = t;
      const resp = await getCurrentAuthUser();
      if (resp?.user) {
        return resp.user as AuthUser;
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const stored = await getStoredToken();
      if (stored) {
        const u = await fetchUser(stored);
        if (mounted) {
          if (u) {
            setAuthToken(stored);
            setUser(u);
          } else {
            await clearToken();
          }
        }
      }
      if (mounted) setIsLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  const discovery = AuthSession.useAutoDiscovery(REPLIT_OIDC_ISSUER);

  const redirectUri = AuthSession.makeRedirectUri({
    scheme: "mobile",
    path: "auth",
  });

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: process.env.EXPO_PUBLIC_REPL_ID!,
      scopes: ["openid", "email", "profile", "offline_access"],
      redirectUri,
      usePKCE: true,
      responseType: AuthSession.ResponseType.Code,
    },
    discovery
  );

  useEffect(() => {
    if (!response) return;
    if (response.type !== "success") return;
    if (!request?.codeVerifier) return;

    (async () => {
      setIsLoading(true);
      try {
        const result = await exchangeMobileAuthorizationCode({
          code: response.params.code,
          code_verifier: request.codeVerifier!,
          redirect_uri: redirectUri,
          state: response.params.state ?? "",
        });
        const sid = result.token;
        const u = await fetchUser(sid);
        if (u) {
          await storeToken(sid);
          setAuthToken(sid);
          setUser(u);
        }
      } catch (e) {
        console.warn("Token exchange failed", e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [response]);

  const login = useCallback(async () => {
    setIsLoading(true);
    try {
      await promptAsync();
    } catch {
      setIsLoading(false);
    }
  }, [promptAsync]);

  const logout = useCallback(async () => {
    try {
      const t = tokenRef.current;
      if (t) await logoutMobileSession();
    } catch {}
    await clearToken();
    setAuthToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const t = tokenRef.current;
    if (!t) return;
    const u = await fetchUser(t);
    if (u) setUser(u);
  }, []);

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
