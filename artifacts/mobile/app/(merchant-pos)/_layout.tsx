import { useColorScheme } from "@/hooks/useColorScheme";
import { Stack, router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { useEventContext } from "@/contexts/EventContext";
import { EventEndedOverlay } from "@/components/EventEndedOverlay";

export default function MerchantPosLayout() {
  const { isReady } = useRoleGuard(["merchant_staff", "merchant_admin"]);
  const { isEventEnded, isLoading: isEventLoading } = useEventContext();
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;

  if (!isReady || isEventLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.background }}>
        <ActivityIndicator color={C.primary} />
      </View>
    );
  }

  if (isEventEnded) {
    return <EventEndedOverlay />;
  }

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
      <Stack.Screen name="index" options={{ title: t("pos.title"), headerShown: true, gestureEnabled: false, headerBackVisible: false }} />
      <Stack.Screen name="charge" options={{ title: t("pos.chargeTitle"), headerShown: true, presentation: "modal" }} />
      <Stack.Screen name="sync-issues" options={{ title: t("syncIssues.title"), headerShown: true }} />
    </Stack>
  );
}
