import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";

const ADMIN_ROLES = ["admin"] as const;
const EVENT_ADMIN_ROLES = ["event_admin"] as const;
const MANAGEMENT_ROLES = ["admin", "event_admin"] as const;

interface RouteGuardProps {
  children: React.ReactNode;
  allowedRoles?: readonly string[];
}

export function RouteGuard({ children, allowedRoles = MANAGEMENT_ROLES }: RouteGuardProps) {
  const { user, isLoading, logout } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      setLocation("/login");
      return;
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
      if (user.role === "admin") {
        setLocation("/admin");
      } else if (user.role === "event_admin") {
        setLocation("/event-admin");
      } else {
        // Role not supported by the admin portal — log out and redirect to login
        logout().finally(() => {
          setLocation("/login?error=unauthorized_role");
        });
      }
    }
  }, [user, isLoading, allowedRoles, setLocation, logout]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) return null;
  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) return null;

  return <>{children}</>;
}

export function PublicRouteGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading, logout } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading || !user) return;
    if (user.role === "admin") {
      setLocation("/admin");
    } else if (user.role === "event_admin") {
      setLocation("/event-admin");
    } else {
      // Role not supported by the admin portal — log out cleanly
      logout().finally(() => {
        setLocation("/login?error=unauthorized_role");
      });
    }
  }, [user, isLoading, setLocation, logout]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (user) return null;

  return <>{children}</>;
}
