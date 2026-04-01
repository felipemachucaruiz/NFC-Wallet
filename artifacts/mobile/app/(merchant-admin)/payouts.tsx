import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import { FlatList, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useListPayouts, useGetPayoutTransactions, useGetMerchantEarnings, customFetch } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import Colors from "@/constants/colors";
import { CopAmount } from "@/components/CopAmount";
import { Badge } from "@/components/ui/Badge";
import { Empty } from "@/components/ui/Empty";
import { Loading } from "@/components/ui/Loading";
import { Card } from "@/components/ui/Card";
import { formatDate } from "@/utils/format";

interface Payout {
  id: string;
  merchantId: string;
  eventId: string;
  periodFrom: string;
  periodTo: string;
  grossSalesCop: number;
  commissionCop: number;
  netPayoutCop: number;
  paymentMethod: string;
  referenceNote: string | null;
  performedByUserId: string;
  paidAt: string;
  createdAt: string;
}

interface Transaction {
  id: string;
  braceletUid: string;
  grossAmountCop: number;
  commissionAmountCop: number;
  netAmountCop: number;
  createdAt: string;
  offlineCreatedAt?: string | null;
  locationName?: string | null;
}

interface MerchantEarnings {
  grossSalesCop: number;
  cogsCop: number;
  grossProfitCop: number;
  profitMarginPercent: number;
  totalCommissionCop: number;
  netEarnedCop: number;
  totalPaidOutCop: number;
  pendingCop: number;
  totalIvaCop: number;
  totalRetencionesCop: number;
}

