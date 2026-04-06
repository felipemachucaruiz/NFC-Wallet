import { useState } from "react";
import {
  useGetCurrentAuthUser,
  useGetRevenueReport,
  useGetTopUpReport,
  useGetRefundsReport,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DollarSign, TrendingUp, RefreshCcw } from "lucide-react";

export default function EventReports() {
  const { data: auth } = useGetCurrentAuthUser();
  const eventId = auth?.user?.eventId ?? "";

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const params = { eventId: eventId || undefined, startDate: startDate || undefined, endDate: endDate || undefined };

  const { data: revenue, isLoading: revLoading } = useGetRevenueReport(params);
  const { data: topups, isLoading: topupLoading } = useGetTopUpReport(params);
  const { data: refunds, isLoading: refundLoading } = useGetRefundsReport(params);

  const fmt = (n?: number | null) => (n ?? 0).toLocaleString();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground mt-1">Financial summaries for your event.</p>
      </div>

      <div className="flex gap-4 p-4 bg-card border border-border rounded-lg">
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Start Date</Label>
          <Input data-testid="input-report-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">End Date</Label>
          <Input data-testid="input-report-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
              <TrendingUp className="w-4 h-4" /> Top-Ups
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
                  <span className="font-mono">${(row.data.grossSalesCop ?? 0).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
