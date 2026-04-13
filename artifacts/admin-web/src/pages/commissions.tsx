import { useQueries } from "@tanstack/react-query";
import { useListEvents, customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Percent, TrendingUp, DollarSign, Calendar, Ticket, CreditCard } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatCurrency } from "@/lib/currency";
import { fmtDate } from "@/lib/date";

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
  ticketSales: number;
  ticketOrderCount: number;
};

function fmt(n: number, cur: string = "COP") {
  return formatCurrency(Math.round(n), cur);
}

function formatDate(d: string | null) {
  return fmtDate(d);
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
    const nfcSales = summary?.totalSales ?? 0;
    const ticketSales = summary?.ticketSales ?? 0;
    const nfcCommission = (nfcSales * rate) / 100;
    const ticketCommission = (ticketSales * rate) / 100;
    const totalCommission = nfcCommission + ticketCommission;
    const loading = summaryQueries[i]?.isLoading ?? true;
    return { ev, rate, nfcSales, ticketSales, nfcCommission, ticketCommission, totalCommission, loading };
  });

  const totalNfcSales = rows.reduce((s, r) => s + r.nfcSales, 0);
  const totalTicketSales = rows.reduce((s, r) => s + r.ticketSales, 0);
  const totalNfcCommission = rows.reduce((s, r) => s + r.nfcCommission, 0);
  const totalTicketCommission = rows.reduce((s, r) => s + r.ticketCommission, 0);
  const grandTotalCommission = totalNfcCommission + totalTicketCommission;
  const allLoading = eventsLoading || summaryQueries.some((q) => q.isLoading);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("commissions.title")}</h1>
        <p className="text-muted-foreground mt-1">{t("commissions.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
              <CreditCard className="w-4 h-4" /> {t("commissions.nfcSales", "Ventas NFC")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold font-mono ${allLoading ? "opacity-40" : ""}`}>{fmt(totalNfcSales)}</p>
            <p className={`text-sm font-mono text-primary ${allLoading ? "opacity-40" : ""}`}>
              {t("commissions.commission", "Comisión")}: {fmt(totalNfcCommission)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Ticket className="w-4 h-4" /> {t("commissions.ticketSales", "Ventas Boletería")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold font-mono ${allLoading ? "opacity-40" : ""}`}>{fmt(totalTicketSales)}</p>
            <p className={`text-sm font-mono text-primary ${allLoading ? "opacity-40" : ""}`}>
              {t("commissions.commission", "Comisión")}: {fmt(totalTicketCommission)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-primary/40 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-primary" /> {t("commissions.totalCommission")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold font-mono text-primary ${allLoading ? "opacity-40" : ""}`}>{fmt(grandTotalCommission)}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("commissions.tapeeEarnings")}</p>
          </CardContent>
        </Card>
      </div>

      <div className="border border-border rounded-lg bg-card overflow-x-auto">
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
              <TableHead className="text-right">{t("commissions.colNfcSales", "NFC")}</TableHead>
              <TableHead className="text-right">{t("commissions.colTicketSales", "Boletería")}</TableHead>
              <TableHead className="text-right">{t("commissions.colNfcCommission", "Com. NFC")}</TableHead>
              <TableHead className="text-right">{t("commissions.colTicketCommission", "Com. Boletería")}</TableHead>
              <TableHead className="text-right">{t("commissions.colTotalCommission", "Total Comisión")}</TableHead>
              <TableHead>{t("commissions.colStatus")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {eventsLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">{t("common.loading")}</TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">{t("commissions.noEvents")}</TableCell>
              </TableRow>
            ) : (
              rows.map(({ ev, rate, nfcSales, ticketSales, nfcCommission, ticketCommission, totalCommission, loading }) => (
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
                    {fmt(nfcSales, ev.currencyCode)}
                  </TableCell>
                  <TableCell className={`text-right font-mono tabular-nums ${loading ? "opacity-40" : ""}`}>
                    {fmt(ticketSales, ev.currencyCode)}
                  </TableCell>
                  <TableCell className={`text-right font-mono tabular-nums text-primary/70 ${loading ? "opacity-40" : ""}`}>
                    {fmt(nfcCommission, ev.currencyCode)}
                  </TableCell>
                  <TableCell className={`text-right font-mono tabular-nums text-primary/70 ${loading ? "opacity-40" : ""}`}>
                    {fmt(ticketCommission, ev.currencyCode)}
                  </TableCell>
                  <TableCell className={`text-right font-mono tabular-nums font-semibold text-primary ${loading ? "opacity-40" : ""}`}>
                    {fmt(totalCommission, ev.currencyCode)}
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
                <TableCell className={`text-right font-mono tabular-nums ${allLoading ? "opacity-40" : ""}`}>{fmt(totalNfcSales)}</TableCell>
                <TableCell className={`text-right font-mono tabular-nums ${allLoading ? "opacity-40" : ""}`}>{fmt(totalTicketSales)}</TableCell>
                <TableCell className={`text-right font-mono tabular-nums text-primary/70 ${allLoading ? "opacity-40" : ""}`}>{fmt(totalNfcCommission)}</TableCell>
                <TableCell className={`text-right font-mono tabular-nums text-primary/70 ${allLoading ? "opacity-40" : ""}`}>{fmt(totalTicketCommission)}</TableCell>
                <TableCell className={`text-right font-mono tabular-nums text-primary ${allLoading ? "opacity-40" : ""}`}>{fmt(grandTotalCommission)}</TableCell>
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
