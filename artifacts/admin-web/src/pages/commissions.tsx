import { useQueries } from "@tanstack/react-query";
import { useListEvents, customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Percent, TrendingUp, DollarSign, Calendar } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatCurrency } from "@/lib/currency";

type EventRow = {
  id: string;
  name: string;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  currencyCode: string;
  platformCommissionRate: string | null;
};

type SummaryResult = {
  totalSales: number;
  totalTopUps: number;
  transactionCount: number;
};

function fmt(n: number, cur: string = "COP") {
  return formatCurrency(Math.round(n), cur);
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

export default function Commissions() {
  const { t } = useTranslation();
  const { data: eventsData, isLoading: eventsLoading } = useListEvents();
  const events = (eventsData?.events ?? []) as unknown as EventRow[];

  const summaryQueries = useQueries({
    queries: events.map((ev) => ({
      queryKey: ["analytics", "summary", ev.id],
      queryFn: () =>
        customFetch<SummaryResult>(`/api/analytics/summary?eventId=${ev.id}`),
      enabled: events.length > 0,
    })),
  });

  const rows = events.map((ev, i) => {
    const rate = parseFloat(ev.platformCommissionRate ?? "0") || 0;
    const summary = summaryQueries[i]?.data;
    const sales = summary?.totalSales ?? 0;
    const commission = (sales * rate) / 100;
    const loading = summaryQueries[i]?.isLoading ?? true;
    return { ev, rate, sales, commission, loading };
  });

  const totalSales = rows.reduce((s, r) => s + r.sales, 0);
  const totalCommission = rows.reduce((s, r) => s + r.commission, 0);
  const allLoading = eventsLoading || summaryQueries.some((q) => q.isLoading);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("commissions.title")}</h1>
        <p className="text-muted-foreground mt-1">{t("commissions.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Calendar className="w-4 h-4" /> {t("commissions.totalEvents")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{events.length}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("commissions.eventsWithSales")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> {t("commissions.totalSales")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold font-mono ${allLoading ? "opacity-40" : ""}`}>{fmt(totalSales)}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("commissions.grossSales")}</p>
          </CardContent>
        </Card>

        <Card className="border-primary/40 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-primary" /> {t("commissions.totalCommission")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold font-mono text-primary ${allLoading ? "opacity-40" : ""}`}>{fmt(totalCommission)}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("commissions.tapeeEarnings")}</p>
          </CardContent>
        </Card>
      </div>

      <div className="border border-border rounded-lg bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("commissions.colEvent")}</TableHead>
              <TableHead>{t("commissions.colPeriod")}</TableHead>
              <TableHead className="text-center">
                <span className="flex items-center gap-1 justify-center">
                  <Percent className="w-3 h-3" /> {t("commissions.colRate")}
                </span>
              </TableHead>
              <TableHead className="text-right">{t("commissions.colSales")}</TableHead>
              <TableHead className="text-right">{t("commissions.colCommission")}</TableHead>
              <TableHead>{t("commissions.colStatus")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {eventsLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{t("common.loading")}</TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{t("commissions.noEvents")}</TableCell>
              </TableRow>
            ) : (
              rows.map(({ ev, rate, sales, commission, loading }) => (
                <TableRow key={ev.id}>
                  <TableCell className="font-medium">{ev.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {formatDate(ev.startsAt)} – {formatDate(ev.endsAt)}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className="font-mono text-primary border-primary/40">
                      {rate.toFixed(1)}%
                    </Badge>
                  </TableCell>
                  <TableCell className={`text-right font-mono tabular-nums ${loading ? "opacity-40" : ""}`}>
                    {fmt(sales, ev.currencyCode)}
                  </TableCell>
                  <TableCell className={`text-right font-mono tabular-nums font-semibold text-primary ${loading ? "opacity-40" : ""}`}>
                    {fmt(commission, ev.currencyCode)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={ev.active ? "default" : "secondary"} className="text-xs">
                      {ev.active ? t("common.active") : t("common.inactive")}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}

            {rows.length > 0 && (
              <TableRow className="border-t-2 border-border bg-muted/30 font-semibold">
                <TableCell colSpan={3} className="text-sm text-muted-foreground">{t("commissions.total")}</TableCell>
                <TableCell className={`text-right font-mono tabular-nums ${allLoading ? "opacity-40" : ""}`}>{fmt(totalSales)}</TableCell>
                <TableCell className={`text-right font-mono tabular-nums text-primary ${allLoading ? "opacity-40" : ""}`}>{fmt(totalCommission)}</TableCell>
                <TableCell />
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground text-right">
        {t("commissions.footnote")}
      </p>
    </div>
  );
}
