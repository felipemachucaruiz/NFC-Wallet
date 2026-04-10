import { useCallback, useRef, useState, useEffect } from "react";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MapPin, Loader2 } from "lucide-react";
import { GOOGLE_MAPS_API_KEY, DEFAULT_CENTER, TAPEE_MAP_STYLES } from "@/lib/maps";
import { useTranslation } from "react-i18next";

type PlaceSuggestion = {
  placeId: string;
  text: string;
};

const MAP_LIBRARIES: ("places")[] = ["places"];


type Props = {
  open: boolean;
  initialAddress?: string;
  onConfirm: (address: string, lat?: number, lng?: number) => void;
  onClose: () => void;
};

export function LocationMapPicker({ open, initialAddress, onConfirm, onClose }: Props) {
  const { t } = useTranslation();
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
  const autocompleteServiceRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);
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
    autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();
    placesServiceRef.current = new window.google.maps.places.PlacesService(map);

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
    debounceRef.current = setTimeout(() => {
      if (!autocompleteServiceRef.current) {
        setSearching(false);
        return;
      }
      autocompleteServiceRef.current.getPlacePredictions(
        {
          input: value,
          locationBias: new google.maps.Circle({
            center: DEFAULT_CENTER,
            radius: 50000,
          }),
        },
        (predictions, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && predictions) {
            const results: PlaceSuggestion[] = predictions.map((p) => ({
              placeId: p.place_id,
              text: p.description,
            }));
            setSuggestions(results);
            setShowDropdown(results.length > 0);
          } else {
            setSuggestions([]);
            setShowDropdown(false);
          }
          setSearching(false);
        },
      );
    }, 350);
  };

  const handleSelectSuggestion = (suggestion: PlaceSuggestion) => {
    setShowDropdown(false);
    setSuggestions([]);
    setSearchValue(suggestion.text);
    setSelectingPlace(true);

    if (!placesServiceRef.current) {
      setSelectingPlace(false);
      return;
    }

    placesServiceRef.current.getDetails(
      { placeId: suggestion.placeId, fields: ["name", "formatted_address", "geometry"] },
      (place, status) => {
        setSelectingPlace(false);
        if (status !== google.maps.places.PlacesServiceStatus.OK || !place?.geometry?.location) return;
        const pos = { lat: place.geometry.location.lat(), lng: place.geometry.location.lng() };
        const raw = place.formatted_address ?? suggestion.text;
        const name = place.name ?? "";
        const addr = name && !raw.startsWith(name) ? `${name}, ${raw}` : raw;
        setMarker(pos);
        setAddress(addr);
        setSearchValue(addr);
        mapRef.current?.panTo(pos);
        mapRef.current?.setZoom(15);
      },
    );
  };

  const handleConfirm = () => {
    onConfirm(address, marker?.lat, marker?.lng);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" />
            {t("locationPicker.title")}
          </DialogTitle>
        </DialogHeader>

        {!isLoaded ? (
          <div className="h-96 flex items-center justify-center text-muted-foreground text-sm gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t("locationPicker.loadingMap")}
          </div>
        ) : (
          <>
            <div className="px-5 pb-3" ref={dropdownRef}>
              <div className="relative">
                <Input
                  placeholder={t("locationPicker.searchPlaceholder")}
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
                {t("locationPicker.searchHint")}
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
                styles: TAPEE_MAP_STYLES,
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
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={handleConfirm} disabled={!address} className="gap-2">
            <MapPin className="w-4 h-4" />
            {t("locationPicker.useThisLocation")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
