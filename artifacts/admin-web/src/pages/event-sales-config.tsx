import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetCurrentAuthUser, useGetEvent } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateTimePicker } from "@/components/ui/datetime-picker";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Settings, Globe, DoorOpen, ShoppingCart, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEventContext } from "@/contexts/event-context";
import { apiUpdateEvent } from "@/lib/api";

export default function EventSalesConfig() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: auth } = useGetCurrentAuthUser();
  const { eventId: ctxEventId } = useEventContext();
  const resolvedEventId = auth?.user?.role === "admin" ? ctxEventId : (auth?.user?.eventId ?? "");

  const { data: eventData, isLoading } = useGetEvent(resolvedEventId);
  const event = (eventData as { event?: Record<string, unknown> })?.event;

  const [onlineSales, setOnlineSales] = useState(true);
  const [doorSales, setDoorSales] = useState(true);
  const [saleStartsAt, setSaleStartsAt] = useState("");
  const [saleEndsAt, setSaleEndsAt] = useState("");

  useEffect(() => {
    if (!event) return;
    const channel = (event.salesChannel as string) ?? "both";
    setOnlineSales(channel === "online" || channel === "both");
    setDoorSales(channel === "door" || channel === "both");
    if (event.saleStartsAt) {
      const d = new Date(event.saleStartsAt as string);
      setSaleStartsAt(d.toISOString().slice(0, 16));
    }
    if (event.saleEndsAt) {
      const d = new Date(event.saleEndsAt as string);
      setSaleEndsAt(d.toISOString().slice(0, 16));
    }
  }, [event]);

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiUpdateEvent(resolvedEventId, body),
    onSuccess: () => {
      toast({ title: t("salesConfig.saved") });
      queryClient.invalidateQueries({ queryKey: ["getEvent"] });
    },
    onError: (e: Error) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const handleSave = () => {
    if (!onlineSales && !doorSales) {
      toast({ title: t("common.error"), description: t("salesConfig.atLeastOneChannel"), variant: "destructive" });
      return;
    }

    let salesChannel: "online" | "door" | "both" = "both";
    if (onlineSales && !doorSales) salesChannel = "online";
    else if (!onlineSales && doorSales) salesChannel = "door";

    mutation.mutate({
      salesChannel,
      saleStartsAt: saleStartsAt ? new Date(saleStartsAt).toISOString() : null,
      saleEndsAt: saleEndsAt ? new Date(saleEndsAt).toISOString() : null,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("salesConfig.title")}</h1>
        <p className="text-muted-foreground mt-1">{t("salesConfig.subtitle")}</p>
      </div>

      <div className="grid gap-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" />
              {t("salesConfig.channelsTitle")}
            </CardTitle>
            <CardDescription>{t("salesConfig.channelsDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-md border">
              <div className="flex items-center gap-3">
                <Globe className="w-5 h-5 text-blue-500" />
                <div>
                  <p className="text-sm font-medium">{t("salesConfig.onlineSales")}</p>
                  <p className="text-xs text-muted-foreground">{t("salesConfig.onlineSalesDesc")}</p>
                </div>
              </div>
              <Switch
                data-testid="toggle-online-sales"
                checked={onlineSales}
                onCheckedChange={setOnlineSales}
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-md border">
              <div className="flex items-center gap-3">
                <DoorOpen className="w-5 h-5 text-green-500" />
                <div>
                  <p className="text-sm font-medium">{t("salesConfig.doorSales")}</p>
                  <p className="text-xs text-muted-foreground">{t("salesConfig.doorSalesDesc")}</p>
                </div>
              </div>
              <Switch
                data-testid="toggle-door-sales"
                checked={doorSales}
                onCheckedChange={setDoorSales}
              />
            </div>

            {!onlineSales && !doorSales && (
              <p className="text-xs text-destructive">{t("salesConfig.atLeastOneChannel")}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="w-4 h-4" />
              {t("salesConfig.globalDatesTitle")}
            </CardTitle>
            <CardDescription>{t("salesConfig.globalDatesDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t("salesConfig.saleStart")}</Label>
                <DateTimePicker
                  value={saleStartsAt}
                  onChange={setSaleStartsAt}
                />
              </div>
              <div className="space-y-1">
                <Label>{t("salesConfig.saleEnd")}</Label>
                <DateTimePicker
                  value={saleEndsAt}
                  onChange={setSaleEndsAt}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Button onClick={handleSave} disabled={mutation.isPending} className="w-fit">
          {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
          {mutation.isPending ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </div>
  );
}
