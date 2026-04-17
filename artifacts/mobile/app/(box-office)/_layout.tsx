import { useColorScheme } from "@/hooks/useColorScheme";
import { Stack } from "expo-router";
import React from "react";
import { ActivityIndicator, View } from "react-native";
import Colors from "@/constants/colors";
import { useRoleGuard } from "@/hooks/useRoleGuard";

export default function BoxOfficeLayout() {
  const { isReady } = useRoleGuard("box_office");
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;

  if (!isReady) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.background }}>
        <ActivityIndicator color={C.primary} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }} />
  );
}
