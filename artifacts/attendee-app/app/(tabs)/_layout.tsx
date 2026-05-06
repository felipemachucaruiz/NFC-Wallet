import { useColorScheme } from "@/hooks/useColorScheme";
import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
// expo-symbols requires iOS SF Symbols native support — not available in all
// binary builds. Dynamic require prevents a crash when the native module is
// absent in an OTA-updated APK/IPA that predates this package being linked.
let SymbolView: React.ComponentType<{ name: string; tintColor: string; size: number }> | null = null;
try {
  SymbolView = require("expo-symbols").SymbolView;
} catch {}
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";
import Svg, { Path, Ellipse } from "react-native-svg";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { router } from "expo-router";

function BraceletIcon({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 512 512" fill="none">
      <Ellipse cx="256" cy="340" rx="210" ry="80" stroke={color} strokeWidth="28" fill="none" />
      <Path
        d="M46 340 C46 220 130 140 220 118 M466 340 C466 220 382 140 292 118"
        stroke={color}
        strokeWidth="28"
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M220 118 C230 115 243 113 256 113 C269 113 282 115 292 118"
        stroke={color}
        strokeWidth="28"
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

export default function TabsLayout() {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading } = useAuth();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";
  const isDark = scheme === "dark";

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.background }}>
        <ActivityIndicator color={C.primary} />
      </View>
    );
  }

  if (!isAuthenticated) {
    router.replace("/login");
    return null;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
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
        name="events"
        options={{
          title: t("events.tab"),
          tabBarIcon: ({ color }) =>
            isIOS && SymbolView
              ? <SymbolView name="mic.fill" tintColor={color} size={22} />
              : <MaterialCommunityIcons name="microphone" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="home"
        options={{
          title: t("home.tab"),
          tabBarIcon: ({ color }) => <BraceletIcon color={color} size={22} />,
        }}
      />
      <Tabs.Screen
        name="my-tickets"
        options={{
          title: t("tickets.tab"),
          tabBarIcon: ({ focused }) => (
            <View style={[styles.circleBtn, { backgroundColor: C.primary }]}>
              <Feather name="tag" size={22} color={focused ? C.card : "#000"} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: t("history.tab"),
          tabBarIcon: ({ color }) =>
            isIOS && SymbolView
              ? <SymbolView name="list.bullet" tintColor={color} size={22} />
              : <Feather name="list" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("profile.tab"),
          tabBarIcon: ({ color }) =>
            isIOS && SymbolView
              ? <SymbolView name="person.circle.fill" tintColor={color} size={22} />
              : <Feather name="user" size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  circleBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
});
