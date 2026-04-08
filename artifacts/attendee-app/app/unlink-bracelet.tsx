import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useUnlinkBracelet } from "@/hooks/useAttendeeApi";
import { extractErrorMessage } from "@/utils/errorMessage";

export default function UnlinkBraceletScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();

  const { uid, balance } = useLocalSearchParams<{ uid: string; balance: string }>();
  const balance = Number(balance ?? "0");

  const { mutateAsync: unlinkBracelet, isPending } = useUnlinkBracelet();
  const [done, setDone] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const formatCop = (amount: number) =>
    new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(amount);

  const handleUnlink = async () => {
    setErrorMsg("");
    try {
      await unlinkBracelet({ uid });
      setDone(true);
      setTimeout(() => {
        router.replace("/(tabs)/home" as never);
      }, 2000);
    } catch (e: unknown) {
      setErrorMsg(extractErrorMessage(e, t("common.unknownError")));
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.background }}
      contentContainerStyle={{
        paddingBottom: insets.bottom + 40,
        paddingTop: insets.top + 16,
        paddingHorizontal: 20,
        gap: 20,
      }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={22} color={C.text} />
        </Pressable>
        <Text style={[styles.title, { color: C.text }]}>{t("unlink.title")}</Text>
        <View style={{ width: 32 }} />
      </View>

      {done ? (
        <Card style={[styles.resultCard, { backgroundColor: C.successLight, borderColor: C.success }]}>
          <Feather name="check-circle" size={52} color={C.success} />
          <Text style={[styles.resultTitle, { color: C.success }]}>{t("unlink.successTitle")}</Text>
          <Text style={[styles.resultSub, { color: C.textSecondary }]}>{t("unlink.successMsg")}</Text>
        </Card>
      ) : (
        <>
          {/* Bracelet info card */}
          <Card style={[styles.infoCard, { borderColor: C.border }]}>
            <View style={[styles.iconWrap, { backgroundColor: C.primaryLight }]}>
              <Feather name="wifi" size={28} color={C.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.uidText, { color: C.textSecondary }]}>
                {t("unlink.wristband")}
              </Text>
              <Text style={[styles.uidValue, { color: C.text }]}>
                {uid.replace(/:/g, "").toUpperCase()}
              </Text>
              {balance > 0 && (
                <View style={[styles.balancePill, { backgroundColor: C.warningLight }]}>
                  <Feather name="dollar-sign" size={12} color={C.warning} />
                  <Text style={[styles.balanceText, { color: C.warning }]}>
                    {formatCop(balance)}
                  </Text>
                </View>
              )}
            </View>
          </Card>

          {/* Balance warning */}
          {balance > 0 && (
            <Card style={[styles.warningCard, { backgroundColor: C.warningLight, borderColor: C.warning }]}>
              <Feather name="alert-triangle" size={18} color={C.warning} />
              <Text style={[styles.warningText, { color: C.warning }]}>
                {t("unlink.balanceWarning", { amount: formatCop(balance) })}
              </Text>
            </Card>
          )}

          {/* Explanation */}
          <Card style={{ borderColor: C.border }}>
            <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>
              {t("unlink.whatHappens")}
            </Text>
            <View style={styles.bulletList}>
              <BulletItem icon="user-x" color={C.textSecondary} text={t("unlink.bullet1")} C={C} />
              <BulletItem icon="gift" color={C.primary} text={t("unlink.bullet2")} C={C} />
              <BulletItem icon="shield" color={C.success} text={t("unlink.bullet3")} C={C} />
            </View>
          </Card>

          {/* Error */}
          {errorMsg ? (
            <Card style={[styles.warningCard, { backgroundColor: C.dangerLight, borderColor: C.danger }]}>
              <Feather name="alert-circle" size={18} color={C.danger} />
              <Text style={[styles.warningText, { color: C.danger }]}>{errorMsg}</Text>
            </Card>
          ) : null}

          {/* Actions */}
          <Button
            title={isPending ? t("unlink.unlinking") : t("unlink.unlinkBtn")}
            onPress={() => void handleUnlink()}
            variant="danger"
            disabled={isPending}
            style={{ marginTop: 4 }}
          />
          <Button
            title={t("common.cancel")}
            onPress={() => router.back()}
            variant="secondary"
            disabled={isPending}
          />
        </>
      )}
    </ScrollView>
  );
}

function BulletItem({
  icon,
  color,
  text,
  C,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  color: string;
  text: string;
  C: typeof Colors.dark;
}) {
  return (
    <View style={styles.bulletRow}>
      <Feather name={icon} size={15} color={color} style={{ marginTop: 1 }} />
      <Text style={[styles.bulletText, { color: C.text }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  backBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  infoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  uidText: { fontSize: 11, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.6 },
  uidValue: { fontSize: 16, fontFamily: "Inter_700Bold", marginTop: 2, letterSpacing: 1 },
  balancePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    marginTop: 6,
  },
  balanceText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  warningCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  warningText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  bulletList: { gap: 12 },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  bulletText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  resultCard: {
    alignItems: "center",
    padding: 36,
    gap: 12,
    borderWidth: 1,
    borderRadius: 20,
  },
  resultTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  resultSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
});
