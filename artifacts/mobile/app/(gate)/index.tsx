import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";

export default function GateHomeScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: isWeb ? 67 : insets.top + 16,
            backgroundColor: C.card,
            borderBottomColor: C.border,
          },
        ]}
      >
        <View style={[styles.logoRow]}>
          <View style={[styles.logoIcon, { backgroundColor: C.primaryLight }]}>
            <Feather name="shield" size={22} color={C.primary} />
          </View>
          <View>
            <Text style={[styles.logoTitle, { color: C.text }]}>
              {t("gate.title")}
            </Text>
            {user?.eventName ? (
              <View style={styles.eventRow}>
                <Feather name="calendar" size={12} color={C.textSecondary} />
                <Text style={[styles.eventName, { color: C.textSecondary }]}>
                  {user.eventName}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <Pressable
          onPress={() => router.push("/settings")}
          hitSlop={10}
        >
          <Feather name="settings" size={20} color={C.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.body}>
        <View style={[styles.infoCard, { backgroundColor: C.card, borderColor: C.border }]}>
          <Feather name="info" size={18} color={C.textSecondary} />
          <Text style={[styles.infoText, { color: C.textSecondary }]}>
            {t("gate.readyHint")}
          </Text>
        </View>

        <Pressable
          style={[styles.ctaBtn, { backgroundColor: C.primary }]}
          onPress={() => router.push("/register" as never)}
        >
          <View style={styles.ctaBtnInner}>
            <View style={[styles.ctaIconWrap, { backgroundColor: "rgba(255,255,255,0.15)" }]}>
              <Feather name="wifi" size={36} color="#fff" />
            </View>
            <Text style={styles.ctaBtnTitle}>{t("gate.registerWristband")}</Text>
            <Text style={styles.ctaBtnSub}>{t("gate.registerWristbandHint")}</Text>
          </View>
          <Feather name="arrow-right" size={22} color="rgba(255,255,255,0.7)" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  logoIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  logoTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  eventRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  eventName: { fontSize: 12, fontFamily: "Inter_500Medium" },
  body: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
    gap: 20,
    alignItems: "stretch",
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  infoText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  ctaBtn: {
    borderRadius: 20,
    padding: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  ctaBtnInner: { flex: 1, gap: 6 },
  ctaIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  ctaBtnTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#fff" },
  ctaBtnSub: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)" },
});
