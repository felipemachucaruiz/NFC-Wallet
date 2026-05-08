import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useRoute, useLocation } from "wouter";
import { Calendar, MapPin, Shield, User as UserIcon, ChevronDown, ChevronUp, ExternalLink, X, Briefcase, DoorOpen, Info } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { formatPrice, formatFullDate } from "@/lib/format";
import type { EventData, TicketType } from "@/data/types";
import { VenueMap } from "@/components/VenueMap";
import { FloatingGraphics } from "@/components/FloatingGraphics";
import { TicketSelector } from "@/components/TicketSelector";
import { SEO } from "@/components/SEO";
import { fetchEventDetail, resolveImageUrl, ApiError, type ApiEventDetail } from "@/lib/api";

const GOOGLE_MAPS_API_KEY = "AIzaSyCyI7QJ3J5_Peqnr4bqFXAIqaeac1DuT_c";

const TAPEE_MAP_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#0a0a0a" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#6b7280" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0a0a0a" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#1a1a2e" }] },
  { featureType: "administrative.country", elementType: "labels.text.fill", stylers: [{ color: "#4b5563" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#7dd3fc" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#111111" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#4b5563" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#0d1a0d" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1e1e2e" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#111111" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#4b5563" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#252538" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#00f1ff", weight: 0.4 }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#111111" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#040d12" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#00f1ff", lightness: -60 }] },
];

// Singleton loader — avoids appending the script more than once per page
let gmapsReady = typeof window !== "undefined" && !!(window as any).google?.maps;
const gmapsCallbacks: Array<() => void> = [];
function loadGoogleMaps(cb: () => void) {
  if (gmapsReady) { cb(); return; }
  gmapsCallbacks.push(cb);
  if (document.querySelector(`script[src*="maps.googleapis.com"]`)) return;
  const s = document.createElement("script");
  s.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}`;
  s.async = true;
  s.onload = () => { gmapsReady = true; gmapsCallbacks.splice(0).forEach((f) => f()); };
  document.head.appendChild(s);
}

function GoogleMapEmbed({ lat, lng }: { lat: number; lng: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    loadGoogleMaps(() => {
      if (!containerRef.current || mapRef.current) return;
      const g = (window as any).google.maps;
      const map = new g.Map(containerRef.current, {
        center: { lat, lng },
        zoom: 15,
        styles: TAPEE_MAP_STYLES,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        zoomControl: true,
      });
      new g.Marker({ position: { lat, lng }, map });
      mapRef.current = map;
    });
    return () => { mapRef.current = null; };
  }, [lat, lng]);

  return <div ref={containerRef} style={{ width: "100%", height: "250px", backgroundColor: "#0a0a0a", position: "relative", zIndex: 0 }} />;
}

function extractVimeoId(url: string): string | null {
  const match = url.match(/(?:vimeo\.com\/(?:[^/]+\/)*)(\d+)/);
  if (match) return match[1];
  if (/^\d+$/.test(url.trim())) return url.trim();
  return null;
}

function VimeoEmbed({ videoId, title }: { videoId: string; title: string }) {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    fetch(`https://vimeo.com/api/oembed.json?url=https://vimeo.com/${videoId}`)
      .then((r) => r.json())
      .then((d) => { if (d.width && d.height) setDims({ w: d.width, h: d.height }); })
      .catch(() => {});
  }, [videoId]);

  const paddingBottom = dims ? `${(dims.h / dims.w) * 100}%` : "56.25%";
  const isPortrait = dims ? dims.h > dims.w : false;

  return (
    // On desktop cap portrait videos to phone-width so they don't fill the whole column
    <div className="w-full mx-auto" style={{ maxWidth: isPortrait ? "360px" : "100%" }}>
    <div
      className="relative w-full rounded-xl overflow-hidden border border-border bg-black"
      style={{ paddingBottom }}
    >
      <iframe
        src={`https://player.vimeo.com/video/${videoId}?color=00f1ff&title=0&byline=0&portrait=0&dnt=1&background=0`}
        className="absolute inset-0 w-full h-full"
        style={{ border: 0, display: "block", backgroundColor: "black" }}
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        title={title}
      />
    </div>
    </div>
  );
}

