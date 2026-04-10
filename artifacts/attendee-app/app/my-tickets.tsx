import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  FlatList,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { Badge } from "@/components/ui/Badge";
import { Loading } from "@/components/ui/Loading";
import { Empty } from "@/components/ui/Empty";
import { useMyTickets } from "@/hooks/useEventsApi";
import type { MyTicket } from "@/types/events";

function statusVariant(status: string): "success" | "warning" | "danger" | "muted" {
  if (status === "active") return "success";
  if (status === "used") return "muted";
  if (status === "cancelled") return "danger";
  return "warning";
}

function getDateLocale(lang: string): string {
  return lang === "en" ? "en-US" : "es-CO";
}

function TicketCard({ ticket }: { ticket: MyTicket }) {
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const { t, i18n } = useTranslation();
  const locale = getDateLocale(i18n.language);

  const startDate = new Date(ticket.startsAt);

  return (
    <Pressable
      style={[styles.ticketCard, { backgroundColor: C.card, borderColor: C.border }]}
      onPress={() =>
        router.push({
          pathname: "/ticket-detail",
          params: { ticketId: ticket.id, ticketData: JSON.stringify(ticket) },
        })
      }
    >
      <View style={styles.ticketCardRow}>
        {ticket.eventCoverImageUrl ? (
          <Image source={{ uri: ticket.eventCoverImageUrl }} style={styles.ticketThumb} resizeMode="cover" />
        ) : (
          <View style={[styles.ticketThumb, { backgroundColor: C.inputBg, alignItems: "center", justifyContent: "center" }]}>
            <Feather name="tag" size={20} color={C.textMuted} />
          </View>
        )}
        <View style={styles.ticketInfo}>
          <Text style={[styles.ticketEventName, { color: C.text }]} numberOfLines={1}>
            {ticket.eventName}
          </Text>
          <Text style={[styles.ticketTypeName, { color: C.primary }]} numberOfLines={1}>
            {ticket.ticketTypeName}
            {ticket.sectionName ? ` · ${ticket.sectionName}` : ""}
          </Text>
          <View style={styles.ticketMeta}>
            <Feather name="calendar" size={11} color={C.textSecondary} />
            <Text style={[styles.ticketMetaText, { color: C.textSecondary }]}>
              {startDate.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" })}
            </Text>
          </View>
          <View style={styles.ticketMeta}>
            <Feather name="map-pin" size={11} color={C.textSecondary} />
            <Text style={[styles.ticketMetaText, { color: C.textSecondary }]} numberOfLines={1}>
              {ticket.venueName}
            </Text>
          </View>

          {ticket.validDays && ticket.validDays.length > 0 && (
            <View style={styles.daysRow}>
              {ticket.validDays.map((day) => {
                const isCheckedIn = ticket.checkedInDays?.includes(day.dayNumber);
                return (
                  <View
                    key={day.dayNumber}
                    style={[
                      styles.dayChip,
                      {
                        backgroundColor: isCheckedIn ? C.successLight : C.inputBg,
                        borderColor: isCheckedIn ? C.success : C.border,
                      },
                    ]}
                  >
                    {isCheckedIn && <Feather name="check" size={10} color={C.success} />}
                    <Text style={[styles.dayChipText, { color: isCheckedIn ? C.success : C.textSecondary }]}>
                      {t("events.dayLabel", { n: day.dayNumber })}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          <View style={{ marginTop: 4 }}>
            <Badge label={t(`tickets.status_${ticket.status}`)} variant={statusVariant(ticket.status)} size="sm" />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export default function MyTicketsScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const { data, isPending, refetch } = useMyTickets();
  const tickets = (data as { tickets?: MyTicket[] } | undefined)?.tickets ?? [];

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refetch(); } finally { setRefreshing(false); }
  }, [refetch]);

  const renderItem = useCallback(
    ({ item }: { item: MyTicket }) => <TicketCard ticket={item} />,
    [],
  );

  if (isPending) return <Loading label={t("common.loading")} />;

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <View style={[styles.header, { paddingTop: isWeb ? 67 : insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={C.text} />
        </Pressable>
        <Text style={[styles.title, { color: C.text }]}>{t("tickets.myTickets")}</Text>
        <View style={{ width: 30 }} />
      </View>

      <FlatList
        data={tickets}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: isWeb ? 34 : insets.bottom + 24 },
          tickets.length === 0 && { flex: 1 },
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.primary} />
        }
        ListEmptyComponent={
          <Empty
            icon="tag"
            title={t("tickets.noTickets")}
            subtitle={t("tickets.noTicketsSub")}
            actionLabel={t("tickets.browseEvents")}
            onAction={() => router.replace("/(tabs)/events")}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  backBtn: { padding: 4 },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  listContent: { paddingHorizontal: 20, paddingTop: 8, gap: 12 },
  ticketCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  ticketCardRow: {
    flexDirection: "row",
  },
  ticketThumb: {
    width: 90,
    height: "100%",
    minHeight: 120,
  },
  ticketInfo: {
    flex: 1,
    padding: 12,
    gap: 3,
  },
  ticketEventName: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  ticketTypeName: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  ticketMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  ticketMetaText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  daysRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 4,
  },
  dayChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  dayChipText: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
  },
});
