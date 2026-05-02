import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import {
  useGetRevenueReport,
  useGetTopUpReport,
  useGetInventoryReport,
  useGetUnclaimedBalances,
  useGetRefundsReport,
  useGetTipsByStaffReport,
} from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { CopAmount } from "@/components/CopAmount";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { useAuth } from "@/contexts/AuthContext";

type ReportTab = "revenue" | "topups" | "inventory" | "unclaimed" | "refunds" | "tips";
type UnclaimedFilter = "all" | "pending" | "refunded";

interface RefundRecord {
  id: string;
  braceletUid: string;
  eventId: string;
  amount: number;
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
  lastKnownBalance: number;
  lastCounter: number;
  flagged: boolean;
  createdAt: string;
  latestRefund: RefundRecord | null;
}

interface RefundMethodBreakdown {
  total: number;
  count: number;
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
  const { data: topUpData, isLoading: topUpLoading } = useGetTopUpReport(eventId ? { eventId } : {});
  const { data: inventoryData, isLoading: invLoading } = useGetInventoryReport(eventId ? { eventId } : {});
  const { data: unclaimedData, isLoading: unclaimedLoading } = useGetUnclaimedBalances(
    eventId ?? "",
    { query: { enabled: !!eventId && activeTab === "unclaimed" } },
  );
  const { data: refundsData, isLoading: refundsLoading } = useGetRefundsReport(
    eventId ? { eventId } : {},
    { query: { enabled: activeTab === "refunds" } },
  );
  const { data: tipsData, isLoading: tipsLoading } = useGetTipsByStaffReport(
    eventId ? { eventId } : {},
    { query: { enabled: activeTab === "tips" } },
  );

  type RevenueResponse = {
    totalSales?: number;
    totalCogs?: number;
    grossProfit?: number;
    totalCommissions?: number;
    netOwedToMerchants?: number;
    totalTopUps?: number;
    totals?: { totalTips?: number; [key: string]: number | undefined };
  };
  const revenue = revenueData as RevenueResponse | undefined;
  const topUps = topUpData as Record<string, number | string | Array<Record<string, unknown>> | undefined> | undefined;
  const inventory = inventoryData as Record<string, number | Array<Record<string, unknown>> | undefined> | undefined;

  const unclaimedRaw = (unclaimedData as { bracelets?: UnclaimedBracelet[]; totalUnclaimed?: number } | undefined);
  const unclaimedBracelets = (unclaimedRaw?.bracelets ?? []).filter((b) => {
    if (unclaimedFilter === "pending") return !b.latestRefund;
    if (unclaimedFilter === "refunded") return !!b.latestRefund;
    return true;
  });
  const totalUnclaimed = unclaimedRaw?.totalUnclaimed;

  const refunds = refundsData as { totalRefunded?: number; count?: number; byRefundMethod?: Record<string, RefundMethodBreakdown> } | undefined;

  type TipsStaffRow = { userId: string | null; firstName: string | null; lastName: string | null; role: string | null; merchantId: string; merchantName: string | null; totalTips: number; transactionCount: number };
  const tips = tipsData as { totals?: { totalTips?: number; transactionCount?: number }; byStaff?: TipsStaffRow[] } | undefined;

  const tabs: { key: ReportTab; label: string; icon: React.ComponentProps<typeof Feather>["name"] }[] = [
    { key: "revenue", label: t("admin.revenueReport"), icon: "trending-up" },
    { key: "topups", label: t("admin.topUpReport"), icon: "plus-circle" },
    { key: "inventory", label: t("admin.inventoryReport"), icon: "package" },
    { key: "unclaimed", label: t("eventAdmin.unclaimed"), icon: "rotate-ccw" },
    { key: "refunds", label: t("eventAdmin.refundsReport"), icon: "corner-down-left" },
    { key: "tips", label: t("eventAdmin.tipsReport"), icon: "gift" },
  ];

  const isLoading = revLoading || topUpLoading || invLoading;

  const refundMethodLabels: Record<string, string> = {
    cash: t("bank.refundMethodCash"),
    nequi: t("bank.refundMethodNequi"),
    bancolombia: t("bank.refundMethodBancolombia"),
    other: t("bank.refundMethodOther"),
  };

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

