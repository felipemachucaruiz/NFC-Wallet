import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
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

  const handleLogout = () => {
    Alert.alert(t("auth.logoutConfirm"), undefined, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("auth.logout"),
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/login");
        },
      },
    ]);
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
        paddingTop: isWeb ? 67 : insets.top + 16,
        paddingBottom: isWeb ? 34 : insets.bottom + 16,
        paddingHorizontal: 20,
        gap: 20,
      }}
    >
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
      </Card>

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

      <Pressable
        onPress={handleLogout}
        style={({ pressed }) => [
          styles.logoutBtn,
          {
            backgroundColor: C.dangerLight,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <Feather name="log-out" size={18} color={C.danger} />
        <Text style={[styles.logoutText, { color: C.danger }]}>
          {t("auth.logout")}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
    marginTop: 4,
  },
  logoutText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
