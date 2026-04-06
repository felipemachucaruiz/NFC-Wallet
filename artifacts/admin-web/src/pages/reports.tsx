import { useState } from "react";
import {
  useGetRevenueReport,
  useGetTopUpReport,
  useGetRefundsReport,
  useGetFiscalSummary,
  useListEvents,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { DollarSign, TrendingUp, CreditCard, RefreshCcw } from "lucide-react";

export default function Reports() {
  const { data: eventsData } = useListEvents();
  const events = eventsData?.events ?? [];

  const [eventId, setEventId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const params = {
    eventId: eventId || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  };

  const { data: revenue, isLoading: revLoading } = useGetRevenueReport(params);
  const { data: topups, isLoading: topupLoading } = useGetTopUpReport(params);
  const { data: refunds, isLoading: refundLoading } = useGetRefundsReport(params);
  const { data: fiscal, isLoading: fiscalLoading } = useGetFiscalSummary(params);

  const fmt = (n?: number | null) => (n ?? 0).toLocaleString();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground mt-1">Financial and operational summaries.</p>
      </div>

      <div className="flex flex-wrap gap-4 p-4 bg-card border border-border rounded-lg">
        <div className="space-y-1 min-w-48">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Event</Label>
          <Select value={eventId || "all"} onValueChange={(v) => setEventId(v === "all" ? "" : v)}>
            <SelectTrigger data-testid="select-report-event"><SelectValue placeholder="All events" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All events</SelectItem>
              {events.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Start Date</Label>
          <Input data-testid="input-report-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">End Date</Label>
          <Input data-testid="input-report-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card data-testid="card-revenue">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4" /> Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            {revLoading ? <p className="text-muted-foreground text-sm">Loading...</p> : (
              <div className="space-y-1">
                <p className="text-2xl font-bold">${fmt(revenue?.totals.grossSalesCop)}</p>
                <p className="text-xs text-muted-foreground">Gross sales (COP)</p>
                <p className="text-sm">Net: ${fmt(revenue?.totals.netCop)}</p>
                <p className="text-sm text-muted-foreground">Commission: ${fmt(revenue?.totals.commissionCop)}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-topups">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CreditCard className="w-4 h-4" /> Top-Ups
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topupLoading ? <p className="text-muted-foreground text-sm">Loading...</p> : (
              <div className="space-y-1">
                <p className="text-2xl font-bold">${fmt(topups?.totalCop)}</p>
                <p className="text-xs text-muted-foreground">Total loaded (COP)</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-refunds">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <RefreshCcw className="w-4 h-4" /> Refunds
            </CardTitle>
          </CardHeader>
          <CardContent>
            {refundLoading ? <p className="text-muted-foreground text-sm">Loading...</p> : (
              <div className="space-y-1">
                <p className="text-2xl font-bold">${fmt(refunds?.totalRefundedCop)}</p>
                <p className="text-xs text-muted-foreground">Total refunded (COP)</p>
                <p className="text-sm">Count: {(refunds?.count ?? 0).toLocaleString()}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-fiscal">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Fiscal Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            {fiscalLoading ? <p className="text-muted-foreground text-sm">Loading...</p> : (
              <div className="space-y-1">
                <p className="text-2xl font-bold">${fmt(fiscal?.totals.totalIvaCop)}</p>
                <p className="text-xs text-muted-foreground">IVA collected (COP)</p>
                <p className="text-sm">Retención: ${fmt(fiscal?.totals.totalRetencionFuenteCop)}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {revenue?.byMerchant && revenue.byMerchant.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revenue by Merchant</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {revenue.byMerchant.map((row, i) => (
                <div key={i} className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-0 last:pb-0">
                  <span className="font-medium">{row.merchantName}</span>
                  <div className="text-right">
                    <span className="font-mono">${(row.data.grossSalesCop ?? 0).toLocaleString()}</span>
                    <span className="text-muted-foreground ml-2 text-xs">gross</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
