import { useEffect } from "react";
import { router } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";

const ROLE_HOME: Record<string, string> = {
  attendee: "/(attendee)/",
  bank: "/(bank)/",
  gate: "/(gate)/",
  box_office: "/(box-office)/",
  merchant_staff: "/(merchant-pos)/",
  merchant_admin: "/(merchant-admin)/",
  warehouse_admin: "/(warehouse)/",
  event_admin: "/(event-admin)/",
  admin: "/(admin)/",
};

export function useRoleGuard(requiredRole: string | string[]): { isReady: boolean } {
  const { user, isAuthenticated, isLoading } = useAuth();
  const allowed = Array.isArray(requiredRole) ? requiredRole : [requiredRole];

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || !user) {
      router.replace("/login");
      return;
    }
    if (!allowed.includes(user.role)) {
      const home = (ROLE_HOME[user.role] ?? "/") as Parameters<typeof router.replace>[0];
      router.replace(home);
    }
  }, [isLoading, isAuthenticated, user?.role, JSON.stringify(allowed)]);

  const isAuthorized = !isLoading && isAuthenticated && !!user && allowed.includes(user.role);
  return { isReady: isAuthorized };
}
