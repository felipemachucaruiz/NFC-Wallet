import { useState } from "react";
import {
  useGetCurrentAuthUser,
  useGetEvent,
  useGetRevenueReport,
  useGetTopUpReport,
  useGetRefundsReport,
  useGetTipsByStaffReport,
  useGetFloatReport,
  useGetSalesHeatmap,
  useGetTopupsHeatmap,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { DollarSign, TrendingUp, RefreshCcw, Gift, Droplets, BarChart2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatCurrency } from "@/lib/currency";
import { useEventContext } from "@/contexts/event-context";

export default function EventReports() {
  const { t } = useTranslation();
  const { data: auth } = useGetCurrentAuthUser();
  const { eventId } = useEventContext();

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const params = { eventId: eventId || undefined, startDate: startDate || undefined, endDate: endDate || undefined };

  const { data: revenue, isLoading: revLoading } = useGetRevenueReport(params);
  const { data: topups, isLoading: topupLoading } = useGetTopUpReport(params);
  const { data: refunds, isLoading: refundLoading } = useGetRefundsReport(params);
  const { data: tipsReport, isLoading: tipsLoading } = useGetTipsByStaffReport({ eventId: eventId || undefined, from: startDate || undefined, to: endDate || undefined });
  const { data: floatReport, isLoading: floatLoading } = useGetFloatReport({ eventId: eventId || undefined });
  const { data: salesHeatmapData, isLoading: salesHeatmapLoading } = useGetSalesHeatmap({ eventId: eventId || undefined });
  const { data: topupsHeatmapData, isLoading: topupsHeatmapLoading } = useGetTopupsHeatmap({ eventId: eventId || undefined });
  const { data: eventData } = useGetEvent(eventId || "");
  const currency = (eventData as Record<string, unknown> | undefined)?.currencyCode as string ?? "COP";

  type FloatData = { totalLoaded?: number; totalSpent?: number; unclaimed?: number; utilizationRate?: number; braceletsWithBalance?: number; uniqueBracelets?: number };
  const float = floatReport as FloatData | undefined;
  type HourBucket = { hour: number; totalAmount: number; transactionCount: number };
  type TopupHourBucket = { hour: number; totalAmount: number; count: number };
  const salesHours = (salesHeatmapData as { byHour?: HourBucket[] } | undefined)?.byHour ?? [];
  const topupHours = (topupsHeatmapData as { byHour?: TopupHourBucket[] } | undefined)?.byHour ?? [];
  const salesMax = Math.max(...salesHours.map((h) => h.totalAmount), 1);
  const topupsMax = Math.max(...topupHours.map((h) => h.totalAmount), 1);

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
          <DatePicker data-testid="input-report-start" value={startDate} onChange={setStartDate} className="w-48" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">{t("reports.endDate")}</Label>
          <DatePicker data-testid="input-report-end" value={endDate} onChange={setEndDate} className="w-48" />
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

      <Card data-testid="card-tips-by-staff">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Gift className="w-4 h-4" /> {t("reports.tipsByStaff")}
          </CardTitle>
          <p className="text-xs text-muted-foreground">{t("reports.tipsByStaffSubtitle")}</p>
        </CardHeader>
        <CardContent>
          {tipsLoading ? (
            <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
          ) : !tipsReport?.byStaff || tipsReport.byStaff.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("reports.noTips")}</p>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">{t("reports.totalTips")}</span>
                <span className="text-xl font-bold">{fmt(tipsReport.totals.totalTips)}</span>
              </div>
              <div className="space-y-2">
                {tipsReport.byStaff.map((row, i) => (
                  <div key={i} className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-0 last:pb-0">
                    <div>
                      <p className="font-medium">{[row.firstName, row.lastName].filter(Boolean).join(" ") || row.userId || "—"}</p>
                      <p className="text-xs text-muted-foreground">{row.merchantName ?? "—"} · {row.transactionCount} {t("reports.transactions")}</p>
                    </div>
                    <span className="font-mono font-semibold">{fmt(row.totalTips)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-float">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Droplets className="w-4 h-4" /> {t("reports.floatAnalysis")}
          </CardTitle>
          <p className="text-xs text-muted-foreground">{t("reports.floatSubtitle")}</p>
        </CardHeader>
        <CardContent>
          {floatLoading ? (
            <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {[
                { label: t("reports.totalLoaded"), value: fmt(float?.totalLoaded) },
                { label: t("reports.totalSpent"), value: fmt(float?.totalSpent) },
                { label: t("reports.unclaimed"), value: fmt(float?.unclaimed) },
                { label: t("reports.utilizationRate"), value: `${float?.utilizationRate ?? 0}%` },
                { label: t("reports.braceletsWithBalance"), value: (float?.braceletsWithBalance ?? "—").toString() },
                { label: t("reports.uniqueBracelets"), value: (float?.uniqueBracelets ?? "—").toString() },
              ].map((item) => (
                <div key={item.label} className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">{item.label}</p>
                  <p className="text-lg font-bold font-mono">{item.value}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-testid="card-sales-heatmap">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <BarChart2 className="w-4 h-4" /> {t("reports.salesHeatmap")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {salesHeatmapLoading ? (
              <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
            ) : salesHours.every((h) => h.totalAmount === 0) ? (
              <p className="text-muted-foreground text-sm">{t("reports.noActivity")}</p>
            ) : (
              <div className="space-y-1">
                {salesHours.map((h) => {
                  const intensity = h.totalAmount / salesMax;
                  const pct = Math.max(intensity * 100, h.totalAmount > 0 ? 2 : 0);
                  return (
                    <div key={h.hour} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-7 text-right">{String(h.hour).padStart(2, "0")}h</span>
                      <div className="flex-1 h-3 bg-muted rounded overflow-hidden">
                        <div className="h-full rounded bg-primary" style={{ width: `${pct}%`, opacity: 0.3 + intensity * 0.7 }} />
                      </div>
                      <span className="text-xs font-mono w-24 text-right">{fmt(h.totalAmount)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-topups-heatmap">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <BarChart2 className="w-4 h-4" /> {t("reports.topupsHeatmap")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topupsHeatmapLoading ? (
              <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
            ) : topupHours.every((h) => h.totalAmount === 0) ? (
              <p className="text-muted-foreground text-sm">{t("reports.noActivity")}</p>
            ) : (
              <div className="space-y-1">
                {topupHours.map((h) => {
                  const intensity = h.totalAmount / topupsMax;
                  const pct = Math.max(intensity * 100, h.totalAmount > 0 ? 2 : 0);
                  return (
                    <div key={h.hour} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-7 text-right">{String(h.hour).padStart(2, "0")}h</span>
                      <div className="flex-1 h-3 bg-muted rounded overflow-hidden">
                        <div className="h-full rounded bg-emerald-500" style={{ width: `${pct}%`, opacity: 0.3 + intensity * 0.7 }} />
                      </div>
                      <span className="text-xs font-mono w-24 text-right">{fmt(h.totalAmount)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
