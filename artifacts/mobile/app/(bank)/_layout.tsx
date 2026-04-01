import { useColorScheme } from "@/hooks/useColorScheme";
import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Stack, Tabs, router } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { useRoleGuard } from "@/hooks/useRoleGuard";

function NativeTabLayout() {
  const { t } = useTranslation();
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "plus.circle", selected: "plus.circle.fill" }} />
        <Label>{t("bank.topUpLabel")}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="shift">
        <Icon sf={{ default: "chart.bar", selected: "chart.bar.fill" }} />
        <Label>{t("bank.shift")}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <Icon sf={{ default: "person.circle", selected: "person.circle.fill" }} />
        <Label>{t("common.settings")}</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";
  const isDark = scheme === "dark";

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: C.card },
        headerTintColor: C.text,
        headerTitleStyle: { fontFamily: "Inter_600SemiBold" },
        headerRight: () => (
          <Pressable onPress={() => router.push("/settings")} style={{ marginRight: 16 }}>
            <Feather name="settings" size={20} color={C.textSecondary} />
          </Pressable>
        ),
        tabBarActiveTintColor: C.primary,
        tabBarInactiveTintColor: C.tabIconDefault,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : C.card,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: C.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={100} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: C.card }]} />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("bank.topUpLabel"),
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="plus.circle.fill" tintColor={color} size={22} /> : <Feather name="plus-circle" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="shift"
        options={{
          title: t("bank.shift"),
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="chart.bar.fill" tintColor={color} size={22} /> : <Feather name="bar-chart-2" size={22} color={color} />,
        }}
      />
      <Tabs.Screen name="topup" options={{ href: null }} />
      <Tabs.Screen name="refund" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
      <Tabs.Screen name="sync-issues" options={{ href: null }} />
      <Tabs.Screen name="refund-requests" options={{ href: null }} />
      <Tabs.Screen name="transfer-balance" options={{ href: null }} />
    </Tabs>
  );
}

export default function BankLayout() {
  const { isReady } = useRoleGuard("bank");
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  if (!isReady) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.background }}>
        <ActivityIndicator color={C.primary} />
      </View>
    );
  }
  if (isLiquidGlassAvailable()) return <NativeTabLayout />;
  return <ClassicTabLayout />;
}
