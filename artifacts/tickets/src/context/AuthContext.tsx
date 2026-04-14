import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import type { User } from "@/data/types";
import { loginApi, loginWithGoogleApi, createAccountApi, fetchCurrentUser, logoutApi, setAuthToken, getAuthToken } from "@/lib/api";

function mapUser(u: Record<string, unknown>): User {
  return {
    id: u.id as string,
    email: (u.email as string) || "",
    firstName: (u.firstName as string) || "",
    lastName: (u.lastName as string) || "",
    phone: (u.phone as string) || "",
    dateOfBirth: (u.dateOfBirth as string) || "",
    sex: (u.sex as string) || "",
    idDocument: (u.idDocument as string) || "",
  };
}

type AuthModalView = "login" | "register" | "forgot";

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  loginWithGoogle: (credential: string) => Promise<boolean>;
  loginWithToken: (token: string) => Promise<boolean>;
  register: (data: { email: string; password: string; firstName: string; lastName: string; phone: string }) => Promise<boolean>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  showAuthModal: boolean;
  authModalView: AuthModalView;
  authRedirect: string | null;
  openAuthModal: (view?: AuthModalView, redirect?: string | null) => void;
  closeAuthModal: () => void;
  switchAuthView: (view: AuthModalView) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!getAuthToken());

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalView, setAuthModalView] = useState<AuthModalView>("login");
  const [authRedirect, setAuthRedirect] = useState<string | null>(null);

  const openAuthModal = useCallback((view: AuthModalView = "login", redirect: string | null = null) => {
    setAuthModalView(view);
    setAuthRedirect(redirect);
    setShowAuthModal(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setShowAuthModal(false);
    setAuthRedirect(null);
  }, []);

  const switchAuthView = useCallback((view: AuthModalView) => {
    setAuthModalView(view);
  }, []);

  const refreshUser = useCallback(async () => {
    const res = await fetchCurrentUser();
    if (res.user) {
      setUser(mapUser(res.user as Record<string, unknown>));
    }
  }, []);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) return;

    fetchCurrentUser()
      .then((res) => {
        if (res.user) {
          setUser(mapUser(res.user as Record<string, unknown>));
        } else {
          setAuthToken(null);
        }
      })
      .catch(() => {
        setAuthToken(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await loginApi(email, password);
    setAuthToken(res.token);
    const userRes = await fetchCurrentUser();
    if (userRes.user) {
      setUser(mapUser(userRes.user as Record<string, unknown>));
      setShowAuthModal(false);
      return true;
    }
    return false;
  }, []);

  const loginWithGoogle = useCallback(async (credential: string) => {
    const res = await loginWithGoogleApi(credential);
    setAuthToken(res.token);
    const userRes = await fetchCurrentUser();
    if (userRes.user) {
      setUser(mapUser(userRes.user as Record<string, unknown>));
      setShowAuthModal(false);
      return true;
    }
    return false;
  }, []);

  const loginWithToken = useCallback(async (token: string) => {
    setAuthToken(token);
    const userRes = await fetchCurrentUser();
    if (userRes.user) {
      setUser(mapUser(userRes.user as Record<string, unknown>));
      setShowAuthModal(false);
      return true;
    }
    return false;
  }, []);

  const register = useCallback(async (data: { email: string; password: string; firstName: string; lastName: string; phone: string }) => {
    await createAccountApi({
      email: data.email,
      password: data.password,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
    });
    const loginRes = await loginApi(data.email, data.password);
    setAuthToken(loginRes.token);
    const userRes = await fetchCurrentUser();
    if (userRes.user) {
      setUser(mapUser(userRes.user as Record<string, unknown>));
      setShowAuthModal(false);
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutApi();
    } catch {
    }
    setAuthToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{
      user, isAuthenticated: !!user, loading, login, loginWithGoogle, loginWithToken, register, logout, refreshUser,
      showAuthModal, authModalView, authRedirect,
      openAuthModal, closeAuthModal, switchAuthView,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
