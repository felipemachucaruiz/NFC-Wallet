import { router } from "expo-router";
import React, { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Loading } from "@/components/ui/Loading";

export default function IndexScreen() {
  const { user, isLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }

    const role = user?.role;
    if (role === "attendee") {
      router.replace("/(attendee)/home");
    } else if (role === "bank") {
      router.replace("/(bank)/");
    } else if (role === "gate") {
      router.replace("/(gate)/");
    } else if (role === "merchant_staff") {
      router.replace("/(merchant-pos)/");
    } else if (role === "merchant_admin") {
      router.replace("/(merchant-admin)/");
    } else if (role === "warehouse_admin") {
      router.replace("/(warehouse)/");
    } else if (role === "event_admin") {
      router.replace("/(event-admin)/");
    } else if (role === "admin") {
      router.replace("/(admin)/");
    } else {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, user]);

  return <Loading full />;
}
