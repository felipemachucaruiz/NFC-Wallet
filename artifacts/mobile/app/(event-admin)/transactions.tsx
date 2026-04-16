import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import { FlatList, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useListEventTransactions } from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { CopAmount } from "@/components/CopAmount";
import { Card } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { useAuth } from "@/contexts/AuthContext";

type TransactionLineItemSummary = {
  id: string;
  productId?: string | null;
  productName?: string | null;
  unitPrice: number;
  quantity: number;
  ivaAmount: number;
};

type EventTransaction = {
  id: string;
  idempotencyKey?: string;
  braceletUid: string;
  locationId: string;
  locationName?: string | null;
  merchantId: string;
  merchantName?: string | null;
  eventId: string;
  grossAmount: number;
  tipAmount?: number | null;
  commissionAmount: number;
  netAmount: number;
  newBalance: number;
  counter: number;
  itemCount: number;
  items: TransactionLineItemSummary[];
  performedByUserId?: string | null;
  offlineCreatedAt?: string | null;
  syncedAt?: string | null;
  createdAt: string;
};

export default function TransactionsScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const eventId = user?.eventId ?? "";

  const { data, isLoading, isFetching } = useListEventTransactions(
    eventId,
    { page, limit: 50, search: debouncedSearch || undefined },
    { query: { enabled: !!eventId } }
  );

  const transactions = (data?.transactions ?? []) as EventTransaction[];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 50));

  const handleSearchChange = (text: string) => {
    setSearch(text);
    setPage(1);
    setDebouncedSearch(text.trim());
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString("es-CO", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Bogota",
    });
  };

  const renderTransaction = ({ item }: { item: EventTransaction }) => (
    <Card style={styles.card} padding={14}>
      <View style={styles.cardRow}>
        <View style={styles.cardLeft}>
          <Text style={[styles.merchantName, { color: C.text }]} numberOfLines={1}>
            {item.merchantName ?? t("transactions.unknownMerchant")}
          </Text>
          {item.locationName ? (
            <View style={styles.locationRow}>
              <Feather name="map-pin" size={11} color={C.textMuted} />
              <Text style={[styles.locationName, { color: C.textSecondary }]} numberOfLines={1}>
                {item.locationName}
              </Text>
            </View>
          ) : null}
          <View style={styles.metaRow}>
            <Feather name="credit-card" size={11} color={C.textMuted} />
            <Text style={[styles.meta, { color: C.textMuted }]} numberOfLines={1}>
              {item.braceletUid}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Feather name="clock" size={11} color={C.textMuted} />
            <Text style={[styles.meta, { color: C.textMuted }]}>
              {formatDate(item.createdAt)}
            </Text>
            {item.offlineCreatedAt && !item.syncedAt && (
              <Text style={[styles.offlineBadge, { color: C.warning, borderColor: C.warning }]}>
                {t("transactions.offline")}
              </Text>
            )}
          </View>
        </View>
        <View style={styles.cardRight}>
          <CopAmount amount={item.grossAmount + (item.tipAmount ?? 0)} size={16} />
          {item.itemCount > 0 ? (
            <Text style={[styles.itemCount, { color: C.textMuted }]}>
              {item.itemCount} {t("transactions.items")}
            </Text>
          ) : null}
        </View>
      </View>
      {(item.items.length > 0 || (item.tipAmount ?? 0) > 0) && (
        <View style={[styles.itemsList, { borderTopColor: C.separator }]}>
          {item.items.map((li) => (
            <View key={li.id} style={styles.lineItem}>
              <Text style={[styles.lineItemName, { color: C.textSecondary }]} numberOfLines={1}>
                {li.productName ?? t("transactions.unknownProduct")}
                {li.quantity > 1 ? ` ×${li.quantity}` : ""}
              </Text>
              <CopAmount amount={li.unitPrice * li.quantity} size={12} />
            </View>
          ))}
          {(item.tipAmount ?? 0) > 0 && (
            <View style={styles.lineItem}>
              <Text style={[styles.lineItemName, { color: C.textSecondary }]}>{t("pos.tipLabel")}</Text>
              <CopAmount amount={item.tipAmount ?? 0} size={12} />
            </View>
          )}
        </View>
      )}
    </Card>
  );

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: isWeb ? 67 : insets.top + 16,
            paddingHorizontal: 20,
            backgroundColor: C.background,
          },
        ]}
      >
        <Text style={[styles.title, { color: C.text }]}>{t("transactions.title")}</Text>
        <Text style={[styles.subtitle, { color: C.textMuted }]}>
          {total > 0 ? `${total} ${t("transactions.total")}` : ""}
        </Text>

        <View style={[styles.searchRow, { backgroundColor: C.inputBg, borderColor: C.border }]}>
          <Feather name="search" size={16} color={C.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: C.text }]}
            placeholder={t("transactions.searchPlaceholder")}
            placeholderTextColor={C.textMuted}
            value={search}
            onChangeText={handleSearchChange}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {search.length > 0 && (
            <Pressable onPress={() => handleSearchChange("")}>
              <Feather name="x" size={16} color={C.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <Loading label={t("common.loading")} />
        </View>
      ) : !eventId ? (
        <View style={styles.emptyContainer}>
          <Feather name="alert-circle" size={40} color={C.textMuted} />
          <Text style={[styles.emptyText, { color: C.textMuted }]}>{t("common.empty")}</Text>
        </View>
      ) : transactions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Feather name="shopping-cart" size={40} color={C.textMuted} />
          <Text style={[styles.emptyText, { color: C.textMuted }]}>{t("transactions.empty")}</Text>
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id}
          renderItem={renderTransaction}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: isWeb ? 34 : insets.bottom + 80 },
          ]}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListFooterComponent={
            totalPages > 1 ? (
              <View style={styles.pagination}>
                <Pressable
                  disabled={page <= 1}
                  onPress={() => setPage((p) => p - 1)}
                  style={[styles.pageBtn, { opacity: page <= 1 ? 0.4 : 1, backgroundColor: C.inputBg }]}
                >
                  <Feather name="chevron-left" size={18} color={C.text} />
                </Pressable>
                <Text style={[styles.pageLabel, { color: C.textSecondary }]}>
                  {page} / {totalPages}
                </Text>
                <Pressable
                  disabled={page >= totalPages}
                  onPress={() => setPage((p) => p + 1)}
                  style={[styles.pageBtn, { opacity: page >= totalPages ? 0.4 : 1, backgroundColor: C.inputBg }]}
                >
                  <Feather name="chevron-right" size={18} color={C.text} />
                </Pressable>
              </View>
            ) : null
          }
        />
      )}

      {isFetching && !isLoading && (
        <View style={styles.fetchingIndicator}>
          <Text style={[styles.fetchingText, { color: C.textMuted }]}>{t("common.loading")}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingBottom: 12, gap: 4 },
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 4 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    padding: 0,
  },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center" },
  list: { paddingHorizontal: 20, paddingTop: 12 },
  card: {},
  cardRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  cardLeft: { flex: 1, gap: 3 },
  cardRight: { alignItems: "flex-end", gap: 4 },
  merchantName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  locationName: { fontSize: 12, fontFamily: "Inter_400Regular" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" },
  meta: { fontSize: 11, fontFamily: "Inter_400Regular" },
  offlineBadge: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  itemCount: { fontSize: 11, fontFamily: "Inter_400Regular" },
  itemsList: { borderTopWidth: 1, paddingTop: 8, marginTop: 6, gap: 4 },
  lineItem: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  lineItemName: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1, marginRight: 8 },
  pagination: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16, paddingVertical: 16 },
  pageBtn: { padding: 8, borderRadius: 8 },
  pageLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  fetchingIndicator: { position: "absolute", bottom: 16, alignSelf: "center", paddingHorizontal: 12, paddingVertical: 4 },
  fetchingText: { fontSize: 12, fontFamily: "Inter_400Regular" },
});
