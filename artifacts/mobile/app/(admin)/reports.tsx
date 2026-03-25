import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
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
import { useGetRevenueReport, useGetTopUpReport, useGetInventoryReport } from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { CopAmount } from "@/components/CopAmount";
import { Card } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { formatPercent } from "@/utils/format";

type ReportTab = "revenue" | "topups" | "inventory";

export default function ReportsScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const [activeTab, setActiveTab] = useState<ReportTab>("revenue");

  const { data: revenueData, isLoading: revLoading } = useGetRevenueReport({});
  const { data: topUpData, isLoading: topUpLoading } = useGetTopUpReport({});
  const { data: inventoryData, isLoading: invLoading } = useGetInventoryReport({});

  const revenue = revenueData as Record<string, number | undefined> | undefined;
  const topUps = topUpData as Record<string, number | string | Array<Record<string, unknown>> | undefined> | undefined;
  const inventory = inventoryData as Record<string, number | Array<Record<string, unknown>> | undefined> | undefined;

  const tabs: { key: ReportTab; label: string; icon: React.ComponentProps<typeof Feather>["name"] }[] = [
    { key: "revenue", label: t("admin.revenueReport"), icon: "trending-up" },
    { key: "topups", label: t("admin.topUpReport"), icon: "plus-circle" },
    { key: "inventory", label: t("admin.inventoryReport"), icon: "package" },
  ];

  const isLoading = revLoading || topUpLoading || invLoading;

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
      <Text style={[styles.title, { color: C.text }]}>{t("admin.reports")}</Text>

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

      {isLoading ? <Loading label={t("common.loading")} /> : (
        <>
          {activeTab === "revenue" && (
            <View style={{ gap: 12 }}>
              {[
                { label: t("admin.totalTopUps"), value: revenue?.totalTopUpsCop, positive: true },
                { label: t("admin.totalSales"), value: revenue?.totalSalesCop, positive: true },
                { label: t("admin.totalCogs"), value: revenue?.totalCogsCop, positive: false },
                { label: t("admin.grossProfit"), value: revenue?.grossProfitCop, positive: true },
                { label: t("admin.totalCommissions"), value: revenue?.totalCommissionsCop, positive: false },
                { label: t("admin.platformRevenue"), value: revenue?.platformRevenueCop, positive: true },
                { label: t("admin.netOwedToMerchants"), value: revenue?.netOwedToMerchantsCop, positive: false },
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
                { label: t("admin.totalTopUpAmount"), value: topUps?.totalAmountCop as number | undefined },
                { label: t("admin.topUpCount"), value: topUps?.totalCount as number | undefined, isCOP: false },
                { label: t("admin.averageTopUp"), value: topUps?.averageAmountCop as number | undefined },
                { label: t("admin.uniqueBracelets"), value: topUps?.uniqueBraceletsCount as number | undefined, isCOP: false },
              ].map((row) => (
                <Card key={row.label} padding={16}>
                  <View style={styles.reportRow}>
                    <Text style={[styles.reportLabel, { color: C.textSecondary }]}>{row.label}</Text>
                    {row.isCOP === false ? (
                      <Text style={[styles.countValue, { color: C.text }]}>{row.value ?? "—"}</Text>
                    ) : (
                      <CopAmount amount={row.value} size={18} />
                    )}
                  </View>
                </Card>
              ))}
            </View>
          )}

          {activeTab === "inventory" && (
            <View style={{ gap: 12 }}>
              {[
                { label: t("admin.totalUnitsInStock"), value: inventory?.totalUnitsInStock as number | undefined, isCOP: false },
                { label: t("admin.inventoryValue"), value: inventory?.totalInventoryValueCop as number | undefined },
                { label: t("admin.lowStockCount"), value: inventory?.lowStockCount as number | undefined, isCOP: false },
                { label: t("admin.unitsSoldToday"), value: inventory?.unitsSoldToday as number | undefined, isCOP: false },
              ].map((row) => (
                <Card key={row.label} padding={16}>
                  <View style={styles.reportRow}>
                    <Text style={[styles.reportLabel, { color: C.textSecondary }]}>{row.label}</Text>
                    {row.isCOP === false ? (
                      <Text style={[styles.countValue, { color: C.text }]}>{row.value ?? "—"}</Text>
                    ) : (
                      <CopAmount amount={row.value} size={18} />
                    )}
                  </View>
                </Card>
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  tabRow: { flexDirection: "row", borderRadius: 12, padding: 4, gap: 2 },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 10, paddingHorizontal: 6, gap: 4 },
  tabLabel: { fontSize: 11, fontFamily: "Inter_500Medium", textAlign: "center" },
  reportRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  reportLabel: { fontSize: 14, fontFamily: "Inter_500Medium", flex: 1 },
  countValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
});
