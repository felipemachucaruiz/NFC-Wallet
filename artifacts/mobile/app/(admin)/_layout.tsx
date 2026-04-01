import { useColorScheme } from "@/hooks/useColorScheme";
import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs, router } from "expo-router";
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
        <Icon sf={{ default: "chart.pie", selected: "chart.pie.fill" }} />
        <Label>{t("admin.overview")}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="clients">
        <Icon sf={{ default: "person.2.circle", selected: "person.2.circle.fill" }} />
        <Label>{t("admin.clients")}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="events">
        <Icon sf={{ default: "calendar", selected: "calendar.fill" }} />
        <Label>{t("admin.events")}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="bracelets">
        <Icon sf={{ default: "wave.3.right.circle", selected: "wave.3.right.circle.fill" }} />
        <Label>{t("admin.braceletMgmt")}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="analytics">
        <Icon sf={{ default: "waveform.path.ecg", selected: "waveform.path.ecg" }} />
        <Label>{t("analytics.title")}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="reports">
        <Icon sf={{ default: "banknote", selected: "banknote.fill" }} />
        <Label>{t("admin.billing")}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="fraud-alerts">
        <Icon sf={{ default: "exclamationmark.shield", selected: "exclamationmark.shield.fill" }} />
        <Label>{t("fraud.alertsTitle")}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="roles">
        <Icon sf={{ default: "gearshape", selected: "gearshape.fill" }} />
        <Label>{t("admin.settings")}</Label>
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
        tabBarLabelStyle: { fontSize: 10, fontFamily: "Inter_500Medium" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t("admin.overview"), tabBarIcon: ({ color }) => isIOS ? <SymbolView name="chart.pie.fill" tintColor={color} size={22} /> : <Feather name="pie-chart" size={22} color={color} /> }} />
      <Tabs.Screen name="clients" options={{ title: t("admin.clients"), tabBarIcon: ({ color }) => isIOS ? <SymbolView name="person.2.circle.fill" tintColor={color} size={22} /> : <Feather name="users" size={22} color={color} /> }} />
      <Tabs.Screen name="events" options={{ title: t("admin.events"), tabBarIcon: ({ color }) => isIOS ? <SymbolView name="calendar.fill" tintColor={color} size={22} /> : <Feather name="calendar" size={22} color={color} /> }} />
      <Tabs.Screen name="bracelets" options={{ title: t("admin.braceletMgmt"), tabBarIcon: ({ color }) => isIOS ? <SymbolView name="wave.3.right.circle.fill" tintColor={color} size={22} /> : <Feather name="wifi" size={22} color={color} /> }} />
      <Tabs.Screen name="analytics" options={{ title: t("analytics.title"), tabBarIcon: ({ color }) => <Feather name="activity" size={22} color={color} /> }} />
      <Tabs.Screen name="reports" options={{ title: t("admin.billing"), tabBarIcon: ({ color }) => isIOS ? <SymbolView name="banknote.fill" tintColor={color} size={22} /> : <Feather name="dollar-sign" size={22} color={color} /> }} />
      <Tabs.Screen name="fraud-alerts" options={{ title: t("fraud.alertsTitle"), tabBarIcon: ({ color }) => <Feather name="shield" size={22} color={color} /> }} />
      <Tabs.Screen name="roles" options={{ title: t("admin.settings"), tabBarIcon: ({ color }) => isIOS ? <SymbolView name="gearshape.fill" tintColor={color} size={22} /> : <Feather name="settings" size={22} color={color} /> }} />
      <Tabs.Screen name="merchants" options={{ href: null }} />
    </Tabs>
  );
}

export default function AdminLayout() {
  const { isReady } = useRoleGuard("admin");
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
