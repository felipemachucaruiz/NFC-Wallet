import {
  useGetCurrentAuthUser,
  useGetAnalyticsSummary,
  useGetAnalyticsSalesByHour,
  useGetAnalyticsTopProducts,
  useGetAnalyticsTopMerchants,
  useGetEvent,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Users, ShoppingCart, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatCurrency } from "@/lib/currency";
import { useEventContext } from "@/contexts/event-context";

export default function EventDashboard() {
  const { t } = useTranslation();
  const { data: auth } = useGetCurrentAuthUser();
  const { eventId } = useEventContext();

  const params = eventId ? { eventId } : {};
  const { data: rawSummary, isLoading: summaryLoading } = useGetAnalyticsSummary(params);
  const summary = rawSummary as (typeof rawSummary & { braceletCount?: number }) | undefined;
  const { data: hourlyData } = useGetAnalyticsSalesByHour(params);
  const { data: productsData } = useGetAnalyticsTopProducts(params);
  const { data: merchantsData } = useGetAnalyticsTopMerchants(params);
  const { data: eventData } = useGetEvent(eventId || "");
  const currency = (eventData as Record<string, unknown> | undefined)?.currencyCode as string ?? "COP";

  const topProducts = productsData?.topProducts ?? [];
  const topMerchants = merchantsData?.topMerchants ?? [];
  const salesByHour = hourlyData?.salesByHour ?? [];

  const fmt = (n?: number | null) => formatCurrency(n ?? 0, currency);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("eventDashboard.title")}</h1>
        <p className="text-muted-foreground mt-1">{t("eventDashboard.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <Card data-testid="card-revenue" className={summaryLoading ? "opacity-60" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4" /> {t("eventDashboard.revenue")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{fmt(summary?.totalSales)}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("eventDashboard.totalSales")}</p>
          </CardContent>
        </Card>

        <Card data-testid="card-transactions">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" /> {t("eventDashboard.transactions")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{summary?.transactionCount ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("eventDashboard.totalProcessed")}</p>
          </CardContent>
        </Card>

        <Card data-testid="card-topups">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> {t("eventDashboard.topUps")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{fmt(summary?.totalTopUps)}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("eventDashboard.totalLoaded")}</p>
          </CardContent>
        </Card>

        <Card data-testid="card-bracelets">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="w-4 h-4" /> {t("eventDashboard.bracelets")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{summary?.braceletCount ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("eventDashboard.activeWristbands")}</p>
          </CardContent>
        </Card>

        <Card data-testid="card-pending-balance">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4" /> {t("eventDashboard.pendingBalance")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{fmt(summary?.pendingBalance)}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("eventDashboard.balanceOnWristbands")}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {topMerchants.length > 0 && (
          <Card data-testid="card-top-merchants">
            <CardHeader>
              <CardTitle className="text-base">{t("eventDashboard.topMerchants")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {topMerchants.map((m, i) => (
                  <div key={m.merchantId ?? i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground w-5 text-right">{i + 1}.</span>
                      <span className="font-medium">{m.merchantName ?? m.merchantId}</span>
                    </div>
                    <div className="text-right">
                      <p className="font-mono">{fmt(m.totalSales)}</p>
                      <p className="text-xs text-muted-foreground">{m.txCount} {t("eventDashboard.txns")}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {topProducts.length > 0 && (
          <Card data-testid="card-top-products">
            <CardHeader>
              <CardTitle className="text-base">{t("eventDashboard.topProducts")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {topProducts.map((p, i) => (
                  <div key={p.productId ?? i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground w-5 text-right">{i + 1}.</span>
                      <span className="font-medium">{p.productName ?? p.productId}</span>
                    </div>
                    <div className="text-right">
                      <p className="font-mono">{fmt(p.totalRevenue)}</p>
                      <p className="text-xs text-muted-foreground">{p.totalUnits} {t("eventDashboard.sold")}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {salesByHour.length > 0 && (
        <Card data-testid="card-sales-by-hour">
          <CardHeader>
            <CardTitle className="text-base">{t("eventDashboard.salesByHour")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1 h-32">
              {salesByHour.map((row, i) => {
                const max = Math.max(...salesByHour.map((r) => r.total ?? 0), 1);
                const pct = ((row.total ?? 0) / max) * 100;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${row.hour}:00 — ${fmt(row.total)}`}>
                    <div
                      className="w-full bg-primary/70 rounded-t"
                      style={{ height: `${Math.max(pct, 4)}%` }}
                    />
                    {salesByHour.length <= 12 && (
                      <span className="text-xs text-muted-foreground">{row.hour}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
