import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useRoute, useLocation } from "wouter";
import { Calendar, MapPin, Clock, Shield, User as UserIcon, ChevronDown, ChevronUp, ExternalLink, X, Loader2, Briefcase, DoorOpen, Info } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { formatPrice, formatFullDate } from "@/lib/format";
import type { EventData, TicketType } from "@/data/types";
import { VenueMap } from "@/components/VenueMap";
import { TicketSelector } from "@/components/TicketSelector";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { fetchEventDetail, resolveImageUrl, ApiError, type ApiEventDetail } from "@/lib/api";

function DarkMapEmbed({ lat, lng }: { lat: number; lng: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [lat, lng],
      zoom: 15,
      zoomControl: true,
      attributionControl: false,
    });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
    }).addTo(map);
    const icon = L.divIcon({
      className: "",
      html: `<div style="width:22px;height:22px;border-radius:50%;background:#00f1ff;border:3px solid #0891b2;box-shadow:0 0 16px rgba(0,241,255,0.6),0 0 32px rgba(0,241,255,0.25)"></div>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
    L.marker([lat, lng], { icon }).addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [lat, lng]);

  return <div ref={containerRef} style={{ width: "100%", height: "250px", backgroundColor: "#0a0a0a", position: "relative", zIndex: 0 }} />;
}

function mapApiToEventData(detail: ApiEventDetail): EventData {
  const { event, eventDays, venues, sections, ticketTypes } = detail;
  const venue = venues[0];

  const mappedDays = eventDays.map((d, i) => ({
    dayNumber: i + 1,
    label: d.label || `Day ${i + 1}`,
    date: d.date,
    doorTime: d.doorsOpenAt ? new Date(d.doorsOpenAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }) : "N/A",
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
      serviceFee: 0,
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
  };
}

export default function EventDetail() {
  const { t, i18n } = useTranslation();
  const [, params] = useRoute("/event/:id");
  const [, navigate] = useLocation();
  const [showFlyer, setShowFlyer] = useState(false);
  const [showDescription, setShowDescription] = useState(false);
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
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

  const handleSectionClick = useCallback((sectionId: string) => {
    setHighlightedSectionId(sectionId);
    const section = event.sections.find((s) => s.id === sectionId);
    if (section && section.ticketTypes.length > 0) {
      const firstTicket = section.ticketTypes[0];
      const el = document.getElementById(`ticket-card-${firstTicket.id}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
    setTimeout(() => setHighlightedSectionId(null), 3000);
  }, [event]);

  return (
    <div className="min-h-screen">
      <div className="relative h-[300px] md:h-[420px] overflow-hidden">
        <img
          src={event.coverImage}
          alt={event.name}
          className="w-full h-full object-cover"
          loading="eager"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto flex items-end justify-between gap-6">
          <div className="flex-1 min-w-0">
            <Badge variant="secondary" className="mb-2">{t(`home.filters.${event.category}`)}</Badge>
            <h1 className="text-3xl md:text-4xl font-bold mb-2">{event.name}</h1>
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              {event.startsAt && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" />
                  {formatFullDate(event.startsAt)}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4" />
                {event.venueName ? `${event.venueName}, ` : ""}{event.city || event.venueAddress}
              </span>
            </div>
          </div>
          {event.flyerImage && (
            <div
              className="hidden md:block flex-shrink-0 cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => setShowFlyer(true)}
            >
              <img
                src={event.flyerImage}
                alt="Flyer"
                className="h-[280px] lg:h-[340px] w-auto rounded-xl shadow-2xl shadow-black/50 object-contain border border-white/10"
                loading="eager"
              />
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="bg-card rounded-xl border border-border p-4 mb-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            <EventInfoItem
              icon={<MapPin className="w-5 h-5 text-primary" />}
              label={t("event.venue", "Lugar")}
              value={event.venueName || event.venueAddress || "—"}
            />
            <EventInfoItem
              icon={<Calendar className="w-5 h-5 text-primary" />}
              label={t("event.date", "Fecha")}
              value={event.days.length > 0
                ? event.days.map((d) => new Date(d.date).toLocaleDateString(i18n.language === "es" ? "es-CO" : "en-US", { day: "numeric", month: "short" })).join(", ")
                : formatFullDate(event.startsAt, i18n.language)}
            />
            <EventInfoItem
              icon={<Clock className="w-5 h-5 text-primary" />}
              label={t("event.time", "Hora")}
              value={event.startsAt ? new Date(event.startsAt).toLocaleTimeString(i18n.language === "es" ? "es-CO" : "en-US", { hour: "numeric", minute: "2-digit", hour12: true }) : "—"}
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
          <div className="bg-card rounded-xl border border-border p-4 mb-6">
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
                className="md:hidden w-full rounded-lg overflow-hidden border border-border cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => setShowFlyer(true)}
              >
                <img src={event.flyerImage} alt="Flyer" className="w-full max-h-64 object-contain" loading="lazy" />
              </div>
            )}

            {event.description && (
              <div>
                <button
                  className="flex items-center gap-2 text-xl font-semibold mb-3 hover:text-primary transition-colors"
                  onClick={() => setShowDescription(!showDescription)}
                >
                  {t("event.description")}
                  {showDescription ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </button>
                {showDescription && (
                  <div
                    className="prose prose-invert max-w-none text-muted-foreground"
                    dangerouslySetInnerHTML={{ __html: event.description }}
                  />
                )}
              </div>
            )}

            {event.isMultiDay && event.days.length > 1 && (
              <div>
                <h2 className="text-xl font-semibold mb-4">{t("event.schedule")}</h2>
                <div className="space-y-3">
                  {event.days.map((day) => (
                    <div key={day.dayNumber} className="flex items-center gap-4 p-3 bg-card rounded-lg border border-border">
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
                <div className="bg-card rounded-lg border border-border overflow-hidden">
                  <div className="p-4">
                    {event.venueName && <p className="font-medium">{event.venueName}</p>}
                    {event.venueAddress && <p className="text-sm text-muted-foreground">{event.venueAddress}</p>}
                  </div>
                  <DarkMapEmbed lat={event.latitude} lng={event.longitude} />
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
              <div className="bg-card rounded-xl border border-border p-5">
                <h2 className="text-lg font-semibold mb-4">{t("event.pricing")}</h2>
                <div className="space-y-3">
                  {event.ticketTypes.map((tt) => {
                    const ttSection = event.sections.find((s) => s.ticketTypes.some((t) => t.id === tt.id));
                    const isHighlighted = highlightedSectionId != null && ttSection?.id === highlightedSectionId;
                    return (
                    <div
                      key={tt.id}
                      id={`ticket-card-${tt.id}`}
                      className={`p-3 rounded-lg border transition-all duration-300 ${
                        tt.status === "sold_out"
                          ? "border-border opacity-50"
                          : isHighlighted
                            ? "border-primary bg-primary/10 ring-1 ring-primary shadow-lg shadow-primary/20 cursor-pointer"
                            : "border-border hover:border-primary/50 cursor-pointer"
                      }`}
                      onClick={() => {
                        if (tt.status !== "sold_out") {
                          handleTicketSelect(tt, ttSection?.name || "");
                        }
                      }}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-medium text-sm">{tt.name}</span>
                        <TicketStatusBadge status={tt.status} />
                      </div>
                      {tt.currentStageName && (
                        <p className="text-xs text-primary/80 font-medium mb-0.5">{tt.currentStageName}</p>
                      )}
                      <p className="text-xs text-muted-foreground mb-1">{tt.validDays}</p>
                      <div className="flex items-baseline gap-2">
                        <p className="text-primary font-bold">{formatPrice(tt.price, event.currencyCode)}</p>
                        {tt.basePrice !== undefined && tt.basePrice !== tt.price && tt.currentStageName && (
                          <p className="text-xs text-muted-foreground line-through">{formatPrice(tt.basePrice, event.currencyCode)}</p>
                        )}
                      </div>
                      {tt.nextStage && (
                        <p className="text-[10px] text-amber-400 mt-1">
                          {t("event.nextStage", "Próximo")}: {tt.nextStage.name} — {formatPrice(tt.nextStage.price, event.currencyCode)}
                        </p>
                      )}
                    </div>
                    );
                  })}
                </div>
                <Separator className="my-4" />
                {isSoldOut ? (
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
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                    onClick={() => {
                      const firstAvailable = event.ticketTypes.find((tt) => tt.status !== "sold_out");
                      if (firstAvailable) {
                        const section = event.sections.find((s) => s.ticketTypes.some((t) => t.id === firstAvailable.id));
                        handleTicketSelect(firstAvailable, section?.name || "");
                      }
                    }}
                  >
                    {t("event.buyTickets")}
                  </Button>
                )}
              </div>

              {detail?.guestLists && detail.guestLists.length > 0 && (
                <div className="bg-card rounded-xl border border-border p-5 mt-6">
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
    <div className="flex items-center gap-3">
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
