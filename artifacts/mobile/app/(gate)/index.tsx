import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { useZoneCache } from "@/contexts/ZoneCacheContext";

export default function GateHomeScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();
  const { getZoneById } = useZoneCache();
  const assignedZone = user?.gateZoneId ? getZoneById(user.gateZoneId) : null;

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
        {assignedZone ? (
          <View style={[styles.zoneBadge, { backgroundColor: assignedZone.colorHex + "22", borderColor: assignedZone.colorHex }]}>
            <View style={[styles.zoneDot, { backgroundColor: assignedZone.colorHex }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.zoneBadgeLabel, { color: assignedZone.colorHex }]}>{t("gate.yourZone")}</Text>
              <Text style={[styles.zoneBadgeName, { color: assignedZone.colorHex }]}>{assignedZone.name}</Text>
            </View>
          </View>
        ) : (
          <View style={[styles.zoneBadge, { backgroundColor: C.warningLight, borderColor: C.warning }]}>
            <Feather name="alert-triangle" size={18} color={C.warning} />
            <Text style={[styles.zoneWarning, { color: C.warning }]}>{t("gate.noZoneWarning")}</Text>
          </View>
        )}

        <Pressable
          style={[styles.ctaBtn, { backgroundColor: "#16a34a" }]}
          onPress={() => router.push("/(gate)/checkin" as never)}
        >
          <View style={styles.ctaBtnInner}>
            <View style={[styles.ctaIconWrap, { backgroundColor: "rgba(0,0,0,0.12)" }]}>
              <Feather name="log-in" size={36} color="#fff" />
            </View>
            <Text style={[styles.ctaBtnTitle, { color: "#fff" }]}>{t("gate.entranceCheckin")}</Text>
            <Text style={[styles.ctaBtnSub, { color: "rgba(255,255,255,0.75)" }]}>{t("gate.entranceCheckinHint")}</Text>
          </View>
          <Feather name="arrow-right" size={22} color="rgba(255,255,255,0.7)" />
        </Pressable>

        <Pressable
          style={[styles.ctaBtn, { backgroundColor: C.primary }]}
          onPress={() => router.push("/register" as never)}
        >
          <View style={styles.ctaBtnInner}>
            <View style={[styles.ctaIconWrap, { backgroundColor: "rgba(0,0,0,0.12)" }]}>
              <Feather name="wifi" size={36} color={C.primaryText} />
            </View>
            <Text style={[styles.ctaBtnTitle, { color: C.primaryText }]}>{t("gate.registerBracelet")}</Text>
            <Text style={[styles.ctaBtnSub, { color: C.primaryText + "99" }]}>{t("gate.registerBraceletHint")}</Text>
          </View>
          <Feather name="arrow-right" size={22} color={C.primaryText + "B3"} />
        </Pressable>

        <Pressable
          style={[styles.securityBtn, { backgroundColor: C.card, borderColor: C.border }]}
          onPress={() => router.push("/(gate)/security-check" as never)}
        >
          <View style={[styles.securityIconWrap, { backgroundColor: C.warningLight }]}>
            <Feather name="check-square" size={24} color={C.warning} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.securityBtnTitle, { color: C.text }]}>{t("gate.securityCheck")}</Text>
            <Text style={[styles.securityBtnSub, { color: C.textSecondary }]}>{t("gate.securityCheckHint")}</Text>
          </View>
          <Feather name="arrow-right" size={18} color={C.textMuted} />
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
    paddingTop: 24,
    gap: 16,
    alignItems: "stretch",
  },
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
  ctaBtnTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  ctaBtnSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  zoneBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
  },
  zoneDot: { width: 16, height: 16, borderRadius: 8 },
  zoneBadgeLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8 },
  zoneBadgeName: { fontSize: 18, fontFamily: "Inter_700Bold", marginTop: 2 },
  zoneWarning: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  securityBtn: {
    borderRadius: 16,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
  },
  securityIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  securityBtnTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  securityBtnSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
});
