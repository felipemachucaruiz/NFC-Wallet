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
import { Feather } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";
import Svg, { Path, Ellipse } from "react-native-svg";

const ICON_MIC_VARIANT = "M9,3A4,4 0 0,1 13,7H5A4,4 0 0,1 9,3M11.84,9.82L11,18H10V19A2,2 0 0,0 12,21A2,2 0 0,0 14,19V14A4,4 0 0,1 18,10H20L19,11L20,12H18A2,2 0 0,0 16,14V19A4,4 0 0,1 12,23A4,4 0 0,1 8,19V18H7L6.16,9.82C5.67,9.32 5.31,8.7 5.13,8H12.87C12.69,8.7 12.33,9.32 11.84,9.82M9,11A1,1 0 0,0 8,12A1,1 0 0,0 9,13A1,1 0 0,0 10,12A1,1 0 0,0 9,11Z";
const ICON_TICKET = "M22 10V6C22 4.89 21.1 4 20 4H4C2.9 4 2 4.89 2 6V10C3.11 10 4 10.9 4 12S3.11 14 2 14V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V14C20.9 14 20 13.1 20 12S20.9 10 22 10M20 8.54C18.81 9.23 18 10.53 18 12S18.81 14.77 20 15.46V18H4V15.46C5.19 14.77 6 13.47 6 12C6 10.5 5.2 9.23 4 8.54L4 6H20V8.54M11 15H13V17H11M11 11H13V13H11M11 7H13V9H11Z";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { router } from "expo-router";

function MdiIcon({ path, color, size = 24 }: { path: string; color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={path} fill={color} />
    </Svg>
  );
}

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
              : <MdiIcon path={ICON_MIC_VARIANT} color={color} size={28} />,
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
          tabBarLabel: () => null,
          tabBarIcon: () => (
            <View style={[styles.circleBtn, { backgroundColor: C.primary }]}>
              <MdiIcon path={ICON_TICKET} color="#000" size={28} />
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
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: -16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6,
  },
});
