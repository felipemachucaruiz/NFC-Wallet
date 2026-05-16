import { useState, useCallback, useRef, useEffect } from "react";
import {
  useGetAnalyticsSummary,
  useGetFraudAlerts,
  useListEvents,
  useListPromoterCompanies,
} from "@workspace/api-client-react";
import type { Event } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, ShieldAlert, DollarSign, Building, TrendingUp, MapPin, Nfc } from "lucide-react";
import { DEFAULT_CENTER } from "@/lib/maps";
import { fmtDate } from "@/lib/date";
import { useTranslation } from "react-i18next";
import { formatCurrency } from "@/lib/currency";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type RawEvent = Event & { latitude?: string | null; longitude?: string | null; capacity?: number | null; promoterCompanyName?: string | null; refundDeadline?: string | null };
type GeocodedEvent = RawEvent & { lat: number; lng: number };

export default function Dashboard() {
  const { t } = useTranslation();
  const { data: summary, isLoading: summaryLoading } = useGetAnalyticsSummary();
  const { data: fraudData } = useGetFraudAlerts({ status: "open" });
  const { data: eventsData, isLoading: eventsLoading } = useListEvents();
  const { data: promotersData } = useListPromoterCompanies();

  const events = (eventsData?.events ?? []) as RawEvent[];
  const activeEvents = events.filter((e) => e.active);
  const alerts = fraudData?.alerts ?? [];
  const companies = promotersData?.companies ?? [];

  const fmt = (n?: number | null) => formatCurrency(n ?? 0, "COP");

  const [geocoded, setGeocoded] = useState<GeocodedEvent[]>([]);
  const [selected, setSelected] = useState<GeocodedEvent | null>(null);
  const geocodedIds = useRef<Set<string>>(new Set());
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.CircleMarker[]>([]);
  const popupRef = useRef<L.Popup | null>(null);

  useEffect(() => {
    const results: GeocodedEvent[] = [];
    for (const event of events) {
      if (geocodedIds.current.has(event.id)) continue;
      const lat = event.latitude ? parseFloat(event.latitude) : NaN;
      const lng = event.longitude ? parseFloat(event.longitude) : NaN;
      if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
        geocodedIds.current.add(event.id);
        results.push({ ...event, lat, lng });
      }
    }
    if (results.length > 0) {
      setGeocoded((prev) => [...prev, ...results]);
    }
  }, [events]);

  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng],
      zoom: 6,
      zoomControl: true,
      attributionControl: false,
    });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
    }).addTo(map);
    mapInstanceRef.current = map;
    return () => { map.remove(); mapInstanceRef.current = null; };
  }, [eventsLoading]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    geocoded.forEach((event) => {
      const color = event.active ? "#00f1ff" : "#6b7280";
      const borderColor = event.active ? "#0891b2" : "#4b5563";
      const marker = L.circleMarker([event.lat, event.lng], {
        radius: 10,
        fillColor: color,
        fillOpacity: 0.9,
        color: borderColor,
        weight: 2,
      }).addTo(map);
      marker.on("click", () => setSelected(event));
      markersRef.current.push(marker);
    });
  }, [geocoded]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (popupRef.current) { popupRef.current.remove(); popupRef.current = null; }
    if (!selected) return;
    const dateStr = selected.startsAt
      ? fmtDate(selected.startsAt) + (selected.endsAt ? ` – ${fmtDate(selected.endsAt)}` : "")
      : "";
    const popup = L.popup({ closeButton: true, className: "tapee-popup" })
      .setLatLng([selected.lat, selected.lng])
      .setContent(`
        <div style="min-width:200px;font-family:Inter,sans-serif;padding:4px 2px">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${selected.active ? '#00f1ff' : '#6b7280'};flex-shrink:0"></span>
            <strong style="font-size:13px;color:#0a0a0a">${selected.name}</strong>
          </div>
          ${selected.venueAddress ? `<div style="font-size:11px;color:#6b7280;margin-bottom:4px">${selected.venueAddress}</div>` : ""}
          ${dateStr ? `<div style="font-size:11px;color:#6b7280;margin-bottom:4px">${dateStr}</div>` : ""}
          ${selected.capacity ? `<div style="font-size:11px;color:#6b7280;margin-bottom:4px">Capacidad: ${selected.capacity.toLocaleString()}</div>` : ""}
          <span style="display:inline-block;font-size:10px;font-weight:600;padding:2px 8px;border-radius:999px;background:${selected.active ? '#cffafe' : '#f3f4f6'};color:${selected.active ? '#0e7490' : '#6b7280'}">${selected.active ? 'Activo' : 'Inactivo'}</span>
        </div>
      `)
      .openOn(map);
    popupRef.current = popup;
  }, [selected]);

  const withoutAddress = events.filter((e) => !e.venueAddress);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("dashboard.title")}</h1>
        <p className="text-muted-foreground mt-1">{t("dashboard.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <Card data-testid="card-events">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Calendar className="w-4 h-4" /> {t("dashboard.events")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{events.length}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("dashboard.activeEvents", { count: activeEvents.length })}</p>
          </CardContent>
        </Card>

        <Card data-testid="card-promoters">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Building className="w-4 h-4" /> {t("dashboard.promoters")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{companies.length}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("dashboard.companiesRegistered")}</p>
          </CardContent>
        </Card>

        <Card data-testid="card-bracelets" className={summaryLoading ? "opacity-60" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Nfc className="w-4 h-4" /> {t("dashboard.bracelets")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{fmt((summary as unknown as Record<string, unknown>)?.braceletCount as number | undefined)}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("dashboard.braceletsRegistered")}</p>
          </CardContent>
        </Card>

        <Card data-testid="card-revenue" className={summaryLoading ? "opacity-60" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4" /> {t("dashboard.revenue")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{fmt(summary?.totalSales)}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("dashboard.totalSales")}</p>
          </CardContent>
        </Card>

        <Card data-testid="card-fraud-alerts" className={alerts.length > 0 ? "border-destructive/50" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ShieldAlert className={`w-4 h-4 ${alerts.length > 0 ? "text-destructive" : ""}`} /> {t("dashboard.fraudAlerts")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-3xl font-bold ${alerts.length > 0 ? "text-destructive" : ""}`}>{alerts.length}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("dashboard.openAlerts")}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="w-4 h-4" /> {t("eventsMap.title")}
          </CardTitle>
          <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
            <span>{t("eventsMap.totalEvents")}: <strong className="text-foreground">{events.length}</strong></span>
            <span>{t("eventsMap.pinnedOnMap")}: <strong className="text-foreground">{geocoded.length}</strong></span>
            {withoutAddress.length > 0 && (
              <span className="text-yellow-500">{t("eventsMap.missingAddress")}: <strong>{withoutAddress.length}</strong></span>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {eventsLoading ? (
            <div className="h-[400px] rounded-lg border bg-muted/30 flex items-center justify-center text-muted-foreground text-sm">
              {t("eventsMap.loadingEvents")}
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <div ref={mapContainerRef} style={{ width: "100%", height: "400px", backgroundColor: "#0a0a0a" }} />
            </div>
          )}
          <div className="flex items-center gap-5 text-xs text-muted-foreground mt-3">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-cyan-400 border-2 border-cyan-600" />
              {t("eventsMap.activeEvent")}
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-gray-500 border-2 border-gray-600" />
              {t("eventsMap.inactiveEvent")}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {summary && (
          <Card data-testid="card-analytics">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4" /> {t("dashboard.analyticsSnapshot")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("dashboard.totalTransactions")}</span>
                <span className="font-mono font-medium">{fmt(summary.transactionCount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("dashboard.topUpTotal")}</span>
                <span className="font-mono font-medium">{fmt(summary.totalTopUps)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("dashboard.pendingBalance")}</span>
                <span className="font-mono font-medium">{fmt(summary.pendingBalance)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("dashboard.topUpCount")}</span>
                <span className="font-mono font-medium">{fmt(summary.topUpCount)}</span>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="w-4 h-4" /> {t("dashboard.recentEvents")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("dashboard.noEvents")}</p>
            ) : (
              <div className="space-y-2">
                {events.slice(0, 6).map((event) => (
                  <div key={event.id} className="flex items-center justify-between" data-testid={`text-event-${event.id}`}>
                    <div>
                      <p className="text-sm font-medium">{event.name}</p>
                      <p className="text-xs text-muted-foreground">{event.venueAddress ?? t("dashboard.noVenue")}</p>
                    </div>
                    <Badge variant={event.active ? "default" : "secondary"} className="text-xs ml-2 flex-shrink-0">
                      {event.active ? t("common.active") : t("common.inactive")}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {alerts.length > 0 && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-base text-destructive flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" /> {t("dashboard.openFraudAlerts")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {alerts.slice(0, 5).map((alert) => (
                <div key={alert.id} className="flex items-center justify-between text-sm" data-testid={`text-alert-${alert.id}`}>
                  <div>
                    <span className="font-medium capitalize">{alert.type.replace(/_/g, " ")}</span>
                    <span className="text-muted-foreground ml-2 font-mono text-xs">{alert.entityId.slice(0, 12)}</span>
                  </div>
                  <Badge variant="destructive" className="text-xs capitalize">{alert.severity}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
