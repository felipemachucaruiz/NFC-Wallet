import { useCallback, useRef, useState, useEffect } from "react";
import { GoogleMap, Marker, Autocomplete, useJsApiLoader } from "@react-google-maps/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MapPin } from "lucide-react";
import { GOOGLE_MAPS_API_KEY, MAPS_LIBRARIES, DEFAULT_CENTER } from "@/lib/maps";

type Props = {
  open: boolean;
  initialAddress?: string;
  onConfirm: (address: string) => void;
  onClose: () => void;
};

export function LocationMapPicker({ open, initialAddress, onConfirm, onClose }: Props) {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: MAPS_LIBRARIES,
  });

  const [marker, setMarker] = useState<google.maps.LatLngLiteral | null>(null);
  const [address, setAddress] = useState(initialAddress ?? "");
  const [searchValue, setSearchValue] = useState(initialAddress ?? "");

  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);

  useEffect(() => {
    if (open) {
      setAddress(initialAddress ?? "");
      setSearchValue(initialAddress ?? "");
      setMarker(null);
    }
  }, [open, initialAddress]);

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
  };

  const handlePlaceChanged = () => {
    const place = autocompleteRef.current?.getPlace();
    if (!place?.geometry?.location) return;
    const lat = place.geometry.location.lat();
    const lng = place.geometry.location.lng();
    const pos = { lat, lng };
    setMarker(pos);
    setAddress(place.formatted_address ?? "");
    setSearchValue(place.formatted_address ?? "");
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
          <div className="h-96 flex items-center justify-center text-muted-foreground text-sm">
            Loading map…
          </div>
        ) : (
          <>
            <div className="px-5 pb-3">
              <Autocomplete
                onLoad={(a) => (autocompleteRef.current = a)}
                onPlaceChanged={handlePlaceChanged}
              >
                <Input
                  placeholder="Search for an address or city…"
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  className="w-full"
                />
              </Autocomplete>
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
                styles: [
                  { elementType: "geometry", stylers: [{ color: "#1a1a2e" }] },
                  { elementType: "labels.text.fill", stylers: [{ color: "#8a8ab0" }] },
                  { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a2e" }] },
                  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2d2d44" }] },
                  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0d1117" }] },
                ],
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
