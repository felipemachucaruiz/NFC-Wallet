import {
  useGetCurrentAuthUser,
  useGetAnalyticsSummary,
  useGetAnalyticsSalesByHour,
  useGetAnalyticsTopProducts,
  useGetAnalyticsTopMerchants,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Users, ShoppingCart, TrendingUp } from "lucide-react";

export default function EventDashboard() {
  const { data: auth } = useGetCurrentAuthUser();
  const eventId = auth?.user?.eventId ?? "";

  const params = eventId ? { eventId } : {};
  const { data: summary, isLoading: summaryLoading } = useGetAnalyticsSummary(params);
  const { data: hourlyData } = useGetAnalyticsSalesByHour(params);
  const { data: productsData } = useGetAnalyticsTopProducts(params);
  const { data: merchantsData } = useGetAnalyticsTopMerchants(params);

  const topProducts = productsData?.topProducts ?? [];
  const topMerchants = merchantsData?.topMerchants ?? [];
  const salesByHour = hourlyData?.salesByHour ?? [];

  const fmt = (n?: number | null) => (n ?? 0).toLocaleString();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Event Dashboard</h1>
        <p className="text-muted-foreground mt-1">Real-time analytics for your event.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card data-testid="card-revenue" className={summaryLoading ? "opacity-60" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4" /> Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">${fmt(summary?.totalSalesCop)}</p>
            <p className="text-xs text-muted-foreground mt-1">total sales (COP)</p>
          </CardContent>
        </Card>

        <Card data-testid="card-transactions">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" /> Transactions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{fmt(summary?.transactionCount)}</p>
            <p className="text-xs text-muted-foreground mt-1">total processed</p>
          </CardContent>
        </Card>

        <Card data-testid="card-topups">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Top-Ups
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">${fmt(summary?.totalTopUpsCop)}</p>
            <p className="text-xs text-muted-foreground mt-1">total loaded (COP)</p>
          </CardContent>
        </Card>

        <Card data-testid="card-bracelets">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="w-4 h-4" /> Bracelets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{fmt(summary?.pendingBalanceCop)}</p>
            <p className="text-xs text-muted-foreground mt-1">active wristbands</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {topMerchants.length > 0 && (
          <Card data-testid="card-top-merchants">
            <CardHeader>
              <CardTitle className="text-base">Top Merchants</CardTitle>
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
                      <p className="font-mono">${(m.totalSalesCop ?? 0).toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">{m.txCount} txns</p>
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
              <CardTitle className="text-base">Top Products</CardTitle>
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
                      <p className="font-mono">${(p.totalRevenueCop ?? 0).toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">{p.totalUnits} sold</p>
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
            <CardTitle className="text-base">Sales by Hour</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1 h-32">
              {salesByHour.map((row, i) => {
                const max = Math.max(...salesByHour.map((r) => r.totalCop ?? 0), 1);
                const pct = ((row.totalCop ?? 0) / max) * 100;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${row.hour}:00 — $${(row.totalCop ?? 0).toLocaleString()}`}>
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
