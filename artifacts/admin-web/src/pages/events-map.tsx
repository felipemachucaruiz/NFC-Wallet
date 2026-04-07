import { useState, useCallback, useRef } from "react";
import { GoogleMap, Marker, InfoWindow, useJsApiLoader } from "@react-google-maps/api";
import { useListEvents } from "@workspace/api-client-react";
import type { Event } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { MapPin, Calendar, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GOOGLE_MAPS_API_KEY, MAPS_LIBRARIES, DEFAULT_CENTER } from "@/lib/maps";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";

type GeocodedEvent = Event & { lat: number; lng: number };

export default function EventsMap() {
  const { t } = useTranslation();
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: MAPS_LIBRARIES,
  });

  const { data, isLoading } = useListEvents();
  const events = data?.events ?? [];

  const [geocoded, setGeocoded] = useState<GeocodedEvent[]>([]);
  const [geocoding, setGeocoding] = useState(false);
  const [selected, setSelected] = useState<GeocodedEvent | null>(null);

  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const geocodedIds = useRef<Set<string>>(new Set());

  const runGeocoding = useCallback(() => {
    if (!geocoderRef.current || events.length === 0) return;
    const pending = events.filter((e) => e.venueAddress && !geocodedIds.current.has(e.id));
    if (pending.length === 0) return;
    setGeocoding(true);
    let remaining = pending.length;
    pending.forEach((event) => {
      geocodedIds.current.add(event.id);
      geocoderRef.current!.geocode({ address: event.venueAddress! }, (results, status) => {
        remaining--;
        if (status === "OK" && results?.[0]) {
          const loc = results[0].geometry.location;
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

  const withAddress = events.filter((e) => e.venueAddress);
  const withoutAddress = events.filter((e) => !e.venueAddress);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("eventsMap.title")}</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {t("eventsMap.subtitle")}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => {
            geocodedIds.current = new Set();
            setGeocoded([]);
            setTimeout(runGeocoding, 50);
          }}
          disabled={geocoding || isLoading}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${geocoding ? "animate-spin" : ""}`} />
          {t("eventsMap.refresh")}
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg border bg-card p-3">
          <div className="text-2xl font-bold text-primary">{events.length}</div>
          <div className="text-muted-foreground text-xs mt-0.5">{t("eventsMap.totalEvents")}</div>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <div className="text-2xl font-bold">{geocoded.length}</div>
          <div className="text-muted-foreground text-xs mt-0.5">{t("eventsMap.pinnedOnMap")}</div>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <div className="text-2xl font-bold text-yellow-500">{withoutAddress.length}</div>
          <div className="text-muted-foreground text-xs mt-0.5">{t("eventsMap.missingAddress")}</div>
        </div>
      </div>

      {!isLoaded || isLoading ? (
        <div className="h-[560px] rounded-lg border bg-card flex items-center justify-center text-muted-foreground text-sm">
          {isLoading ? t("eventsMap.loadingEvents") : t("eventsMap.loadingMap")}
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden shadow-sm">
          <GoogleMap
            mapContainerStyle={{ width: "100%", height: "560px" }}
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

      <div className="flex items-center gap-5 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-cyan-400 border-2 border-cyan-600" />
          {t("eventsMap.activeEvent")}
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-gray-500 border-2 border-gray-600" />
          {t("eventsMap.inactiveEvent")}
        </div>
        {geocoding && <span className="text-primary animate-pulse">{t("eventsMap.geocoding")}</span>}
      </div>

      {withoutAddress.length > 0 && (
        <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4">
          <div className="flex items-center gap-2 text-yellow-600 text-sm font-medium mb-2">
            <MapPin className="w-4 h-4" />
            {t("eventsMap.eventsWithoutAddress", { count: withoutAddress.length })}
          </div>
          <div className="flex flex-wrap gap-2">
            {withoutAddress.map((e) => (
              <Badge key={e.id} variant="outline" className="text-xs border-yellow-500/30 text-yellow-600">
                {e.name}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
