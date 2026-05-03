import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useGetEvent,
  useGetRevenueReport,
  useGetTopUpReport,
  useGetRefundsReport,
  useGetTipsByStaffReport,
  useGetFloatReport,
  useGetSalesHeatmap,
  useGetTopupsHeatmap,
  useGetAnalyticsSummary,
  useGetAnalyticsTopMerchants,
  customFetch,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DollarSign, TrendingUp, RefreshCcw, Gift, Droplets, BarChart2,
  Users, Ticket, CheckSquare, Clock, CreditCard, Wallet,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatCurrency } from "@/lib/currency";
import { useEventContext } from "@/contexts/event-context";

type TicketsSummaryResponse = {
  totals: {
    ticketsSold: number;
    ticketsCheckedIn: number;
    checkInRate: number;
    ticketRevenue: number;
    guestListRegistrations: number;
  };
  byType: { ticketTypeId: string | null; ticketTypeName: string; price: number; sold: number; checkedIn: number }[];
  guestLists: { id: string; name: string; maxGuests: number; currentCount: number; status: string }[];
  checkInsByHour: { hour: number; count: number }[];
};

function useGetTicketsSummary(params: { eventId?: string; startDate?: string; endDate?: string }) {
  return useQuery<TicketsSummaryResponse>({
    queryKey: ["tickets-summary", params],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (params.eventId) qs.set("eventId", params.eventId);
      if (params.startDate) qs.set("from", params.startDate);
      if (params.endDate) qs.set("to", params.endDate);
      const str = qs.toString();
      return customFetch<TicketsSummaryResponse>(`/api/reports/tickets-summary${str ? `?${str}` : ""}`);
    },
    enabled: !!params.eventId,
  });
}

