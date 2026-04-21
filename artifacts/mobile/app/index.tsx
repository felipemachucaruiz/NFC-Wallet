import { router, type Href } from "expo-router";
import React, { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Loading } from "@/components/ui/Loading";

const roleRoutes: Record<string, string> = {
  bank: "/(bank)/",
  gate: "/(gate)/",
  box_office: "/(box-office)/",
  merchant_staff: "/(merchant-pos)/",
  merchant_admin: "/(merchant-admin)/",
  warehouse_admin: "/(warehouse)/",
  event_admin: "/(event-admin)/",
  admin: "/(admin)/",
  box_office: "/(box-office)/",
};

export default function IndexScreen() {
  const { user, isLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }

    const dest = (user?.role && roleRoutes[user.role]) || "/login";
    router.replace(dest as Href);
  }, [isLoading, isAuthenticated, user]);

  return <Loading full />;
}
