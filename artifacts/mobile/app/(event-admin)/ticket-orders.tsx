import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import React, { useState, useCallback, useEffect } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Loading } from "@/components/ui/Loading";
import { useAuth } from "@/contexts/AuthContext";
import { useEventContext } from "@/contexts/EventContext";
import { API_BASE_URL } from "@/constants/domain";
import { formatCurrency } from "@/utils/format";

type Order = {
  id: string;
  buyerEmail: string;
  buyerName: string | null;
  totalAmount: number;
  ticketCount: number;
  paymentStatus: string;
  createdAt: string;
};

const STATUS_OPTIONS = ["all", "confirmed", "pending", "cancelled", "expired"] as const;

export default function TicketOrdersScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { token } = useAuth();
  const { eventId, currencyCode } = useEventContext();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const authHeader = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const load = useCallback(async () => {
    if (!eventId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/events/${eventId}/ticket-orders`, { headers: authHeader });
      const data = await res.json();
      if (res.ok) setOrders(data.orders ?? []);
    } catch {}
    setLoading(false);
  }, [eventId, token]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const filtered = orders.filter(o => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      (o.buyerName ?? "").toLowerCase().includes(q) ||
      o.buyerEmail.toLowerCase().includes(q) ||
      o.id.toLowerCase().includes(q);
    const matchStatus = statusFilter === "all" || o.paymentStatus === statusFilter;
    return matchSearch && matchStatus;
  });

  const statusColor = (status: string) => {
    switch (status) {
      case "confirmed": return C.primary;
      case "pending": return "#F59E0B";
      case "cancelled": return Colors.danger;
      case "expired": return C.textMuted;
      default: return C.textMuted;
    }
  };

  const fmt = (n: number) => formatCurrency(n, currencyCode ?? "COP");

  if (loading) return <Loading />;

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <View style={[styles.header, { paddingTop: isWeb ? 67 : insets.top + 16, backgroundColor: C.background }]}>
        <Text style={[styles.title, { color: C.text }]}>{t("ticketOrders.title")}</Text>
        <Text style={[styles.subtitle, { color: C.textMuted }]}>{t("ticketOrders.subtitle", { count: filtered.length })}</Text>
      </View>

      <View style={[styles.filterBar, { paddingHorizontal: 16 }]}>
        <View style={[styles.searchBox, { backgroundColor: C.inputBg, borderColor: C.border }]}>
          <Feather name="search" size={15} color={C.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: C.text }]}
            value={search}
            onChangeText={setSearch}
            placeholder={t("ticketOrders.searchPlaceholder")}
            placeholderTextColor={C.textMuted}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")}>
              <Feather name="x" size={15} color={C.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.statusBar}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={STATUS_OPTIONS}
          keyExtractor={s => s}
          contentContainerStyle={styles.statusList}
          renderItem={({ item: s }) => (
            <Pressable
              onPress={() => setStatusFilter(s)}
              style={[styles.statusChip, { backgroundColor: statusFilter === s ? C.primary : C.inputBg, borderColor: statusFilter === s ? C.primary : C.border }]}
            >
              <Text style={[styles.statusChipText, { color: statusFilter === s ? "#fff" : C.textMuted }]}>
                {t(`ticketOrders.status.${s}`)}
              </Text>
            </Pressable>
          )}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        contentContainerStyle={[styles.list, { paddingBottom: isWeb ? 34 : insets.bottom + 100 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={<Empty message={t("ticketOrders.empty")} />}
        renderItem={({ item }) => (
          <Card style={styles.orderCard}>
            <View style={styles.orderRow}>
              <View style={{ flex: 1 }}>
                <View style={styles.orderTopRow}>
                  <Text style={[styles.buyerName, { color: C.text }]} numberOfLines={1}>
                    {item.buyerName || item.buyerEmail}
                  </Text>
                  <View style={[styles.statusBadge, { backgroundColor: statusColor(item.paymentStatus) + "20" }]}>
                    <Text style={[styles.statusBadgeText, { color: statusColor(item.paymentStatus) }]}>
                      {t(`ticketOrders.status.${item.paymentStatus}`)}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.buyerEmail, { color: C.textMuted }]} numberOfLines={1}>{item.buyerEmail}</Text>
                <View style={styles.orderMeta}>
                  <Text style={[styles.orderMetaText, { color: C.textMuted }]}>
                    {item.ticketCount} {t("ticketOrders.tickets")}
                  </Text>
                  <Text style={[styles.orderAmount, { color: C.primary }]}>{fmt(item.totalAmount)}</Text>
                </View>
                <Text style={[styles.orderId, { color: C.textMuted }]}>
                  {new Date(item.createdAt).toLocaleDateString()} · #{item.id.slice(0, 8)}
                </Text>
              </View>
            </View>
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12 },
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  filterBar: { marginBottom: 8 },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  statusBar: { marginBottom: 8 },
  statusList: { paddingHorizontal: 16, gap: 8 },
  statusChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  statusChipText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  list: { paddingHorizontal: 16, paddingTop: 4, gap: 10 },
  orderCard: { marginHorizontal: 0 },
  orderRow: { gap: 4 },
  orderTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  buyerName: { fontSize: 15, fontFamily: "Inter_600SemiBold", flex: 1 },
  buyerEmail: { fontSize: 13, fontFamily: "Inter_400Regular" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  statusBadgeText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  orderMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  orderMetaText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  orderAmount: { fontSize: 15, fontFamily: "Inter_700Bold" },
  orderId: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
});
