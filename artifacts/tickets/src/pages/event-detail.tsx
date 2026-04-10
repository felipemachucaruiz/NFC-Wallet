import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useRoute, useLocation } from "wouter";
import { Calendar, MapPin, Clock, Shield, User as UserIcon, ChevronDown, ChevronUp, ExternalLink, X, Loader2 } from "lucide-react";
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
      svgPath: "",
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
    category: event.category || "",
    venueName: venue?.name || "",
    venueAddress: venue?.address || event.venueAddress || "",
    city: venue?.city || "",
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
    setSelectedTicket(ticket);
    setSelectedSectionName(sectionName);
  };

  return (
    <div className="min-h-screen">
      <div className="relative h-[300px] md:h-[400px] overflow-hidden">
        <img
          src={event.coverImage}
          alt={event.name}
          className="w-full h-full object-cover"
          loading="eager"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
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
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div className="flex flex-col sm:flex-row gap-6">
              <div className="flex-1 space-y-3">
                <InfoRow icon={<Clock className="w-4 h-4" />} label={t("event.doorTime")} value={event.days[0]?.doorTime || "N/A"} />
                {event.minAge && (
                  <InfoRow icon={<Shield className="w-4 h-4" />} label={t("event.minAge")} value={`${event.minAge} ${t("event.years")}`} />
                )}
                {event.organizer && (
                  <InfoRow icon={<UserIcon className="w-4 h-4" />} label={t("event.organizer")} value={event.organizer} />
                )}
              </div>
              {event.flyerImage && (
                <div
                  className="w-32 h-48 sm:w-40 sm:h-56 rounded-lg overflow-hidden border border-border cursor-pointer hover:opacity-90 transition-opacity shrink-0"
                  onClick={() => setShowFlyer(true)}
                >
                  <img src={event.flyerImage} alt="Flyer" className="w-full h-full object-cover" loading="lazy" />
                  <p className="text-xs text-center text-muted-foreground mt-1">{t("event.viewFlyer")}</p>
                </div>
              )}
            </div>

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

            <div>
              <button
                className="flex items-center gap-2 text-xl font-semibold mb-4 hover:text-primary transition-colors"
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

            {event.latitude !== 0 && event.longitude !== 0 && (
              <div>
                <h2 className="text-xl font-semibold mb-4">{t("event.location")}</h2>
                <div className="bg-card rounded-lg border border-border overflow-hidden">
                  <div className="p-4">
                    {event.venueName && <p className="font-medium">{event.venueName}</p>}
                    <p className="text-sm text-muted-foreground">{event.venueAddress}</p>
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

            {event.sections.length > 0 && event.sections.some((s) => s.svgPath) && (
              <div>
                <h2 className="text-xl font-semibold mb-4">{t("venueMap.title")}</h2>
                <VenueMap event={event} onSelectTicket={handleTicketSelect} />
              </div>
            )}
          </div>

          <div className="lg:col-span-1">
            <div className="sticky top-20 space-y-6">
              <div className="bg-card rounded-xl border border-border p-5">
                <h2 className="text-lg font-semibold mb-4">{t("event.pricing")}</h2>
                <div className="space-y-3">
                  {event.ticketTypes.map((tt) => (
                    <div
                      key={tt.id}
                      className={`p-3 rounded-lg border transition-colors ${
                        tt.status === "sold_out"
                          ? "border-border opacity-50"
                          : "border-border hover:border-primary/50 cursor-pointer"
                      }`}
                      onClick={() => {
                        if (tt.status !== "sold_out") {
                          const section = event.sections.find((s) => s.ticketTypes.some((t) => t.id === tt.id));
                          handleTicketSelect(tt, section?.name || "");
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
                  ))}
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
          onClose={() => setSelectedTicket(null)}
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
