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

    // DIAGNOSTIC: route to /debug before role screen to isolate crash source
    router.replace("/debug");
  }, [isLoading, isAuthenticated, user]);

  return <Loading full />;
}
