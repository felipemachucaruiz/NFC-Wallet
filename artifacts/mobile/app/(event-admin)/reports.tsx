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
import {
  useGetRevenueReport,
  useGetTopUpReport,
  useGetInventoryReport,
  useGetUnclaimedBalances,
} from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { CopAmount } from "@/components/CopAmount";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { useAuth } from "@/contexts/AuthContext";

type ReportTab = "revenue" | "topups" | "inventory" | "unclaimed";
type UnclaimedFilter = "all" | "pending" | "refunded";

interface RefundRecord {
  id: string;
  braceletUid: string;
  eventId: string;
  amountCop: number;
  refundMethod: string;
  notes?: string | null;
  performedByUserId: string;
  createdAt: string;
}

interface UnclaimedBracelet {
  id: string;
  nfcUid: string;
  eventId?: string | null;
  attendeeName?: string | null;
  phone?: string | null;
  email?: string | null;
  lastKnownBalanceCop: number;
  lastCounter: number;
  flagged: boolean;
  createdAt: string;
  latestRefund: RefundRecord | null;
}

export default function EventAdminReportsScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<ReportTab>("revenue");
  const [unclaimedFilter, setUnclaimedFilter] = useState<UnclaimedFilter>("all");

  const eventId = user?.eventId ?? undefined;

  const { data: revenueData, isLoading: revLoading } = useGetRevenueReport(eventId ? { eventId } : {});
  const { data: topUpData, isLoading: topUpLoading } = useGetTopUpReport({});
  const { data: inventoryData, isLoading: invLoading } = useGetInventoryReport(eventId ? { eventId } : {});
  const { data: unclaimedData, isLoading: unclaimedLoading } = useGetUnclaimedBalances(
    eventId ?? "",
    { query: { enabled: !!eventId && activeTab === "unclaimed" } },
  );

  const revenue = revenueData as Record<string, number | undefined> | undefined;
  const topUps = topUpData as Record<string, number | string | Array<Record<string, unknown>> | undefined> | undefined;
  const inventory = inventoryData as Record<string, number | Array<Record<string, unknown>> | undefined> | undefined;

  const unclaimedBracelets = (
    (unclaimedData as { bracelets?: UnclaimedBracelet[] } | undefined)?.bracelets ?? []
  ).filter((b) => {
    if (unclaimedFilter === "pending") return !b.latestRefund;
    if (unclaimedFilter === "refunded") return !!b.latestRefund;
    return true;
  });

  const tabs: { key: ReportTab; label: string; icon: React.ComponentProps<typeof Feather>["name"] }[] = [
    { key: "revenue", label: t("admin.revenueReport"), icon: "trending-up" },
    { key: "topups", label: t("admin.topUpReport"), icon: "plus-circle" },
    { key: "inventory", label: t("admin.inventoryReport"), icon: "package" },
    { key: "unclaimed", label: t("eventAdmin.unclaimed"), icon: "rotate-ccw" },
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
      <Text style={[styles.title, { color: C.text }]}>{t("eventAdmin.reports")}</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll}>
        <View style={[styles.tabRow, { backgroundColor: C.inputBg }]}>
          {tabs.map((tab) => (
            <Pressable
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={[
                styles.tabBtn,
                activeTab === tab.key && {
                  backgroundColor: C.card,
                  borderRadius: 10,
                  shadowColor: "#000",
                  shadowOpacity: 0.06,
                  shadowRadius: 4,
                  elevation: 2,
                },
              ]}
            >
              <Feather name={tab.icon} size={16} color={activeTab === tab.key ? C.primary : C.textMuted} />
              <Text style={[styles.tabLabel, { color: activeTab === tab.key ? C.primary : C.textMuted }]}>
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {activeTab !== "unclaimed" && isLoading ? (
        <Loading label={t("common.loading")} />
      ) : (
        <>
          {activeTab === "revenue" && (
            <View style={{ gap: 12 }}>
              {[
                { label: t("admin.totalTopUps"), value: revenue?.totalTopUpsCop, positive: true },
                { label: t("admin.totalSales"), value: revenue?.totalSalesCop, positive: true },
                { label: t("admin.totalCogs"), value: revenue?.totalCogsCop, positive: false },
                { label: t("admin.grossProfit"), value: revenue?.grossProfitCop, positive: true },
                { label: t("admin.totalCommissions"), value: revenue?.totalCommissionsCop, positive: false },
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

          {activeTab === "unclaimed" && (
            <View style={{ gap: 12 }}>
              <View>
                <Text style={[styles.unclaimedSubtitle, { color: C.textSecondary }]}>
                  {t("eventAdmin.unclaimedSubtitle")}
                </Text>
              </View>

              <View style={[styles.filterRow, { backgroundColor: C.inputBg }]}>
                {(["all", "pending", "refunded"] as UnclaimedFilter[]).map((f) => (
                  <Pressable
                    key={f}
                    onPress={() => setUnclaimedFilter(f)}
                    style={[
                      styles.filterBtn,
                      unclaimedFilter === f && { backgroundColor: C.card, borderRadius: 8 },
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterLabel,
                        { color: unclaimedFilter === f ? C.primary : C.textMuted },
                      ]}
                    >
                      {f === "all"
                        ? t("eventAdmin.filterAll")
                        : f === "pending"
                          ? t("eventAdmin.filterPending")
                          : t("eventAdmin.filterRefunded")}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {unclaimedLoading ? (
                <Loading label={t("common.loading")} />
              ) : unclaimedBracelets.length === 0 ? (
                <Card padding={24}>
                  <Text style={[styles.emptyText, { color: C.textMuted }]}>
                    {t("eventAdmin.noUnclaimed")}
                  </Text>
                </Card>
              ) : (
                unclaimedBracelets.map((b) => (
                  <Card key={b.id} padding={16}>
                    <View style={styles.unclaimedCard}>
                      <View style={styles.unclaimedTop}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.braceletUid, { color: C.text }]} numberOfLines={1}>
                            {b.nfcUid}
                          </Text>
                          {b.attendeeName ? (
                            <Text style={[styles.contactLine, { color: C.textSecondary }]}>
                              {b.attendeeName}
                            </Text>
                          ) : null}
                        </View>
                        <View style={styles.rightCol}>
                          <CopAmount amount={b.lastKnownBalanceCop} size={16} />
                          {b.latestRefund ? (
                            <Badge label={t("eventAdmin.refundIssued")} variant="success" />
                          ) : (
                            <Badge label={t("eventAdmin.pendingRefund")} variant="warning" />
                          )}
                        </View>
                      </View>
                      {(b.phone || b.email) && (
                        <View style={[styles.contactDetails, { borderTopColor: C.separator }]}>
                          {b.phone ? (
                            <View style={styles.contactRow}>
                              <Feather name="phone" size={12} color={C.textMuted} />
                              <Text style={[styles.contactText, { color: C.textSecondary }]}>{b.phone}</Text>
                            </View>
                          ) : null}
                          {b.email ? (
                            <View style={styles.contactRow}>
                              <Feather name="mail" size={12} color={C.textMuted} />
                              <Text style={[styles.contactText, { color: C.textSecondary }]}>{b.email}</Text>
                            </View>
                          ) : null}
                        </View>
                      )}
                    </View>
                  </Card>
                ))
              )}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  tabScroll: { flexGrow: 0 },
  tabRow: { flexDirection: "row", borderRadius: 12, padding: 4, gap: 2 },
  tabBtn: { alignItems: "center", paddingVertical: 10, paddingHorizontal: 10, gap: 4, minWidth: 70 },
  tabLabel: { fontSize: 11, fontFamily: "Inter_500Medium", textAlign: "center" },
  reportRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  reportLabel: { fontSize: 14, fontFamily: "Inter_500Medium", flex: 1 },
  countValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
  unclaimedSubtitle: { fontSize: 13, fontFamily: "Inter_400Regular" },
  filterRow: { flexDirection: "row", borderRadius: 10, padding: 3, gap: 2 },
  filterBtn: { flex: 1, alignItems: "center", paddingVertical: 8, paddingHorizontal: 4 },
  filterLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  unclaimedCard: { gap: 10 },
  unclaimedTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  braceletUid: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  contactLine: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  rightCol: { alignItems: "flex-end", gap: 6 },
  contactDetails: { borderTopWidth: 1, paddingTop: 8, gap: 4 },
  contactRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  contactText: { fontSize: 12, fontFamily: "Inter_400Regular" },
});
