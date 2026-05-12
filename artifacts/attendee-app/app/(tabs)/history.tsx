import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { CopAmount } from "@/components/CopAmount";
import { Empty } from "@/components/ui/Empty";
import { ScreenBackground } from "@/components/ui/ScreenBackground";
import { Loading } from "@/components/ui/Loading";
import { Badge } from "@/components/ui/Badge";
import { formatDateTime } from "@/utils/format";
import { useMyTransactions, useMyBracelets } from "@/hooks/useAttendeeApi";

type TxItem = {
  id: string;
  type: "purchase" | "top_up" | "refund" | "transfer";
  braceletUid: string;
  amount: number;
  newBalance: number;
  merchantName: string | null;
  locationName: string | null;
  eventId: string | null;
  eventName: string | null;
  lineItems: Array<{ name: string; quantity: number; unitPrice: number }>;
  createdAt: string;
  refundStatus?: "pending" | "approved" | "rejected" | null;
  refundChipZeroed?: boolean | null;
};

export default function HistoryScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const [pages, setPages] = useState<TxItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const { data: initialData, isLoading, refetch, isRefetching } = useMyTransactions();
  const { data: braceletData } = useMyBracelets();

  const bracelets = ((braceletData as { bracelets?: { uid: string; balance: number }[] } | undefined)?.bracelets ?? []);
  const totalBalance = bracelets.reduce((sum, b) => sum + b.balance, 0);

  const initialTxData = initialData as { transactions?: TxItem[]; nextCursor?: string | null } | undefined;
  const initialTransactions = initialTxData?.transactions ?? [];
  const initialNextCursor = initialTxData?.nextCursor;

  const allTransactions = pages.length > 0 ? pages : initialTransactions;
  const cursor = pages.length > 0 ? nextCursor : initialNextCursor;

  const { refetch: fetchNextPage } = useMyTransactions(cursor ?? undefined);

  const events = useMemo(() => {
    const map = new Map<string, string>();
    for (const tx of allTransactions) {
      if (tx.eventId && tx.eventName && !map.has(tx.eventId)) {
        map.set(tx.eventId, tx.eventName);
      }
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [allTransactions]);

  const filteredTransactions = useMemo(() => {
    if (!selectedEventId) return allTransactions;
    return allTransactions.filter((tx) => tx.eventId === selectedEventId);
  }, [allTransactions, selectedEventId]);

  const handleLoadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await fetchNextPage();
      const nextData = result.data as { transactions?: TxItem[]; nextCursor?: string | null } | undefined;
      if (nextData?.transactions) {
        setPages((prev) => {
          const base = prev.length > 0 ? prev : initialTransactions;
          return [...base, ...(nextData.transactions ?? [])];
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
    setSelectedEventId(null);
    await refetch();
  }, [refetch]);

  if (isLoading) return <Loading label={t("common.loading")} />;

  return (
    <ScreenBackground style={styles.container}>
      <FlatList
        data={filteredTransactions}
        keyExtractor={(item) => item.id}
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
            <Text style={[styles.pageTitle, { color: C.text }]}>{t("history.title")}</Text>
            {totalBalance > 0 && (
              <View style={[styles.balancePill, { backgroundColor: C.primaryLight }]}>
                <Text style={[styles.balancePillText, { color: C.primary }]}>
                  {t("history.balance")}: <CopAmount amount={totalBalance} size={14} color={C.primary} />
                </Text>
              </View>
            )}
            {events.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginTop: 4 }}
                contentContainerStyle={{ gap: 8, paddingRight: 4 }}
              >
                <Pressable
                  onPress={() => setSelectedEventId(null)}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor: selectedEventId === null ? C.primary : C.inputBg,
                      borderColor: selectedEventId === null ? C.primary : C.border,
                    },
                  ]}
                >
                  <Text style={[styles.filterChipText, { color: selectedEventId === null ? "#fff" : C.textSecondary }]}>
                    Todos
                  </Text>
                </Pressable>
                {events.map((ev) => (
                  <Pressable
                    key={ev.id}
                    onPress={() => setSelectedEventId(ev.id === selectedEventId ? null : ev.id)}
                    style={[
                      styles.filterChip,
                      {
                        backgroundColor: selectedEventId === ev.id ? C.primary : C.inputBg,
                        borderColor: selectedEventId === ev.id ? C.primary : C.border,
                      },
                    ]}
                  >
                    <Text style={[styles.filterChipText, { color: selectedEventId === ev.id ? "#fff" : C.textSecondary }]}>
                      {ev.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        )}
        ListEmptyComponent={() => (
          <Empty
            icon="clock"
            title={t("history.noTransactions")}
            subtitle={t("history.noTransactionsSub")}
          />
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
        renderItem={({ item }) => <TxCard tx={item} C={C} t={t} showEvent={!!item.eventName} />}
      />
    </ScreenBackground>
  );
}

function txConfig(tx: TxItem, C: typeof Colors.dark, t: (k: string) => string) {
  switch (tx.type) {
    case "top_up":
      return {
        icon: "plus-circle" as const,
        iconBg: C.successLight,
        iconColor: C.success,
        label: t("history.topUp"),
        positive: true,
      };
    case "refund":
      return {
        icon: "rotate-ccw" as const,
        iconBg: C.warningLight,
        iconColor: C.warning,
        label: t("history.refund"),
        positive: true,
      };
    case "transfer":
      return {
        icon: "shuffle" as const,
        iconBg: C.primaryLight,
        iconColor: C.primary,
        label: t("history.transfer"),
        positive: false,
      };
    default:
      return {
        icon: "shopping-bag" as const,
        iconBg: C.primaryLight,
        iconColor: C.primary,
        label: `${t("history.purchase")}${tx.merchantName ? ` ${t("history.at")} ${tx.merchantName}` : ""}`,
        positive: false,
      };
  }
}

function refundStatusVariant(status?: string | null, chipZeroed?: boolean | null): "warning" | "success" | "danger" | "muted" {
  if (status === "approved" && chipZeroed) return "success";
  if (status === "approved") return "muted";
  if (status === "rejected") return "danger";
  if (status === "pending") return "warning";
  return "muted";
}

function refundStatusLabel(status?: string | null, chipZeroed?: boolean | null, t?: (k: string) => string): string {
  if (!t) return status ?? "";
  if (status === "approved" && chipZeroed) return t("history.refundStatus.paid");
  if (status === "approved") return t("history.refundStatus.approved");
  if (status === "rejected") return t("history.refundStatus.rejected");
  if (status === "pending") return t("history.refundStatus.pending");
  return status ?? "";
}

function TxCard({
  tx,
  C,
  t,
  showEvent,
}: {
  tx: TxItem;
  C: typeof Colors.dark;
  t: (k: string) => string;
  showEvent: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const cfg = txConfig(tx, C, t);

  return (
    <TouchableOpacity onPress={() => setExpanded((v) => !v)} activeOpacity={0.85}>
      <View style={[styles.txCard, { backgroundColor: C.card, borderColor: C.border }]}>
        <View style={styles.txRow}>
          <View style={[styles.txIcon, { backgroundColor: cfg.iconBg }]}>
            <Feather name={cfg.icon} size={18} color={cfg.iconColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.txType, { color: C.text }]}>{cfg.label}</Text>
            {tx.locationName && (
              <Text style={[styles.txLocation, { color: C.textMuted }]}>{tx.locationName}</Text>
            )}
            {showEvent && tx.eventName && (
              <Text style={[styles.txEvent, { color: C.primary }]}>
                <Feather name="calendar" size={10} color={C.primary} /> {tx.eventName}
              </Text>
            )}
            <Text style={[styles.txDate, { color: C.textMuted }]}>{formatDateTime(tx.createdAt)}</Text>
          </View>
          <View style={styles.txRight}>
            <CopAmount amount={tx.amount} positive={cfg.positive} />
            {tx.type === "refund" && tx.refundStatus && (
              <Badge
                label={refundStatusLabel(tx.refundStatus, tx.refundChipZeroed, t)}
                variant={refundStatusVariant(tx.refundStatus, tx.refundChipZeroed)}
              />
            )}
          </View>
        </View>
        {expanded && tx.lineItems && tx.lineItems.length > 0 && (
          <View style={[styles.lineItems, { borderTopColor: C.separator }]}>
            {tx.lineItems.map((li, idx) => (
              <View key={idx} style={styles.lineItemRow}>
                <Text style={[styles.lineItemName, { color: C.textSecondary }]}>
                  {li.quantity}× {li.name}
                </Text>
                <Text style={[styles.lineItemPrice, { color: C.textSecondary }]}>
                  ${(li.unitPrice * li.quantity).toLocaleString("es-CO")}
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
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 100,
    borderWidth: 1,
  },
  filterChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  txCard: { borderRadius: 14, borderWidth: 1, padding: 14 },
  txRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  txIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  txType: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  txLocation: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  txEvent: { fontSize: 11, fontFamily: "Inter_500Medium", marginTop: 2 },
  txDate: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  txRight: { alignItems: "flex-end", gap: 4 },
  lineItems: { borderTopWidth: 1, marginTop: 12, paddingTop: 10, gap: 6 },
  lineItemRow: { flexDirection: "row", justifyContent: "space-between" },
  lineItemName: { fontSize: 13, fontFamily: "Inter_400Regular" },
  lineItemPrice: { fontSize: 13, fontFamily: "Inter_500Medium" },
  loadingMore: { paddingVertical: 16, alignItems: "center" },
  endText: { textAlign: "center", fontSize: 12, fontFamily: "Inter_400Regular", paddingVertical: 16 },
});
