import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { customFetch } from "@workspace/api-client-react";
import { CreditCard } from "lucide-react";

const ALL_METHODS = [
  "nequi",
  "pse",
  "card",
  "bancolombia_transfer",
  "daviplata",
  "puntoscolombia",
] as const;

type Method = (typeof ALL_METHODS)[number];

const METHOD_META: Record<Method, { label: string; color: string; svg: string }> = {
  nequi: {
    label: "Nequi",
    color: "#ca0080",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 38.15 30"><path fill="#ca0080" d="M8.38,3.86h-3.93c-.46,0-.83.37-.83.83v3.34c0,.46.37.83.83.83h3.93c.46,0,.83-.37.83-.83v-3.34c0-.46-.37-.83-.83-.83Z"/><path fill="currentColor" d="M32.4,3.86h-3.39c-.46,0-.83.38-.83.83v13.55c0,.28-.36.38-.49.13l-7.88-14.15c-.13-.23-.36-.36-.64-.36h-5.64c-.46,0-.83.38-.83.83v21.65c0,.46.38.83.83.83h3.39c.46,0,.83-.38.83-.83v-13.96c0-.28.36-.38.49-.13l8.1,14.57c.13.23.36.36.64.36h5.39c.46,0,.83-.38.83-.83V4.68c0-.46-.38-.83-.83-.83h.03Z"/></svg>`,
  },
  pse: {
    label: "PSE",
    color: "#1a1a2e",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 38 38"><path fill="currentColor" d="M12.17,15.02h0s.54.01.54.01l.07-.4h-.73l-.05.2s0,.09.03.12.07.06.12.06ZM28.26,16.97h.01s-2.23.01-2.23.01c-.42,0-.77.29-.85.7l-.27,1.46h3.97l.23-1.14c.05-.25-.01-.51-.18-.71-.17-.2-.41-.32-.67-.32ZM15.11,16.98h-1.93c-.5,0-.92.35-1.01.84l-.15.79-.46,2.53c-.06.29.02.6.22.84.19.24.48.36.78.36h1.94c.5,0,.92-.35,1.01-.84l.6-3.32c.06-.29-.02-.6-.22-.84-.19-.24-.48-.36-.78-.36ZM18.99,3.85c-6.1,0-11.39,3.46-14.03,8.51.37.02.68.33.68.71s-.32.73-.73.73c-.22,0-.4-.1-.53-.25-.15.33-.26.68-.38,1.03l-.03.09c.18.14.29.33.29.57,0,.37-.29.68-.66.7-.1.41-.18.83-.25,1.25h2.02l1.67,2.04h3.28v.57h-1.69l-1.29,2.32h-1.76c-.11.26-.36.44-.66.44-.4,0-.73-.32-.73-.73s.32-.73.73-.73c.29,0,.56.18.66.44h1.43l.97-1.76H3.17c0,1.2.16,2.37.43,3.5.26.1.45.36.45.67,0,.17-.07.32-.16.44.14.45.31.9.49,1.33.14-.17.33-.28.56-.28.4,0,.73.32.73.73s-.32.73-.73.73h-.01c2.63,5.11,7.93,8.61,14.08,8.61,8.74,0,15.83-7.08,15.83-15.83S27.74,3.85,18.99,3.85Z"/></svg>`,
  },
  card: {
    label: "Tarjeta",
    color: "#3b82f6",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`,
  },
  bancolombia_transfer: {
    label: "Bancolombia",
    color: "#f0c000",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 110.54 110.83"><path fill="currentColor" d="M82.66.03c-21.47,2.65-42.21,6.56-63,12.59-2.71.85-4.37,3.88-3.69,6.57,1.52,5.99,2.29,8.99,3.83,15,.65,2.54,3.21,3.84,5.8,2.98,21.24-6.54,42.53-11.01,64.51-14.27,2.52-.34,3.89-2.94,2.97-5.55-1.95-5.51-2.93-8.25-4.92-13.73-.86-2.32-3.15-3.85-5.5-3.59ZM100.62,33.37c-33.61,4.29-66.35,12.6-97.39,26.34-2.26,1.07-3.62,3.92-3.14,6.43,1.22,6.42,1.83,9.64,3.07,16.07.53,2.75,3.1,4.02,5.63,2.78,31.53-14.45,64.84-23.64,99.01-29.12,2.17-.36,3.28-2.85,2.45-5.41-1.72-5.32-2.59-7.98-4.37-13.27-.81-2.46-3.04-4.11-5.26-3.82ZM100.22,69.19c-20.99,4.56-41.51,10.05-61.83,17.03-2.58.95-4.03,3.66-3.35,6.17,1.62,5.96,2.42,8.95,4.06,14.93.77,2.81,3.93,4.25,6.83,3.14,20.31-7.28,40.83-13.63,61.79-18.73,2.01-.49,3-2.85,2.26-5.28-1.65-5.37-2.48-8.05-4.18-13.39-.83-2.63-3.27-4.35-5.58-3.87Z"/></svg>`,
  },
  daviplata: {
    label: "Daviplata",
    color: "#e30613",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18"/></svg>`,
  },
  puntoscolombia: {
    label: "Puntos Colombia",
    color: "#5e00cc",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  },
};

export default function PlatformConfig() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [enabled, setEnabled] = useState<Method[]>([...ALL_METHODS]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    customFetch("/api/platform-config/payment-methods")
      .then((res) => res.json())
      .then((data: { enabledPaymentMethods: Method[] }) => {
        setEnabled(data.enabledPaymentMethods ?? [...ALL_METHODS]);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const toggle = (method: Method) => {
    setEnabled((prev) => {
      if (prev.includes(method)) {
        if (prev.length === 1) return prev;
        return prev.filter((m) => m !== method);
      }
      return [...prev, method];
    });
  };

  const save = async () => {
    setIsSaving(true);
    try {
      const res = await customFetch("/api/platform-config/payment-methods", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabledPaymentMethods: enabled }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as Record<string, string>).error ?? t("common.error"));
      }
      toast({ title: t("platformConfig.saved"), variant: "default" });
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : t("common.error"), variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <CreditCard className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">{t("platformConfig.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("platformConfig.subtitle")}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">{t("platformConfig.methodsTitle")}</CardTitle>
          <CardDescription className="text-xs">{t("platformConfig.methodsDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <div className="text-sm text-muted-foreground py-4 text-center">{t("common.loading")}</div>
          ) : (
            ALL_METHODS.map((method) => {
              const meta = METHOD_META[method];
              const isOn = enabled.includes(method);
              const isLast = enabled.length === 1 && isOn;
              return (
                <div
                  key={method}
                  className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                    isOn ? "border-border bg-card" : "border-border/40 bg-muted/30 opacity-60"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: isOn ? `${meta.color}18` : "transparent", border: `1px solid ${isOn ? meta.color + "40" : "transparent"}` }}
                    >
                      <span
                        className="w-5 h-5 block"
                        style={{ color: isOn ? meta.color : "var(--muted-foreground)" }}
                        dangerouslySetInnerHTML={{ __html: meta.svg }}
                      />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{meta.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {isOn ? t("platformConfig.active") : t("platformConfig.inactive")}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={isOn}
                    onCheckedChange={() => toggle(method)}
                    disabled={isLast}
                    title={isLast ? t("platformConfig.minOneRequired") : undefined}
                  />
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {!isLoading && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {t("platformConfig.activeCount", { count: enabled.length, total: ALL_METHODS.length })}
          </p>
          <Button onClick={save} disabled={isSaving}>
            {isSaving ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      )}
    </div>
  );
}
