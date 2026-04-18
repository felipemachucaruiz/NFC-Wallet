import { useColorScheme } from "@/hooks/useColorScheme";
import { BlurView } from "expo-blur";
import { Tabs, router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";

const styles = StyleSheet.create({
  posTab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3 },
  posTabLabel: { fontSize: 10, fontFamily: "Inter_500Medium" },
});
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { EventProvider, useEventContext } from "@/contexts/EventContext";
import { EventEndedOverlay } from "@/components/EventEndedOverlay";

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
          tabBarIcon: ({ color }) => <Feather name="bar-chart-2" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="locations"
        options={{
          title: t("merchant_admin.locations"),
          tabBarIcon: ({ color }) => <Feather name="map-pin" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="products"
        options={{
          title: t("merchant_admin.products"),
          tabBarIcon: ({ color }) => <Feather name="tag" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="stock"
        options={{
          title: t("merchant_admin.inventory"),
          tabBarIcon: ({ color }) => <Feather name="package" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="staff"
        options={{
          title: t("merchant_admin.staff"),
          tabBarIcon: ({ color }) => <Feather name="user-plus" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="payouts"
        options={{
          title: t("merchant_admin.payouts"),
          tabBarIcon: ({ color }) => <Feather name="credit-card" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="pos-link"
        options={{
          title: t("pos.title"),
          tabBarIcon: ({ color }) => <Feather name="shopping-cart" size={22} color={color} />,
          tabBarButton: ({ style }) => (
            <Pressable
              style={[style, styles.posTab]}
              onPress={() => router.push("/(merchant-pos)/")}
            >
              <Feather name="shopping-cart" size={22} color={C.primary} />
              <Text style={[styles.posTabLabel, { color: C.primary }]}>{t("pos.title")}</Text>
            </Pressable>
          ),
        }}
      />
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  );
}

function MerchantAdminGuard() {
  const { isEventEnded, isLoading: isEventLoading } = useEventContext();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;

  if (isEventLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.background }}>
        <ActivityIndicator color={C.primary} />
      </View>
    );
  }

  if (isEventEnded) {
    return <EventEndedOverlay />;
  }

  return <ClassicTabLayout />;
}

export default function MerchantAdminLayout() {
  const { isReady } = useRoleGuard("merchant_admin");
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
      <MerchantAdminGuard />
    </EventProvider>
  );
}
