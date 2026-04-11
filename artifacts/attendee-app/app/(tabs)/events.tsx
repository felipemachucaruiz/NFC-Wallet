import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Image,
  ImageBackground,
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
import { Badge } from "@/components/ui/Badge";
import { Loading } from "@/components/ui/Loading";
import { Empty } from "@/components/ui/Empty";
import { useEventCatalogue } from "@/hooks/useEventsApi";
import { formatCurrency } from "@/utils/format";
import type { EventListItem, EventCategory } from "@/types/events";

const DATE_FILTERS = ["upcoming", "this_week", "this_month"] as const;
const CATEGORIES: EventCategory[] = ["concert", "festival", "sports", "theater", "conference", "party"];

function getDateLocale(lang: string): string {
  return lang === "en" ? "en-US" : "es-CO";
}

function formatEventDate(startsAt: string, locale: string, endsAt?: string, multiDay?: boolean): string {
  const start = new Date(startsAt);
  if (multiDay && endsAt) {
    const end = new Date(endsAt);
    return `${start.toLocaleDateString(locale, { month: "short", day: "numeric" })} - ${end.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" })}`;
  }
  return start.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function EventCard({ event }: { event: EventListItem }) {
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const { t, i18n } = useTranslation();
  const locale = getDateLocale(i18n.language);

  return (
    <Pressable
      style={[styles.eventCard, { borderColor: C.border }]}
      onPress={() => router.push({ pathname: "/event-detail", params: { eventId: event.id } })}
    >
      {event.coverImageUrl ? (
        <ImageBackground
          source={{ uri: event.coverImageUrl }}
          style={styles.cardHero}
          resizeMode="cover"
          blurRadius={1}
        >
          <View style={styles.scrim} />
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.55)", "rgba(0,0,0,0.92)"]}
            style={styles.gradient}
          />

          {event.flyerImageUrl && (
            <Image
              source={{ uri: event.flyerImageUrl }}
              style={styles.flyerSquare}
              resizeMode="cover"
            />
          )}

          {event.soldOut && (
            <View style={styles.soldOutOverlay}>
              <Text style={styles.soldOutText}>{t("events.soldOut")}</Text>
            </View>
          )}

          <View style={styles.heroInfo}>
            <Text style={styles.heroName} numberOfLines={2}>{event.name}</Text>
            <View style={styles.heroMeta}>
              <Feather name="calendar" size={11} color="rgba(255,255,255,0.75)" />
              <Text style={styles.heroMetaText} numberOfLines={1}>
                {formatEventDate(event.startsAt, locale, event.endsAt, event.multiDay)}
              </Text>
            </View>
            <View style={styles.heroMeta}>
              <Feather name="map-pin" size={11} color="rgba(255,255,255,0.75)" />
              <Text style={styles.heroMetaText} numberOfLines={1}>
                {event.venueName} · {event.city}
              </Text>
            </View>
            <View style={styles.heroBadges}>
              {event.minPrice != null && (
                <Badge
                  label={`${t("events.from")} ${formatCurrency(event.minPrice, event.currencyCode)}`}
                  variant="info"
                  size="sm"
                />
              )}
              {event.multiDay && (
                <Badge label={t("events.multiDay")} variant="muted" size="sm" />
              )}
            </View>
          </View>
        </ImageBackground>
      ) : (
        <View style={[styles.cardHero, { backgroundColor: C.inputBg }]}>
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Feather name="calendar" size={36} color={C.textMuted} />
          </View>
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.7)", "rgba(0,0,0,0.95)"]}
            style={styles.gradient}
          />
          <View style={styles.heroInfo}>
            <Text style={styles.heroName} numberOfLines={2}>{event.name}</Text>
            <View style={styles.heroMeta}>
              <Feather name="calendar" size={11} color="rgba(255,255,255,0.75)" />
              <Text style={styles.heroMetaText} numberOfLines={1}>
                {formatEventDate(event.startsAt, locale, event.endsAt, event.multiDay)}
              </Text>
            </View>
            <View style={styles.heroMeta}>
              <Feather name="map-pin" size={11} color="rgba(255,255,255,0.75)" />
              <Text style={styles.heroMetaText} numberOfLines={1}>
                {event.venueName} · {event.city}
              </Text>
            </View>
            <View style={styles.heroBadges}>
              {event.minPrice != null && (
                <Badge
                  label={`${t("events.from")} ${formatCurrency(event.minPrice, event.currencyCode)}`}
                  variant="info"
                  size="sm"
                />
              )}
              {event.multiDay && (
                <Badge label={t("events.multiDay")} variant="muted" size="sm" />
              )}
            </View>
          </View>
        </View>
      )}
    </Pressable>
  );
}