function mapApiToEventData(detail: ApiEventDetail): EventData {
  const { event, eventDays, venues, sections, ticketTypes } = detail;
  const venue = venues[0];

  const mappedDays = eventDays.map((d, i) => ({
    dayNumber: i + 1,
    label: d.label || `Day ${i + 1}`,
    date: d.date,
    doorTime: d.doorsOpenAt ? new Date(d.doorsOpenAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) : "N/A",
  }));

  const dayIdToLabel = new Map(eventDays.map((d) => [d.id, d.label || d.date]));

  const mappedTicketTypes: TicketType[] = ticketTypes.map((tt) => {
    let status: "available" | "limited" | "sold_out" = "available";
    if (tt.available <= 0) status = "sold_out";
    else if (tt.available < tt.total * 0.1) status = "limited";

    const validDaysStr = tt.validEventDayIds
      ? tt.validEventDayIds.map((id) => dayIdToLabel.get(id) || id).join(", ")
      : mappedDays.map((d) => d.label).join(", ");

    const effectivePrice = tt.currentPrice ?? tt.price ?? tt.basePrice ?? 0;

    return {
      id: tt.ticketTypeId,
      name: tt.name,
      validDays: validDaysStr,
      price: effectivePrice,
      basePrice: tt.basePrice ?? tt.price ?? effectivePrice,
      currentStageName: tt.currentStageName ?? null,
      serviceFee: tt.serviceFee ?? 0,
      serviceFeeType: (tt.serviceFeeType as "fixed" | "percentage") ?? "fixed",
      availableCount: tt.available,
      maxPerOrder: tt.isNumberedUnits ? 1 : 6,
      sectionId: tt.sectionId || undefined,
      status,
      pricingStages: tt.pricingStages,
      nextStage: tt.nextStage,
      isNumberedUnits: tt.isNumberedUnits,
      unitLabel: tt.unitLabel,
      ticketsPerUnit: tt.ticketsPerUnit,
      units: tt.units as any,
    };
  });

  const mappedSections = sections.map((sec) => {
    const sectionTickets = mappedTicketTypes.filter((tt) => tt.sectionId === sec.id);
    let sectionStatus: "available" | "limited" | "sold_out" | "na" = "na";
    if (sectionTickets.length > 0) {
      if (sectionTickets.every((t) => t.status === "sold_out")) sectionStatus = "sold_out";
      else if (sectionTickets.some((t) => t.status === "limited")) sectionStatus = "limited";
      else sectionStatus = "available";
    }

    return {
      id: sec.id,
      name: sec.name,
      sectionType: sec.sectionType || "",
      svgPath: sec.svgPathData || "",
      color: sec.colorHex || "#22c55e",
      status: sectionStatus,
      ticketTypes: sectionTickets,
    };
  });

  const unsectionedTickets = mappedTicketTypes.filter((tt) => !tt.sectionId);
  if (unsectionedTickets.length > 0 && sections.length === 0) {
    mappedSections.push({
      id: "sec-default",
      name: "General",
      sectionType: "",
      svgPath: "",
      color: "#22c55e",
      status: unsectionedTickets.every((t) => t.status === "sold_out") ? "sold_out" : "available",
      ticketTypes: unsectionedTickets,
    });
  }

  const allSoldOut = mappedTicketTypes.length > 0 && mappedTicketTypes.every((t) => t.status === "sold_out");
  const anyLimited = mappedTicketTypes.some((t) => t.status === "limited");

  const priceFrom = mappedTicketTypes.length > 0 ? Math.min(...mappedTicketTypes.map((t) => t.price)) : 0;

  return {
    id: event.id,
    name: event.name,
    description: event.longDescription || event.description || "",
    descriptionEn: event.descriptionEn || null,
    coverImage: resolveImageUrl(event.coverImageUrl),
    flyerImage: resolveImageUrl(event.flyerImageUrl),
    floorplanImage: venue?.floorplanImageUrl ? resolveImageUrl(venue.floorplanImageUrl) : "",
    category: event.category || "",
    venueName: venue?.name || "",
    venueAddress: event.venueAddress || venue?.address || "",
    city: venue?.city || "",
    promoterCompanyName: detail.promoterCompany?.companyName || "",
    promoterNit: detail.promoterCompany?.nit || "",
    pulepId: event.pulepId || "",
    startsAt: event.startsAt || "",
    endsAt: event.endsAt || "",
    timezone: "America/Bogota",
    minAge: event.minAge,
    organizer: "",
    latitude: event.latitude ? parseFloat(event.latitude) : 0,
    longitude: event.longitude ? parseFloat(event.longitude) : 0,
    priceFrom,
    currencyCode: event.currencyCode || "COP",
    isMultiDay: eventDays.length > 1,
    days: mappedDays,
    ticketTypes: mappedTicketTypes,
    sections: mappedSections,
    salesStartAt: null,
    status: allSoldOut ? "sold_out" : anyLimited ? "limited" : "available",
    active: true,
    floatingGraphicUrl: resolveImageUrl(event.floatingGraphicUrl) || null,
    floatingGraphics: event.floatingGraphics?.length
      ? event.floatingGraphics.map((g) => ({ url: resolveImageUrl(g.url) || g.url, opacity: g.opacity }))
      : null,
    vimeoUrl: event.vimeoUrl || null,
  };
}

