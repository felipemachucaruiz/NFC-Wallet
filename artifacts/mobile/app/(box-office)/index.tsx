import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";

export default function BoxOfficeHomeScreen() {
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
        <View style={styles.logoRow}>
          <View style={[styles.logoIcon, { backgroundColor: C.primaryLight }]}>
            <Feather name="tag" size={22} color={C.primary} />
          </View>
          <View>
            <Text style={[styles.logoTitle, { color: C.text }]}>
              {t("boxOffice.title")}
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

        <Pressable onPress={() => router.push("/settings")} hitSlop={10}>
          <Feather name="settings" size={20} color={C.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.body}>
        <Pressable
          style={[styles.ctaBtn, { backgroundColor: C.primary }]}
          onPress={() => router.push("/(box-office)/sale" as never)}
        >
          <View style={styles.ctaBtnInner}>
            <View style={[styles.ctaIconWrap, { backgroundColor: "rgba(0,0,0,0.12)" }]}>
              <Feather name="shopping-bag" size={36} color={C.primaryText} />
            </View>
            <Text style={[styles.ctaBtnTitle, { color: C.primaryText }]}>
              {t("boxOffice.sellTicket")}
            </Text>
            <Text style={[styles.ctaBtnSub, { color: C.primaryText + "99" }]}>
              {t("boxOffice.sellTicketHint")}
            </Text>
          </View>
          <Feather name="arrow-right" size={22} color={C.primaryText + "B3"} />
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
});
