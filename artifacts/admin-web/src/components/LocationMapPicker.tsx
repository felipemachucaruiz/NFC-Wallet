import { useCallback, useRef, useState, useEffect } from "react";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MapPin, Loader2 } from "lucide-react";
import { GOOGLE_MAPS_API_KEY, DEFAULT_CENTER } from "@/lib/maps";

// Uses Places API (New) REST endpoints — compatible with API keys created after March 2025.
// The old google.maps.places.Autocomplete class is not available to new customers.
const PLACES_BASE = "https://places.googleapis.com/v1";

type PlaceSuggestion = {
  placeId: string;
  text: string;
};

async function fetchSuggestions(input: string): Promise<PlaceSuggestion[]> {
  if (input.trim().length < 2) return [];
  try {
    const res = await fetch(`${PLACES_BASE}/places:autocomplete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask": "suggestions.placePredictions.text,suggestions.placePredictions.placeId",
      },
      body: JSON.stringify({
        input,
        locationBias: {
          circle: {
            center: { latitude: DEFAULT_CENTER.lat, longitude: DEFAULT_CENTER.lng },
            radius: 1000000,
          },
        },
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.suggestions ?? [])
      .filter((s: any) => s.placePrediction)
      .map((s: any) => ({
        placeId: s.placePrediction.placeId,
        text: s.placePrediction.text?.text ?? "",
      }));
  } catch {
    return [];
  }
}

async function fetchPlaceDetails(placeId: string): Promise<{ address: string; lat: number; lng: number } | null> {
  try {
    const res = await fetch(`${PLACES_BASE}/places/${placeId}?fields=formattedAddress,location`, {
      headers: {
        "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      address: data.formattedAddress ?? "",
      lat: data.location?.latitude ?? 0,
      lng: data.location?.longitude ?? 0,
    };
  } catch {
    return null;
  }
}

const MAP_LIBRARIES: ("places")[] = ["places"];

const MAP_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#1a1a2e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8a8ab0" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a2e" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2d2d44" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0d1117" }] },
];

type Props = {
  open: boolean;
  initialAddress?: string;
  onConfirm: (address: string) => void;
  onClose: () => void;
};

export function LocationMapPicker({ open, initialAddress, onConfirm, onClose }: Props) {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: MAP_LIBRARIES,
  });

  const [marker, setMarker] = useState<google.maps.LatLngLiteral | null>(null);
  const [address, setAddress] = useState(initialAddress ?? "");
  const [searchValue, setSearchValue] = useState(initialAddress ?? "");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searching, setSearching] = useState(false);
  const [selectingPlace, setSelectingPlace] = useState(false);

  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setAddress(initialAddress ?? "");
      setSearchValue(initialAddress ?? "");
      setMarker(null);
      setSuggestions([]);
      setShowDropdown(false);
    }
  }, [open, initialAddress]);

  // Close dropdown on outside click
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    geocoderRef.current = new window.google.maps.Geocoder();

    if (initialAddress) {
      geocoderRef.current.geocode({ address: initialAddress }, (results, status) => {
        if (status === "OK" && results?.[0]) {
          const loc = results[0].geometry.location;
          const pos = { lat: loc.lat(), lng: loc.lng() };
          setMarker(pos);
          map.panTo(pos);
          map.setZoom(15);
        }
      });
    }
  }, [initialAddress]);

  const handleMapClick = (e: google.maps.MapMouseEvent) => {
    if (!e.latLng) return;
    const latLng = { lat: e.latLng.lat(), lng: e.latLng.lng() };
    setMarker(latLng);
    geocoderRef.current?.geocode({ location: latLng }, (results, status) => {
      if (status === "OK" && results?.[0]) {
        setAddress(results[0].formatted_address);
        setSearchValue(results[0].formatted_address);
      }
    });
    setShowDropdown(false);
  };

  const handleSearchChange = (value: string) => {
    setSearchValue(value);
    setShowDropdown(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const results = await fetchSuggestions(value);
      setSuggestions(results);
      setShowDropdown(results.length > 0);
      setSearching(false);
    }, 350);
  };

  const handleSelectSuggestion = async (suggestion: PlaceSuggestion) => {
    setShowDropdown(false);
    setSuggestions([]);
    setSearchValue(suggestion.text);
    setSelectingPlace(true);
    const details = await fetchPlaceDetails(suggestion.placeId);
    setSelectingPlace(false);
    if (!details) return;
    const pos = { lat: details.lat, lng: details.lng };
    setMarker(pos);
    setAddress(details.address);
    setSearchValue(details.address);
    mapRef.current?.panTo(pos);
    mapRef.current?.setZoom(15);
  };

  const handleConfirm = () => {
    onConfirm(address);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" />
            Set Event Location
          </DialogTitle>
        </DialogHeader>

        {!isLoaded ? (
          <div className="h-96 flex items-center justify-center text-muted-foreground text-sm gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading map…
          </div>
        ) : (
          <>
            <div className="px-5 pb-3" ref={dropdownRef}>
              <div className="relative">
                <Input
                  placeholder="Search for an address or city…"
                  value={searchValue}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
                  className="w-full pr-8"
                />
                {(searching || selectingPlace) && (
                  <Loader2 className="w-4 h-4 animate-spin absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                )}
                {showDropdown && suggestions.length > 0 && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg overflow-hidden">
                    {suggestions.map((s) => (
                      <button
                        key={s.placeId}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectSuggestion(s);
                        }}
                        className="w-full text-left px-3 py-2.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors flex items-start gap-2"
                      >
                        <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                        <span className="line-clamp-1">{s.text}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                Search above or click anywhere on the map to set the pin.
              </p>
            </div>

            <GoogleMap
              mapContainerStyle={{ width: "100%", height: "380px" }}
              center={marker ?? DEFAULT_CENTER}
              zoom={marker ? 15 : 6}
              onLoad={onMapLoad}
              onClick={handleMapClick}
              options={{
                streetViewControl: false,
                mapTypeControl: false,
                fullscreenControl: false,
                styles: MAP_STYLES,
              }}
            >
              {marker && <Marker position={marker} />}
            </GoogleMap>

            {address && (
              <div className="px-5 py-2.5 text-sm text-muted-foreground bg-muted/30 border-t flex items-start gap-2">
                <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
                <span>{address}</span>
              </div>
            )}
          </>
        )}

        <DialogFooter className="px-5 py-4 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={!address} className="gap-2">
            <MapPin className="w-4 h-4" />
            Use this location
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
