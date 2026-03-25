import { Feather } from "@expo/vector-icons";
import React, { useState, useEffect } from "react";
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
import {
  useGetRevenueReport,
  useGetTopUpReport,
  useGetInventoryReport,
  useListMerchants,
  useListLocations,
} from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { CopAmount } from "@/components/CopAmount";
import { Card } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { useAuth } from "@/contexts/AuthContext";

type ReportTab = "revenue" | "topups" | "inventory" | "billing";

type BillingRow = {
  eventId: string;
  eventName: string;
  platformCommissionRate: number;
  totalSalesCop: number;
  platformCommissionEarnedCop: number;
};

const getApiBase = (): string => `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

export default function ReportsScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { token } = useAuth();

  const [activeTab, setActiveTab] = useState<ReportTab>("revenue");
  const [billing, setBilling] = useState<BillingRow[]>([]);
  const [billingLoading, setBillingLoading] = useState(false);
  const [selectedMerchantId, setSelectedMerchantId] = useState<string | undefined>(undefined);
  const [selectedLocationId, setSelectedLocationId] = useState<string | undefined>(undefined);

  const { data: merchantsData } = useListMerchants({});
  const merchants = (merchantsData as { merchants?: Array<{ id: string; name: string }> } | undefined)?.merchants ?? [];

  const { data: locationsData } = useListLocations(
    selectedMerchantId ? { merchantId: selectedMerchantId } : {},
    { query: { enabled: !!selectedMerchantId } }
  );
  const locations = (locationsData as { locations?: Array<{ id: string; name: string; active: boolean }> } | undefined)?.locations?.filter((l) => l.active) ?? [];

  const revenueParams = {
    ...(selectedMerchantId ? { merchantId: selectedMerchantId } : {}),
    ...(selectedLocationId ? { locationId: selectedLocationId } : {}),
  };

  const inventoryParams = {
    ...(selectedLocationId ? { locationId: selectedLocationId } : {}),
  };

  const { data: revenueData, isLoading: revLoading } = useGetRevenueReport(revenueParams);
  const { data: topUpData, isLoading: topUpLoading } = useGetTopUpReport({});
  const { data: inventoryData, isLoading: invLoading } = useGetInventoryReport(inventoryParams);

  const revenue = revenueData as {
    totals?: {
      grossSalesCop?: number;
      cogsCop?: number;
      grossProfitCop?: number;
      commissionCop?: number;
      netCop?: number;
      transactionCount?: number;
    };
    totalTopUpsCop?: number;
  } | undefined;

  const topUps = topUpData as Record<string, number | string | Array<Record<string, unknown>> | undefined> | undefined;
  const inventory = inventoryData as {
    items?: Array<{
      locationId: string;
      locationName: string;
      productId: string;
      productName: string;
      quantityOnHand: number;
      restockTrigger: number;
      isLowStock: boolean;
    }>;
  } | undefined;

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
    { key: "revenue", label: t("admin.revenueReport"), icon: "trending-up" },
    { key: "topups", label: t("admin.topUpReport"), icon: "plus-circle" },
    { key: "inventory", label: t("admin.inventoryReport"), icon: "package" },
    { key: "billing", label: t("admin.billing"), icon: "dollar-sign" },
  ];

  const isLoading = revLoading || topUpLoading || invLoading;

  const showLocationFilter = activeTab === "revenue" || activeTab === "inventory";

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

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 2, paddingHorizontal: 20 }}>
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
      </ScrollView>

      {showLocationFilter && (
        <View style={{ gap: 12 }}>
          <Text style={[styles.filterLabel, { color: C.textSecondary }]}>{t("admin.filterByMerchant")}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -4 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 4 }}>
            <Pressable
              onPress={() => { setSelectedMerchantId(undefined); setSelectedLocationId(undefined); }}
              style={[styles.chip, { backgroundColor: !selectedMerchantId ? C.primary : C.inputBg, borderColor: !selectedMerchantId ? C.primary : C.border }]}
            >
              <Text style={[styles.chipText, { color: !selectedMerchantId ? "#fff" : C.textSecondary }]}>
                {t("admin.allMerchants")}
              </Text>
            </Pressable>
            {merchants.map((m) => (
              <Pressable
                key={m.id}
                onPress={() => { setSelectedMerchantId(m.id); setSelectedLocationId(undefined); }}
                style={[styles.chip, { backgroundColor: selectedMerchantId === m.id ? C.primary : C.inputBg, borderColor: selectedMerchantId === m.id ? C.primary : C.border }]}
              >
                <Text style={[styles.chipText, { color: selectedMerchantId === m.id ? "#fff" : C.textSecondary }]}>
                  {m.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {selectedMerchantId && locations.length > 0 && (
            <>
              <Text style={[styles.filterLabel, { color: C.textSecondary }]}>{t("admin.filterByLocation")}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -4 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 4 }}>
                <Pressable
                  onPress={() => setSelectedLocationId(undefined)}
                  style={[styles.chip, { backgroundColor: !selectedLocationId ? C.primary : C.inputBg, borderColor: !selectedLocationId ? C.primary : C.border }]}
                >
                  <Text style={[styles.chipText, { color: !selectedLocationId ? "#fff" : C.textSecondary }]}>
                    {t("admin.allLocations")}
                  </Text>
                </Pressable>
                {locations.map((loc) => (
                  <Pressable
                    key={loc.id}
                    onPress={() => setSelectedLocationId(loc.id)}
                    style={[styles.chip, { backgroundColor: selectedLocationId === loc.id ? C.primary : C.inputBg, borderColor: selectedLocationId === loc.id ? C.primary : C.border }]}
                  >
                    <Text style={[styles.chipText, { color: selectedLocationId === loc.id ? "#fff" : C.textSecondary }]}>
                      {loc.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          )}
        </View>
      )}

      {isLoading && activeTab !== "billing" ? <Loading label={t("common.loading")} /> : (
        <>
          {activeTab === "revenue" && (
            <View style={{ gap: 12 }}>
              {[
                { label: t("admin.totalSales"), value: revenue?.totals?.grossSalesCop, positive: true },
                { label: t("admin.totalCogs"), value: revenue?.totals?.cogsCop, positive: false },
                { label: t("admin.grossProfit"), value: revenue?.totals?.grossProfitCop, positive: true },
                { label: t("admin.totalCommissions"), value: revenue?.totals?.commissionCop, positive: false },
                { label: t("admin.netOwedToMerchants"), value: revenue?.totals?.netCop, positive: false },
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
              {inventory?.items && inventory.items.length > 0 ? (
                <>
                  <View style={{ gap: 2 }}>
                    <Card padding={16}>
                      <View style={styles.reportRow}>
                        <Text style={[styles.reportLabel, { color: C.textSecondary }]}>{t("admin.totalUnitsInStock")}</Text>
                        <Text style={[styles.countValue, { color: C.text }]}>
                          {inventory.items.reduce((s, i) => s + i.quantityOnHand, 0)}
                        </Text>
                      </View>
                    </Card>
                    <Card padding={16}>
                      <View style={styles.reportRow}>
                        <Text style={[styles.reportLabel, { color: C.textSecondary }]}>{t("admin.lowStockCount")}</Text>
                        <Text style={[styles.countValue, { color: C.text }]}>
                          {inventory.items.filter((i) => i.isLowStock).length}
                        </Text>
                      </View>
                    </Card>
                  </View>

                  <Text style={[styles.filterLabel, { color: C.textSecondary }]}>{t("admin.byLocation")}</Text>
                  {Object.entries(
                    inventory.items.reduce((acc, item) => {
                      if (!acc[item.locationId]) {
                        acc[item.locationId] = { name: item.locationName, items: [] };
                      }
                      acc[item.locationId].items.push(item);
                      return acc;
                    }, {} as Record<string, { name: string; items: typeof inventory.items }>)
                  ).map(([locId, locGroup]) => (
                    <Card key={locId} padding={14}>
                      <Text style={[styles.locationGroupTitle, { color: C.text }]}>{locGroup.name}</Text>
                      {locGroup.items.map((item) => (
                        <View key={item.productId} style={[styles.invDetailRow, { borderTopColor: C.border }]}>
                          <Text style={[styles.invProduct, { color: C.text, flex: 1 }]}>{item.productName}</Text>
                          <Text style={[styles.invQty, { color: item.isLowStock ? C.danger : C.text }]}>
                            {item.quantityOnHand} u.
                          </Text>
                          {item.isLowStock && (
                            <Feather name="alert-triangle" size={12} color={C.danger} />
                          )}
                        </View>
                      ))}
                    </Card>
                  ))}
                </>
              ) : (
                <Card padding={16}>
                  <Text style={[styles.reportLabel, { color: C.textSecondary, textAlign: "center" }]}>{t("admin.noInventoryData")}</Text>
                </Card>
              )}
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
                      <CopAmount amount={row.totalSalesCop} size={16} />
                    </View>
                    <View style={styles.reportRow}>
                      <Text style={[styles.reportLabel, { color: C.textSecondary }]}>{t("eventAdmin.platformCommission")}</Text>
                      <Text style={[styles.commissionRate, { color: C.warning }]}>{row.platformCommissionRate}%</Text>
                    </View>
                    <View style={[styles.reportRow, styles.billingTotal, { borderTopColor: C.border }]}>
                      <Text style={[styles.reportLabel, { color: C.text, fontFamily: "Inter_600SemiBold" }]}>{t("admin.platformCommissionEarned")}</Text>
                      <CopAmount amount={row.platformCommissionEarnedCop} size={18} color={C.primary} />
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
