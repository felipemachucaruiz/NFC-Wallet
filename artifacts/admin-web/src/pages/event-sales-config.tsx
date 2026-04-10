import { useState } from "react";
import { useGetCurrentAuthUser, useGetEvent } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Settings, Globe, DoorOpen, ShoppingCart } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function EventSalesConfig() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: auth } = useGetCurrentAuthUser();
  const eventId = auth?.user?.eventId ?? "";

  const [onlineSales, setOnlineSales] = useState(true);
  const [doorSales, setDoorSales] = useState(true);
  const [saleStartsAt, setSaleStartsAt] = useState("");
  const [saleEndsAt, setSaleEndsAt] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = () => {
    if (!onlineSales && !doorSales) {
      toast({ title: t("common.error"), description: t("salesConfig.atLeastOneChannel"), variant: "destructive" });
      return;
    }
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      toast({ title: t("salesConfig.saved") });
    }, 500);
  };

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
                <Input
                  type="datetime-local"
                  value={saleStartsAt}
                  onChange={(e) => setSaleStartsAt(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>{t("salesConfig.saleEnd")}</Label>
                <Input
                  type="datetime-local"
                  value={saleEndsAt}
                  onChange={(e) => setSaleEndsAt(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Button onClick={handleSave} disabled={saving} className="w-fit">
          {saving ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </div>
  );
}
