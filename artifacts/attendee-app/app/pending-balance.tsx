import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CopAmount } from "@/components/CopAmount";
import { usePendingWalletBalance } from "@/hooks/useAttendeeApi";
import { useMyBracelets } from "@/hooks/useAttendeeApi";
import { Loading } from "@/components/ui/Loading";

type BraceletItem = { uid: string; event?: { active: boolean } | null };

export default function PendingBalanceScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const { data: walletData, isPending } = usePendingWalletBalance();
  const { data: braceletData } = useMyBracelets();

  const pendingBalance = (walletData as { pendingWalletBalance?: number } | undefined)?.pendingWalletBalance ?? 0;
  const bracelets = ((braceletData as { bracelets?: BraceletItem[] } | undefined)?.bracelets ?? []);
  const hasActiveBracelet = bracelets.some((b) => b.event?.active);

  if (isPending) return <Loading label={t("common.loading")} />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.background }}
      contentContainerStyle={[styles.container, { paddingTop: isWeb ? 40 : insets.top + 16, paddingBottom: isWeb ? 40 : insets.bottom + 40 }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: "rgba(0,241,255,0.12)" }]}>
          <Feather name="clock" size={36} color={C.primary} />
        </View>
        <Text style={[styles.title, { color: C.text }]}>{t("pendingBalance.title")}</Text>
        <Text style={[styles.subtitle, { color: C.textSecondary }]}>{t("pendingBalance.subtitle")}</Text>
      </View>

      {/* Amount card */}
      <Card style={[styles.amountCard, { borderColor: "rgba(0,241,255,0.28)", backgroundColor: "rgba(0,241,255,0.06)" }]}>
        <Text style={[styles.amountLabel, { color: C.primary }]}>{t("pendingBalance.availableAmount")}</Text>
        <CopAmount amount={pendingBalance} size={44} color={C.text} />
        <View style={[styles.statusBadge, { backgroundColor: "rgba(0,241,255,0.12)" }]}>
          <Feather name="check-circle" size={13} color={C.primary} />
          <Text style={[styles.statusText, { color: C.primary }]}>{t("pendingBalance.paymentConfirmed")}</Text>
        </View>
      </Card>

      {/* Info card */}
      <Card style={styles.infoCard}>
        <View style={styles.infoRow}>
          <View style={[styles.infoIconWrap, { backgroundColor: C.primaryLight }]}>
            <Feather name="info" size={16} color={C.primary} />
          </View>
          <Text style={[styles.infoText, { color: C.textSecondary }]}>
            {hasActiveBracelet ? t("pendingBalance.hintWithBracelet") : t("pendingBalance.hintNoBracelet")}
          </Text>
        </View>

        <View style={[styles.divider, { backgroundColor: C.separator }]} />

        <View style={styles.infoRow}>
          <View style={[styles.infoIconWrap, { backgroundColor: C.primaryLight }]}>
            <Feather name="zap" size={16} color={C.primary} />
          </View>
          <Text style={[styles.infoText, { color: C.textSecondary }]}>
            {t("pendingBalance.autoTransferHint")}
          </Text>
        </View>
      </Card>

      {/* Actions */}
      <View style={styles.actions}>
        <Button
          title={t("pendingBalance.addMore")}
          onPress={() => router.push({ pathname: "/top-up", params: { preload: "true" } })}
          variant="primary"
        />
        <Button
          title={t("common.back")}
          onPress={() => router.back()}
          variant="secondary"
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, gap: 16 },
  header: { alignItems: "center", gap: 12, paddingVertical: 8 },
  iconWrap: { width: 72, height: 72, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  amountCard: { alignItems: "center", gap: 10, padding: 24, borderWidth: 1 },
  amountLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8 },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 100,
    marginTop: 4,
  },
  statusText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  infoCard: { gap: 0, padding: 0, overflow: "hidden" },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 16 },
  infoIconWrap: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 },
  infoText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  divider: { height: 1, marginHorizontal: 16 },
  actions: { gap: 10, marginTop: 8 },
});
