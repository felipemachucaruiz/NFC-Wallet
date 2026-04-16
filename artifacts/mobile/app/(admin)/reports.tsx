import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import React, { useState, useEffect } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import {
  useGetRevenueReport,
  useGetTopUpReport,
} from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { API_BASE_URL } from "@/constants/domain";
import { CopAmount } from "@/components/CopAmount";
import { Card } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { useAuth } from "@/contexts/AuthContext";

type ReportTab = "billing" | "revenue" | "topups";

type BillingRow = {
  eventId: string;
  eventName: string;
  platformCommissionRate: number;
  totalSales: number;
  platformCommissionEarned: number;
};

const getApiBase = (): string => API_BASE_URL;

export default function ReportsScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { token } = useAuth();

  const [activeTab, setActiveTab] = useState<ReportTab>("billing");
  const [billing, setBilling] = useState<BillingRow[]>([]);
  const [billingLoading, setBillingLoading] = useState(false);

  const { data: revenueData, isLoading: revLoading } = useGetRevenueReport({});
  const { data: topUpData, isLoading: topUpLoading } = useGetTopUpReport({});

  const revenue = revenueData as {
    totals?: {
      grossSales?: number;
      totalTips?: number;
      cogs?: number;
      grossProfit?: number;
      commission?: number;
      net?: number;
      transactionCount?: number;
    };
    totalTopUps?: number;
  } | undefined;

  const topUps = topUpData as Record<string, number | string | Array<Record<string, unknown>> | undefined> | undefined;

  useEffect(() => {
    if (activeTab === "billing" && token) {
      setBillingLoading(true);
      fetch(`${getApiBase()}/api/reports/billing`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((data: { billing: BillingRow[] }) => { setBilling(data.billing ?? []); })
        .catch(() => {})
        .finally(() => setBillingLoading(false));
    }
  }, [activeTab, token]);

  const tabs: { key: ReportTab; label: string; icon: React.ComponentProps<typeof Feather>["name"] }[] = [
    { key: "billing", label: t("admin.billing"), icon: "dollar-sign" },
    { key: "revenue", label: t("admin.revenueReport"), icon: "trending-up" },
    { key: "topups", label: t("admin.topUpReport"), icon: "plus-circle" },
  ];

  const isLoading = revLoading || topUpLoading;

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
      <Text style={[styles.title, { color: C.text }]}>{t("admin.billing")}</Text>

      <View style={[styles.tabRow, { backgroundColor: C.inputBg }]}>
        {tabs.map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={[styles.tabBtn, activeTab === tab.key && { backgroundColor: C.card, borderRadius: 10, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 }]}
          >
            <Feather name={tab.icon} size={16} color={activeTab === tab.key ? C.primary : C.textMuted} />
            <Text style={[styles.tabLabel, { color: activeTab === tab.key ? C.primary : C.textMuted }]}>{tab.label}</Text>
          </Pressable>
        ))}
      </View>

      {isLoading && activeTab !== "billing" ? <Loading label={t("common.loading")} /> : (
        <>
          {activeTab === "revenue" && (
            <View style={{ gap: 12 }}>
              {[
                { label: t("admin.totalSales"), value: revenue?.totals?.grossSales, positive: true },
                { label: t("admin.totalTips"), value: revenue?.totals?.totalTips, positive: true },
                { label: t("admin.totalCogs"), value: revenue?.totals?.cogs, positive: false },
                { label: t("admin.grossProfit"), value: revenue?.totals?.grossProfit, positive: true },
                { label: t("admin.totalCommissions"), value: revenue?.totals?.commission, positive: false },
                { label: t("admin.netOwedToMerchants"), value: revenue?.totals?.net, positive: false },
              ].map((row) => (
                <Card key={row.label} padding={16}>
                  <View style={styles.reportRow}>
                    <Text style={[styles.reportLabel, { color: C.textSecondary }]}>{row.label}</Text>
                    <CopAmount amount={row.value as number | undefined} size={18} positive={row.positive} />
                  </View>
                </Card>
              ))}
            </View>
          )}

          {activeTab === "topups" && (
            <View style={{ gap: 12 }}>
              {[
                { label: t("admin.totalTopUpAmount"), value: topUps?.totalAmount as number | undefined },
                { label: t("admin.topUpCount"), value: topUps?.totalCount as number | undefined, isCurrency: false },
                { label: t("admin.averageTopUp"), value: topUps?.averageAmount as number | undefined },
                { label: t("admin.uniqueBracelets"), value: topUps?.uniqueBraceletsCount as number | undefined, isCurrency: false },
              ].map((row) => (
                <Card key={row.label} padding={16}>
                  <View style={styles.reportRow}>
                    <Text style={[styles.reportLabel, { color: C.textSecondary }]}>{row.label}</Text>
                    {row.isCurrency === false ? (
                      <Text style={[styles.countValue, { color: C.text }]}>{row.value ?? "—"}</Text>
                    ) : (
                      <CopAmount amount={row.value} size={18} />
                    )}
                  </View>
                </Card>
              ))}
            </View>
          )}

          {activeTab === "billing" && (
            billingLoading ? <Loading label={t("common.loading")} /> : (
              <View style={{ gap: 12 }}>
                <Text style={[styles.billingHint, { color: C.textSecondary }]}>{t("admin.billingHint")}</Text>
                {billing.length === 0 ? (
                  <Card padding={16}>
                    <Text style={{ color: C.textMuted, textAlign: "center", fontFamily: "Inter_400Regular" }}>{t("admin.noEvents")}</Text>
                  </Card>
                ) : billing.map((row) => (
                  <Card key={row.eventId} padding={16}>
                    <Text style={[styles.eventBillingName, { color: C.text }]}>{row.eventName}</Text>
                    <View style={styles.reportRow}>
                      <Text style={[styles.reportLabel, { color: C.textSecondary }]}>{t("admin.totalSales")}</Text>
                      <CopAmount amount={row.totalSales} size={16} />
                    </View>
                    <View style={styles.reportRow}>
                      <Text style={[styles.reportLabel, { color: C.textSecondary }]}>{t("eventAdmin.platformCommission")}</Text>
                      <Text style={[styles.commissionRate, { color: C.warning }]}>{row.platformCommissionRate}%</Text>
                    </View>
                    <View style={[styles.reportRow, styles.billingTotal, { borderTopColor: C.border }]}>
                      <Text style={[styles.reportLabel, { color: C.text, fontFamily: "Inter_600SemiBold" }]}>{t("admin.platformCommissionEarned")}</Text>
                      <CopAmount amount={row.platformCommissionEarned} size={18} color={C.primary} />
                    </View>
                  </Card>
                ))}
              </View>
            )
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  tabRow: { flexDirection: "row", borderRadius: 12, padding: 4, gap: 2 },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 10, paddingHorizontal: 8, gap: 4, minWidth: 70 },
  tabLabel: { fontSize: 10, fontFamily: "Inter_500Medium", textAlign: "center" },
  reportRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  reportLabel: { fontSize: 14, fontFamily: "Inter_500Medium", flex: 1 },
  countValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
  billingHint: { fontSize: 12, fontFamily: "Inter_400Regular" },
  eventBillingName: { fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 8 },
  commissionRate: { fontSize: 16, fontFamily: "Inter_700Bold" },
  billingTotal: { marginTop: 12, paddingTop: 12, borderTopWidth: 1 },
  filterLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100, borderWidth: 1 },
  chipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  locationGroupTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 8 },
  invDetailRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 8, marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  invProduct: { fontSize: 13, fontFamily: "Inter_400Regular" },
  invQty: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