export default function EventReports() {
  const { t } = useTranslation();
  const { eventId } = useEventContext();

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const dateParams = { eventId: eventId || undefined, startDate: startDate || undefined, endDate: endDate || undefined };
  const reportParams = dateParams;

  const { data: summary, isLoading: summaryLoading } = useGetAnalyticsSummary({ eventId: eventId || undefined, from: startDate || undefined, to: endDate || undefined });
  const { data: merchantsData, isLoading: merchantsLoading } = useGetAnalyticsTopMerchants({ eventId: eventId || undefined, from: startDate || undefined, to: endDate || undefined, limit: 50 });
  const { data: revenue, isLoading: revLoading } = useGetRevenueReport(reportParams);
  const { data: topups, isLoading: topupLoading } = useGetTopUpReport(reportParams);
  const { data: refunds, isLoading: refundLoading } = useGetRefundsReport(reportParams);
  const { data: tipsReport, isLoading: tipsLoading } = useGetTipsByStaffReport({ eventId: eventId || undefined, from: startDate || undefined, to: endDate || undefined });
  const { data: floatReport, isLoading: floatLoading } = useGetFloatReport({ eventId: eventId || undefined });
  const { data: salesHeatmapData, isLoading: salesHeatmapLoading } = useGetSalesHeatmap({ eventId: eventId || undefined });
  const { data: topupsHeatmapData, isLoading: topupsHeatmapLoading } = useGetTopupsHeatmap({ eventId: eventId || undefined });
  const { data: ticketsSummary, isLoading: ticketsLoading } = useGetTicketsSummary(dateParams);
  const { data: eventData } = useGetEvent(eventId || "");

  const currency = (eventData as Record<string, unknown> | undefined)?.currencyCode as string ?? "COP";

  type ExtendedSummary = typeof summary & { braceletCount?: number; ticketSales?: number; ticketOrderCount?: number };
  const sum = summary as ExtendedSummary | undefined;

  type FloatData = { totalLoaded?: number; totalSpent?: number; unclaimed?: number; utilizationRate?: number; braceletsWithBalance?: number; uniqueBracelets?: number };
  const float = floatReport as FloatData | undefined;

  type HourBucket = { hour: number; totalAmount: number; transactionCount: number };
  type TopupHourBucket = { hour: number; totalAmount: number; count: number };
  const salesHours = (salesHeatmapData as { byHour?: HourBucket[] } | undefined)?.byHour ?? [];
  const topupHours = (topupsHeatmapData as { byHour?: TopupHourBucket[] } | undefined)?.byHour ?? [];
  const salesMax = Math.max(...salesHours.map((h) => h.totalAmount), 1);
  const topupsMax = Math.max(...topupHours.map((h) => h.totalAmount), 1);
  const checkInsMax = Math.max(...(ticketsSummary?.checkInsByHour.map((h) => h.count) ?? []), 1);

  const fmt = (n?: number | null) => formatCurrency(n ?? 0, currency);
  const avgSpend = (sum?.braceletCount ?? 0) > 0
    ? Math.round((sum?.totalSales ?? 0) / (sum?.braceletCount ?? 1))
    : 0;

  const topUpAvg = (topups as Record<string, unknown> | undefined)?.totalCount as number | undefined;
  const topupTotal = topups as { total?: number; byPaymentMethod?: Record<string, number>; bySource?: { bank?: { total: number; count: number }; digital?: { total: number; count: number } } } | undefined;

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

      <Tabs defaultValue="summary">
        <TabsList className="mb-4">
          <TabsTrigger value="summary">{t("reports.tab.summary")}</TabsTrigger>
          <TabsTrigger value="merchants">{t("reports.tab.merchants")}</TabsTrigger>
          <TabsTrigger value="tickets">{t("reports.tab.tickets")}</TabsTrigger>
          <TabsTrigger value="finance">{t("reports.tab.finance")}</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Resumen Ejecutivo ── */}
        <TabsContent value="summary" className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { icon: <TrendingUp className="w-4 h-4" />, label: t("reports.topUps"), value: fmt(sum?.totalTopUps), sub: `${(topUpAvg ?? 0).toLocaleString()} ${t("reports.topUpCount").toLowerCase()}` },
              { icon: <DollarSign className="w-4 h-4" />, label: t("reports.revenue"), value: fmt(sum?.totalSales), sub: `${(sum?.transactionCount ?? 0).toLocaleString()} ${t("reports.txCount").toLowerCase()}` },
              { icon: <Droplets className="w-4 h-4" />, label: t("reports.unclaimed"), value: fmt(float?.unclaimed), sub: `${float?.utilizationRate ?? 0}% ${t("reports.utilizationRate2").toLowerCase()}` },
              { icon: <Users className="w-4 h-4" />, label: t("reports.totalBracelets"), value: (sum?.braceletCount ?? "—").toString(), sub: fmt(avgSpend) + " " + t("reports.avgSpend").toLowerCase() },
            ].map((item) => (
              <Card key={item.label}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    {item.icon} {item.label}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {summaryLoading ? <p className="text-muted-foreground text-sm">{t("common.loading")}</p> : (
                    <div className="space-y-0.5">
                      <p className="text-2xl font-bold font-mono">{item.value}</p>
                      <p className="text-xs text-muted-foreground">{item.sub}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Ticket className="w-4 h-4" /> {t("reports.ticketRevenue")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold font-mono">{fmt(sum?.ticketSales)}</p>
                <p className="text-xs text-muted-foreground">{(sum?.ticketOrderCount ?? 0).toLocaleString()} {t("reports.ticketOrders").toLowerCase()}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <RefreshCcw className="w-4 h-4" /> {t("reports.refunds")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {refundLoading ? <p className="text-muted-foreground text-sm">{t("common.loading")}</p> : (
                  <div>
                    <p className="text-2xl font-bold font-mono">{fmt(refunds?.totalRefunded)}</p>
                    <p className="text-xs text-muted-foreground">{t("reports.count", { count: (refunds?.count ?? 0).toLocaleString() })}</p>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Wallet className="w-4 h-4" /> {t("reports.pendingBalance")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold font-mono">{fmt(float?.totalLoaded)}</p>
                <p className="text-xs text-muted-foreground">{t("reports.totalLoaded")}</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Tab 2: Ranking de Comerciantes ── */}
        <TabsContent value="merchants" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("reports.merchantRanking")}</CardTitle>
            </CardHeader>
            <CardContent>
              {merchantsLoading ? (
                <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
              ) : !merchantsData?.topMerchants?.length ? (
                <p className="text-muted-foreground text-sm">{t("reports.noActivity")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">{t("reports.rank")}</TableHead>
                      <TableHead>{t("reports.merchant")}</TableHead>
                      <TableHead className="text-right">{t("reports.grossSales")}</TableHead>
                      <TableHead className="text-right">{t("reports.txCount")}</TableHead>
                      <TableHead className="text-right">{t("reports.avgTicket")}</TableHead>
                      <TableHead className="text-right">{t("reports.grossMargin")}</TableHead>
                      <TableHead className="text-right">{t("reports.netRevenue")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {merchantsData.topMerchants.map((m, i) => (
                      <TableRow key={m.merchantId}>
                        <TableCell className="text-muted-foreground font-mono text-xs">{i + 1}</TableCell>
                        <TableCell className="font-medium">{m.merchantName}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(m.totalSales)}</TableCell>
                        <TableCell className="text-right font-mono">{m.txCount.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(m.txCount > 0 ? Math.round(m.totalSales / m.txCount) : 0)}</TableCell>
                        <TableCell className="text-right font-mono">{m.profitMarginPercent.toFixed(1)}%</TableCell>
                        <TableCell className="text-right font-mono">{fmt(m.totalNet)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

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
        </TabsContent>

        {/* ── Tab 3: Tickets & Acceso ── */}
        <TabsContent value="tickets" className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { icon: <Ticket className="w-4 h-4" />, label: t("reports.ticketsSold"), value: (ticketsSummary?.totals.ticketsSold ?? 0).toLocaleString() },
              { icon: <CheckSquare className="w-4 h-4" />, label: t("reports.ticketsCheckedIn"), value: (ticketsSummary?.totals.ticketsCheckedIn ?? 0).toLocaleString() },
              { icon: <TrendingUp className="w-4 h-4" />, label: t("reports.checkInRate"), value: `${ticketsSummary?.totals.checkInRate ?? 0}%` },
              { icon: <DollarSign className="w-4 h-4" />, label: t("reports.ticketRevenue"), value: fmt(ticketsSummary?.totals.ticketRevenue) },
            ].map((item) => (
              <Card key={item.label}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    {item.icon} {item.label}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {ticketsLoading ? <p className="text-muted-foreground text-sm">{t("common.loading")}</p> : (
                    <p className="text-2xl font-bold font-mono">{item.value}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("reports.byTicketType")}</CardTitle>
            </CardHeader>
            <CardContent>
              {ticketsLoading ? (
                <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
              ) : !ticketsSummary?.byType?.length ? (
                <p className="text-muted-foreground text-sm">{t("reports.noTickets")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("reports.byTicketType")}</TableHead>
                      <TableHead className="text-right">{t("reports.price")}</TableHead>
                      <TableHead className="text-right">{t("reports.ticketsSold")}</TableHead>
                      <TableHead className="text-right">{t("reports.ticketsCheckedIn")}</TableHead>
                      <TableHead className="text-right">{t("reports.checkInRate")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ticketsSummary.byType.map((row) => (
                      <TableRow key={row.ticketTypeId ?? "__none__"}>
                        <TableCell className="font-medium">{row.ticketTypeName}</TableCell>
                        <TableCell className="text-right font-mono">{row.price > 0 ? fmt(row.price) : "—"}</TableCell>
                        <TableCell className="text-right font-mono">{row.sold.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono">{row.checkedIn.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono">
                          {row.sold > 0 ? `${Math.round((row.checkedIn / row.sold) * 100)}%` : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("reports.guestLists")}</CardTitle>
            </CardHeader>
            <CardContent>
              {ticketsLoading ? (
                <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
              ) : !ticketsSummary?.guestLists?.length ? (
                <p className="text-muted-foreground text-sm">{t("reports.noGuestLists")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("reports.guestLists")}</TableHead>
                      <TableHead className="text-right">{t("reports.capacity")}</TableHead>
                      <TableHead className="text-right">{t("reports.registered")}</TableHead>
                      <TableHead className="text-right">{t("reports.checkInRate")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ticketsSummary.guestLists.map((gl) => (
                      <TableRow key={gl.id}>
                        <TableCell className="font-medium">
                          {gl.name}
                          <span className="ml-2 text-xs text-muted-foreground">
                            {gl.status === "active" ? t("reports.open") : t("reports.closed")}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono">{gl.maxGuests.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono">{gl.currentCount.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono">
                          {gl.maxGuests > 0 ? `${Math.round((gl.currentCount / gl.maxGuests) * 100)}%` : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-checkins-heatmap">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Clock className="w-4 h-4" /> {t("reports.checkInsByHour")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {ticketsLoading ? (
                <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
              ) : ticketsSummary?.checkInsByHour.every((h) => h.count === 0) ? (
                <p className="text-muted-foreground text-sm">{t("reports.noCheckins")}</p>
              ) : (
                <div className="space-y-1">
                  {(ticketsSummary?.checkInsByHour ?? []).map((h) => {
                    const intensity = h.count / checkInsMax;
                    const pct = Math.max(intensity * 100, h.count > 0 ? 2 : 0);
                    return (
                      <div key={h.hour} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-7 text-right">{String(h.hour).padStart(2, "0")}h</span>
                        <div className="flex-1 h-3 bg-muted rounded overflow-hidden">
                          <div className="h-full rounded bg-violet-500" style={{ width: `${pct}%`, opacity: 0.3 + intensity * 0.7 }} />
                        </div>
                        <span className="text-xs font-mono w-12 text-right">{h.count.toLocaleString()}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 4: Finanzas & Liquidación ── */}
        <TabsContent value="finance" className="space-y-6">
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
                    <p className="text-2xl font-bold">{fmt(topupTotal?.total)}</p>
                    <p className="text-xs text-muted-foreground">{t("reports.totalLoaded")}</p>
                    {topupTotal?.bySource && (
                      <div className="pt-1 space-y-1">
                        <p className="text-xs text-muted-foreground">{t("reports.bankTopups")}: <span className="font-mono font-medium">{fmt(topupTotal.bySource.bank?.total)}</span></p>
                        <p className="text-xs text-muted-foreground">{t("reports.digitalTopups")}: <span className="font-mono font-medium">{fmt(topupTotal.bySource.digital?.total)}</span></p>
                      </div>
                    )}
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
                    {refunds?.byRefundMethod && Object.keys(refunds.byRefundMethod).length > 0 && (
                      <div className="pt-1 space-y-1">
                        {Object.entries(refunds.byRefundMethod).map(([method, data]) => (
                          <p key={method} className="text-xs text-muted-foreground">
                            {method}: <span className="font-mono font-medium">{fmt((data as { total: number }).total)}</span>
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {topupTotal?.byPaymentMethod && Object.keys(topupTotal.byPaymentMethod).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CreditCard className="w-4 h-4" /> {t("reports.paymentMethods")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(topupTotal.byPaymentMethod)
                    .sort(([, a], [, b]) => (b as number) - (a as number))
                    .map(([method, amount]) => (
                      <div key={method} className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-0 last:pb-0">
                        <span className="font-medium capitalize">{method.replace(/_/g, " ")}</span>
                        <span className="font-mono">{fmt(amount as number)}</span>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

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
        </TabsContent>
      </Tabs>
    </div>
  );
}
