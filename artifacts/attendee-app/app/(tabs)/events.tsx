import { useColorScheme } from "@/hooks/useColorScheme";
import { Image } from 'expo-image';
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { FlatList, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { Badge } from "@/components/ui/Badge";
import { Loading } from "@/components/ui/Loading";
import { ScreenBackground } from "@/components/ui/ScreenBackground";
import { Empty } from "@/components/ui/Empty";
import { useEventCatalogue } from "@/hooks/useEventsApi";
import { useQuery } from "@tanstack/react-query";
import { API_BASE_URL } from "@/constants/domain";
import { formatCurrency } from "@/utils/format";
import type { EventListItem, EventCategory } from "@/types/events";

const DATE_FILTERS = ["upcoming", "this_week", "this_month"] as const;
const ALL_CATEGORIES: EventCategory[] = ["race", "concert", "festival", "sports", "theater", "conference", "party", "other"];

const CATEGORY_EMOJIS: Record<EventCategory, string> = {
  concert: "🎵",
  festival: "🎡",
  sports: "🏅",
  theater: "🎭",
  conference: "🎤",
  party: "🎉",
  race: "🏃",
  other: "✨",
};

interface CityItem {
  id: string;
  name: string;
  coverImageUrl: string | null;
}

function useCities() {
  return useQuery<CityItem[]>({
    queryKey: ["public-cities"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/api/public/cities`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.cities ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

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
        <View style={styles.cardHero}>
          <Image
            source={{ uri: event.coverImageUrl }}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            contentFit="cover"
            blurRadius={1}
            cachePolicy="disk"
          />
          <View style={styles.scrim} />
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.55)", "rgba(0,0,0,0.92)"]}
            style={styles.gradient}
          />

          {event.flyerImageUrl && (
            <Image
              source={{ uri: event.flyerImageUrl }}
              style={styles.flyerSquare}
              contentFit="cover"
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
        </View>
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

  const { data: cityData } = useCities();
  const cities = cityData ?? [];

  const { data, isPending, refetch, isError } = useEventCatalogue({
    search: search.trim() || undefined,
    category: categoryFilter || undefined,
    city: cityFilter || undefined,
    dateFilter: dateFilter || undefined,
  });

  const { data: allData } = useEventCatalogue();

  const events = useMemo(() => (data as { events?: EventListItem[] } | undefined)?.events ?? [], [data]);

  const sortedCategories = useMemo(() => {
    const allEvents = (allData as { events?: EventListItem[] } | undefined)?.events ?? [];
    const counts: Partial<Record<EventCategory, number>> = {};
    for (const ev of allEvents) {
      if (ev.category) counts[ev.category] = (counts[ev.category] ?? 0) + 1;
    }
    return ALL_CATEGORIES
      .filter((cat) => (counts[cat] ?? 0) > 0)
      .sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0));
  }, [allData]);

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
    <ScreenBackground style={styles.container}>
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

      {cities.length > 0 && (
        <View style={styles.citiesSection}>
          <Text style={[styles.sectionTitle, { color: C.text }]}>{t("events.citiesTitle")}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.citiesScroll}
          >
            {cities.map((city) => {
              const isActive = cityFilter === city.id;
              return (
                <Pressable
                  key={city.id}
                  onPress={() => setCityFilter(isActive ? "" : city.id)}
                  style={styles.cityCard}
                >
                  <View style={styles.cityCardBg}>
                    {city.coverImageUrl ? (
                      <Image
                        source={{ uri: city.coverImageUrl }}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                        cachePolicy="disk"
                      />
                    ) : null}
                    <LinearGradient
                      colors={["transparent", "rgba(0,0,0,0.72)"]}
                      style={styles.cityCardGradient}
                    />
                    {isActive && (
                      <View style={[styles.cityCardCheck, { backgroundColor: C.primary }]}>
                        <Feather name="check" size={10} color="#000" />
                      </View>
                    )}
                    <Text style={styles.cityCardName} numberOfLines={1}>{city.name}</Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      <View style={styles.filtersRow}>
        {cityFilter !== "" && (
          <Pressable
            onPress={() => setCityFilter("")}
            style={[styles.filterChip, { backgroundColor: C.primaryLight, borderColor: C.primary }]}
          >
            <Feather name="map-pin" size={11} color={C.primary} />
            <Text style={[styles.filterChipText, { color: C.primary }]}>
              {cities.find((c) => c.id === cityFilter)?.name ?? cityFilter} ✕
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
            <Text style={[styles.filterChipText, { color: dateFilter === df ? C.primary : C.textSecondary }]}>
              {t(`events.filter_${df}`)}
            </Text>
          </Pressable>
        ))}
      </View>

      {sortedCategories.length > 0 && <View style={styles.categoriesSection}>
        <Text style={[styles.categoriesTitle, { color: C.text }]}>{t("events.categoriesTitle")}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoriesScroll}
        >
          {sortedCategories.map((cat) => {
            const isActive = categoryFilter === cat;
            return (
              <Pressable
                key={cat}
                onPress={() => setCategoryFilter(isActive ? "" : cat)}
                style={[
                  styles.categoryCard,
                  {
                    backgroundColor: isActive ? C.primary : C.card,
                    borderColor: isActive ? C.primary : C.border,
                  },
                ]}
              >
                <Text style={styles.categoryEmoji}>{CATEGORY_EMOJIS[cat]}</Text>
                <Text
                  style={[styles.categoryName, { color: isActive ? "#000" : C.textSecondary }]}
                  numberOfLines={1}
                >
                  {t(`events.category_${cat}`)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>}

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
    </ScreenBackground>
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
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  filterChipText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  citiesSection: {
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  citiesScroll: {
    paddingHorizontal: 20,
    gap: 10,
  },
  cityCard: {
    width: 140,
    height: 88,
    borderRadius: 14,
    overflow: "hidden",
  },
  cityCardBg: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "#222",
    overflow: "hidden",
    borderRadius: 14,
  },
  cityCardGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 60,
    borderRadius: 14,
  },
  cityCardCheck: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cityCardName: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    paddingHorizontal: 10,
    paddingBottom: 8,
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
  categoriesSection: {
    marginBottom: 8,
  },
  categoriesTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  categoriesScroll: {
    paddingHorizontal: 20,
    gap: 10,
  },
  categoryCard: {
    width: 88,
    height: 88,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 6,
  },
  categoryEmoji: {
    fontSize: 28,
  },
  categoryName: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
});
