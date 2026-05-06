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

import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { router } from "expo-router";


function BraceletIcon({ color, size = 28 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size * (130.27 / 218.21)} viewBox="0 0 218.21 130.27">
      <Path d="M54.12,111.32c-16.88-3.75-46.87-15.28-47.12-28.54l-.42-21.9c24.54,23.23,79.64,30.2,112.49,28.8,29.43-1.25,71.09-12.05,93.88-30.87.94,22.46,2.74,27.34-16.63,39-48.86,22.73-89.82,25.16-142.2,13.51Z" fill={color} />
      <Path d="M118.35,30.33c-33.56-1.08-82.26,5.7-108.07,25.42C-3.72,36.37,26.61,21.18,48.61,15.52c41.27-10.62,85.03-10.44,126.1.97,15.63,4.34,38.25,14.97,38.42,28.57.05,3.87-3.01,8.39-6.34,11.13-23.81-14.86-60.12-24.95-88.44-25.86Z" fill={color} />
      <Rect x="60.11" y="72.37" width="99.83" height="53.2" rx="6.23" fill={color} />
    </Svg>
  );
}

function TicketIcon({ color, size = 26 }: { color: string; size?: number }) {
  const sw = (4 * size) / 236.76;
  return (
    <Svg width={size} height={size * (223.51 / 236.76)} viewBox="0 0 236.76 223.51">
      <Path d="M117.58,210.65c-5.89,5.89-13.61,5.95-19.08.59l-13.26-13c-1.21-1.18-1.51-5.33-.32-6.62,4.78-5.22,4.22-13.54-1.21-17.47-5.87-4.24-12.42-3.34-19.03,3.09l-17.23-17.21c-5.31-5.3-3.02-13.26,1.88-18.15l100.95-100.89c4.3-4.3,12.37-4.88,16.71-.55l17.26,17.23c-5.87,6.13-7.29,12.39-3.55,18.15,3.38,5.21,11.29,7.54,17.13,2.63,2.28-1.92,6.05-1.54,7.97.39l11.91,11.98c5.5,5.53,6.23,13.47.34,19.37l-100.45,100.46ZM189.45,127.78l-4.58-4.61c-1.05-1.06-.51-4.91.81-5.99,1.17-.95,4.17.06,5.33,1.06l4.31,3.7,18.18-18.22c1.39-1.39.34-6.01-1.03-7.36l-10.88-10.65c-8.26,4.65-18.22,3.94-24.48-2.21-6.58-6.47-8.59-16.38-2.95-24.96l-11.23-11.73c-1.45-1.52-6.18-1.56-7.72.01l-17.76,18.16,5.29,5.11c.98.94-.79,5.43-2.16,5.55-2.54.23-6.12-2.58-8.46-5.55l-78.76,78.73c-1.41,1.41-.61,5.94.61,7.14l11.34,11.16c8.4-5.41,18.77-3.98,25.28,2.96s7.03,16.33,2.14,24.48l10.61,10.81c2.54,2.59,6.28,2.27,8.98-.43l77.12-77.16Z" fill={color} stroke={color} strokeWidth={sw} strokeMiterlimit={10} />
      <Path d="M69.97,46.04l8.1,4.65c1.46.84-1.65,6.03-3.2,5.56l-7.8-2.33-37.83,104c-.88,2.43,1.56,5.93,3.76,6.73l18.13,6.59c1.27.46,2.87,3.58,2.34,4.7s-3.88,2.87-5.24,2.37l-18.01-6.56c-5.86-2.13-10.93-8.75-8.46-15.58L71.14,20.12c5.36-14.77,22.12-6.18,38.11.61-3.48,9.18-.32,16.04,6.65,18.63,6.5,2.41,13.41-1.1,16.1-9.26,6.68-.35,14.56,2.72,14.84,6.69.12,1.65-3.47,3.7-5.1,3.34l-5.66-1.23c-5.48,7.95-14.62,10.91-23.76,7.38-7.74-2.99-13.09-11.33-12.35-21.39l-15.97-5.54c-1.48-.51-5.15,1.92-5.69,3.45l-8.33,23.24Z" fill={color} stroke={color} strokeWidth={sw} strokeMiterlimit={10} />
      <Path d="M98.66,65.44l-9.61-3.76c-1.33-.52-3.12-2.97-3.08-4.21.05-1.47,3.38-3.74,4.75-3.26l9.24,3.23c1.07.37,3.44,3.15,2.91,4.15-.65,1.25-2.91,3.06-4.22,3.85Z" fill={color} stroke={color} strokeWidth={sw} strokeMiterlimit={10} />
      <Path d="M173.94,111.94l-7.56-7.26c-.82-.79-.61-4.33.06-5.26.84-1.16,4.42-1.32,5.42-.32l7.01,6.99c.83.82.88,3.71.6,4.84s-4.64,1.87-5.53,1.02Z" fill={color} stroke={color} strokeWidth={sw} strokeMiterlimit={10} />
      <Path d="M158.92,86.05c.74.72,2.15,2.78,2.51,3.74.45,1.2-1.06,3.52-2.22,4.09s-4.42-.49-5.31-1.44l-5.58-5.98c-.93-.99-1.33-3.72-.75-4.89s4.6-2.06,5.5-1.18l5.84,5.67Z" fill={color} stroke={color} strokeWidth={sw} strokeMiterlimit={10} />
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
          tabBarIcon: ({ color }) => <EventosIcon color={color} size={20} />,
        }}
      />
      <Tabs.Screen
        name="home"
        options={{
          title: t("home.tab"),
          tabBarIcon: ({ color }) => <BraceletIcon color={color} size={32} />,
        }}
      />
      <Tabs.Screen
        name="my-tickets"
        options={{
          title: t("tickets.tab"),
          tabBarLabel: () => null,
          tabBarIcon: () => (
            <View style={[styles.circleBtn, { backgroundColor: C.primary }]}>
              <TicketIcon color="#000" size={38} />
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
