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
        <Icon sf={{ default: "chart.bar", selected: "chart.bar.fill" }} />
        <Label>{t("merchant_admin.earnings")}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="locations">
        <Icon sf={{ default: "mappin.and.ellipse", selected: "mappin.and.ellipse" }} />
        <Label>{t("merchant_admin.locations")}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="staff">
        <Icon sf={{ default: "person.badge.plus", selected: "person.badge.plus.fill" }} />
        <Label>{t("merchant_admin.staff")}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="payouts">
        <Icon sf={{ default: "banknote", selected: "banknote.fill" }} />
        <Label>{t("merchant_admin.payouts")}</Label>
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
          title: t("merchant_admin.earnings"),
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="chart.bar.fill" tintColor={color} size={22} /> : <Feather name="bar-chart-2" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="locations"
        options={{
          title: t("merchant_admin.locations"),
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="mappin.and.ellipse" tintColor={color} size={22} /> : <Feather name="map-pin" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="staff"
        options={{
          title: t("merchant_admin.staff"),
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="person.badge.plus.fill" tintColor={color} size={22} /> : <Feather name="user-plus" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="payouts"
        options={{
          title: t("merchant_admin.payouts"),
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="banknote" tintColor={color} size={22} /> : <Feather name="credit-card" size={22} color={color} />,
        }}
      />
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  );
}

export default function MerchantAdminLayout() {
  if (isLiquidGlassAvailable()) return <NativeTabLayout />;
  return <ClassicTabLayout />;
}
