import { useState, useCallback, useRef } from "react";
import {
  useGetAnalyticsSummary,
  useGetFraudAlerts,
  useListEvents,
  useListPromoterCompanies,
} from "@workspace/api-client-react";
import type { Event } from "@workspace/api-client-react";
import { GoogleMap, Marker, InfoWindow, useJsApiLoader } from "@react-google-maps/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, ShieldAlert, DollarSign, Building, TrendingUp, MapPin, Nfc } from "lucide-react";
import { GOOGLE_MAPS_API_KEY, MAPS_LIBRARIES, DEFAULT_CENTER } from "@/lib/maps";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { formatCurrency } from "@/lib/currency";

type GeocodedEvent = Event & { lat: number; lng: number };
type RawEvent = Event & { latitude?: string | null; longitude?: string | null; capacity?: number | null; promoterCompanyName?: string | null };

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

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: MAPS_LIBRARIES,
  });

  const [geocoded, setGeocoded] = useState<GeocodedEvent[]>([]);
  const [geocoding, setGeocoding] = useState(false);
  const [selected, setSelected] = useState<GeocodedEvent | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const geocodedIds = useRef<Set<string>>(new Set());

  const runGeocoding = useCallback(() => {
    const results: GeocodedEvent[] = [];
    const needGeocode: RawEvent[] = [];

    for (const event of events) {
      if (geocodedIds.current.has(event.id)) continue;
      const lat = event.latitude ? parseFloat(event.latitude) : NaN;
      const lng = event.longitude ? parseFloat(event.longitude) : NaN;
      if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
        geocodedIds.current.add(event.id);
        results.push({ ...event, lat, lng });
      } else if (event.venueAddress) {
        needGeocode.push(event);
      }
    }

    if (results.length > 0) {
      setGeocoded((prev) => [...prev, ...results]);
    }

    if (needGeocode.length === 0) return;
    if (!geocoderRef.current) return;

    setGeocoding(true);
    let remaining = needGeocode.length;
    needGeocode.forEach((event) => {
      geocodedIds.current.add(event.id);
      geocoderRef.current!.geocode({ address: event.venueAddress! }, (res, status) => {
        remaining--;
        if (status === "OK" && res?.[0]) {
          const loc = res[0].geometry.location;
          setGeocoded((prev) => [...prev, { ...event, lat: loc.lat(), lng: loc.lng() }]);
        }
        if (remaining === 0) setGeocoding(false);
      });
    });
  }, [events]);

  const onMapLoad = useCallback(
    (map: google.maps.Map) => {
      geocoderRef.current = new window.google.maps.Geocoder();
      runGeocoding();
      void map;
    },
    [runGeocoding]
  );

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
            <p className="text-3xl font-bold">{fmt(summary?.braceletCount)}</p>
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
            {geocoding && <span className="text-primary animate-pulse">{t("eventsMap.geocoding")}</span>}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {!isLoaded || eventsLoading ? (
            <div className="h-[400px] rounded-lg border bg-muted/30 flex items-center justify-center text-muted-foreground text-sm">
              {eventsLoading ? t("eventsMap.loadingEvents") : t("eventsMap.loadingMap")}
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <GoogleMap
                mapContainerStyle={{ width: "100%", height: "400px" }}
                center={DEFAULT_CENTER}
                zoom={6}
                onLoad={onMapLoad}
                options={{
                  streetViewControl: false,
                  mapTypeControl: false,
                  styles: [
                    { elementType: "geometry", stylers: [{ color: "#1a1a2e" }] },
                    { elementType: "labels.text.fill", stylers: [{ color: "#8a8ab0" }] },
                    { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a2e" }] },
                    { featureType: "road", elementType: "geometry", stylers: [{ color: "#2d2d44" }] },
                    { featureType: "water", elementType: "geometry", stylers: [{ color: "#0d1117" }] },
                    { featureType: "administrative.country", elementType: "geometry.stroke", stylers: [{ color: "#444466" }] },
                  ],
                }}
              >
                {geocoded.map((event) => (
                  <Marker
                    key={event.id}
                    position={{ lat: event.lat, lng: event.lng }}
                    title={event.name}
                    icon={{
                      path: window.google.maps.SymbolPath.CIRCLE,
                      scale: 11,
                      fillColor: event.active ? "#00f1ff" : "#6b7280",
                      fillOpacity: 0.9,
                      strokeColor: event.active ? "#0891b2" : "#4b5563",
                      strokeWeight: 2,
                    }}
                    onClick={() => setSelected(event)}
                  />
                ))}

                {selected && (
                  <InfoWindow
                    position={{ lat: selected.lat, lng: selected.lng }}
                    onCloseClick={() => setSelected(null)}
                    options={{ pixelOffset: new window.google.maps.Size(0, -12) }}
                  >
                    <div style={{ minWidth: 200, fontFamily: "Inter, sans-serif", padding: "4px 2px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <span
                          style={{
                            display: "inline-block",
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: selected.active ? "#00f1ff" : "#6b7280",
                            flexShrink: 0,
                          }}
                        />
                        <strong style={{ fontSize: 13, color: "#0a0a0a" }}>{selected.name}</strong>
                      </div>

                      {selected.venueAddress && (
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 5, marginBottom: 4 }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" style={{ marginTop: 1, flexShrink: 0 }}>
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                            <circle cx="12" cy="10" r="3" />
                          </svg>
                          <span style={{ fontSize: 11, color: "#6b7280", lineHeight: "1.4" }}>{selected.venueAddress}</span>
                        </div>
                      )}

                      {selected.startsAt && (
                        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                            <line x1="16" y1="2" x2="16" y2="6" />
                            <line x1="8" y1="2" x2="8" y2="6" />
                            <line x1="3" y1="10" x2="21" y2="10" />
                          </svg>
                          <span style={{ fontSize: 11, color: "#6b7280" }}>
                            {format(new Date(selected.startsAt), "MMM d, yyyy")}
                            {selected.endsAt && ` – ${format(new Date(selected.endsAt), "MMM d, yyyy")}`}
                          </span>
                        </div>
                      )}

                      {selected.capacity != null && selected.capacity > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                            <circle cx="9" cy="7" r="4" />
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                          </svg>
                          <span style={{ fontSize: 11, color: "#6b7280" }}>
                            {t("eventsMap.capacity")}: {selected.capacity.toLocaleString()}
                          </span>
                        </div>
                      )}

                      {selected.promoterCompanyName && (
                        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2">
                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                            <polyline points="9 22 9 12 15 12 15 22" />
                          </svg>
                          <span style={{ fontSize: 11, color: "#6b7280" }}>
                            {selected.promoterCompanyName}
                          </span>
                        </div>
                      )}

                      <div style={{ marginTop: 6 }}>
                        <span
                          style={{
                            display: "inline-block",
                            fontSize: 10,
                            fontWeight: 600,
                            padding: "2px 8px",
                            borderRadius: 999,
                            background: selected.active ? "#cffafe" : "#f3f4f6",
                            color: selected.active ? "#0e7490" : "#6b7280",
                          }}
                        >
                          {selected.active ? t("common.active") : t("common.inactive")}
                        </span>
                      </div>
                    </div>
                  </InfoWindow>
                )}
              </GoogleMap>
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
