import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearch } from "wouter";
import { Calendar, MapPin, Search, X, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { fetchEvents, fetchAds, fetchCities, resolveImageUrl, type ApiEvent, type ApiAd, type ApiCity } from "@/lib/api";
import { formatPrice, formatDateRange } from "@/lib/format";
import { SEO } from "@/components/SEO";

const ITEMS_PER_PAGE = 6;

const CATEGORY_ICONS: Record<string, string> = {
  all: "✦",
  concert: "🎵",
  festival: "🎡",
  sports: "🏅",
  theater: "🎭",
  conference: "🎤",
  party: "🎉",
  race: "🏃",
  other: "✨",
};

export default function Home() {
  const { t, i18n } = useTranslation();
  const rawSearch = useSearch();
  const qParam = new URLSearchParams(rawSearch).get("q") || "";
  const [searchQuery, setSearchQuery] = useState(qParam);

  useEffect(() => {
    if (qParam) setSearchQuery(qParam);
  }, [qParam]);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [cityId, setCityId] = useState("");
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);

  const { data, isLoading } = useQuery({
    queryKey: ["events", searchQuery, categoryFilter, cityId],
    queryFn: () => fetchEvents({
      search: searchQuery || undefined,
      category: categoryFilter !== "all" ? categoryFilter : undefined,
      city: cityId || undefined,
    }),
    staleTime: 30_000,
  });

  const { data: adsData } = useQuery({
    queryKey: ["ads"],
    queryFn: fetchAds,
    staleTime: 60_000,
  });

  const { data: citiesData } = useQuery({
    queryKey: ["cities"],
    queryFn: fetchCities,
    staleTime: 5 * 60_000,
  });

  const ads = adsData?.ads ?? [];
  const dbCities: ApiCity[] = citiesData?.cities ?? [];
  const events = data?.events ?? [];

  const categories = ["all", "concert", "festival", "sports", "theater", "conference", "party", "race", "other"];

  const filteredEvents = events;

  const visibleEvents = filteredEvents.slice(0, visibleCount);
  const heroEvents = events.filter((e) => e.coverImageUrl);

  const hasFilters = searchQuery || categoryFilter !== "all" || cityId !== "";

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
      <div className="min-h-screen">
        <div className="h-[420px] md:h-[500px] bg-card animate-pulse" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex gap-3 mb-4 overflow-x-auto pb-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-9 w-28 flex-shrink-0 rounded-full bg-card animate-pulse" />
            ))}
          </div>
          <div className="h-10 rounded-lg bg-card animate-pulse mb-6" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-card rounded-xl overflow-hidden border border-border animate-pulse">
                <div className="aspect-square bg-muted" />
                <div className="p-4 space-y-2">
                  <div className="h-5 bg-muted rounded w-3/4" />
                  <div className="h-4 bg-muted rounded w-1/2" />
                  <div className="h-4 bg-muted rounded w-2/3" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const currentHero = heroEvents[heroIndex] || events[0];

  const homeSchema = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "name": "Tapee Tickets",
        "url": "https://tapeetickets.com",
        "potentialAction": {
          "@type": "SearchAction",
          "target": {
            "@type": "EntryPoint",
            "urlTemplate": "https://tapeetickets.com/?q={search_term_string}"
          },
          "query-input": "required name=search_term_string"
        }
      },
      {
        "@type": "Organization",
        "name": "Tapee",
        "url": "https://tapeetickets.com",
        "logo": {
          "@type": "ImageObject",
          "url": "https://tapeetickets.com/favicon.png"
        },
        "contactPoint": {
          "@type": "ContactPoint",
          "contactType": "customer support",
          "email": "soporte@tapee.app",
          "areaServed": "CO",
          "availableLanguage": "Spanish"
        }
      }
    ]
  });

  return (
    <div className="min-h-screen">
      <SEO schema={homeSchema} />

      {/* ── Hero carousel ─────────────────────────────────────────────────── */}
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
                fetchPriority={i === 0 ? "high" : "auto"}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/30" />
            </div>
          ))}
          <div
            className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-end pb-10 transition-opacity duration-500 ease-in-out"
            style={{ opacity: heroFade ? 1 : 0 }}
          >
            <div className="flex-1 min-w-0">
              <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-5 md:p-7 max-w-xl shadow-xl">
                <Badge variant="outline" className="w-fit mb-3 border-primary/60 text-primary bg-primary/10">
                  {t("home.featured")}
                </Badge>
                <h1 className="text-2xl md:text-4xl font-bold mb-3 leading-tight tracking-tight">{currentHero.name}</h1>
                <div className="flex flex-col gap-1.5 text-sm text-white/70 mb-5">
                  {currentHero.startsAt && (
                    <span className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-primary shrink-0" />
                      {formatDateRange(currentHero.startsAt, currentHero.endsAt || currentHero.startsAt, currentHero.dayCount > 1)}
                    </span>
                  )}
                  {currentHero.venueAddress && (
                    <span className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                      {currentHero.venueAddress}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Link href={`/event/${currentHero.slug || currentHero.id}`}>
                    <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2 shadow-[0_0_20px_rgba(0,241,255,0.3)]">
                      {t("home.hero.cta")}
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </Link>
                  <span className="text-base font-semibold text-white">
                    {currentHero.externalTicketingUrl ? (
                      <span className="text-primary">
                        {currentHero.externalTicketingVendorName
                          ? t("home.soldBy", { vendor: currentHero.externalTicketingVendorName, defaultValue: `Vendido por ${currentHero.externalTicketingVendorName}` })
                          : t("home.externalSales", "Venta externa")}
                      </span>
                    ) : currentHero.priceFrom > 0 ? (
                      <>{t("home.from")} <span className="text-primary">{formatPrice(currentHero.priceFrom, "COP", i18n.language)}</span></>
                    ) : (
                      <span className="text-primary">{formatPrice(0, "COP", i18n.language)}</span>
                    )}
                  </span>
                </div>
                {heroCount > 1 && (
                  <div className="flex items-center gap-1 mt-5">
                    {heroEvents.map((evt, i) => (
                      <button
                        key={i}
                        onClick={() => handleDotClick(i)}
                        aria-label={`Ver evento ${evt.name}`}
                        aria-current={i === heroIndex ? "true" : undefined}
                        className="p-2 flex items-center justify-center"
                      >
                        <span className={`rounded-full transition-all duration-300 block ${i === heroIndex ? "w-8 h-2 bg-primary shadow-[0_0_8px_rgba(0,241,255,0.6)]" : "w-2 h-2 bg-white/30 hover:bg-white/50"}`} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
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

      {/* ── Cities row ────────────────────────────────────────────────────── */}
      {dbCities.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
            {t("home.exploreCities", "Explorar por ciudad")}
          </h2>
          <div
            className="flex gap-3 overflow-x-auto py-4 px-3"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {dbCities.map((city) => (
              <CityCard
                key={city.id}
                city={city}
                selected={cityId === city.id}
                onClick={() => {
                  setCityId(cityId === city.id ? "" : city.id);
                  setVisibleCount(ITEMS_PER_PAGE);
                }}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Filters + Events ─────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Category pills */}
        <div className="mb-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
            {t("home.categories", "Categorías")}
          </p>
          <div
            className="flex gap-2 overflow-x-auto py-4 px-3"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => { setCategoryFilter(cat); setVisibleCount(ITEMS_PER_PAGE); }}
                className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                  categoryFilter === cat
                    ? "bg-primary text-primary-foreground shadow-[0_0_12px_rgba(0,241,255,0.35)]"
                    : "bg-card border border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                }`}
              >
                <span>{CATEGORY_ICONS[cat] ?? "✦"}</span>
                {cat === "all" ? t("home.filters.all") : t(`home.filters.${cat}`, cat)}
              </button>
            ))}
          </div>
        </div>

        {/* Search bar */}
        <div className="flex gap-3 mb-6">
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
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setSearchQuery(""); setCategoryFilter("all"); setCityId(""); setVisibleCount(ITEMS_PER_PAGE); }}
              className="gap-1 shrink-0"
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

function CityCard({ city, selected, onClick }: { city: ApiCity; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 relative w-44 h-32 rounded-2xl overflow-hidden transition-all duration-200 ${
        selected
          ? "ring-2 ring-primary shadow-[0_0_16px_rgba(0,241,255,0.45)] scale-[1.03]"
          : "ring-1 ring-border hover:ring-primary/40 hover:scale-[1.02]"
      }`}
    >
      {city.coverImageUrl ? (
        <img
          src={resolveImageUrl(city.coverImageUrl, 400)}
          alt={city.name}
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-muted" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
      <div className="absolute bottom-0 inset-x-0 p-2">
        <span className="text-[11px] font-bold text-white text-center block leading-tight drop-shadow">
          {city.name}
        </span>
      </div>
    </button>
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
        className="w-full object-cover"
        style={{ aspectRatio: "1200/230" }}
      />
      {count > 1 && (
        <div className="absolute bottom-2 right-3 flex gap-0.5">
          {ads.map((a, i) => (
            <button
              key={i}
              onClick={(e) => { e.preventDefault(); if (timerRef.current) clearInterval(timerRef.current); goTo(i); }}
              aria-label={`Ver anuncio ${a.title || i + 1}`}
              aria-current={i === idx ? "true" : undefined}
              className="p-2 flex items-center justify-center"
            >
              <span className={`rounded-full transition-all duration-300 block ${i === idx ? "w-5 h-2 bg-white" : "w-2 h-2 bg-white/50 hover:bg-white/80"}`} />
            </button>
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
  const { t, i18n } = useTranslation();

  return (
    <Link href={`/event/${event.slug || event.id}`}>
      <div className="group bg-card border border-border rounded-xl overflow-hidden cursor-pointer transition-all duration-300 hover:border-primary/40 hover:shadow-[0_0_24px_rgba(0,241,255,0.1)] hover:-translate-y-0.5">
        {/* Image — portrait aspect ratio */}
        <div className="relative aspect-[3/4] overflow-hidden">
          <img
            src={resolveImageUrl(event.flyerImageUrl || event.coverImageUrl)}
            alt={event.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="absolute bottom-0 left-0 right-0 p-3 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
            {event.startsAt && (
              <div className="flex items-center gap-1.5 text-xs text-white/90 mb-1">
                <Calendar className="w-3 h-3 shrink-0" />
                <span>{formatDateRange(event.startsAt, event.endsAt || event.startsAt, event.dayCount > 1)}</span>
              </div>
            )}
            {event.venueAddress && (
              <div className="flex items-center gap-1.5 text-xs text-white/70">
                <MapPin className="w-3 h-3 shrink-0" />
                <span className="truncate">{event.venueAddress}</span>
              </div>
            )}
          </div>
          {event.category && (
            <div className="absolute top-3 left-3">
              <Badge variant="secondary" className="bg-black/60 backdrop-blur-sm text-xs border-white/10">
                {t(`home.filters.${event.category}`, event.category)}
              </Badge>
            </div>
          )}
        </div>
        {/* Bottom strip — blurred flyer as background */}
        <div className="relative overflow-hidden p-4">
          <div
            className="absolute inset-0 scale-110"
            style={{
              backgroundImage: `url(${resolveImageUrl(event.flyerImageUrl || event.coverImageUrl)})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: "blur(20px)",
              opacity: 0.35,
            }}
          />
          <div className="absolute inset-0 bg-card/70" />
          <div className="relative z-10">
            <h3 className="font-semibold text-base mb-2 line-clamp-2 group-hover:text-primary transition-colors duration-200 leading-snug tracking-tight">
              {event.name}
            </h3>
            <div className="flex items-center justify-between">
              {event.externalTicketingUrl ? (
                <span className="text-xs font-semibold text-primary uppercase tracking-wide truncate">
                  {event.externalTicketingVendorName
                    ? t("home.soldBy", { vendor: event.externalTicketingVendorName, defaultValue: `Vendido por ${event.externalTicketingVendorName}` })
                    : t("home.externalSales", "Venta externa")}
                </span>
              ) : event.priceFrom > 0 ? (
                <span className="text-sm text-muted-foreground">
                  {t("home.from")} <span className="text-primary font-bold">{formatPrice(event.priceFrom, "COP", i18n.language)}</span>
                </span>
              ) : (
                <span className="text-sm font-bold text-primary">{formatPrice(0, "COP", i18n.language)}</span>
              )}
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all duration-200" />
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
