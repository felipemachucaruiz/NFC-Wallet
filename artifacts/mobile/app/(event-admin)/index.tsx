import { Feather } from "@expo/vector-icons";
import React from "react";
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
import { useGetRevenueReport } from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { CopAmount } from "@/components/CopAmount";
import { Card } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { useAuth } from "@/contexts/AuthContext";

export default function EventAdminDashboard() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();

  const { data: revenueData, isLoading } = useGetRevenueReport(
    user?.eventId ? { eventId: user.eventId } : {},
  );

  const revenue = revenueData as {
    totalTopUpsCop?: number;
    totalSalesCop?: number;
    totalCogsCop?: number;
    grossProfitCop?: number;
    totalCommissionsCop?: number;
    netOwedToMerchantsCop?: number;
    platformRevenueCop?: number;
    transactionCount?: number;
    topUpCount?: number;
    braceletCount?: number;
  } | undefined;

  const kpiCards = [
    { label: t("admin.totalSales"), value: revenue?.totalSalesCop, icon: "shopping-bag" as const, color: C.success },
    { label: t("admin.grossProfit"), value: revenue?.grossProfitCop, icon: "dollar-sign" as const, color: C.success },
    { label: t("admin.totalCommissions"), value: revenue?.totalCommissionsCop, icon: "percent" as const, color: C.warning },
    { label: t("admin.netOwedToMerchants"), value: revenue?.netOwedToMerchantsCop, icon: "credit-card" as const, color: C.textSecondary },
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
      <Text style={[styles.title, { color: C.text }]}>{t("eventAdmin.dashboard")}</Text>

      {user?.eventId ? (
        <Card style={[styles.eventBadge, { backgroundColor: C.primaryLight }]} padding={12}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Feather name="calendar" size={16} color={C.primary} />
            <Text style={[styles.eventBadgeText, { color: C.primary }]}>{t("eventAdmin.yourEvent")}</Text>
          </View>
        </Card>
      ) : null}

      {isLoading ? <Loading label={t("common.loading")} /> : (
        <>
          <Card style={[styles.mainCard, { backgroundColor: C.primary }]} padding={24}>
            <View style={styles.mainRow}>
              <View>
                <Text style={styles.mainLabel}>{t("admin.totalSales")}</Text>
                <CopAmount amount={revenue?.totalSalesCop} size={38} color="#fff" />
              </View>
              <View style={[styles.mainIconBox, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
                <Feather name="trending-up" size={28} color="#fff" />
              </View>
            </View>
            <View style={styles.statsRow}>
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
  eventBadge: { borderRadius: 12 },
  eventBadgeText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  mainCard: { borderRadius: 20 },
  mainRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  mainLabel: { color: "rgba(255,255,255,0.8)", fontFamily: "Inter_500Medium", fontSize: 13, marginBottom: 4 },
  mainIconBox: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  statsRow: { flexDirection: "row", gap: 16, marginTop: 16 },
  statPill: { flex: 1, alignItems: "center" },
  statValue: { color: "#fff", fontSize: 20, fontFamily: "Inter_700Bold" },
  statLabel: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontFamily: "Inter_400Regular" },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  kpiIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  kpiLabel: { fontSize: 11, fontFamily: "Inter_500Medium", marginBottom: 4 },
});