      {activeTab !== "unclaimed" && activeTab !== "refunds" && isLoading ? (
        <Loading label={t("common.loading")} />
      ) : (
        <>
          {activeTab === "revenue" && (
            <View style={{ gap: 12 }}>
              {[
                { label: t("admin.totalTopUps"), value: revenue?.totalTopUps, positive: true },
                { label: t("admin.totalSales"), value: revenue?.totalSales, positive: true },
                { label: t("admin.totalTips"), value: revenue?.totals?.totalTips, positive: true },
                { label: t("admin.totalCogs"), value: revenue?.totalCogs, positive: false },
                { label: t("admin.grossProfit"), value: revenue?.grossProfit, positive: true },
                { label: t("admin.totalCommissions"), value: revenue?.totalCommissions, positive: false },
                { label: t("admin.netOwedToMerchants"), value: revenue?.netOwedToMerchants, positive: false },
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

          {activeTab === "inventory" && (
            <View style={{ gap: 12 }}>
              {[
                { label: t("admin.totalUnitsInStock"), value: inventory?.totalUnitsInStock as number | undefined, isCurrency: false },
                { label: t("admin.inventoryValue"), value: inventory?.totalInventoryValue as number | undefined },
                { label: t("admin.lowStockCount"), value: inventory?.lowStockCount as number | undefined, isCurrency: false },
                { label: t("admin.unitsSoldToday"), value: inventory?.unitsSoldToday as number | undefined, isCurrency: false },
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

          {activeTab === "unclaimed" && (
            <View style={{ gap: 12 }}>
              <View>
                <Text style={[styles.unclaimedSubtitle, { color: C.textSecondary }]}>
                  {t("eventAdmin.unclaimedSubtitle")}
                </Text>
              </View>

              {totalUnclaimed !== undefined && (
                <Card padding={16}>
                  <View style={styles.reportRow}>
                    <Text style={[styles.reportLabel, { color: C.textSecondary }]}>{t("eventAdmin.totalUnclaimed")}</Text>
                    <CopAmount amount={totalUnclaimed} size={18} />
                  </View>
                </Card>
              )}

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
                          <CopAmount amount={b.lastKnownBalance} size={16} />
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

          {activeTab === "refunds" && (
            <View style={{ gap: 12 }}>
              <Text style={[styles.unclaimedSubtitle, { color: C.textSecondary }]}>
                {t("eventAdmin.refundsReportTitle")}
              </Text>

              {refundsLoading ? (
                <Loading label={t("common.loading")} />
              ) : (
                <>
                  <Card padding={16}>
                    <View style={styles.reportRow}>
                      <Text style={[styles.reportLabel, { color: C.textSecondary }]}>{t("eventAdmin.totalRefunded")}</Text>
                      <CopAmount amount={refunds?.totalRefunded} size={18} />
                    </View>
                  </Card>

                  <Card padding={16}>
                    <View style={styles.reportRow}>
                      <Text style={[styles.reportLabel, { color: C.textSecondary }]}>{t("eventAdmin.refundCount")}</Text>
                      <Text style={[styles.countValue, { color: C.text }]}>{refunds?.count ?? 0}</Text>
                    </View>
                  </Card>

                  {refunds?.byRefundMethod && Object.keys(refunds.byRefundMethod).length > 0 && (
                    <Card padding={16}>
                      <Text style={[styles.sectionHeader, { color: C.textSecondary, marginBottom: 12 }]}>
                        {t("eventAdmin.byRefundMethod")}
                      </Text>
                      <View style={{ gap: 10 }}>
                        {Object.entries(refunds.byRefundMethod).map(([method, data]) => (
                          <View key={method} style={styles.methodRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.methodName, { color: C.text }]}>
                                {refundMethodLabels[method] ?? method}
                              </Text>
                              <Text style={[styles.methodCount, { color: C.textMuted }]}>
                                {data.count} {t("merchant_admin.transactions")}
                              </Text>
                            </View>
                            <CopAmount amount={data.total} size={16} />
                          </View>
                        ))}
                      </View>
                    </Card>
                  )}

                  {(!refunds || refunds.count === 0) && (
                    <Card padding={24}>
                      <Text style={[styles.emptyText, { color: C.textMuted }]}>
                        {t("eventAdmin.noRefunds")}
                      </Text>
                    </Card>
                  )}
                </>
              )}
            </View>
          )}

          {activeTab === "tips" && (
            <View style={{ gap: 12 }}>
              <Text style={[styles.unclaimedSubtitle, { color: C.textSecondary }]}>
                {t("eventAdmin.tipsReportSubtitle")}
              </Text>

              {tipsLoading ? (
                <Loading label={t("common.loading")} />
              ) : (
                <>
                  <Card padding={16}>
                    <View style={styles.reportRow}>
                      <Text style={[styles.reportLabel, { color: C.textSecondary }]}>{t("eventAdmin.totalTipsGrand")}</Text>
                      <CopAmount amount={tips?.totals?.totalTips} size={18} positive />
                    </View>
                  </Card>

                  {tips?.byStaff && tips.byStaff.length > 0 ? (
                    <Card padding={16}>
                      <Text style={[styles.sectionHeader, { color: C.textSecondary, marginBottom: 12 }]}>
                        {t("eventAdmin.tipsReportTitle")}
                      </Text>
                      <View style={{ gap: 10 }}>
                        {tips.byStaff.map((row, i) => (
                          <View key={i} style={styles.methodRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.methodName, { color: C.text }]}>
                                {[row.firstName, row.lastName].filter(Boolean).join(" ") || row.userId || "—"}
                              </Text>
                              <Text style={[styles.methodCount, { color: C.textMuted }]}>
                                {row.merchantName ?? "—"} · {t("eventAdmin.txCount", { count: row.transactionCount })}
                              </Text>
                            </View>
                            <CopAmount amount={row.totalTips} size={16} positive />
                          </View>
                        ))}
                      </View>
                    </Card>
                  ) : (
                    <Card padding={24}>
                      <Text style={[styles.emptyText, { color: C.textMuted }]}>
                        {t("eventAdmin.noTips")}
                      </Text>
                    </Card>
                  )}
                </>
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
  sectionHeader: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  methodRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  methodName: { fontSize: 14, fontFamily: "Inter_500Medium" },
  methodCount: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
});
