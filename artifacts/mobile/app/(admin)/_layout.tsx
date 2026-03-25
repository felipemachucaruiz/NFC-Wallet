import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs, router } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, Pressable, StyleSheet, View, useColorScheme } from "react-native";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";

function NativeTabLayout() {
  const { t } = useTranslation();
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "chart.pie", selected: "chart.pie.fill" }} />
        <Label>{t("admin.dashboard")}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="merchants">
        <Icon sf={{ default: "storefront", selected: "storefront.fill" }} />
        <Label>{t("admin.merchants")}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="events">
        <Icon sf={{ default: "calendar", selected: "calendar.fill" }} />
        <Label>{t("admin.events")}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="reports">
        <Icon sf={{ default: "doc.chart", selected: "doc.chart.fill" }} />
        <Label>{t("admin.reports")}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="roles">
        <Icon sf={{ default: "person.3", selected: "person.3.fill" }} />
        <Label>{t("admin.users")}</Label>
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
      <Tabs.Screen name="index" options={{ title: t("admin.dashboard"), tabBarIcon: ({ color }) => isIOS ? <SymbolView name="chart.pie.fill" tintColor={color} size={22} /> : <Feather name="pie-chart" size={22} color={color} /> }} />
      <Tabs.Screen name="merchants" options={{ title: t("admin.merchants"), tabBarIcon: ({ color }) => isIOS ? <SymbolView name="storefront.fill" tintColor={color} size={22} /> : <Feather name="shopping-bag" size={22} color={color} /> }} />
      <Tabs.Screen name="events" options={{ title: t("admin.events"), tabBarIcon: ({ color }) => isIOS ? <SymbolView name="calendar.fill" tintColor={color} size={22} /> : <Feather name="calendar" size={22} color={color} /> }} />
      <Tabs.Screen name="reports" options={{ title: t("admin.reports"), tabBarIcon: ({ color }) => isIOS ? <SymbolView name="doc.chart.fill" tintColor={color} size={22} /> : <Feather name="file-text" size={22} color={color} /> }} />
      <Tabs.Screen name="roles" options={{ title: t("admin.users"), tabBarIcon: ({ color }) => isIOS ? <SymbolView name="person.3.fill" tintColor={color} size={22} /> : <Feather name="users" size={22} color={color} /> }} />
    </Tabs>
  );
}

export default function AdminLayout() {
  if (isLiquidGlassAvailable()) return <NativeTabLayout />;
  return <ClassicTabLayout />;
}
