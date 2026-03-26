import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs, router } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, View, useColorScheme } from "react-native";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { EventProvider } from "@/contexts/EventContext";
import { useAuth } from "@/contexts/AuthContext";

function NativeTabLayout() {
  const { t } = useTranslation();
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "chart.pie", selected: "chart.pie.fill" }} />
        <Label>{t("eventAdmin.dashboard")}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="promoter-summary">
        <Icon sf={{ default: "building.2", selected: "building.2.fill" }} />
        <Label>{t("eventAdmin.promoterSummary")}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="merchants">
        <Icon sf={{ default: "storefront", selected: "storefront.fill" }} />
        <Label>{t("eventAdmin.merchants")}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="users">
        <Icon sf={{ default: "person.3", selected: "person.3.fill" }} />
        <Label>{t("eventAdmin.users")}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="inventory">
        <Icon sf={{ default: "shippingbox", selected: "shippingbox.fill" }} />
        <Label>{t("inventory.tab")}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="reports">
        <Icon sf={{ default: "doc.chart", selected: "doc.chart.fill" }} />
        <Label>{t("eventAdmin.reports")}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="event-settings">
        <Icon sf={{ default: "gearshape", selected: "gearshape.fill" }} />
        <Label>{t("eventAdmin.inventorySettings")}</Label>
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
  const { user } = useAuth();
  const hasPromoterCompany = !!user?.promoterCompanyId;
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const isWeb = Platform.OS === "web";
  const isIOS = Platform.OS === "ios";
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
      <Tabs.Screen name="index" options={{ title: t("eventAdmin.dashboard"), tabBarIcon: ({ color }) => <Feather name="pie-chart" size={22} color={color} /> }} />
      <Tabs.Screen name="promoter-summary" options={{ href: hasPromoterCompany ? undefined : null, title: t("eventAdmin.promoterSummary"), tabBarIcon: ({ color }) => <Feather name="briefcase" size={22} color={color} /> }} />
      <Tabs.Screen name="merchants" options={{ title: t("eventAdmin.merchants"), tabBarIcon: ({ color }) => <Feather name="shopping-bag" size={22} color={color} /> }} />
      <Tabs.Screen name="users" options={{ title: t("eventAdmin.users"), tabBarIcon: ({ color }) => <Feather name="users" size={22} color={color} /> }} />
      <Tabs.Screen name="inventory" options={{ title: t("inventory.tab"), tabBarIcon: ({ color }) => <Feather name="package" size={22} color={color} /> }} />
      <Tabs.Screen name="reports" options={{ title: t("eventAdmin.reports"), tabBarIcon: ({ color }) => <Feather name="bar-chart-2" size={22} color={color} /> }} />
      <Tabs.Screen name="event-settings" options={{ title: t("eventAdmin.inventorySettings"), tabBarIcon: ({ color }) => <Feather name="settings" size={22} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  );
}

export default function EventAdminLayout() {
  const { isReady } = useRoleGuard("event_admin");
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  if (!isReady) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.background }}>
        <ActivityIndicator color={C.primary} />
      </View>
    );
  }
  const layout = isLiquidGlassAvailable() ? <NativeTabLayout /> : <ClassicTabLayout />;
  return <EventProvider>{layout}</EventProvider>;
}
