import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Platform, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { CopAmount } from "@/components/CopAmount";
import { Empty } from "@/components/ui/Empty";
import { Loading } from "@/components/ui/Loading";
import { formatDateTime } from "@/utils/format";
import { useMyTransactions, useMyBracelets } from "@/hooks/useAttendeeApi";

type TxItem = {
  id: string;
  type: "purchase" | "top_up";
  braceletUid: string;
  amountCop: number;
  newBalanceCop: number;
  merchantName: string | null;
  locationName: string | null;
  lineItems: Array<{ name: string; quantity: number; unitPriceCop: number }>;
  createdAt: string;
};

type BraceletSummary = { uid: string; balanceCop: number };

export default function AttendeeHistoryScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const [pages, setPages] = useState<TxItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);

  const { data: initialData, isLoading, refetch, isRefetching } = useMyTransactions();
  const { data: braceletData } = useMyBracelets();

  const bracelets = (braceletData as { bracelets?: BraceletSummary[] } | undefined)?.bracelets ?? [];
  const totalBalance = bracelets.reduce((sum, b) => sum + b.balanceCop, 0);

  const initialTxData = initialData as { transactions?: TxItem[]; nextCursor?: string | null } | undefined;
  const initialTransactions = initialTxData?.transactions ?? [];
  const initialNextCursor = initialTxData?.nextCursor;

  const allTransactions = pages.length > 0 ? pages : initialTransactions;
  const cursor = pages.length > 0 ? nextCursor : initialNextCursor;

  const { data: nextPageData, refetch: fetchNextPage } = useMyTransactions(cursor ?? undefined);

  const handleLoadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await fetchNextPage();
      const nextData = result.data as { transactions?: TxItem[]; nextCursor?: string | null } | undefined;
      if (nextData?.transactions) {
        setPages((prev) => {
          const base = prev.length > 0 ? prev : initialTransactions;
          return [...base, ...nextData.transactions!];
        });
        setNextCursor(nextData.nextCursor ?? null);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, fetchNextPage, initialTransactions]);

  const handleRefresh = useCallback(async () => {
    setPages([]);
    setNextCursor(undefined);
    await refetch();
  }, [refetch]);

  if (isLoading) return <Loading label={t("common.loading")} />;

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <FlatList
        data={allTransactions}
        keyExtractor={(item) => item.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          padding: 16,
          paddingTop: isWeb ? 67 : insets.top + 8,
          paddingBottom: isWeb ? 34 : insets.bottom + 100,
          gap: 10,
        }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} tintColor={C.primary} />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.2}
        ListHeaderComponent={() => (
          <View style={styles.header}>
            <Text style={[styles.pageTitle, { color: C.text }]}>{t("attendee.historyTitle")}</Text>
            {totalBalance > 0 && (
              <View style={[styles.balancePill, { backgroundColor: C.primaryLight }]}>
                <Text style={[styles.balancePillText, { color: C.primary }]}>
                  {t("attendee.balance")}: <CopAmount amount={totalBalance} size={14} color={C.primary} />
                </Text>
              </View>
            )}
          </View>
        )}
        ListEmptyComponent={() => (
          <Empty icon="clock" title={t("attendee.noTransactions")} />
        )}
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.loadingMore}>
              <ActivityIndicator color={C.primary} />
            </View>
          ) : cursor === null && allTransactions.length > 0 ? (
            <Text style={[styles.endText, { color: C.textMuted }]}>{t("common.endOfList")}</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <TxCard tx={item} C={C} t={t} />
        )}
      />
    </View>
  );
}

function TxCard({
  tx,
  C,
  t,
}: {
  tx: TxItem;
  C: typeof Colors.light;
  t: (k: string) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const isTopUp = tx.type === "top_up";

  return (
    <TouchableOpacity onPress={() => setExpanded((v) => !v)} activeOpacity={0.85}>
      <View style={[styles.txCard, { backgroundColor: C.card, borderColor: C.border }]}>
        <View style={styles.txRow}>
          <View style={[styles.txIcon, { backgroundColor: isTopUp ? C.successLight : C.primaryLight }]}>
            <Feather
              name={isTopUp ? "plus-circle" : "shopping-bag"}
              size={18}
              color={isTopUp ? C.success : C.primary}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.txType, { color: C.text }]}>
              {isTopUp
                ? t("attendee.topUp")
                : `${t("attendee.purchase")}${tx.merchantName ? ` ${t("attendee.at")} ${tx.merchantName}` : ""}`}
            </Text>
            {tx.locationName && (
              <Text style={[styles.txLocation, { color: C.textMuted }]}>{tx.locationName}</Text>
            )}
            <Text style={[styles.txDate, { color: C.textMuted }]}>{formatDateTime(tx.createdAt)}</Text>
          </View>
          <CopAmount amount={tx.amountCop} positive={isTopUp} />
        </View>
        {expanded && tx.lineItems && tx.lineItems.length > 0 && (
          <View style={[styles.lineItems, { borderTopColor: C.separator }]}>
            {tx.lineItems.map((li, idx) => (
              <View key={idx} style={styles.lineItemRow}>
                <Text style={[styles.lineItemName, { color: C.textSecondary }]}>
                  {li.quantity}× {li.name}
                </Text>
                <Text style={[styles.lineItemPrice, { color: C.textSecondary }]}>
                  ${(li.unitPriceCop * li.quantity).toLocaleString("es-CO")}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { gap: 10, marginBottom: 8 },
  pageTitle: { fontSize: 24, fontFamily: "Inter_700Bold" },
  balancePill: { alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100 },
  balancePillText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  txCard: { borderRadius: 14, borderWidth: 1, padding: 14 },
  txRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  txIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  txType: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  txLocation: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  txDate: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  lineItems: { borderTopWidth: 1, marginTop: 12, paddingTop: 10, gap: 6 },
  lineItemRow: { flexDirection: "row", justifyContent: "space-between" },
  lineItemName: { fontSize: 13, fontFamily: "Inter_400Regular" },
  lineItemPrice: { fontSize: 13, fontFamily: "Inter_500Medium" },
  loadingMore: { paddingVertical: 16, alignItems: "center" },
  endText: { textAlign: "center", fontSize: 12, fontFamily: "Inter_400Regular", paddingVertical: 16 },
});
