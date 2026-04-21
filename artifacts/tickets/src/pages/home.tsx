import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearch } from "wouter";
import { Calendar, MapPin, Search, X, ChevronRight, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchEvents, fetchAds, resolveImageUrl, type ApiEvent, type ApiAd } from "@/lib/api";
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

  const { data: adsData } = useQuery({
    queryKey: ["ads"],
    queryFn: fetchAds,
    staleTime: 60_000,
  });
  const ads = adsData?.ads ?? [];

  const events = data?.events ?? [];

  const categories = ["all", "concerts", "festivals", "sports", "theater"];
  const cities = useMemo(() => {
    const c = new Set<string>();
    const countryNames = new Set(["colombia", "argentina", "mexico", "méxico", "brasil", "brazil", "chile", "peru", "perú", "ecuador", "usa", "united states", "venezuela", "panamá", "panama"]);
    const colombianDepts = new Set(["antioquia", "cundinamarca", "valle del cauca", "atlántico", "atlantico", "santander", "boyacá", "boyaca", "bolívar", "bolivar", "nariño", "narino", "tolima", "huila", "caldas", "risaralda", "quindío", "quindio", "meta", "cesar", "magdalena", "córdoba", "cordoba", "cauca", "sucre"]);
    events.forEach((e) => {
      if (e.venueAddress) {
        const parts = e.venueAddress.split(",").map((p) => p.trim()).filter(Boolean);
        if (parts.length >= 2 && countryNames.has(parts[parts.length - 1].toLowerCase())) {
          parts.pop();
        }
        if (parts.length >= 2 && colombianDepts.has(parts[parts.length - 1].toLowerCase())) {
          parts.pop();
        }
        const cityPart = parts[parts.length - 1];
        if (cityPart) c.add(cityPart);
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
  const heroEvents = events.filter((e) => e.coverImageUrl);

  const hasFilters = searchQuery || categoryFilter !== "all" || cityFilter !== "all";

  const [heroIndex, setHeroIndex] = useState(0);
  const [heroFade, setHeroFade] = useState(true);
  const heroTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const heroCount = heroEvents.length;

  const goToSlide = useCallback((idx: number) => {
    setHeroFade(false);
    setTimeout(() => {
      setHeroIndex(idx);
      setHeroFade(true);
    }, 500);
  }, []);

  useEffect(() => {
    if (heroCount <= 1) return;
    heroTimerRef.current = setInterval(() => {
      goToSlide((heroIndex + 1) % heroCount);
    }, 6000);
    return () => { if (heroTimerRef.current) clearInterval(heroTimerRef.current); };
  }, [heroIndex, heroCount, goToSlide]);

  const handleDotClick = (idx: number) => {
    if (heroTimerRef.current) clearInterval(heroTimerRef.current);
    goToSlide(idx);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  const currentHero = heroEvents[heroIndex] || events[0];

  return (
    <div className="min-h-screen">
      {currentHero && (
        <section className="relative h-[420px] md:h-[500px] overflow-hidden">
          {heroEvents.map((evt, i) => (
            <div
              key={evt.id}
              className="absolute inset-0 transition-opacity duration-700 ease-in-out"
              style={{ opacity: i === heroIndex && heroFade ? 1 : 0, zIndex: i === heroIndex ? 1 : 0 }}
            >
              <img
                src={resolveImageUrl(evt.coverImageUrl)}
                alt={evt.name}
                className="w-full h-full object-cover"
                loading={i === 0 ? "eager" : "lazy"}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/30" />
            </div>
          ))}
          <div
            className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-end pb-10 transition-opacity duration-500 ease-in-out"
            style={{ opacity: heroFade ? 1 : 0 }}
          >
            <div className="flex-1 min-w-0">
              <Badge variant="outline" className="w-fit mb-3 border-primary text-primary">
                {t("home.featured")}
              </Badge>
              <h1 className="text-3xl md:text-5xl font-bold mb-2 max-w-2xl">{currentHero.name}</h1>
              <div className="flex flex-wrap items-center gap-4 text-muted-foreground mb-4">
                {currentHero.startsAt && (
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4" />
                    {formatDateRange(currentHero.startsAt, currentHero.endsAt || currentHero.startsAt, currentHero.dayCount > 1)}
                  </span>
                )}
                {currentHero.venueAddress && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-4 h-4" />
                    {currentHero.venueAddress}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Link href={`/event/${currentHero.slug || currentHero.id}`}>
                  <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2">
                    {t("home.hero.cta")}
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </Link>
                {currentHero.priceFrom > 0 && (
                  <span className="text-lg font-semibold">
                    {t("home.from")} {formatPrice(currentHero.priceFrom)}
                  </span>
                )}
              </div>
              {heroCount > 1 && (
                <div className="flex items-center gap-2 mt-5">
                  {heroEvents.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => handleDotClick(i)}
                      className={`rounded-full transition-all duration-300 ${i === heroIndex ? "w-8 h-2.5 bg-primary" : "w-2.5 h-2.5 bg-white/40 hover:bg-white/60"}`}
                    />
                  ))}
                </div>
              )}
            </div>
            {resolveImageUrl(currentHero.flyerImageUrl) && (
              <div className="hidden md:block flex-shrink-0 ml-8">
                <img
                  src={resolveImageUrl(currentHero.flyerImageUrl)}
                  alt={`${currentHero.name} flyer`}
                  className="h-[340px] w-auto rounded-xl shadow-2xl shadow-black/50 object-contain border border-white/10"
                />
              </div>
            )}
          </div>
        </section>
      )}

      {ads.length > 0 && <AdsBanner ads={ads} />}

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

function AdsBanner({ ads }: { ads: ApiAd[] }) {
  const [idx, setIdx] = useState(0);
  const [fade, setFade] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const count = ads.length;

  const goTo = useCallback((i: number) => {
    setFade(false);
    setTimeout(() => { setIdx(i); setFade(true); }, 400);
  }, []);

  useEffect(() => {
    if (count <= 1) return;
    timerRef.current = setInterval(() => goTo((idx + 1) % count), 5000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [idx, count, goTo]);

  const ad = ads[idx];
  if (!ad) return null;

  const inner = (
    <div
      className="relative w-full overflow-hidden rounded-xl border border-border"
      style={{ transition: "opacity 0.4s", opacity: fade ? 1 : 0 }}
    >
      <img
        src={resolveImageUrl(ad.imageUrl)}
        alt={ad.title}
        className="w-full h-[120px] sm:h-[160px] md:h-[200px] object-cover"
      />
      {count > 1 && (
        <div className="absolute bottom-2 right-3 flex gap-1.5">
          {ads.map((_, i) => (
            <button
              key={i}
              onClick={(e) => { e.preventDefault(); if (timerRef.current) clearInterval(timerRef.current); goTo(i); }}
              className={`rounded-full transition-all duration-300 ${i === idx ? "w-5 h-2 bg-white" : "w-2 h-2 bg-white/50 hover:bg-white/80"}`}
            />
          ))}
        </div>
      )}
      <div className="absolute top-2 right-2 text-[10px] text-white/60 bg-black/30 px-1.5 py-0.5 rounded">
        Patrocinado
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
      {ad.linkUrl ? (
        <a href={ad.linkUrl} target="_blank" rel="noopener noreferrer" className="block">
          {inner}
        </a>
      ) : inner}
    </div>
  );
}

function EventCard({ event }: { event: ApiEvent }) {
  const { t } = useTranslation();

  return (
    <Link href={`/event/${event.slug || event.id}`}>
      <div className="group bg-card border border-card-border rounded-xl overflow-hidden hover:border-primary/50 transition-all duration-200 cursor-pointer">
        <div className="relative aspect-square overflow-hidden">
          <img
            src={resolveImageUrl(event.flyerImageUrl || event.coverImageUrl)}
            alt={event.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
          <div className="absolute bottom-3 left-3">
            {event.category && (
              <Badge variant="secondary" className="bg-background/80 backdrop-blur-sm text-xs">
                {t(`home.filters.${event.category}`, event.category)}
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
