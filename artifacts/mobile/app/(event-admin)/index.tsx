import { Feather } from "@expo/vector-icons";
import React from "react";
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
import { useGetRevenueReport, useGetEvent } from "@workspace/api-client-react";
import { customFetch } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { router as navRouter } from "expo-router";
import Colors from "@/constants/colors";
import { CopAmount } from "@/components/CopAmount";
import { Card } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { useAuth } from "@/contexts/AuthContext";

type EventDetail = {
  id: string;
  name: string;
  description?: string | null;
  venueAddress?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  active?: boolean;
  capacity?: number | null;
  promoterCompanyId?: string | null;
  promoterCompanyName?: string | null;
  pulepId?: string | null;
};

function formatDate(iso: string | null | undefined, t: (k: string) => string): string {
  if (!iso) return t("common.notSet");
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function EventInfoCard({ event }: { event: EventDetail }) {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;

  const rows: { icon: string; label: string; value: string }[] = [
    ...(event.promoterCompanyName
      ? [{ icon: "briefcase", label: t("eventAdmin.company"), value: event.promoterCompanyName }]
      : []),
    ...(event.pulepId
      ? [{ icon: "hash", label: "PULEP", value: event.pulepId }]
      : []),
    { icon: "calendar", label: t("eventAdmin.startsAt"), value: formatDate(event.startsAt, t) },
    { icon: "calendar", label: t("eventAdmin.endsAt"), value: formatDate(event.endsAt, t) },
    ...(event.venueAddress
      ? [{ icon: "map-pin", label: t("eventAdmin.venue"), value: event.venueAddress }]
      : []),
  ];

  return (
    <Card style={[styles.eventCard, { borderColor: C.border }]} padding={0}>
      <View style={[styles.eventCardHeader, { backgroundColor: C.primaryLight, borderBottomColor: C.border }]}>
        <Feather name="calendar" size={16} color={C.primary} />
        <Text style={[styles.eventName, { color: C.primary }]} numberOfLines={2}>
          {event.name}
        </Text>
        <View style={[styles.statusDot, { backgroundColor: event.active ? C.success : C.textMuted }]} />
      </View>
      <View style={styles.eventRows}>
        {rows.map((row, i) => (
          <View
            key={row.label}
            style={[
              styles.eventRow,
              { borderBottomColor: C.border },
              i === rows.length - 1 && { borderBottomWidth: 0 },
            ]}
          >
            <Feather name={row.icon as any} size={13} color={C.textMuted} style={{ marginTop: 1 }} />
            <Text style={[styles.eventRowLabel, { color: C.textMuted }]}>{row.label}</Text>
            <Text style={[styles.eventRowValue, { color: C.text }]} numberOfLines={2}>
              {row.value}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

export default function EventAdminDashboard() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();

  const { data: revenueData, isLoading: revenueLoading } = useGetRevenueReport(
    user?.eventId ? { eventId: user.eventId } : {},
  );

  const { data: eventData, isLoading: eventLoading } = useGetEvent(
    user?.eventId ?? "",
    { query: { enabled: !!user?.eventId } },
  );

  const { data: flaggedData } = useQuery({
    queryKey: ["flagged-bracelets", user?.eventId],
    enabled: !!user?.eventId,
    refetchInterval: 30000,
    queryFn: async () => {
      const res = await customFetch(`/api/events/${user!.eventId}/flagged-bracelets`, { method: "GET" });
      return res as { flaggedBracelets: Array<{ nfcUid: string }> };
    },
  });
  const flaggedCount = flaggedData?.flaggedBracelets?.length ?? 0;

  const revenue = revenueData as {
    totalTopUpsCop?: number;
    totalSalesCop?: number;
    totalCogsCop?: number;
    grossProfitCop?: number;
    totalCommissionsCop?: number;
    netOwedToMerchantsCop?: number;
    platformRevenueCop?: number;
    transactionCount?: number;
    topUpCount?: number;
    braceletCount?: number;
  } | undefined;

  const event = eventData as EventDetail | undefined;

  const kpiCards = [
    { label: t("admin.totalSales"), value: revenue?.totalSalesCop, icon: "shopping-bag" as const, color: C.success },
    { label: t("admin.grossProfit"), value: revenue?.grossProfitCop, icon: "dollar-sign" as const, color: C.success },
    { label: t("admin.totalCommissions"), value: revenue?.totalCommissionsCop, icon: "percent" as const, color: C.warning },
    { label: t("admin.netOwedToMerchants"), value: revenue?.netOwedToMerchantsCop, icon: "credit-card" as const, color: C.textSecondary },
  ];

  if (eventLoading) return <Loading label={t("common.loading")} />;

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
      <Text style={[styles.title, { color: C.text }]}>{t("eventAdmin.dashboard")}</Text>

      {event ? <EventInfoCard event={event} /> : null}

      {flaggedCount > 0 && (
        <Pressable onPress={() => navRouter.push("/(event-admin)/event-settings")}>
          <Card padding={14} style={[styles.flagAlert, { borderColor: C.danger + "55", backgroundColor: C.dangerLight }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={[styles.flagAlertBadge, { backgroundColor: C.danger }]}>
                <Text style={styles.flagAlertBadgeText}>{flaggedCount}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.flagAlertTitle, { color: C.text }]}>{t("eventAdmin.flaggedBracelets")}</Text>
                <Text style={[styles.flagAlertSub, { color: C.textSecondary }]}>{t("eventAdmin.flaggedBracelets_alert")}</Text>
              </View>
              <Feather name="chevron-right" size={18} color={C.danger} />
            </View>
          </Card>
        </Pressable>
      )}

      {revenueLoading ? <Loading label={t("common.loading")} /> : (
        <>
          <Card style={[styles.mainCard, { backgroundColor: C.primary }]} padding={24}>
            <View style={styles.mainRow}>
              <View>
                <Text style={styles.mainLabel}>{t("admin.totalSales")}</Text>
                <CopAmount amount={revenue?.totalSalesCop} size={38} color="#0a0a0a" />
              </View>
              <View style={[styles.mainIconBox, { backgroundColor: "rgba(0,0,0,0.12)" }]}>
                <Feather name="trending-up" size={28} color="#0a0a0a" />
              </View>
            </View>
            <View style={styles.statsRow}>
              <StatPill label={t("admin.transactions")} value={String(revenue?.transactionCount ?? 0)} />
              <StatPill label={t("admin.topUps")} value={String(revenue?.topUpCount ?? 0)} />
              <StatPill label={t("admin.bracelets")} value={String(revenue?.braceletCount ?? 0)} />
            </View>
          </Card>

          <View style={styles.kpiGrid}>
            {kpiCards.map((card) => (
              <Card key={card.label} style={{ flex: 1, minWidth: "47%" }} padding={16}>
                <View style={[styles.kpiIcon, { backgroundColor: card.color + "22" }]}>
                  <Feather name={card.icon} size={16} color={card.color} />
                </View>
                <Text style={[styles.kpiLabel, { color: C.textSecondary }]}>{card.label}</Text>
                <CopAmount amount={card.value} size={18} color={card.color} />
              </Card>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statPill}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontFamily: "Inter_700Bold" },
  eventCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  eventCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  eventName: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  eventRows: {
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  eventRowLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    width: 72,
    flexShrink: 0,
    marginTop: 1,
  },
  eventRowValue: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  mainCard: { borderRadius: 20 },
  mainRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  mainLabel: { color: "rgba(0,0,0,0.7)", fontFamily: "Inter_500Medium", fontSize: 13, marginBottom: 4 },
  mainIconBox: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  statsRow: { flexDirection: "row", gap: 16, marginTop: 16 },
  statPill: { flex: 1, alignItems: "center" },
  statValue: { color: "#0a0a0a", fontSize: 20, fontFamily: "Inter_700Bold" },
  statLabel: { color: "rgba(0,0,0,0.6)", fontSize: 11, fontFamily: "Inter_400Regular" },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  kpiIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  kpiLabel: { fontSize: 11, fontFamily: "Inter_500Medium", marginBottom: 4 },
  flagAlert: { borderWidth: 1, borderRadius: 14 },
  flagAlertBadge: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  flagAlertBadgeText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
  flagAlertTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  flagAlertSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
});
