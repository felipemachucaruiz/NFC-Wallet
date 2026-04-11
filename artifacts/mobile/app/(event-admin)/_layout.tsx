import { useColorScheme } from "@/hooks/useColorScheme";
import { BlurView } from "expo-blur";
import { Tabs, router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { EventProvider } from "@/contexts/EventContext";

function ClassicTabLayout() {
  const { t } = useTranslation();
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
        headerShown: false,
      }}
    >
      {/* Primary 5 tabs */}
      <Tabs.Screen
        name="index"
        options={{
          title: t("eventAdmin.dashboard"),
          tabBarIcon: ({ color }) => <Feather name="pie-chart" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="merchants"
        options={{
          title: t("eventAdmin.merchants"),
          tabBarIcon: ({ color }) => <Feather name="shopping-bag" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="fraud-alerts"
        options={{
          title: t("fraud.alertsTitle"),
          tabBarIcon: ({ color }) => <Feather name="shield" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: t("eventAdmin.reports"),
          tabBarIcon: ({ color }) => <Feather name="bar-chart-2" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: t("eventAdmin.more"),
          tabBarIcon: ({ color }) => <Feather name="grid" size={22} color={color} />,
        }}
      />

      {/* Hidden from tab bar — accessible via More screen */}
      <Tabs.Screen name="users" options={{ href: null }} />
      <Tabs.Screen name="wristbands" options={{ href: null }} />
      <Tabs.Screen name="transactions" options={{ href: null }} />
      <Tabs.Screen name="inventory" options={{ href: null }} />
      <Tabs.Screen name="analytics" options={{ href: null }} />
      <Tabs.Screen name="promoter-summary" options={{ href: null }} />
      <Tabs.Screen name="event-settings" options={{ href: null }} />
      <Tabs.Screen name="access-zones" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
      {/* Ticketing screens */}
      <Tabs.Screen name="ticket-types" options={{ href: null }} />
      <Tabs.Screen name="ticket-orders" options={{ href: null }} />
      <Tabs.Screen name="ticket-checkins" options={{ href: null }} />
      <Tabs.Screen name="event-days" options={{ href: null }} />
      <Tabs.Screen name="guest-lists" options={{ href: null }} />
      <Tabs.Screen name="sales-config" options={{ href: null }} />
      <Tabs.Screen name="sales-dashboard" options={{ href: null }} />
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
  return (
    <EventProvider>
      <ClassicTabLayout />
    </EventProvider>
  );
}
