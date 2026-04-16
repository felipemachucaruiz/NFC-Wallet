import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import React, { useState, useCallback, useEffect } from "react";
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { Card } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { useAuth } from "@/contexts/AuthContext";
import { useEventContext } from "@/contexts/EventContext";
import { API_BASE_URL } from "@/constants/domain";
import { formatCurrency } from "@/utils/format";

type TicketType = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  soldCount: number;
  isActive: boolean;
  sectionId: string | null;
};

type Order = {
  id: string;
  buyerEmail: string;
  buyerName: string | null;
  totalAmount: number;
  ticketCount: number;
  paymentStatus: string;
  createdAt: string;
};

type Section = {
  id: string;
  name: string;
  color: string | null;
  capacity: number | null;
};

export default function SalesDashboardScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { token } = useAuth();
  const { eventId, currencyCode } = useEventContext();

  const [types, setTypes] = useState<TicketType[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const authHeader = { Authorization: `Bearer ${token}` };
  const fmt = (n: number) => formatCurrency(n, currencyCode ?? "COP");

  const load = useCallback(async () => {
    if (!eventId) return;
    try {
      const [typesRes, ordersRes, venuesRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/events/${eventId}/ticket-types`, { headers: authHeader }),
        fetch(`${API_BASE_URL}/api/events/${eventId}/ticket-orders`, { headers: authHeader }),
        fetch(`${API_BASE_URL}/api/events/${eventId}/venues`, { headers: authHeader }),
      ]);
      const typesData = await typesRes.json();
      const ordersData = await ordersRes.json();
      const venuesData = await venuesRes.json();
      if (typesRes.ok) setTypes(typesData.ticketTypes ?? []);
      if (ordersRes.ok) setOrders(ordersData.orders ?? []);
      if (venuesRes.ok && venuesData.venues?.length > 0) {
        const firstVenueId = venuesData.venues[0].id;
        const sectionsRes = await fetch(`${API_BASE_URL}/api/events/${eventId}/venues/${firstVenueId}/sections`, { headers: authHeader });
        if (sectionsRes.ok) {
          const sectionsData = await sectionsRes.json();
          setSections(sectionsData.sections ?? []);
        }
      }
    } catch {}
    setLoading(false);
  }, [eventId, token]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const confirmedOrders = orders.filter(o => o.paymentStatus === "confirmed");
  const totalSold = confirmedOrders.reduce((s, o) => s + o.ticketCount, 0);
  const totalRevenue = confirmedOrders.reduce((s, o) => s + o.totalAmount, 0);
  const totalCapacity = types.reduce((s, tt) => s + tt.quantity, 0);
  const remaining = Math.max(0, totalCapacity - totalSold);
  const recentOrders = [...orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 20);

  const sectionStats = sections.map(sec => {
    const sectionTTs = types.filter(tt => tt.sectionId === sec.id);
    const sold = sectionTTs.reduce((s, tt) => s + tt.soldCount, 0);
    const capacity = sectionTTs.reduce((s, tt) => s + tt.quantity, 0) || sec.capacity || 0;
    const revenue = sectionTTs.reduce((s, tt) => s + tt.soldCount * tt.price, 0);
    return { ...sec, sold, capacity, revenue };
  });

  const unassignedTTs = types.filter(tt => !tt.sectionId || !sections.find(s => s.id === tt.sectionId));
  const hasSectionData = sections.length > 0;

  const fillColor = (pct: number) => {
    if (pct >= 90) return Colors.danger;
    if (pct >= 70) return "#F59E0B";
    return "#22C55E";
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "confirmed": return C.primary;
      case "pending": return "#F59E0B";
      case "cancelled": return Colors.danger;
      default: return C.textMuted;
    }
  };

  if (loading) return <Loading />;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: C.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: isWeb ? 34 : insets.bottom + 80 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={[styles.header, { paddingTop: isWeb ? 67 : insets.top + 16 }]}>
        <Text style={[styles.title, { color: C.text }]}>{t("salesDashboard.title")}</Text>
        <Text style={[styles.subtitle, { color: C.textMuted }]}>{t("salesDashboard.subtitle")}</Text>
      </View>

      {/* Summary Stats */}
      <View style={styles.statsGrid}>
        <Card style={[styles.statCard]}>
          <View style={[styles.statIcon, { backgroundColor: C.primaryLight }]}>
            <Feather name="tag" size={18} color={C.primary} />
          </View>
          <Text style={[styles.statValue, { color: C.text }]}>{totalSold.toLocaleString()}</Text>
          <Text style={[styles.statLabel, { color: C.textMuted }]}>{t("salesDashboard.totalSold")}</Text>
        </Card>
        <Card style={[styles.statCard]}>
          <View style={[styles.statIcon, { backgroundColor: "#22C55E20" }]}>
            <Feather name="dollar-sign" size={18} color="#22C55E" />
          </View>
          <Text style={[styles.statValue, { color: C.text }]} numberOfLines={1} adjustsFontSizeToFit>{fmt(totalRevenue)}</Text>
          <Text style={[styles.statLabel, { color: C.textMuted }]}>{t("salesDashboard.totalRevenue")}</Text>
        </Card>
        <Card style={[styles.statCard]}>
          <View style={[styles.statIcon, { backgroundColor: "#F59E0B20" }]}>
            <Feather name="layers" size={18} color="#F59E0B" />
          </View>
          <Text style={[styles.statValue, { color: C.text }]}>{remaining.toLocaleString()}</Text>
          <Text style={[styles.statLabel, { color: C.textMuted }]}>{t("salesDashboard.remaining")}</Text>
        </Card>
      </View>

      {/* Section Breakdown */}
      {hasSectionData && (
        <>
          <Text style={[styles.sectionTitle, { color: C.text }]}>{t("salesDashboard.bySection")}</Text>
          {sectionStats.map(sec => {
            const pct = sec.capacity > 0 ? Math.min(100, Math.round((sec.sold / sec.capacity) * 100)) : 0;
            const color = sec.color || fillColor(pct);
            return (
              <Card key={sec.id} style={styles.typeCard}>
                <View style={styles.typeRow}>
                  <View style={[styles.secDot, { backgroundColor: color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.typeName, { color: C.text }]}>{sec.name}</Text>
                    <Text style={[styles.typePrice, { color: C.textMuted }]}>{fmt(sec.revenue)}</Text>
                  </View>
                  <View style={styles.typeSales}>
                    <Text style={[styles.typeSold, { color: color }]}>{sec.sold}/{sec.capacity}</Text>
                    <Text style={[styles.typePct, { color: C.textMuted }]}>{pct}%</Text>
                  </View>
                </View>
                <View style={[styles.progressBar, { backgroundColor: C.inputBg }]}>
                  <View style={[styles.progressFill, { width: `${pct}%` as any, backgroundColor: color }]} />
                </View>
              </Card>
            );
          })}
          {unassignedTTs.length > 0 && (() => {
            const sold = unassignedTTs.reduce((s, tt) => s + tt.soldCount, 0);
            const cap = unassignedTTs.reduce((s, tt) => s + tt.quantity, 0);
            const rev = unassignedTTs.reduce((s, tt) => s + tt.soldCount * tt.price, 0);
            const pct = cap > 0 ? Math.min(100, Math.round((sold / cap) * 100)) : 0;
            return (
              <Card style={styles.typeCard}>
                <View style={styles.typeRow}>
                  <View style={[styles.secDot, { backgroundColor: C.textMuted }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.typeName, { color: C.text }]}>{t("salesDashboard.generalAdmission")}</Text>
                    <Text style={[styles.typePrice, { color: C.textMuted }]}>{fmt(rev)}</Text>
                  </View>
                  <View style={styles.typeSales}>
                    <Text style={[styles.typeSold, { color: C.primary }]}>{sold}/{cap}</Text>
                    <Text style={[styles.typePct, { color: C.textMuted }]}>{pct}%</Text>
                  </View>
                </View>
                <View style={[styles.progressBar, { backgroundColor: C.inputBg }]}>
                  <View style={[styles.progressFill, { width: `${pct}%` as any, backgroundColor: C.primary }]} />
                </View>
              </Card>
            );
          })()}
        </>
      )}

      {/* Ticket Type Breakdown */}
      {types.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { color: C.text }]}>{t("salesDashboard.byType")}</Text>
          {types.map(tt => {
            const pct = tt.quantity > 0 ? Math.min(100, Math.round((tt.soldCount / tt.quantity) * 100)) : 0;
            return (
              <Card key={tt.id} style={styles.typeCard}>
                <View style={styles.typeRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.typeName, { color: C.text }]}>{tt.name}</Text>
                    <Text style={[styles.typePrice, { color: C.textMuted }]}>{fmt(tt.price)}</Text>
                  </View>
                  <View style={styles.typeSales}>
                    <Text style={[styles.typeSold, { color: C.primary }]}>{tt.soldCount}/{tt.quantity}</Text>
                    <Text style={[styles.typePct, { color: C.textMuted }]}>{pct}%</Text>
                  </View>
                </View>
                <View style={[styles.progressBar, { backgroundColor: C.inputBg }]}>
                  <View style={[styles.progressFill, { width: `${pct}%` as any, backgroundColor: pct >= 90 ? Colors.danger : pct >= 70 ? "#F59E0B" : C.primary }]} />
                </View>
              </Card>
            );
          })}
        </>
      )}

      {/* Recent Orders */}
      <Text style={[styles.sectionTitle, { color: C.text }]}>{t("salesDashboard.recentOrders")}</Text>
      {recentOrders.length === 0 ? (
        <Text style={[styles.emptyText, { color: C.textMuted }]}>{t("salesDashboard.noOrders")}</Text>
      ) : (
        recentOrders.map(order => (
          <Card key={order.id} style={styles.orderCard}>
            <View style={styles.orderRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.orderBuyer, { color: C.text }]} numberOfLines={1}>
                  {order.buyerName || order.buyerEmail}
                </Text>
                <Text style={[styles.orderSub, { color: C.textMuted }]}>
                  {order.ticketCount} {t("ticketOrders.tickets")} · {new Date(order.createdAt).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Bogota" })}
                </Text>
              </View>
              <View style={styles.orderRight}>
                <Text style={[styles.orderAmount, { color: C.primary }]}>{fmt(order.totalAmount)}</Text>
                <View style={[styles.statusDot, { backgroundColor: statusColor(order.paymentStatus) }]} />
              </View>
            </View>
          </Card>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16 },
  header: { paddingBottom: 16, paddingHorizontal: 4 },
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  statsGrid: { flexDirection: "row", gap: 8, marginBottom: 8 },
  statCard: { flex: 1, alignItems: "center", gap: 4, marginHorizontal: 0, paddingHorizontal: 8 },
  statIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  statValue: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center" },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginTop: 20, marginBottom: 10, paddingHorizontal: 4 },
  typeCard: { marginHorizontal: 0, marginBottom: 8 },
  typeRow: { flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 8 },
  secDot: { width: 10, height: 10, borderRadius: 5 },
  typeName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  typePrice: { fontSize: 12, fontFamily: "Inter_400Regular" },
  typeSales: { alignItems: "flex-end" },
  typeSold: { fontSize: 14, fontFamily: "Inter_700Bold" },
  typePct: { fontSize: 12, fontFamily: "Inter_400Regular" },
  progressBar: { height: 6, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3 },
  orderCard: { marginHorizontal: 0, marginBottom: 8 },
  orderRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  orderBuyer: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  orderSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  orderRight: { alignItems: "flex-end", gap: 4 },
  orderAmount: { fontSize: 14, fontFamily: "Inter_700Bold" },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  emptyText: { textAlign: "center", paddingVertical: 20, fontSize: 14, fontFamily: "Inter_400Regular" },
});
