import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearch } from "wouter";
import { Calendar, MapPin, Search, X, ChevronRight, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchEvents, type ApiEvent } from "@/lib/api";
import { formatPrice, formatDateRange } from "@/lib/format";

const ITEMS_PER_PAGE = 6;

export default function Home() {
  const { t } = useTranslation();
  const rawSearch = useSearch();
  const qParam = new URLSearchParams(rawSearch).get("q") || "";
  const [searchQuery, setSearchQuery] = useState(qParam);

  useEffect(() => {
    if (qParam) setSearchQuery(qParam);
  }, [qParam]);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("all");
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);

  const { data, isLoading } = useQuery({
    queryKey: ["events", searchQuery, categoryFilter],
    queryFn: () => fetchEvents({
      search: searchQuery || undefined,
      category: categoryFilter !== "all" ? categoryFilter : undefined,
    }),
    staleTime: 30_000,
  });

  const events = data?.events ?? [];

  const categories = ["all", "concerts", "festivals", "sports", "theater"];
  const cities = useMemo(() => {
    const c = new Set<string>();
    events.forEach((e) => {
      if (e.venueAddress) {
        const parts = e.venueAddress.split(",");
        const city = parts[parts.length - 1]?.trim();
        if (city) c.add(city);
      }
    });
    return ["all", ...Array.from(c).sort()];
  }, [events]);

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (cityFilter !== "all") {
        const addr = event.venueAddress || "";
        if (!addr.toLowerCase().includes(cityFilter.toLowerCase())) return false;
      }
      return true;
    });
  }, [events, cityFilter]);

  const visibleEvents = filteredEvents.slice(0, visibleCount);
  const featured = events.find((e) => e.priceFrom > 0) || events[0];

  const hasFilters = searchQuery || categoryFilter !== "all" || cityFilter !== "all";

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {featured && (
        <section className="relative h-[420px] md:h-[500px] overflow-hidden">
          <div className="absolute inset-0">
            <img
              src={featured.coverImageUrl || ""}
              alt={featured.name}
              className="w-full h-full object-cover"
              loading="eager"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/30" />
          </div>
          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex flex-col justify-end pb-10">
            <Badge variant="outline" className="w-fit mb-3 border-primary text-primary">
              {t("home.featured")}
            </Badge>
            <h1 className="text-3xl md:text-5xl font-bold mb-2 max-w-2xl">{featured.name}</h1>
            <div className="flex flex-wrap items-center gap-4 text-muted-foreground mb-4">
              {featured.startsAt && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" />
                  {formatDateRange(featured.startsAt, featured.endsAt || featured.startsAt, featured.dayCount > 1)}
                </span>
              )}
              {featured.venueAddress && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" />
                  {featured.venueAddress}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Link href={`/event/${featured.id}`}>
                <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2">
                  {t("home.hero.cta")}
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </Link>
              {featured.priceFrom > 0 && (
                <span className="text-lg font-semibold">
                  {t("home.from")} {formatPrice(featured.priceFrom)}
                </span>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder={t("nav.search")}
              className="pl-10 bg-card"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setVisibleCount(ITEMS_PER_PAGE); }}
            />
          </div>
          <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setVisibleCount(ITEMS_PER_PAGE); }}>
            <SelectTrigger className="w-full md:w-48 bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c === "all" ? t("home.filters.all") : t(`home.filters.${c}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={cityFilter} onValueChange={(v) => { setCityFilter(v); setVisibleCount(ITEMS_PER_PAGE); }}>
            <SelectTrigger className="w-full md:w-48 bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {cities.map((c) => (
                <SelectItem key={c} value={c}>
                  {c === "all" ? t("home.filters.allCities") : c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setSearchQuery(""); setCategoryFilter("all"); setCityFilter("all"); setVisibleCount(ITEMS_PER_PAGE); }}
              className="gap-1"
            >
              <X className="w-4 h-4" />
              {t("home.filters.clearFilters")}
            </Button>
          )}
        </div>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">{t("home.events")}</h2>
          <span className="text-sm text-muted-foreground">
            {t("home.showingOf", { shown: visibleEvents.length, total: filteredEvents.length })}
          </span>
        </div>

        {filteredEvents.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-xl font-semibold mb-2">{t("home.noEvents")}</p>
            <p className="text-muted-foreground">{t("home.noEventsDesc")}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {visibleEvents.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
            {visibleCount < filteredEvents.length && (
              <div className="text-center mt-8">
                <Button
                  variant="outline"
                  onClick={() => setVisibleCount((c) => c + ITEMS_PER_PAGE)}
                >
                  {t("home.loadMore")}
                </Button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function EventCard({ event }: { event: ApiEvent }) {
  const { t } = useTranslation();

  return (
    <Link href={`/event/${event.id}`}>
      <div className="group bg-card border border-card-border rounded-xl overflow-hidden hover:border-primary/50 transition-all duration-200 cursor-pointer">
        <div className="relative aspect-square overflow-hidden">
          <img
            src={event.coverImageUrl || ""}
            alt={event.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
          <div className="absolute bottom-3 left-3">
            {event.category && (
              <Badge variant="secondary" className="bg-background/80 backdrop-blur-sm text-xs">
                {t(`home.filters.${event.category}` as any) || event.category}
              </Badge>
            )}
          </div>
        </div>
        <div className="p-4">
          <h3 className="font-semibold text-lg mb-1 line-clamp-2 group-hover:text-primary transition-colors">
            {event.name}
          </h3>
          {event.startsAt && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              <span>{formatDateRange(event.startsAt, event.endsAt || event.startsAt, event.dayCount > 1)}</span>
            </div>
          )}
          {event.venueAddress && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-3">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{event.venueAddress}</span>
            </div>
          )}
          {event.priceFrom > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {t("home.from")} <span className="text-primary font-bold">{formatPrice(event.priceFrom)}</span>
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
