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
import { EventProvider, useEventContext } from "@/contexts/EventContext";

function NativeTabLayout() {
  const { t } = useTranslation();
  const { inventoryMode } = useEventContext();
  const isLocationBased = inventoryMode === "location_based";

  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "cube.box", selected: "cube.box.fill" }} />
        <Label>{t("warehouse.stock")}</Label>
      </NativeTabs.Trigger>
      {!isLocationBased && (
        <NativeTabs.Trigger name="dispatch">
          <Icon sf={{ default: "arrow.up.circle", selected: "arrow.up.circle.fill" }} />
          <Label>{t("warehouse.dispatch")}</Label>
        </NativeTabs.Trigger>
      )}
      {!isLocationBased && (
        <NativeTabs.Trigger name="restock">
          <Icon sf={{ default: "cart.badge.plus", selected: "cart.badge.plus" }} />
          <Label>{t("warehouse.restock")}</Label>
        </NativeTabs.Trigger>
      )}
      {!isLocationBased && (
        <NativeTabs.Trigger name="movements">
          <Icon sf={{ default: "list.bullet.rectangle", selected: "list.bullet.rectangle.fill" }} />
          <Label>{t("warehouse.movements")}</Label>
        </NativeTabs.Trigger>
      )}
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
  const { inventoryMode } = useEventContext();
  const isLocationBased = inventoryMode === "location_based";

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
      <Tabs.Screen name="index" options={{ title: t("warehouse.stock"), tabBarIcon: ({ color }) => isIOS ? <SymbolView name="cube.box.fill" tintColor={color} size={22} /> : <Feather name="package" size={22} color={color} /> }} />
      <Tabs.Screen name="dispatch" options={{ href: isLocationBased ? null : undefined, title: t("warehouse.dispatch"), tabBarIcon: ({ color }) => isIOS ? <SymbolView name="arrow.up.circle.fill" tintColor={color} size={22} /> : <Feather name="upload" size={22} color={color} /> }} />
      <Tabs.Screen name="restock" options={{ href: isLocationBased ? null : undefined, title: t("warehouse.restock"), tabBarIcon: ({ color }) => isIOS ? <SymbolView name="cart.badge.plus" tintColor={color} size={22} /> : <Feather name="shopping-cart" size={22} color={color} /> }} />
      <Tabs.Screen name="movements" options={{ href: isLocationBased ? null : undefined, title: t("warehouse.movements"), tabBarIcon: ({ color }) => isIOS ? <SymbolView name="list.bullet.rectangle.fill" tintColor={color} size={22} /> : <Feather name="list" size={22} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  );
}

export default function WarehouseLayout() {
  const { isReady } = useRoleGuard("warehouse_admin");
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
    <EventProvider>
      <WarehouseTabsInner />
    </EventProvider>
  );
}

function WarehouseTabsInner() {
  return (Platform.OS !== "web" && isLiquidGlassAvailable()) ? <NativeTabLayout /> : <ClassicTabLayout />;
}
