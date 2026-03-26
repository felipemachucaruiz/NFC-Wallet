import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useGetMerchantEarnings, useListEvents } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import Colors from "@/constants/colors";
import { CopAmount } from "@/components/CopAmount";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { formatPercent } from "@/utils/format";

export default function MerchantEarningsScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();

  const [selectedEventId, setSelectedEventId] = useState<string | undefined>(undefined);

  const { data: eventsData } = useListEvents();
  const events = (eventsData as { events?: Array<{ id: string; name: string }> } | undefined)?.events ?? [];

  const { data: earningsData, isLoading } = useGetMerchantEarnings(
    user?.merchantId ?? "",
    selectedEventId ? { eventId: selectedEventId } : {},
    { query: { enabled: !!user?.merchantId } }
  );

  const earnings = earningsData as {
    grossSalesCop?: number;
    cogsCop?: number;
    grossProfitCop?: number;
    profitMarginPercent?: number;
    commissionRatePercent?: number;
    totalCommissionCop?: number;
    netEarnedCop?: number;
    pendingCop?: number;
    totalIvaCop?: number;
    totalRetencionFuenteCop?: number;
    totalRetencionICACop?: number;
    totalRetencionesCop?: number;
    totalNetoCop?: number;
  } | undefined;

  const metrics = [
    { label: t("merchant_admin.grossSales"), value: earnings?.grossSalesCop, icon: "trending-up" as const, color: C.primary },
    { label: t("merchant_admin.cogs"), value: earnings?.cogsCop, icon: "package" as const, color: C.textSecondary },
    { label: t("merchant_admin.grossProfit"), value: earnings?.grossProfitCop, icon: "dollar-sign" as const, color: C.success },
    { label: t("merchant_admin.commissionAmount"), value: earnings?.totalCommissionCop, icon: "percent" as const, color: C.warning },
    { label: t("merchant_admin.netOwed"), value: earnings?.pendingCop, icon: "credit-card" as const, color: C.primary, big: true },
  ];

  const fiscalMetrics = [
    { label: t("merchant_admin.totalIva"), value: earnings?.totalIvaCop },
    { label: t("merchant_admin.retencionFuente"), value: earnings?.totalRetencionFuenteCop },
    { label: t("merchant_admin.retencionICA"), value: earnings?.totalRetencionICACop },
    { label: t("merchant_admin.totalRetenciones"), value: earnings?.totalRetencionesCop },
    { label: t("merchant_admin.totalNeto"), value: earnings?.totalNetoCop },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.background }}
      contentContainerStyle={{
        paddingTop: isWeb ? 67 : insets.top + 16,
        paddingBottom: isWeb ? 34 : insets.bottom + 100,
        paddingHorizontal: 20,
        gap: 20,
      }}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Text style={[styles.title, { color: C.text }]}>{t("merchant_admin.earnings")}</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}>
        <EventFilter
          label={t("merchant_admin.allEvents")}
          selected={!selectedEventId}
          onPress={() => setSelectedEventId(undefined)}
          C={C}
        />
        {events.map((ev) => (
          <EventFilter
            key={ev.id}
            label={ev.name}
            selected={selectedEventId === ev.id}
            onPress={() => setSelectedEventId(ev.id)}
            C={C}
          />
        ))}
      </ScrollView>

      {isLoading ? (
        <Loading label={t("common.loading")} />
      ) : (
        <>
          <View style={[styles.netOwedCard, { backgroundColor: C.primary }]}>
            <Text style={styles.netOwedLabel}>{t("merchant_admin.netOwed")}</Text>
            <CopAmount amount={earnings?.pendingCop} size={44} color="#fff" />
            <View style={styles.rateRow}>
              <Text style={styles.rateText}>
                {t("merchant_admin.marginLabel")}: {formatPercent(earnings?.profitMarginPercent)}
              </Text>
            </View>
          </View>

          <View style={styles.metricsGrid}>
            {metrics.slice(0, 4).map((m) => (
              <Card key={m.label} style={{ flex: 1, minWidth: "47%" }}>
                <View style={[styles.metricIcon, { backgroundColor: m.color + "22" }]}>
                  <Feather name={m.icon} size={16} color={m.color} />
                </View>
                <Text style={[styles.metricLabel, { color: C.textSecondary }]}>{m.label}</Text>
                <CopAmount amount={m.value} size={20} color={m.color} />
              </Card>
            ))}
          </View>

          {(earnings?.totalIvaCop !== undefined || earnings?.totalRetencionesCop !== undefined) && (
            <View style={[styles.fiscalCard, { backgroundColor: C.card, borderColor: C.border }]}>
              <View style={styles.fiscalHeader}>
                <Feather name="file-text" size={16} color={C.primary} />
                <Text style={[styles.fiscalTitle, { color: C.text }]}>{t("merchant_admin.fiscalBreakdown")}</Text>
              </View>
              {fiscalMetrics.map((m) => (
                <View key={m.label} style={styles.fiscalRow}>
                  <Text style={[styles.fiscalLabel, { color: C.textSecondary }]}>{m.label}</Text>
                  <CopAmount amount={m.value} size={14} color={C.text} />
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

function EventFilter({ label, selected, onPress, C }: { label: string; selected: boolean; onPress: () => void; C: typeof Colors.light }) {
  return (
    <Text
      onPress={onPress}
      style={[
        styles.filterChip,
        {
          backgroundColor: selected ? C.primary : C.inputBg,
          color: selected ? "#fff" : C.textSecondary,
          borderColor: selected ? C.primary : C.border,
        },
      ]}
    >
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 100,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    borderWidth: 1,
  },
  netOwedCard: {
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    gap: 8,
    shadowColor: "#1A56DB",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  netOwedLabel: { color: "rgba(255,255,255,0.8)", fontFamily: "Inter_500Medium", fontSize: 14 },
  rateRow: { flexDirection: "row", gap: 16 },
  rateText: { color: "rgba(255,255,255,0.7)", fontFamily: "Inter_400Regular", fontSize: 13 },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metricIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  metricLabel: { fontSize: 12, fontFamily: "Inter_500Medium", marginBottom: 4 },
  fiscalCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 10 },
  fiscalHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  fiscalTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  fiscalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  fiscalLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
});
