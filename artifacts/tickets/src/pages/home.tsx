import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearch } from "wouter";
import { Calendar, MapPin, Search, X, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { mockEvents, formatPrice, formatDateRange } from "@/data/mockEvents";

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

  const categories = ["all", "concerts", "festivals", "sports", "theater"];
  const cities = useMemo(() => {
    const c = new Set(mockEvents.map((e) => e.city));
    return ["all", ...Array.from(c).sort()];
  }, []);

  const filteredEvents = useMemo(() => {
    return mockEvents.filter((event) => {
      if (!event.active) return false;
      if (searchQuery && !event.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (categoryFilter !== "all" && event.category !== categoryFilter) return false;
      if (cityFilter !== "all" && event.city !== cityFilter) return false;
      return true;
    });
  }, [searchQuery, categoryFilter, cityFilter]);

  const visibleEvents = filteredEvents.slice(0, visibleCount);
  const featured = mockEvents.find((e) => e.active && e.status !== "sold_out") || mockEvents[0];

  const hasFilters = searchQuery || categoryFilter !== "all" || cityFilter !== "all";

  return (
    <div className="min-h-screen">
      <section className="relative h-[420px] md:h-[500px] overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={featured.coverImage}
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
            <span className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              {formatDateRange(featured.startsAt, featured.endsAt, featured.isMultiDay)}
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4" />
              {featured.venueName}, {featured.city}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link href={`/event/${featured.id}`}>
              <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2">
                {t("home.hero.cta")}
                <ChevronRight className="w-4 h-4" />
              </Button>
            </Link>
            <span className="text-lg font-semibold">
              {t("home.from")} {formatPrice(featured.priceFrom, featured.currencyCode)}
            </span>
          </div>
        </div>
      </section>

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

function EventCard({ event }: { event: typeof mockEvents[0] }) {
  const { t } = useTranslation();

  const statusBadge = () => {
    switch (event.status) {
      case "available":
        return <Badge className="rounded-full bg-black/70 text-emerald-400 border-emerald-600/50 backdrop-blur-sm">{t("home.available")}</Badge>;
      case "limited":
        return <Badge className="rounded-full bg-black/70 text-amber-400 border-amber-600/50 backdrop-blur-sm">{t("home.limited")}</Badge>;
      case "sold_out":
        return <Badge className="rounded-full bg-black/70 text-red-400 border-red-600/50 backdrop-blur-sm">{t("home.soldOut")}</Badge>;
    }
  };

  return (
    <Link href={`/event/${event.id}`}>
      <div className="group bg-card border border-card-border rounded-xl overflow-hidden hover:border-primary/50 transition-all duration-200 cursor-pointer">
        <div className="relative aspect-square overflow-hidden">
          <img
            src={event.flyerImage || event.coverImage}
            alt={event.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
          <div className="absolute top-3 right-3">
            {statusBadge()}
          </div>
          <div className="absolute bottom-3 left-3">
            <Badge variant="secondary" className="bg-background/80 backdrop-blur-sm text-xs">
              {t(`home.filters.${event.category}` as any) || event.category}
            </Badge>
          </div>
        </div>
        <div className="p-4">
          <h3 className="font-semibold text-lg mb-1 line-clamp-2 group-hover:text-primary transition-colors">
            {event.name}
          </h3>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            <span>{formatDateRange(event.startsAt, event.endsAt, event.isMultiDay)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-3">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{event.venueName}, {event.city}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              {t("home.from")} <span className="text-primary font-bold">{formatPrice(event.priceFrom, event.currencyCode)}</span>
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
