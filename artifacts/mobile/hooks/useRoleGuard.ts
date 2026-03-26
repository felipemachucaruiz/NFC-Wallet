import { useEffect } from "react";
import { router } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";

const ROLE_HOME: Record<string, string> = {
  attendee: "/(attendee)/",
  bank: "/(bank)/",
  merchant_staff: "/(merchant-pos)/",
  merchant_admin: "/(merchant-admin)/",
  warehouse_admin: "/(warehouse)/",
  event_admin: "/(event-admin)/",
  admin: "/(admin)/",
};

export function useRoleGuard(requiredRole: string): { isReady: boolean } {
  const { user, isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || !user) {
      router.replace("/login");
      return;
    }
    if (user.role !== requiredRole) {
      const home = (ROLE_HOME[user.role] ?? "/") as Parameters<typeof router.replace>[0];
      router.replace(home);
    }
  }, [isLoading, isAuthenticated, user?.role, requiredRole]);

  const isAuthorized = !isLoading && isAuthenticated && !!user && user.role === requiredRole;
  return { isReady: isAuthorized };
}
