import {
  useGetAnalyticsSummary,
  useGetAnalyticsSalesByHour,
  useGetAnalyticsTopProducts,
  useGetAnalyticsTopMerchants,
  useGetEvent,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { DollarSign, Users, ShoppingCart, TrendingUp, ArrowUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatCurrency } from "@/lib/currency";
import { useEventContext } from "@/contexts/event-context";

export default function EventDashboard() {
  const { t } = useTranslation();
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
        <h1 className="text-2xl font-bold tracking-tight">{t("eventDashboard.title")}</h1>
        <p className="text-muted-foreground text-sm mt-0.5">{t("eventDashboard.subtitle")}</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <StatCard
          data-testid="card-revenue"
          loading={summaryLoading}
          icon={DollarSign}
          iconColor="text-primary"
          iconBg="bg-primary/10"
          label={t("eventDashboard.revenue")}
          value={fmt(summary?.totalSales)}
          sub={t("eventDashboard.totalSales")}
        />
        <StatCard
          data-testid="card-transactions"
          loading={summaryLoading}
          icon={ShoppingCart}
          iconColor="text-blue-400"
          iconBg="bg-blue-400/10"
          label={t("eventDashboard.transactions")}
          value={summary?.transactionCount ?? 0}
          sub={t("eventDashboard.totalProcessed")}
        />
        <StatCard
          data-testid="card-topups"
          loading={summaryLoading}
          icon={TrendingUp}
          iconColor="text-emerald-400"
          iconBg="bg-emerald-400/10"
          label={t("eventDashboard.topUps")}
          value={fmt(summary?.totalTopUps)}
          sub={t("eventDashboard.totalLoaded")}
        />
        <StatCard
          data-testid="card-bracelets"
          loading={summaryLoading}
          icon={Users}
          iconColor="text-violet-400"
          iconBg="bg-violet-400/10"
          label={t("eventDashboard.bracelets")}
          value={summary?.braceletCount ?? 0}
          sub={t("eventDashboard.activeWristbands")}
        />
        <StatCard
          data-testid="card-pending-balance"
          loading={summaryLoading}
          icon={ArrowUpRight}
          iconColor="text-amber-400"
          iconBg="bg-amber-400/10"
          label={t("eventDashboard.pendingBalance")}
          value={fmt(summary?.pendingBalance)}
          sub={t("eventDashboard.balanceOnWristbands")}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {topMerchants.length > 0 && (
          <Card data-testid="card-top-merchants">
            <CardContent className="p-5">
              <p className="text-sm font-semibold mb-4">{t("eventDashboard.topMerchants")}</p>
              <div className="space-y-3">
                {topMerchants.map((m, i) => (
                  <div key={m.merchantId ?? i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground shrink-0">
                        {i + 1}
                      </span>
                      <span className="font-medium text-xs">{m.merchantName ?? m.merchantId}</span>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-xs font-semibold">{fmt(m.totalSales)}</p>
                      <p className="text-[10px] text-muted-foreground">{m.txCount} {t("eventDashboard.txns")}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {topProducts.length > 0 && (
          <Card data-testid="card-top-products">
            <CardContent className="p-5">
              <p className="text-sm font-semibold mb-4">{t("eventDashboard.topProducts")}</p>
              <div className="space-y-3">
                {topProducts.map((p, i) => (
                  <div key={p.productId ?? i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground shrink-0">
                        {i + 1}
                      </span>
                      <span className="font-medium text-xs">{p.productName ?? p.productId}</span>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-xs font-semibold">{fmt(p.totalRevenue)}</p>
                      <p className="text-[10px] text-muted-foreground">{p.totalUnits} {t("eventDashboard.sold")}</p>
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
          <CardContent className="p-5">
            <p className="text-sm font-semibold mb-4">{t("eventDashboard.salesByHour")}</p>
            <div className="flex items-end gap-1 h-32">
              {salesByHour.map((row, i) => {
                const max = Math.max(...salesByHour.map((r) => r.total ?? 0), 1);
                const pct = ((row.total ?? 0) / max) * 100;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${row.hour}:00 — ${fmt(row.total)}`}>
                    <div
                      className="w-full bg-primary/60 hover:bg-primary rounded-t transition-colors"
                      style={{ height: `${Math.max(pct, 4)}%` }}
                    />
                    {salesByHour.length <= 12 && (
                      <span className="text-[10px] text-muted-foreground">{row.hour}</span>
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

function StatCard({
  icon: Icon,
  iconColor,
  iconBg,
  label,
  value,
  sub,
  loading,
  "data-testid": testId,
}: {
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  label: string;
  value: string | number;
  sub: string;
  loading?: boolean;
  "data-testid"?: string;
}) {
  return (
    <Card data-testid={testId} className={loading ? "opacity-60" : ""}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider truncate">{label}</p>
            <p className="text-2xl font-bold mt-1.5 tracking-tight">{value}</p>
            <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>
          </div>
          <div className={`w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}>
            <Icon className={`w-4 h-4 ${iconColor}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
