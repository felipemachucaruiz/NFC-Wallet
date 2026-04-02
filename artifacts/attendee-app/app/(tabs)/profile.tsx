import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/contexts/AuthContext";
import { useMyRefundRequests } from "@/hooks/useAttendeeApi";
import { setStoredLanguage } from "@/i18n";
import i18n from "@/i18n";
import { formatDate } from "@/utils/format";

type RefundRequest = {
  id: string;
  braceletUid: string;
  refundMethod: string;
  status: "pending" | "approved" | "rejected";
  chipZeroed?: boolean;
  createdAt: string;
};

export default function ProfileScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user, logout } = useAuth();

  const { data: refundsData } = useMyRefundRequests();
  const refunds = ((refundsData as { refundRequests?: RefundRequest[] } | undefined)?.refundRequests ?? []);

  const [currentLang, setCurrentLang] = useState(i18n.language);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLanguage = async (lang: string) => {
    await setStoredLanguage(lang);
    await i18n.changeLanguage(lang);
    setCurrentLang(lang);
  };

  const handleLogoutConfirm = async () => {
    setLoggingOut(true);
    await logout();
    router.replace("/login");
  };

  const statusVariant = (r: RefundRequest): "success" | "warning" | "danger" | "muted" => {
    if (r.status === "approved" && r.chipZeroed) return "success";
    if (r.status === "approved") return "muted";
    if (r.status === "rejected") return "danger";
    return "warning";
  };

  const statusLabel = (r: RefundRequest) => {
    if (r.status === "approved" && r.chipZeroed) return t("profile.refundComplete");
    if (r.status === "approved") return t("profile.refundProcessing");
    if (r.status === "rejected") return t("common.rejected");
    return t("common.pending");
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.background }}
      contentContainerStyle={{
        paddingTop: isWeb ? 67 : insets.top + 16,
        paddingBottom: isWeb ? 34 : insets.bottom + 100,
        paddingHorizontal: 20,
        gap: 20,
      }}
    >
      <Text style={[styles.pageTitle, { color: C.text }]}>{t("profile.title")}</Text>

      <Card>
        <View style={styles.avatarRow}>
          <View style={[styles.avatar, { backgroundColor: C.primaryLight }]}>
            <Feather name="user" size={28} color={C.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.userName, { color: C.text }]}>
              {[user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Asistente"}
            </Text>
            <Text style={[styles.userEmail, { color: C.textSecondary }]}>
              {user?.email ?? ""}
            </Text>
          </View>
        </View>
      </Card>

      <View>
        <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>
          {t("profile.language")}
        </Text>
        <View style={styles.langRow}>
          {[
            { code: "es", label: t("profile.spanish") },
            { code: "en", label: t("profile.english") },
          ].map((lang) => (
            <Pressable
              key={lang.code}
              onPress={() => handleLanguage(lang.code)}
              style={[
                styles.langBtn,
                {
                  backgroundColor: currentLang === lang.code ? C.primaryLight : C.card,
                  borderColor: currentLang === lang.code ? C.primary : C.border,
                },
              ]}
            >
              <Text style={[styles.langText, { color: currentLang === lang.code ? C.primary : C.textSecondary }]}>
                {lang.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View>
        <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>
          {t("profile.myRefunds")}
        </Text>
        {refunds.length === 0 ? (
          <View style={[styles.emptyRefunds, { backgroundColor: C.card, borderColor: C.border }]}>
            <Feather name="inbox" size={24} color={C.textMuted} />
            <Text style={[styles.emptyRefundText, { color: C.textMuted }]}>
              {t("profile.noRefunds")}
            </Text>
          </View>
        ) : (
          refunds.map((r) => (
            <Card key={r.id} style={{ marginBottom: 8 }}>
              <View style={styles.refundRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.refundUid, { color: C.text }]}>{r.braceletUid}</Text>
                  <Text style={[styles.refundDate, { color: C.textMuted }]}>
                    {formatDate(r.createdAt)} · {r.refundMethod}
                  </Text>
                </View>
                <Badge
                  label={statusLabel(r)}
                  variant={statusVariant(r)}
                />
              </View>
            </Card>
          ))
        )}
      </View>

      {!showLogoutConfirm ? (
        <Pressable
          onPress={() => setShowLogoutConfirm(true)}
          style={[styles.logoutBtn, { backgroundColor: C.dangerLight, borderColor: C.danger }]}
        >
          <Feather name="log-out" size={18} color={C.danger} />
          <Text style={[styles.logoutText, { color: C.danger }]}>{t("profile.logout")}</Text>
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
                {loggingOut ? "..." : t("common.logout")}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pageTitle: { fontSize: 24, fontFamily: "Inter_700Bold" },
  avatarRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  userName: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  userEmail: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  langRow: { flexDirection: "row", gap: 10 },
  langBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1.5,
  },
  langText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  emptyRefunds: {
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
  },
  emptyRefundText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  refundRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  refundUid: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  refundDate: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  logoutText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  logoutConfirm: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 14,
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
