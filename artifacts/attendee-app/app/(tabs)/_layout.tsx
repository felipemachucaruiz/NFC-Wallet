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
import Svg, { Path, Rect } from "react-native-svg";

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

function BraceletIcon({ color, size = 28 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size * (130.27 / 218.21)} viewBox="0 0 218.21 130.27">
      <Path d="M54.12,111.32c-16.88-3.75-46.87-15.28-47.12-28.54l-.42-21.9c24.54,23.23,79.64,30.2,112.49,28.8,29.43-1.25,71.09-12.05,93.88-30.87.94,22.46,2.74,27.34-16.63,39-48.86,22.73-89.82,25.16-142.2,13.51Z" fill={color} />
      <Path d="M118.35,30.33c-33.56-1.08-82.26,5.7-108.07,25.42C-3.72,36.37,26.61,21.18,48.61,15.52c41.27-10.62,85.03-10.44,126.1.97,15.63,4.34,38.25,14.97,38.42,28.57.05,3.87-3.01,8.39-6.34,11.13-23.81-14.86-60.12-24.95-88.44-25.86Z" fill={color} />
      <Rect x="60.11" y="72.37" width="99.83" height="53.2" rx="6.23" fill={color} />
    </Svg>
  );
}

function EventosIcon({ color, size = 24 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size * (209.37 / 177.26)} viewBox="0 0 177.26 209.37">
      <Path d="M150.67,77.71c-24.08-6.2-44.82-27.29-50.54-51.03-.49-2.02-.53-3.97,1.03-5.51,13.63-13.49,35-15.51,50.74-4.47,19.51,13.69,22.3,41.66,6.18,59.03-1.99,2.15-4.14,2.82-7.41,1.97Z" fill={color} />
      <Path d="M139.96,196.77c1.36,2.31-.08,4.83-1.5,5.77-1.89,1.24-4.82,1.07-6.02-.87-3.45-5.54-6.58-10.78-10.71-15.79-15.63-19-42.76-23.47-63.74-10.56-7.54,4.64-15.04,8.51-23.55,11.15-7.53,2.34-15.43,1.7-22.07-2.47-5.34-3.32-7.23-9.38-5.03-15.3,1.99-5.36,5.62-9.74,10.07-13.62-4.77-4.32-4.91-10.95-.82-15.95l17.63-21.57c5.27,11.78,14.49,21.11,26.43,26.4l-22.97,18.55c-4.18,3.38-9.87,2.59-13.83-1.01-5.33,4.61-11.4,12.11-6.4,15.03,4.41,2.57,9.39,2.8,14.27,1.31,7.96-2.42,14.8-6.2,21.87-10.45,24.22-14.55,55.47-9.88,74.06,11.4,4.82,5.51,8.48,11.47,12.32,17.98Z" fill={color} />
      <Path d="M146.9,83.74c-7.38,4.72-16.68,5.5-25.58,3.63-16.83-3.53-29.04-16.75-31.1-33.86-.93-7.76.08-15.63,4.21-22.27,4.72,13.25,11.37,24.34,21.02,33.71,8.93,8.47,19.08,14.38,31.46,18.78Z" fill={color} />
      <Path d="M94.81,79.13c-5.54-6.4-8.82-13.78-11.02-22.38l-44.35,54.35c4.48,13.3,14.79,23.38,27.72,27.65l54.05-44.35c-10.95-2.9-19.66-7.46-26.4-15.26ZM89.02,93.22l-11.26,11.4c-1.29,1.31-2.8,1.33-4,.57-1.03-.66-2.08-2.68-.86-3.93l11.33-11.6c1.12-1.15,2.87-1.39,4.14-.4.89.7,1.94,2.65.65,3.96Z" fill={color} />
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
          tabBarIcon: ({ color }) => <EventosIcon color={color} size={24} />,
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
