import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs, router } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, Pressable, StyleSheet, View, useColorScheme } from "react-native";
import Colors from "@/constants/colors";

function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "cube.box", selected: "cube.box.fill" }} />
        <Label>Stock</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="dispatch">
        <Icon sf={{ default: "arrow.up.circle", selected: "arrow.up.circle.fill" }} />
        <Label>Despachar</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="restock">
        <Icon sf={{ default: "cart.badge.plus", selected: "cart.badge.plus" }} />
        <Label>Reabastec.</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="movements">
        <Icon sf={{ default: "list.bullet.rectangle", selected: "list.bullet.rectangle.fill" }} />
        <Label>Movimientos</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
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
      <Tabs.Screen name="index" options={{ title: "Stock", tabBarIcon: ({ color }) => isIOS ? <SymbolView name="cube.box.fill" tintColor={color} size={22} /> : <Feather name="package" size={22} color={color} /> }} />
      <Tabs.Screen name="dispatch" options={{ title: "Despachar", tabBarIcon: ({ color }) => isIOS ? <SymbolView name="arrow.up.circle.fill" tintColor={color} size={22} /> : <Feather name="upload" size={22} color={color} /> }} />
      <Tabs.Screen name="restock" options={{ title: "Reabastec.", tabBarIcon: ({ color }) => isIOS ? <SymbolView name="cart.badge.plus" tintColor={color} size={22} /> : <Feather name="shopping-cart" size={22} color={color} /> }} />
      <Tabs.Screen name="movements" options={{ title: "Movimientos", tabBarIcon: ({ color }) => isIOS ? <SymbolView name="list.bullet.rectangle.fill" tintColor={color} size={22} /> : <Feather name="list" size={22} color={color} /> }} />
    </Tabs>
  );
}

export default function WarehouseLayout() {
  if (isLiquidGlassAvailable()) return <NativeTabLayout />;
  return <ClassicTabLayout />;
}
