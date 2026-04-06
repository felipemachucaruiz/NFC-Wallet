import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { apiGetCurrentUser, apiLogout, type AuthUser } from "@/lib/api";

const SESSION_KEY = "tapee_admin_session";

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const login = useCallback(async (newToken: string) => {
    const userData = await apiGetCurrentUser(newToken);
    if (!userData) throw new Error("Failed to load user data");
    sessionStorage.setItem(SESSION_KEY, newToken);
    setToken(newToken);
    setUser(userData);
  }, []);

  const logout = useCallback(async () => {
    const currentToken = token ?? sessionStorage.getItem(SESSION_KEY);
    if (currentToken) {
      await apiLogout(currentToken).catch(() => {});
    }
    sessionStorage.removeItem(SESSION_KEY);
    setToken(null);
    setUser(null);
  }, [token]);

  useEffect(() => {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (!stored) {
      setIsLoading(false);
      return;
    }
    apiGetCurrentUser(stored)
      .then((userData) => {
        if (userData) {
          setToken(stored);
          setUser(userData);
        } else {
          sessionStorage.removeItem(SESSION_KEY);
        }
      })
      .catch(() => {
        sessionStorage.removeItem(SESSION_KEY);
      })
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
