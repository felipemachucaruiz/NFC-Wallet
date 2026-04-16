import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useGetRevenueReport, useListEvents } from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { CopAmount } from "@/components/CopAmount";
import { Card } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";

export default function AdminDashboardScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const [selectedEventId, setSelectedEventId] = useState<string | undefined>(undefined);

  const { data: eventsData } = useListEvents();
  const events = (eventsData as { events?: Array<{ id: string; name: string; status: string }> } | undefined)?.events ?? [];

  const { data: revenueData, isLoading, isError, refetch } = useGetRevenueReport(
    selectedEventId ? { eventId: selectedEventId } : {},
  );

  const revenue = revenueData as {
    totalTopUps?: number;
    totalSales?: number;
    totalCogs?: number;
    grossProfit?: number;
    totalCommissions?: number;
    netOwedToMerchants?: number;
    platformRevenue?: number;
    transactionCount?: number;
    topUpCount?: number;
    braceletCount?: number;
  } | undefined;

  const kpiCards = [
    { label: t("admin.totalTopUps"), value: revenue?.totalTopUps, icon: "trending-up" as const, color: C.primary },
    { label: t("admin.totalSales"), value: revenue?.totalSales, icon: "shopping-bag" as const, color: C.success },
    { label: t("admin.grossProfit"), value: revenue?.grossProfit, icon: "dollar-sign" as const, color: C.success },
    { label: t("admin.totalCommissions"), value: revenue?.totalCommissions, icon: "percent" as const, color: C.warning },
    { label: t("admin.platformRevenue"), value: revenue?.platformRevenue, icon: "zap" as const, color: C.primary },
    { label: t("admin.netOwedToMerchants"), value: revenue?.netOwedToMerchants, icon: "credit-card" as const, color: C.textSecondary },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.background }}
      contentContainerStyle={{
        paddingTop: isWeb ? 67 : insets.top + 16,
        paddingBottom: isWeb ? 34 : insets.bottom + 80,
        paddingHorizontal: 20,
        gap: 20,
      }}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Text style={[styles.title, { color: C.text }]}>{t("admin.dashboard")}</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}>
        <EventChip label={t("admin.allEvents")} selected={!selectedEventId} onPress={() => setSelectedEventId(undefined)} C={C} />
        {events.map((ev) => (
          <EventChip key={ev.id} label={ev.name} selected={selectedEventId === ev.id} onPress={() => setSelectedEventId(ev.id)} C={C} badge={ev.status} />
        ))}
      </ScrollView>

      {isLoading ? (
        <Loading label={t("common.loading")} />
      ) : isError ? (
        <View style={[styles.errorBox, { backgroundColor: C.card, borderColor: C.danger }]}>
          <Feather name="wifi-off" size={28} color={C.danger} />
          <Text style={[styles.errorTitle, { color: C.text }]}>{t("common.connectionError")}</Text>
          <Text style={[styles.errorMsg, { color: C.textSecondary }]}>{t("common.checkConnection")}</Text>
          <Pressable onPress={() => refetch()} style={[styles.retryBtn, { backgroundColor: C.primary }]}>
            <Text style={styles.retryBtnText}>{t("common.retry")}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Card style={[styles.platformCard, { backgroundColor: C.primary }]} padding={24}>
            <View style={styles.platformRow}>
              <View>
                <Text style={styles.platformLabel}>{t("admin.platformRevenue")}</Text>
                <CopAmount amount={revenue?.platformRevenue} size={38} color="#0a0a0a" />
              </View>
              <View style={[styles.platformIconBox, { backgroundColor: "rgba(0,0,0,0.12)" }]}>
                <Feather name="zap" size={28} color="#0a0a0a" />
              </View>
            </View>
            <View style={styles.platformStats}>
              <StatPill label={t("admin.transactions")} value={String(revenue?.transactionCount ?? 0)} />
              <StatPill label={t("admin.topUps")} value={String(revenue?.topUpCount ?? 0)} />
              <StatPill label={t("admin.bracelets")} value={String(revenue?.braceletCount ?? 0)} />
            </View>
          </Card>

          <View style={styles.kpiGrid}>
            {kpiCards.map((card) => (
              <Card key={card.label} style={{ flex: 1, minWidth: "47%" }} padding={16}>
                <View style={[styles.kpiIcon, { backgroundColor: card.color + "22" }]}>
                  <Feather name={card.icon} size={16} color={card.color} />
                </View>
                <Text style={[styles.kpiLabel, { color: C.textSecondary }]}>{card.label}</Text>
                <CopAmount amount={card.value} size={18} color={card.color} />
              </Card>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

function EventChip({ label, selected, onPress, C, badge }: {
  label: string; selected: boolean; onPress: () => void; C: typeof Colors.light; badge?: string;
}) {
  void badge;
  return (
    <Text
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: selected ? C.primary : C.inputBg, color: selected ? "#0a0a0a" : C.textSecondary, borderColor: selected ? C.primary : C.border },
      ]}
    >
      {label}
    </Text>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statPill}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontFamily: "Inter_700Bold" },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 100, fontFamily: "Inter_500Medium", fontSize: 13, borderWidth: 1 },
  platformCard: { borderRadius: 20 },
  platformRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  platformLabel: { color: "rgba(0,0,0,0.7)", fontFamily: "Inter_500Medium", fontSize: 13, marginBottom: 4 },
  platformIconBox: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  platformStats: { flexDirection: "row", gap: 16, marginTop: 16 },
  statPill: { flex: 1, alignItems: "center" },
  statValue: { color: "#0a0a0a", fontSize: 20, fontFamily: "Inter_700Bold" },
  statLabel: { color: "rgba(0,0,0,0.6)", fontSize: 11, fontFamily: "Inter_400Regular" },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  kpiIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  kpiLabel: { fontSize: 11, fontFamily: "Inter_500Medium", marginBottom: 4 },
  errorBox: { alignItems: "center", gap: 8, padding: 24, borderRadius: 16, borderWidth: 1 },
  errorTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginTop: 4 },
  errorMsg: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  retryBtn: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 100 },
  retryBtnText: { color: "#0a0a0a", fontFamily: "Inter_600SemiBold", fontSize: 14 },
});
