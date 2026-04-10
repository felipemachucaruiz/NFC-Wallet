import { useState } from "react";
import { useGetCurrentAuthUser, useGetEvent } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { MapPin, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LocationMapPicker } from "@/components/LocationMapPicker";

export default function EventVenueLocation() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: auth } = useGetCurrentAuthUser();
  const eventId = auth?.user?.eventId ?? "";
  const { data: eventData } = useGetEvent(eventId || "");
  const event = eventData as Record<string, unknown> | undefined;

  const [address, setAddress] = useState<string>((event?.venueAddress as string) ?? "");
  const [lat, setLat] = useState<number | null>(event?.latitude ? parseFloat(String(event.latitude)) : null);
  const [lng, setLng] = useState<number | null>(event?.longitude ? parseFloat(String(event.longitude)) : null);
  const [mapOpen, setMapOpen] = useState(false);

  const handleConfirm = (addr: string, latitude?: number, longitude?: number) => {
    setAddress(addr);
    setLat(latitude ?? null);
    setLng(longitude ?? null);
    toast({ title: t("venueLocation.locationSet") });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("venueLocation.title")}</h1>
        <p className="text-muted-foreground mt-1">{t("venueLocation.subtitle")}</p>
      </div>

      <div className="max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              {t("venueLocation.currentLocation")}
            </CardTitle>
            <CardDescription>{t("venueLocation.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {address ? (
              <div className="p-3 rounded-md border bg-muted/30">
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{address}</p>
                    {lat && lng && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {t("venueLocation.coordinates")}: {lat.toFixed(6)}, {lng.toFixed(6)}
                      </p>
                    )}
                  </div>
                  <Check className="w-4 h-4 text-green-500 shrink-0 ml-auto" />
                </div>
              </div>
            ) : (
              <div className="p-6 rounded-md border border-dashed text-center text-muted-foreground">
                <MapPin className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">{t("venueLocation.noLocation")}</p>
              </div>
            )}

            <Button onClick={() => setMapOpen(true)} className="gap-2">
              <MapPin className="w-4 h-4" />
              {address ? t("venueLocation.changeLocation") : t("venueLocation.setLocation")}
            </Button>
          </CardContent>
        </Card>
      </div>

      <LocationMapPicker
        open={mapOpen}
        initialAddress={address}
        onConfirm={handleConfirm}
        onClose={() => setMapOpen(false)}
      />
    </div>
  );
}