export default function EventsScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [cityFilter, setCityFilter] = useState<string>("");
  const [showCityInput, setShowCityInput] = useState(false);
  const [cityInputValue, setCityInputValue] = useState("");

  const { data, isPending, refetch, isError } = useEventCatalogue({
    search: search.trim() || undefined,
    category: categoryFilter || undefined,
    city: cityFilter || undefined,
    dateFilter: dateFilter || undefined,
  });

  const events = useMemo(() => (data as { events?: EventListItem[] } | undefined)?.events ?? [], [data]);

  const filteredEvents = useMemo(() => {
    if (!search.trim()) return events;
    const q = search.toLowerCase();
    return events.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.venueName.toLowerCase().includes(q) ||
        e.city.toLowerCase().includes(q)
    );
  }, [events, search]);

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refetch(); } finally { setRefreshing(false); }
  }, [refetch]);

  const renderItem = useCallback(
    ({ item }: { item: EventListItem }) => <EventCard event={item} />,
    [],
  );

  if (isPending) return <Loading label={t("common.loading")} />;

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <View style={[styles.header, { paddingTop: isWeb ? 67 : insets.top + 8 }]}>
        <Text style={[styles.title, { color: C.text }]}>{t("events.title")}</Text>
        <Pressable onPress={() => router.push("/my-tickets")} style={styles.ticketsBtn}>
          <Feather name="tag" size={20} color={C.primary} />
        </Pressable>
      </View>

      <View style={[styles.searchWrap, { backgroundColor: C.inputBg, borderColor: C.border }]}>
        <Feather name="search" size={18} color={C.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: C.text }]}
          placeholder={t("events.searchPlaceholder")}
          placeholderTextColor={C.textMuted}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")}>
            <Feather name="x" size={16} color={C.textMuted} />
          </Pressable>
        )}
      </View>

      <View style={styles.filtersRow}>
        {cityFilter !== "" && (
          <Pressable
            onPress={() => setCityFilter("")}
            style={[
              styles.filterChip,
              {
                backgroundColor: C.primaryLight,
                borderColor: C.primary,
              },
            ]}
          >
            <Text style={[styles.filterChipText, { color: C.primary }]}>
              {cityFilter} ✕
            </Text>
          </Pressable>
        )}
        {cityFilter === "" && (
          <Pressable
            onPress={() => setShowCityInput(true)}
            style={[
              styles.filterChip,
              {
                backgroundColor: C.inputBg,
                borderColor: C.border,
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
              },
            ]}
          >
            <Feather name="map-pin" size={12} color={C.textSecondary} />
            <Text style={[styles.filterChipText, { color: C.textSecondary }]}>
              {t("events.filterCity")}
            </Text>
          </Pressable>
        )}
        {DATE_FILTERS.map((df) => (
          <Pressable
            key={df}
            onPress={() => setDateFilter(dateFilter === df ? "" : df)}
            style={[
              styles.filterChip,
              {
                backgroundColor: dateFilter === df ? C.primaryLight : C.inputBg,
                borderColor: dateFilter === df ? C.primary : C.border,
              },
            ]}
          >
            <Text
              style={[
                styles.filterChipText,
                { color: dateFilter === df ? C.primary : C.textSecondary },
              ]}
            >
              {t(`events.filter_${df}`)}
            </Text>
          </Pressable>
        ))}
        {CATEGORIES.map((cat) => (
          <Pressable
            key={cat}
            onPress={() => setCategoryFilter(categoryFilter === cat ? "" : cat)}
            style={[
              styles.filterChip,
              {
                backgroundColor: categoryFilter === cat ? C.primaryLight : C.inputBg,
                borderColor: categoryFilter === cat ? C.primary : C.border,
              },
            ]}
          >
            <Text
              style={[
                styles.filterChipText,
                { color: categoryFilter === cat ? C.primary : C.textSecondary },
              ]}
            >
              {t(`events.category_${cat}`)}
            </Text>
          </Pressable>
        ))}
      </View>

      {showCityInput && (
        <View style={[styles.cityInputWrap, { backgroundColor: C.inputBg, borderColor: C.border }]}>
          <Feather name="map-pin" size={16} color={C.textMuted} />
          <TextInput
            style={[styles.cityInput, { color: C.text }]}
            placeholder={t("events.cityPlaceholder")}
            placeholderTextColor={C.textMuted}
            value={cityInputValue}
            onChangeText={setCityInputValue}
            autoFocus
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={() => {
              if (cityInputValue.trim()) {
                setCityFilter(cityInputValue.trim());
              }
              setShowCityInput(false);
              setCityInputValue("");
            }}
          />
          <Pressable onPress={() => { setShowCityInput(false); setCityInputValue(""); }}>
            <Feather name="x" size={16} color={C.textMuted} />
          </Pressable>
        </View>
      )}

      <FlatList
        data={filteredEvents}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: isWeb ? 34 : insets.bottom + 100 },
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.primary} />
        }
        ListEmptyComponent={
          <Empty
            icon="calendar"
            title={isError ? t("common.error") : t("events.noEvents")}
            subtitle={isError ? t("common.retry") : t("events.noEventsSub")}
            actionLabel={isError ? t("common.retry") : undefined}
            onAction={isError ? handleRefresh : undefined}
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
  title: { fontSize: 28, fontFamily: "Inter_700Bold" },
  ticketsBtn: { padding: 8 },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  filtersRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 4,
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  filterChipText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  cityInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    marginBottom: 4,
  },
  cityInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 12,
  },
  eventCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  cardHero: {
    width: "100%",
    height: 200,
    justifyContent: "flex-end",
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  gradient: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 140,
  },
  flyerSquare: {
    position: "absolute",
    top: 10,
    right: 12,
    width: 120,
    height: 120,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.18)",
  },
  soldOutOverlay: {
    position: "absolute",
    top: 12,
    left: 12,
    backgroundColor: "rgba(239,68,68,0.9)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  soldOutText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    textTransform: "uppercase",
  },
  heroInfo: {
    padding: 14,
    gap: 4,
  },
  heroName: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    lineHeight: 23,
    marginBottom: 2,
  },
  heroMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  heroMetaText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.75)",
    flex: 1,
  },
  heroBadges: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6,
  },
});
