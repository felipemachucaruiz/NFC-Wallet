import {
  useGetCurrentAuthUser,
  useGetSettlementReport,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DollarSign, TrendingUp, Percent, Receipt } from "lucide-react";

export default function EventSettlement() {
  const { data: auth } = useGetCurrentAuthUser();
  const eventId = auth?.user?.eventId ?? "";

  const { data: report, isLoading } = useGetSettlementReport(eventId || null);

  const fmt = (n?: number | null) => (n ?? 0).toLocaleString();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Settlement Report</h1>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Settlement Report</h1>
        <p className="text-muted-foreground">No settlement data available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settlement Report</h1>
          <p className="text-muted-foreground mt-1">{report.eventName} — Generated {new Date(report.generatedAt).toLocaleString()}</p>
        </div>
        <Badge variant={report.eventClosed ? "destructive" : "default"} className="text-sm">
          {report.eventClosed ? "Event Closed" : "Event Active"}
        </Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4" /> Gross Sales
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">${fmt(report.totals.grossSalesCop)}</p>
            <p className="text-xs text-muted-foreground">COP</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Tips
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">${fmt(report.totals.tipsCop)}</p>
            <p className="text-xs text-muted-foreground">COP</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Percent className="w-4 h-4" /> Commissions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">${fmt(report.totals.commissionsCop)}</p>
            <p className="text-xs text-muted-foreground">COP earned by Tapee</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Receipt className="w-4 h-4" /> Net Payout
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">${fmt(report.totals.netPayoutCop)}</p>
            <p className="text-xs text-muted-foreground">{report.totals.transactionCount} transactions</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Merchant Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Merchant</TableHead>
                <TableHead>Commission %</TableHead>
                <TableHead className="text-right">Gross Sales</TableHead>
                <TableHead className="text-right">Tips</TableHead>
                <TableHead className="text-right">Commissions</TableHead>
                <TableHead className="text-right">Net Payout</TableHead>
                <TableHead className="text-right">Transactions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.merchants.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No merchants.</TableCell></TableRow>
              ) : (
                report.merchants.map((m) => (
                  <TableRow key={m.merchantId}>
                    <TableCell className="font-medium">{m.merchantName}</TableCell>
                    <TableCell className="font-mono text-sm">{m.commissionRatePercent}%</TableCell>
                    <TableCell className="text-right font-mono">${m.grossSalesCop.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono">${m.tipsCop.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono">${m.commissionsCop.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono font-bold">${m.netPayoutCop.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{m.transactionCount}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