export default function EventDetail() {
  const { t, i18n } = useTranslation();
  const [, params] = useRoute("/event/:id");
  const [, navigate] = useLocation();
  const [showFlyer, setShowFlyer] = useState(false);
const [selectedTicket, setSelectedTicket] = useState<TicketType | null>(null);
  const [selectedSectionName, setSelectedSectionName] = useState("");
  const [preSelectedUnitId, setPreSelectedUnitId] = useState<string | null>(null);
  const [highlightedSectionId, setHighlightedSectionId] = useState<string | null>(null);

  const { data: detail, isLoading, error: fetchError } = useQuery({
    queryKey: ["event-detail", params?.id],
    queryFn: () => fetchEventDetail(params!.id),
    enabled: !!params?.id,
    staleTime: 30_000,
  });

  const event = useMemo(() => detail ? mapApiToEventData(detail) : undefined, [detail]);

  const handleSectionClick = useCallback((sectionId: string) => {
    setHighlightedSectionId(sectionId);
    if (!event) return;
    const section = event.sections.find((s) => s.id === sectionId);
    if (section && section.ticketTypes.length > 0) {
      const availableTicket = section.ticketTypes.find((tt) => tt.status !== "sold_out");
      if (availableTicket) {
        setSelectedTicket(availableTicket);
        setSelectedSectionName(section.name);
      }
      const el = document.getElementById(`section-group-${sectionId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
    setTimeout(() => setHighlightedSectionId(null), 3000);
  }, [event]);

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <div className="h-[300px] md:h-[420px] bg-card/80 animate-pulse" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 space-y-4">
          <div className="h-24 bg-card/80 rounded-xl animate-pulse" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-4">
              <div className="h-40 bg-card/80 rounded-xl animate-pulse" />
              <div className="h-60 bg-card/80 rounded-xl animate-pulse" />
            </div>
            <div className="h-80 bg-card/80 rounded-xl animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (!event || fetchError) {
    const is404 = !fetchError || (fetchError instanceof ApiError && fetchError.status === 404);
    return (
      <div className="min-h-screen flex items-center justify-center flex-col gap-3">
        <p className="text-muted-foreground">
          {is404 ? t("common.eventNotFound") : t("common.somethingWentWrong", "Something went wrong. Please try again later.")}
        </p>
        {!is404 && (
          <button
            className="text-primary underline text-sm"
            onClick={() => window.location.reload()}
          >
            {t("common.retry", "Retry")}
          </button>
        )}
      </div>
    );
  }

  const isSoldOut = event.status === "sold_out";
  const isEventEnded = event.endsAt ? new Date(event.endsAt) < new Date() : false;
  const salesNotStarted = event.salesStartAt && new Date(event.salesStartAt) > new Date();

  const handleTicketSelect = (ticket: TicketType, sectionName: string) => {
    setPreSelectedUnitId(null);
    setSelectedTicket(ticket);
    setSelectedSectionName(sectionName);
  };

  const handleUnitSelect = (ticket: TicketType, unit: { id: string; unitLabel: string }) => {
    const section = event.sections.find((s) => s.ticketTypes.some((tt) => tt.id === ticket.id));
    setPreSelectedUnitId(unit.id);
    setSelectedTicket(ticket);
    setSelectedSectionName(section?.name || ticket.name);
  };

  const schemaObj = useMemo(() => {
    if (!event) return null;
    const eventUrl = `https://tapeetickets.com/event/${params?.id}`;
    const images = [event.coverImage, event.flyerImage].filter(Boolean);
    return {
      "@context": "https://schema.org",
      "@type": "Event",
      "name": event.name,
      "description": event.description?.replace(/<[^>]*>?/gm, '') || event.name,
      "image": images,
      "url": eventUrl,
      "startDate": event.startsAt,
      "endDate": event.endsAt || event.startsAt,
      "eventStatus": "https://schema.org/EventScheduled",
      "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
      "location": {
        "@type": "Place",
        "name": event.venueName || "TBD",
        "address": {
          "@type": "PostalAddress",
          "streetAddress": event.venueAddress || "",
          "addressLocality": event.city || "",
          "addressCountry": "CO"
        },
        ...(event.latitude && event.longitude ? {
          "geo": {
            "@type": "GeoCoordinates",
            "latitude": event.latitude,
            "longitude": event.longitude
          }
        } : {})
      },
      "offers": event.ticketTypes.length > 0 ? event.ticketTypes.map(tt => ({
        "@type": "Offer",
        "name": tt.name,
        "price": tt.price,
        "priceCurrency": event.currencyCode,
        "availability": tt.status === "sold_out" ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
        "url": eventUrl,
        "validFrom": event.startsAt
      })) : undefined,
      "organizer": event.promoterCompanyName ? {
        "@type": "Organization",
        "name": event.promoterCompanyName,
        "url": "https://tapeetickets.com"
      } : undefined
    };
  }, [event, params?.id]);

  const schemaStr = schemaObj ? JSON.stringify(schemaObj) : undefined;

  return (
    <div className="min-h-screen">
      {event && (
        <SEO 
          title={`${event.name} | Tapee Tickets`}
          description={event.description?.replace(/<[^>]*>?/gm, '').substring(0, 160) || `Compra boletas para ${event.name}`}
          image={event.coverImage}
          url={`https://tapeetickets.com/event/${params?.id}`}
          schema={schemaStr}
        />
      )}
      {/* Full-viewport flyer background */}
      <div
        className="fixed inset-0 z-0"
        style={{
          backgroundImage: `url(${event.flyerImage ?? event.coverImage})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      {/* Frosted glass overlay */}
      <div className="fixed inset-0 z-0 backdrop-blur-3xl bg-background/80" />

      {/* Floating graphic layer — above frosted overlay, below content cards */}
      {event.floatingGraphics?.length && <FloatingGraphics graphics={event.floatingGraphics} />}

      <div className="relative z-10">
      {/* min-h-[320px] ensures the hero is never shorter than 320px on mobile;
          the 1920/500 aspect ratio takes over once the viewport is wide enough (~1230px) */}
      <div className="relative h-[380px] lg:h-[460px] overflow-hidden">
        <img
          src={event.coverImage}
          alt={event.name}
          className="absolute inset-0 w-full h-full object-cover"
          loading="eager"
          style={{
            WebkitMaskImage: "linear-gradient(to bottom, black 50%, transparent 100%)",
            maskImage: "linear-gradient(to bottom, black 50%, transparent 100%)",
          }}
        />
        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto flex items-end justify-between gap-6">
          <div className="flex-1 min-w-0">
            <div className="bg-black/50 backdrop-blur-md border border-white/10 rounded-2xl p-3 sm:p-5 max-w-xl shadow-xl">
              {event.category && (
                <Badge variant="secondary" className="mb-3 bg-primary/10 border-primary/40 text-primary">{t(`home.filters.${event.category}`, event.category)}</Badge>
              )}
              <h1 className="text-xl sm:text-2xl md:text-4xl font-bold mb-2 sm:mb-3 leading-tight tracking-tight">{event.name}</h1>
              <div className="flex flex-col gap-1.5 text-sm text-white/70">
                {event.startsAt && (
                  <span className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-primary shrink-0" />
                    {formatFullDate(event.startsAt, i18n.language)}
                  </span>
                )}
                <span className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                  {event.venueName ? `${event.venueName}, ` : ""}{event.city || event.venueAddress}
                </span>
              </div>
            </div>
          </div>
          {event.flyerImage && (
            <div
              className="hidden md:block flex-shrink-0 cursor-pointer hover:opacity-90 transition-opacity relative"
              onClick={() => setShowFlyer(true)}
            >
              <img
                src={event.flyerImage}
                alt="Flyer"
                className="h-[280px] lg:h-[340px] w-auto rounded-xl shadow-2xl shadow-black/50 object-contain border border-white/10"
                loading="eager"
              />
              <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background to-transparent rounded-b-xl pointer-events-none" />
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {/* Venue — own card so the full name wraps instead of truncating */}
        {(event.venueName || event.venueAddress) && (
          <div className="bg-card/80 rounded-xl border border-border p-4 mb-4">
            <div className="flex items-start gap-3 border-l-2 border-primary pl-3">
              <MapPin className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">{t("event.venue", "Lugar")}</p>
                <p className="text-sm font-semibold leading-snug break-words">
                  {event.venueName && event.venueName.toLowerCase() !== event.name.toLowerCase()
                    ? event.venueName
                    : event.venueAddress || event.venueName}
                </p>
                {event.venueAddress
                  && event.venueName
                  && event.venueName.toLowerCase() !== event.name.toLowerCase()
                  && event.venueAddress !== event.venueName && (
                  <p className="text-xs text-muted-foreground mt-0.5 break-words">{event.venueAddress}</p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="bg-card/80 rounded-xl border border-border p-4 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <EventInfoItem
              icon={<Calendar className="w-5 h-5 text-primary" />}
              label={t("event.date", "Fecha")}
              value={event.days.length > 0
                ? event.days.map((d) => new Date(d.date).toLocaleDateString(i18n.language === "es" ? "es-CO" : "en-US", { day: "numeric", month: "short" })).join(", ")
                : formatFullDate(event.startsAt, i18n.language)}
            />
            <EventInfoItem
              icon={<DoorOpen className="w-5 h-5 text-primary" />}
              label={t("event.doorOpening", "Apertura de Puertas")}
              value={event.days[0]?.doorTime || "—"}
            />
            {event.minAge ? (
              <EventInfoItem
                icon={<Shield className="w-5 h-5 text-primary" />}
                label={t("event.minAge", "Edad Mínima")}
                value={`${event.minAge} ${t("event.years", "años")}`}
              />
            ) : (
              <EventInfoItem
                icon={<Shield className="w-5 h-5 text-primary" />}
                label={t("event.minAge", "Edad Mínima")}
                value={t("event.allAges", "Todas las edades")}
              />
            )}
          </div>
        </div>

        {(event.promoterCompanyName || event.promoterNit || event.pulepId) && (
          <div className="bg-card/80 rounded-xl border border-border p-4 mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {event.promoterCompanyName && (
                <EventInfoItem
                  icon={<Briefcase className="w-5 h-5 text-primary" />}
                  label={t("event.promoter", "Responsable")}
                  value={event.promoterCompanyName}
                />
              )}
              {event.promoterNit && (
                <EventInfoItem
                  icon={<Info className="w-5 h-5 text-primary" />}
                  label="Nit"
                  value={event.promoterNit}
                />
              )}
              {event.pulepId && (
                <EventInfoItem
                  icon={<Info className="w-5 h-5 text-primary" />}
                  label="Pulep"
                  value={event.pulepId}
                />
              )}
            </div>
          </div>
        )}
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            {event.flyerImage && (
              <div
                className="md:hidden w-full rounded-lg overflow-hidden border border-border cursor-pointer hover:opacity-90 transition-opacity relative"
                onClick={() => setShowFlyer(true)}
              >
                <img src={event.flyerImage} alt="Flyer" className="w-full max-h-64 object-contain" loading="lazy" />
                <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background to-transparent pointer-events-none" />
              </div>
            )}

            {(event.description || event.descriptionEn) && (() => {
              const desc = i18n.language.startsWith("en") && event.descriptionEn
                ? event.descriptionEn
                : event.description;
              return desc ? (
                <div className="rounded-xl border border-border bg-card/80 px-5 py-4">
                  <h2 className="text-xl font-semibold mb-3">{t("event.description")}</h2>
                  <div
                    className="prose prose-invert max-w-none text-muted-foreground"
                    dangerouslySetInnerHTML={{ __html: desc }}
                  />
                </div>
              ) : null;
            })()}

            {event.vimeoUrl && extractVimeoId(event.vimeoUrl) && (
              <div>
                <h2 className="text-xl font-semibold mb-4">{t("event.video", "Video")}</h2>
                <VimeoEmbed videoId={extractVimeoId(event.vimeoUrl!)!} title={event.name} />
              </div>
            )}

            {event.isMultiDay && event.days.length > 1 && (
              <div>
                <h2 className="text-xl font-semibold mb-4">{t("event.schedule")}</h2>
                <div className="space-y-3">
                  {event.days.map((day) => (
                    <div key={day.dayNumber} className="flex items-center gap-4 p-3 bg-card/80 rounded-lg border border-border">
                      <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold">
                        {day.dayNumber}
                      </div>
                      <div>
                        <p className="font-medium">{day.label}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(day.date).toLocaleDateString(i18n.language === "es" ? "es-CO" : "en-US", { day: "numeric", month: "long" })} — {t("event.doorTime")}: {day.doorTime}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(event.sections.length > 0 || event.floorplanImage) && (
              <div>
                <h2 className="text-xl font-semibold mb-4">{t("venueMap.title")}</h2>
                <VenueMap event={event} onSelectTicket={handleTicketSelect} onSelectUnit={handleUnitSelect} onSectionClick={handleSectionClick} selectedUnitId={preSelectedUnitId} />
              </div>
            )}

            {event.latitude !== 0 && event.longitude !== 0 && (
              <div>
                <h2 className="text-xl font-semibold mb-4">{t("event.location")}</h2>
                <div className="bg-card/80 rounded-lg border border-border overflow-hidden">
                  <div className="p-4">
                    {event.venueName && <p className="font-medium">{event.venueName}</p>}
                    {event.venueAddress && <p className="text-sm text-muted-foreground">{event.venueAddress}</p>}
                  </div>
                  <GoogleMapEmbed lat={event.latitude} lng={event.longitude} />
                  <div className="p-3">
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${event.latitude},${event.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-primary hover:underline"
                    >
                      {t("event.getDirections")}
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-1">
            <div className="sticky top-20 space-y-6">
              <div className="bg-card/80 rounded-xl border border-border p-5">
                <h2 className="text-lg font-semibold mb-4">{t("event.pricing")}</h2>
                <SectionTicketGroups
                  event={event}
                  highlightedSectionId={highlightedSectionId}
                  selectedTicketId={selectedTicket?.id || null}
                  onTicketSelect={handleTicketSelect}
                  onSelectionChange={(ticket) => {
                    setSelectedTicket(ticket);
                    if (ticket) {
                      const section = event.sections.find((s) => s.ticketTypes.some((t) => t.id === ticket.id));
                      setSelectedSectionName(section?.name || ticket.name);
                    }
                  }}
                />
                <Separator className="my-4" />
                {isEventEnded ? (
                  <Button disabled className="w-full" size="lg">
                    {t("event.ended")}
                  </Button>
                ) : isSoldOut ? (
                  <Button disabled className="w-full" size="lg">
                    {t("event.soldOut")}
                  </Button>
                ) : salesNotStarted ? (
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground mb-2">{t("event.salesStart")}</p>
                    <Countdown targetDate={event.salesStartAt!} />
                  </div>
                ) : (
                  <Button
                    size="lg"
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_20px_rgba(0,241,255,0.25)] hover:shadow-[0_0_28px_rgba(0,241,255,0.4)] transition-shadow"
                    onClick={() => {
                      const ticketToUse = selectedTicket || event.ticketTypes.find((tt) => tt.status !== "sold_out");
                      if (ticketToUse) {
                        const section = event.sections.find((s) => s.ticketTypes.some((t) => t.id === ticketToUse.id));
                        handleTicketSelect(ticketToUse, section?.name || "");
                      }
                    }}
                  >
                    {selectedTicket
                      ? `${t("event.buyTickets")} — ${formatPrice(selectedTicket.price, event.currencyCode)}`
                      : t("event.buyTickets")}
                  </Button>
                )}
              </div>

              {detail?.guestLists && detail.guestLists.length > 0 && (
                <div className="bg-card/80 rounded-xl border border-border p-5 mt-6">
                  <h2 className="text-lg font-semibold mb-4">{t("event.guestLists", "Guest Lists")}</h2>
                  <div className="space-y-3">
                    {detail.guestLists.map((gl) => (
                      <a
                        key={gl.id}
                        href={`${import.meta.env.BASE_URL}guest-list/${gl.slug}`}
                        className="block p-3 rounded-lg border border-border hover:border-primary/50 transition-colors"
                      >
                        <span className="font-medium text-sm">{gl.name}</span>
                        <p className="text-xs text-muted-foreground mt-1">
                          {gl.maxGuests - gl.currentCount} {t("event.spotsRemaining", "spots remaining")}
                        </p>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <Dialog open={showFlyer} onOpenChange={setShowFlyer}>
        <DialogContent className="max-w-lg p-0 bg-transparent border-0">
          <button
            onClick={() => setShowFlyer(false)}
            className="absolute top-2 right-2 z-10 p-1 rounded-full bg-background/80 text-foreground hover:bg-background"
          >
            <X className="w-5 h-5" />
          </button>
          <img src={event.flyerImage} alt="Flyer" className="w-full rounded-lg" />
        </DialogContent>
      </Dialog>

      {selectedTicket && (
        <TicketSelector
          event={event}
          ticketType={selectedTicket}
          sectionName={selectedSectionName}
          onClose={() => { setSelectedTicket(null); setPreSelectedUnitId(null); }}
          preSelectedUnitId={preSelectedUnitId}
        />
      )}
      </div>
    </div>
  );
}

function SectionTicketGroups({
  event,
  highlightedSectionId,
  selectedTicketId: parentSelectedTicketId,
  onTicketSelect,
  onSelectionChange,
}: {
  event: EventData;
  highlightedSectionId: string | null;
  selectedTicketId: string | null;
  onTicketSelect: (ticket: TicketType, sectionName: string) => void;
  onSelectionChange?: (ticket: TicketType | null) => void;
}) {
  const { t } = useTranslation();
  const [expandedSectionId, setExpandedSectionId] = useState<string | null>(null);

  useEffect(() => {
    if (highlightedSectionId) {
      setExpandedSectionId(highlightedSectionId);
      const el = document.getElementById(`section-group-${highlightedSectionId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightedSectionId]);

  const sectionGroups = useMemo(() => {
    const groups: { sectionId: string; sectionName: string; color: string; tickets: TicketType[] }[] = [];
    const seen = new Set<string>();

    for (const sec of event.sections) {
      if (sec.ticketTypes.length === 0) continue;
      seen.add(sec.id);
      groups.push({
        sectionId: sec.id,
        sectionName: sec.name,
        color: sec.color,
        tickets: sec.ticketTypes,
      });
    }

    const unsectioned = event.ticketTypes.filter((tt) => !tt.sectionId || !seen.has(tt.sectionId));
    if (unsectioned.length > 0 && groups.length === 0) {
      groups.push({
        sectionId: "__unsectioned__",
        sectionName: t("event.generalSection", "General"),
        color: "#22c55e",
        tickets: unsectioned,
      });
    } else if (unsectioned.length > 0) {
      for (const tt of unsectioned) {
        groups.push({
          sectionId: `__single_${tt.id}`,
          sectionName: tt.name,
          color: "#22c55e",
          tickets: [tt],
        });
      }
    }

    return groups;
  }, [event, t]);

  const handleToggle = (sectionId: string) => {
    setExpandedSectionId((prev) => prev === sectionId ? null : sectionId);
  };

  const handleRadioSelect = (ticket: TicketType, sectionName: string) => {
    onSelectionChange?.(ticket);
  };

  return (
    <div className="space-y-2">
      {sectionGroups.map((group) => {
        const isExpanded = expandedSectionId === group.sectionId;
        const isHighlighted = highlightedSectionId === group.sectionId;
        const hasSingleTicket = group.tickets.length === 1;
        const allSoldOut = group.tickets.every((tt) => tt.status === "sold_out");
        const lowestPrice = Math.min(...group.tickets.map((tt) => tt.price));
        const hasSelectedTicket = group.tickets.some((tt) => tt.id === parentSelectedTicketId);

        return (
          <div
            key={group.sectionId}
            id={`section-group-${group.sectionId}`}
            className={`rounded-lg border transition-all duration-300 overflow-hidden ${
              allSoldOut
                ? "border-border opacity-50"
                : isHighlighted
                  ? "border-primary ring-1 ring-primary shadow-lg shadow-primary/20"
                  : hasSelectedTicket
                    ? "border-primary ring-1 ring-primary"
                    : isExpanded
                      ? "border-primary/60"
                      : "border-border hover:border-primary/40"
            }`}
          >
            {hasSingleTicket ? (
              <SingleTicketCard
                ticket={group.tickets[0]}
                sectionName={group.sectionName}
                sectionColor={group.color}
                currencyCode={event.currencyCode}
                isSelected={parentSelectedTicketId === group.tickets[0].id}
                onSelect={() => {
                  if (group.tickets[0].status !== "sold_out") {
                    handleRadioSelect(group.tickets[0], group.sectionName);
                  }
                }}
              />
            ) : (
              <>
                <button
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/30 transition-colors"
                  onClick={() => handleToggle(group.sectionId)}
                >
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: group.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-sm">{group.sectionName}</span>
                    {!isExpanded && (
                      <span className="text-xs text-muted-foreground ml-2">
                        {t("event.fromPrice", { price: formatPrice(lowestPrice, event.currencyCode) })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {!isExpanded && (
                      <TicketStatusBadge status={allSoldOut ? "sold_out" : group.tickets.some((tt) => tt.status === "limited") ? "limited" : "available"} />
                    )}
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-3 pb-3 space-y-1.5">
                    {group.tickets.map((tt) => {
                      const isSelected = parentSelectedTicketId === tt.id;
                      return (
                        <div key={tt.id} id={`ticket-card-${tt.id}`}>
                          <label
                            className={`flex items-start gap-3 p-2.5 rounded-md cursor-pointer transition-colors ${
                              tt.status === "sold_out"
                                ? "opacity-40 cursor-not-allowed"
                                : isSelected
                                  ? "bg-primary/10 border border-primary/40"
                                  : "hover:bg-muted/40 border border-transparent"
                            }`}
                            onClick={(e) => {
                              if (tt.status === "sold_out") { e.preventDefault(); return; }
                              handleRadioSelect(tt, group.sectionName);
                            }}
                          >
                            <div className="pt-0.5">
                              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                                isSelected ? "border-primary" : "border-muted-foreground/40"
                              }`}>
                                {isSelected && <div className="w-2 h-2 rounded-full bg-primary" />}
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-start">
                                <div className="min-w-0">
                                  <span className="text-sm font-medium block">{tt.name}</span>
                                  {tt.currentStageName && (
                                    <span className="text-[11px] text-primary/80 font-medium">{tt.currentStageName}</span>
                                  )}
                                  <span className="text-[11px] text-muted-foreground block">{tt.validDays}</span>
                                </div>
                                <div className="text-right shrink-0 ml-2">
                                  <span className="text-primary font-bold text-sm">{formatPrice(tt.price, event.currencyCode)}</span>
                                  {tt.basePrice !== undefined && tt.basePrice !== tt.price && tt.currentStageName && (
                                    <span className="text-[10px] text-muted-foreground line-through block">{formatPrice(tt.basePrice, event.currencyCode)}</span>
                                  )}
                                </div>
                              </div>
                              {tt.nextStage && (
                                <p className="text-[10px] text-amber-400 mt-0.5">
                                  {t("event.nextStage", "Próximo")}: {tt.nextStage.name} — {formatPrice(tt.nextStage.price, event.currencyCode)}
                                </p>
                              )}
                            </div>
                            <TicketStatusBadge status={tt.status} />
                          </label>
                        </div>
                      );
                    })}

                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SingleTicketCard({
  ticket,
  sectionName,
  sectionColor,
  currencyCode,
  isSelected,
  onSelect,
}: {
  ticket: TicketType;
  sectionName: string;
  sectionColor: string;
  currencyCode: string;
  isSelected?: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      id={`ticket-card-${ticket.id}`}
      className={`p-3 cursor-pointer hover:bg-muted/30 transition-colors ${
        ticket.status === "sold_out"
          ? "opacity-50 cursor-not-allowed"
          : isSelected
            ? "bg-primary/5"
            : ""
      }`}
      onClick={onSelect}
    >
      <div className="flex items-center gap-2 mb-1">
        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: sectionColor }} />
        <span className="font-medium text-sm flex-1">{sectionName}</span>
        <TicketStatusBadge status={ticket.status} />
      </div>
      {ticket.currentStageName && (
        <p className="text-xs text-primary/80 font-medium mb-0.5 ml-[18px]">{ticket.currentStageName}</p>
      )}
      <p className="text-xs text-muted-foreground mb-1 ml-[18px]">{ticket.validDays}</p>
      <div className="flex items-baseline gap-2 ml-[18px]">
        <p className="text-primary font-bold">{formatPrice(ticket.price, currencyCode)}</p>
        {ticket.basePrice !== undefined && ticket.basePrice !== ticket.price && ticket.currentStageName && (
          <p className="text-xs text-muted-foreground line-through">{formatPrice(ticket.basePrice, currencyCode)}</p>
        )}
      </div>
      {ticket.nextStage && (
        <p className="text-[10px] text-amber-400 mt-1 ml-[18px]">
          {t("event.nextStage", "Próximo")}: {ticket.nextStage.name} — {formatPrice(ticket.nextStage.price, currencyCode)}
        </p>
      )}
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="text-muted-foreground">{icon}</div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

function EventInfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 border-l-2 border-primary pl-3">
      <div className="shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold truncate">{value}</p>
      </div>
    </div>
  );
}

function TicketStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  switch (status) {
    case "available":
      return <Badge className="bg-emerald-600/20 text-emerald-400 border-emerald-600/30 text-xs">{t("event.available")}</Badge>;
    case "limited":
      return <Badge className="bg-amber-600/20 text-amber-400 border-amber-600/30 text-xs">{t("event.limited")}</Badge>;
    case "sold_out":
      return <Badge className="bg-red-600/20 text-red-400 border-red-600/30 text-xs">{t("event.soldOut")}</Badge>;
    default:
      return null;
  }
}

function Countdown({ targetDate }: { targetDate: string }) {
  const { t } = useTranslation();
  const [timeLeft, setTimeLeft] = useState(getTimeLeft(targetDate));

  useEffect(() => {
    const timer = setInterval(() => setTimeLeft(getTimeLeft(targetDate)), 1000);
    return () => clearInterval(timer);
  }, [targetDate]);

  return (
    <div className="flex justify-center gap-3">
      <TimeUnit value={timeLeft.days} label={t("event.days")} />
      <TimeUnit value={timeLeft.hours} label={t("event.hours")} />
      <TimeUnit value={timeLeft.minutes} label={t("event.minutes")} />
      <TimeUnit value={timeLeft.seconds} label={t("event.seconds")} />
    </div>
  );
}

function TimeUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="text-center">
      <div className="text-2xl font-bold text-primary">{String(value).padStart(2, "0")}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function getTimeLeft(target: string) {
  const diff = Math.max(0, new Date(target).getTime() - Date.now());
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}