function PayoutTransactionsModal({
  payoutId,
  visible,
  onClose,
}: {
  payoutId: string;
  visible: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();

  const { data, isLoading } = useGetPayoutTransactions(payoutId, {
    query: { enabled: visible && !!payoutId },
  });

  const txData = data as { payout?: Payout; transactions?: Transaction[] } | undefined;
  const transactions = txData?.transactions ?? [];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.modalContainer, { backgroundColor: C.background, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
        <View style={[styles.modalHeader, { borderBottomColor: C.separator }]}>
          <Text style={[styles.modalTitle, { color: C.text }]}>{t("merchant_admin.payoutTransactionsTitle")}</Text>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Feather name="x" size={22} color={C.textMuted} />
          </Pressable>
        </View>

        {isLoading ? (
          <Loading label={t("common.loading")} />
        ) : transactions.length === 0 ? (
          <View style={styles.emptyWrapper}>
            <Text style={[styles.emptyText, { color: C.textMuted }]}>{t("merchant_admin.payoutNoTransactions")}</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
            <Card padding={14}>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: C.textSecondary }]}>{t("merchant_admin.transactions")}</Text>
                <Text style={[styles.summaryValue, { color: C.text }]}>{transactions.length}</Text>
              </View>
            </Card>

            {transactions.map((tx) => (
              <View key={tx.id} style={[styles.txCard, { backgroundColor: C.card, borderColor: C.border }]}>
                <View style={styles.txRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.txUid, { color: C.textSecondary }]} numberOfLines={1}>
                      {tx.braceletUid}
                    </Text>
                    <Text style={[styles.txDate, { color: C.textMuted }]}>{formatDate(tx.createdAt)}</Text>
                  </View>
                  <View style={styles.txAmounts}>
                    <CopAmount amount={tx.grossAmountCop} size={15} positive />
                    <Text style={[styles.txComm, { color: C.textMuted }]}>
                      -{tx.commissionAmountCop.toLocaleString("es-CO")}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

export default function MerchantPayoutsScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();
  const [selectedPayoutId, setSelectedPayoutId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useListPayouts(
    { merchantId: user?.merchantId ?? "" },
    { query: { enabled: !!user?.merchantId } }
  );
  const { data: earningsData, refetch: refetchEarnings } = useGetMerchantEarnings(
    user?.merchantId ?? "",
    {},
    { query: { enabled: !!user?.merchantId } }
  );

  const merchantId = user?.merchantId ?? "";
  const { data: txData, isLoading: txLoading, refetch: refetchTx } = useQuery({
    queryKey: ["merchant-transactions", merchantId],
    queryFn: () => customFetch(`/api/merchants/${encodeURIComponent(merchantId)}/transactions?limit=100`) as Promise<{ transactions: Transaction[] }>,
    enabled: !!merchantId,
  });

  const payouts = ((data as { payouts?: Payout[] } | undefined)?.payouts ?? []);
  const earnings = earningsData as MerchantEarnings | undefined;
  const allTransactions = txData?.transactions ?? [];

  if (isLoading) return <Loading label={t("common.loading")} />;

  const totalPaid = payouts.reduce((s, p) => s + p.netPayoutCop, 0);

  return (
    <>
      <FlatList
        data={payouts}
        keyExtractor={(item) => item.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingTop: isWeb ? 67 : insets.top + 16,
          paddingBottom: isWeb ? 34 : insets.bottom + 100,
          paddingHorizontal: 20,
          gap: 12,
        }}
        style={{ backgroundColor: C.background }}
        refreshControl={<RefreshControl refreshing={isLoading || txLoading} onRefresh={() => { refetch(); refetchEarnings(); refetchTx(); }} tintColor={C.primary} />}
        ListHeaderComponent={() => (
          <>
            <Text style={[styles.title, { color: C.text }]}>{t("merchant_admin.payouts")}</Text>

            {earnings && (
              <View style={[styles.earningsCard, { backgroundColor: C.card, borderColor: C.border }]}>
                <Text style={[styles.earningsTitle, { color: C.text }]}>{t("merchant_admin.salesSummary")}</Text>
                <View style={styles.earningsRow}>
                  <Text style={[styles.earningsLabel, { color: C.textSecondary }]}>{t("merchant_admin.totalSalesLabel")}</Text>
                  <CopAmount amount={earnings.grossSalesCop ?? 0} size={15} positive />
                </View>
                <View style={styles.earningsRow}>
                  <Text style={[styles.earningsLabel, { color: C.textSecondary }]}>{t("merchant_admin.cogsLabel")}</Text>
                  <CopAmount amount={earnings.cogsCop ?? 0} size={15} />
                </View>
                <View style={styles.earningsRow}>
                  <Text style={[styles.earningsLabel, { color: C.textSecondary }]}>{t("merchant_admin.grossProfitLabel")}</Text>
                  <CopAmount amount={earnings.grossProfitCop ?? 0} size={15} positive />
                </View>
                {earnings.totalCommissionCop > 0 && (
                  <View style={styles.earningsRow}>
                    <Text style={[styles.earningsLabel, { color: C.textSecondary }]}>{t("merchant_admin.commissionLabel")}</Text>
                    <CopAmount amount={earnings.totalCommissionCop} size={15} />
                  </View>
                )}
                {earnings.profitMarginPercent !== undefined && (
                  <View style={styles.earningsRow}>
                    <Text style={[styles.earningsLabel, { color: C.textSecondary }]}>{t("merchant_admin.profitMargin")}</Text>
                    <Badge
                      label={`${earnings.profitMarginPercent.toFixed(1)}%`}
                      variant={earnings.profitMarginPercent >= 0 ? "success" : "danger"}
                    />
                  </View>
                )}
                {earnings.pendingCop > 0 && (
                  <View style={[styles.earningsRow, styles.pendingRow]}>
                    <Text style={[styles.earningsLabel, { color: C.warning }]}>{t("merchant_admin.pendingLabel")}</Text>
                    <CopAmount amount={earnings.pendingCop} size={15} color={C.warning} />
                  </View>
                )}
              </View>
            )}

            {totalPaid > 0 && (
              <View style={[styles.totalCard, { backgroundColor: C.successLight, borderColor: C.success + "44" }]}>
                <Text style={[styles.totalLabel, { color: C.success }]}>{t("merchant_admin.totalPaid")}</Text>
                <CopAmount amount={totalPaid} size={28} color={C.success} />
              </View>
            )}

            {allTransactions.length > 0 && (
              <View style={{ marginTop: 8 }}>
                <Text style={[styles.sectionTitle, { color: C.text }]}>{t("merchant_admin.recentTransactions")}</Text>
                {allTransactions.slice(0, 30).map((tx) => (
                  <View key={tx.id} style={[styles.txCard, { backgroundColor: C.card, borderColor: C.border, marginBottom: 8 }]}>
                    <View style={styles.txRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.txUid, { color: C.textSecondary }]} numberOfLines={1}>
                          {tx.locationName ? `${tx.locationName} · ` : ""}{tx.braceletUid}
                        </Text>
                        <Text style={[styles.txDate, { color: C.textMuted }]}>{formatDate(tx.offlineCreatedAt ?? tx.createdAt)}</Text>
                      </View>
                      <View style={styles.txAmounts}>
                        <CopAmount amount={tx.grossAmountCop} size={15} positive />
                        {tx.commissionAmountCop > 0 && (
                          <Text style={[styles.txComm, { color: C.textMuted }]}>
                            comisión: -{tx.commissionAmountCop.toLocaleString("es-CO")}
                          </Text>
                        )}
                      </View>
                    </View>
                  </View>
                ))}
                {allTransactions.length > 30 && (
                  <Text style={[styles.txDate, { color: C.textMuted, textAlign: "center", marginBottom: 4 }]}>
                    +{allTransactions.length - 30} {t("common.more")}
                  </Text>
                )}
              </View>
            )}

            <Text style={[styles.sectionTitle, { color: C.text }]}>{t("merchant_admin.payoutsSection")}</Text>
          </>
        )}
        ListEmptyComponent={() => (
          <Empty icon="credit-card" title={t("merchant_admin.noPayout")} />
        )}
        scrollEnabled={!!payouts.length}
        renderItem={({ item }) => (
          <Pressable onPress={() => setSelectedPayoutId(item.id)}>
            <View style={[styles.payoutCard, { backgroundColor: C.card, borderColor: C.border }]}>
              <View style={styles.payoutRow}>
                <View style={[styles.payIcon, { backgroundColor: C.successLight }]}>
                  <Feather name="check-circle" size={18} color={C.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.payMethod, { color: C.text }]}>{item.paymentMethod}</Text>
                  <Text style={[styles.payDate, { color: C.textMuted }]}>{formatDate(item.paidAt)}</Text>
                  {item.referenceNote ? (
                    <Text style={[styles.payRef, { color: C.textSecondary }]} numberOfLines={1}>{item.referenceNote}</Text>
                  ) : null}
                  <Text style={[styles.payPeriod, { color: C.textMuted }]}>
                    {t("merchant_admin.payoutPeriod")}: {formatDate(item.periodFrom)} – {formatDate(item.periodTo)}
                  </Text>
                </View>
                <View style={styles.payRight}>
                  <CopAmount amount={item.netPayoutCop} size={17} positive />
                  <View style={[styles.viewTxBtn, { borderColor: C.primary + "55" }]}>
                    <Text style={[styles.viewTxLabel, { color: C.primary }]}>{t("merchant_admin.viewTransactions")}</Text>
                  </View>
                </View>
              </View>
            </View>
          </Pressable>
        )}
      />

      {selectedPayoutId && (
        <PayoutTransactionsModal
          payoutId={selectedPayoutId}
          visible={!!selectedPayoutId}
          onClose={() => setSelectedPayoutId(null)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontFamily: "Inter_700Bold", marginBottom: 4 },
  totalCard: { borderWidth: 1, borderRadius: 16, padding: 20, alignItems: "center", gap: 4, marginBottom: 4 },
  totalLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  earningsCard: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 8, marginBottom: 8 },
  earningsTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  earningsRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  earningsLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  pendingRow: { marginTop: 4, paddingTop: 4 },
  sectionTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", marginTop: 8, marginBottom: 6 },
  payoutCard: { borderWidth: 1, borderRadius: 14, padding: 14 },
  payoutRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  payIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  payMethod: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  payDate: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  payRef: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  payPeriod: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 3 },
  payRight: { alignItems: "flex-end", gap: 6 },
  viewTxBtn: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  viewTxLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  closeBtn: { padding: 4 },
  emptyWrapper: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  summaryLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  summaryValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
  txCard: { borderWidth: 1, borderRadius: 12, padding: 12 },
  txRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  txUid: { fontSize: 12, fontFamily: "Inter_500Medium" },
  txDate: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  txAmounts: { alignItems: "flex-end", gap: 2 },
  txComm: { fontSize: 11, fontFamily: "Inter_400Regular" },
});
