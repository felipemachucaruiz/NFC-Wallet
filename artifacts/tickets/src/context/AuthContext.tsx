import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { User } from "@/data/types";

type AuthModalView = "login" | "register";

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  register: (data: { email: string; password: string; firstName: string; lastName: string; phone: string }) => Promise<boolean>;
  logout: () => void;
  showAuthModal: boolean;
  authModalView: AuthModalView;
  authRedirect: string | null;
  openAuthModal: (view?: AuthModalView, redirect?: string | null) => void;
  closeAuthModal: () => void;
  switchAuthView: (view: AuthModalView) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const STORAGE_KEY = "tapee_tickets_user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try { return JSON.parse(stored); } catch { return null; }
    }
    return null;
  });

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

  const login = useCallback(async (email: string, _password: string) => {
    const mockUser: User = {
      id: "user-001",
      email,
      firstName: email.split("@")[0],
      lastName: "",
      phone: "+57 300 123 4567",
    };
    setUser(mockUser);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mockUser));
    setShowAuthModal(false);
    return true;
  }, []);

  const register = useCallback(async (data: { email: string; password: string; firstName: string; lastName: string; phone: string }) => {
    const mockUser: User = {
      id: "user-" + Date.now(),
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
    };
    setUser(mockUser);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mockUser));
    setShowAuthModal(false);
    return true;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <AuthContext.Provider value={{
      user, isAuthenticated: !!user, login, register, logout,
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
