import { useState } from "react";
import {
  useGetCurrentAuthUser,
  useGetEvent,
  useGetRevenueReport,
  useGetTopUpReport,
  useGetRefundsReport,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DollarSign, TrendingUp, RefreshCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatCurrency } from "@/lib/currency";

export default function EventReports() {
  const { t } = useTranslation();
  const { data: auth } = useGetCurrentAuthUser();
  const eventId = auth?.user?.eventId ?? "";

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const params = { eventId: eventId || undefined, startDate: startDate || undefined, endDate: endDate || undefined };

  const { data: revenue, isLoading: revLoading } = useGetRevenueReport(params);
  const { data: topups, isLoading: topupLoading } = useGetTopUpReport(params);
  const { data: refunds, isLoading: refundLoading } = useGetRefundsReport(params);
  const { data: eventData } = useGetEvent(eventId || "");
  const currency = (eventData as Record<string, unknown> | undefined)?.currencyCode as string ?? "COP";

  const fmt = (n?: number | null) => formatCurrency(n ?? 0, currency);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("reports.title")}</h1>
        <p className="text-muted-foreground mt-1">{t("reports.subtitleEvent")}</p>
      </div>

      <div className="flex gap-4 p-4 bg-card border border-border rounded-lg">
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">{t("reports.startDate")}</Label>
          <Input data-testid="input-report-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">{t("reports.endDate")}</Label>
          <Input data-testid="input-report-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card data-testid="card-revenue">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4" /> {t("reports.revenue")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {revLoading ? <p className="text-muted-foreground text-sm">{t("common.loading")}</p> : (
              <div className="space-y-1">
                <p className="text-2xl font-bold">{fmt(revenue?.totals.grossSales)}</p>
                <p className="text-xs text-muted-foreground">{t("reports.grossSales")}</p>
                <p className="text-sm">{t("reports.net", { value: fmt(revenue?.totals.net) })}</p>
                <p className="text-sm text-muted-foreground">{t("reports.commission", { value: fmt(revenue?.totals.commission) })}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-topups">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> {t("reports.topUps")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topupLoading ? <p className="text-muted-foreground text-sm">{t("common.loading")}</p> : (
              <div className="space-y-1">
                <p className="text-2xl font-bold">{fmt(topups?.total)}</p>
                <p className="text-xs text-muted-foreground">{t("reports.totalLoaded")}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-refunds">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <RefreshCcw className="w-4 h-4" /> {t("reports.refunds")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {refundLoading ? <p className="text-muted-foreground text-sm">{t("common.loading")}</p> : (
              <div className="space-y-1">
                <p className="text-2xl font-bold">{fmt(refunds?.totalRefunded)}</p>
                <p className="text-xs text-muted-foreground">{t("reports.totalRefunded")}</p>
                <p className="text-sm">{t("reports.count", { count: (refunds?.count ?? 0).toLocaleString() })}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {revenue?.byMerchant && revenue.byMerchant.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("reports.revenueByMerchant")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {revenue.byMerchant.map((row, i) => (
                <div key={i} className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-0 last:pb-0">
                  <span className="font-medium">{row.merchantName}</span>
                  <span className="font-mono">{fmt(row.data.grossSales)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
