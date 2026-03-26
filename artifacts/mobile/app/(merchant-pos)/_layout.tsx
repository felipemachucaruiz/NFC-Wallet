import { Stack, router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, useColorScheme } from "react-native";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { useRoleGuard } from "@/hooks/useRoleGuard";

export default function MerchantPosLayout() {
  useRoleGuard("merchant_staff");
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: C.card },
        headerTintColor: C.text,
        headerTitleStyle: { fontFamily: "Inter_600SemiBold" },
        headerRight: () => (
          <Pressable onPress={() => router.push("/settings")} style={{ marginRight: 16 }}>
            <Feather name="settings" size={20} color={C.textSecondary} />
          </Pressable>
        ),
      }}
    >
      <Stack.Screen name="index" options={{ title: t("pos.title"), headerShown: true }} />
      <Stack.Screen name="charge" options={{ title: t("pos.chargeTitle"), headerShown: true, presentation: "modal" }} />
      <Stack.Screen name="sync-issues" options={{ title: t("syncIssues.title"), headerShown: true }} />
    </Stack>
  );
}
