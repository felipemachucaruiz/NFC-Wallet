import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import i18n, { setStoredLanguage, SUPPORTED_LANGUAGES } from "@/i18n";
import { useAuth } from "@/contexts/AuthContext";
import Colors from "@/constants/colors";
import { Card } from "@/components/ui/Card";

export function ProfileSettings() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const isWeb = Platform.OS === "web";

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogoutConfirm = async () => {
    setLoggingOut(true);
    await logout();
    router.replace("/login");
  };

  const changeLang = async (code: string) => {
    await i18n.changeLanguage(code);
    await setStoredLanguage(code);
  };

  const roleLabels: Record<string, string> = {
    attendee: t("admin.roles.attendee"),
    bank: t("admin.roles.bank"),
    merchant_staff: t("admin.roles.merchant_staff"),
    merchant_admin: t("admin.roles.merchant_admin"),
    warehouse_admin: t("admin.roles.warehouse_admin"),
    event_admin: t("admin.roles.event_admin"),
    admin: t("admin.roles.admin"),
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.background }}
      contentContainerStyle={{
        paddingTop: isWeb ? 24 : insets.top + 8,
        paddingBottom: isWeb ? 34 : insets.bottom + 16,
        paddingHorizontal: 20,
        gap: 20,
      }}
    >
      <Pressable
        onPress={() => router.back()}
        style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.5 : 1 }]}
        hitSlop={12}
      >
        <Feather name="arrow-left" size={22} color={C.text} />
      </Pressable>

      <Text style={[styles.pageTitle, { color: C.text }]}>
        {t("common.settings")}
      </Text>

      <Card>
        <View style={styles.userRow}>
          <View style={[styles.avatar, { backgroundColor: C.primaryLight }]}>
            <Feather name="user" size={24} color={C.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.userName, { color: C.text }]}>
              {user?.firstName} {user?.lastName}
            </Text>
            <Text style={[styles.userEmail, { color: C.textSecondary }]}>
              {user?.email}
            </Text>
            <Text style={[styles.userRole, { color: C.primary }]}>
              {user?.role ? (roleLabels[user.role] ?? user.role) : ""}
            </Text>
          </View>
        </View>

        {(user?.merchantName || user?.eventName) ? (
          <View style={[styles.contextRow, { borderTopColor: C.separator }]}>
            {user.merchantName ? (
              <View style={styles.contextItem}>
                <Feather name="shopping-bag" size={13} color={C.textMuted} />
                <Text style={[styles.contextLabel, { color: C.textMuted }]}>
                  {t("common.merchant")}
                </Text>
                <Text style={[styles.contextValue, { color: C.textSecondary }]} numberOfLines={1}>
                  {user.merchantName}
                </Text>
              </View>
            ) : null}
            {user.eventName ? (
              <View style={styles.contextItem}>
                <Feather name="calendar" size={13} color={C.textMuted} />
                <Text style={[styles.contextLabel, { color: C.textMuted }]}>
                  {t("common.event")}
                </Text>
                <Text style={[styles.contextValue, { color: C.textSecondary }]} numberOfLines={1}>
                  {user.eventName}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </Card>

      {user?.role !== "event_admin" && (
        <View>
          <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>
            {t("common.tools")}
          </Text>
          <Card padding={8} style={{ marginTop: 8 }}>
            <Pressable
              onPress={() => router.push("/check-balance")}
              style={({ pressed }) => [
                styles.langRow,
                { backgroundColor: pressed ? C.inputBg : "transparent" },
              ]}
            >
              <Feather name="wifi" size={16} color={C.textSecondary} style={{ marginRight: 6 }} />
              <Text style={[styles.langLabel, { color: C.text, flex: 1 }]}>
                {t("checkBalance.title")}
              </Text>
              <Feather name="chevron-right" size={18} color={C.textMuted} />
            </Pressable>
          </Card>
        </View>
      )}

      <View>
        <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>
          {t("common.language")}
        </Text>
        <Card padding={8} style={{ marginTop: 8 }}>
          {SUPPORTED_LANGUAGES.map((lang, idx) => {
            const isActive = i18n.language === lang.code;
            return (
              <Pressable
                key={lang.code}
                onPress={() => changeLang(lang.code)}
                style={({ pressed }) => [
                  styles.langRow,
                  {
                    borderTopWidth: idx > 0 ? 1 : 0,
                    borderTopColor: C.separator,
                    backgroundColor: pressed ? C.inputBg : "transparent",
                  },
                ]}
              >
                <Text style={[styles.langLabel, { color: C.text }]}>
                  {lang.label}
                </Text>
                {isActive ? (
                  <Feather name="check" size={18} color={C.primary} />
                ) : null}
              </Pressable>
            );
          })}
        </Card>
      </View>

      {!showLogoutConfirm ? (
        <Pressable
          onPress={() => setShowLogoutConfirm(true)}
          style={({ pressed }) => [
            styles.logoutBtn,
            { backgroundColor: C.dangerLight, borderColor: C.danger, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Feather name="log-out" size={18} color={C.danger} />
          <Text style={[styles.logoutText, { color: C.danger }]}>
            {t("auth.logout")}
          </Text>
        </Pressable>
      ) : (
        <View style={[styles.logoutConfirm, { backgroundColor: C.dangerLight, borderColor: C.danger }]}>
          <Text style={[styles.logoutConfirmText, { color: C.danger }]}>
            {t("auth.logoutConfirm")}
          </Text>
          <View style={styles.logoutConfirmBtns}>
            <Pressable
              onPress={() => setShowLogoutConfirm(false)}
              style={[styles.logoutCancelBtn, { backgroundColor: C.card, borderColor: C.border }]}
            >
              <Text style={[styles.logoutCancelText, { color: C.textSecondary }]}>
                {t("common.cancel")}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleLogoutConfirm}
              disabled={loggingOut}
              style={[styles.logoutConfirmBtn, { backgroundColor: C.danger, opacity: loggingOut ? 0.6 : 1 }]}
            >
              <Feather name="log-out" size={15} color="#fff" />
              <Text style={styles.logoutConfirmBtnText}>
                {loggingOut ? "..." : t("auth.logout")}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  backBtn: { alignSelf: "flex-start", padding: 4 },
  pageTitle: { fontSize: 28, fontFamily: "Inter_700Bold" },
  userRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  userName: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  userEmail: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  userRole: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginTop: 4 },
  contextRow: {
    borderTopWidth: 1,
    marginTop: 14,
    paddingTop: 14,
    gap: 10,
  },
  contextItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  contextLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    width: 70,
  },
  contextValue: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  langRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  langLabel: { fontSize: 16, fontFamily: "Inter_500Medium" },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 4,
  },
  logoutText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  logoutConfirm: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 14,
    marginTop: 4,
  },
  logoutConfirmText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  logoutConfirmBtns: {
    flexDirection: "row",
    gap: 10,
  },
  logoutCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
  },
  logoutCancelText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  logoutConfirmBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
  },
  logoutConfirmBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});
