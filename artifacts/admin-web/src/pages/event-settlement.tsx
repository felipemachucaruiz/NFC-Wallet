import { fmtDateTime } from "@/lib/date";
import {
  useGetCurrentAuthUser,
  useGetSettlementReport,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DollarSign, TrendingUp, Percent, Receipt } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatCurrency } from "@/lib/currency";
import { useEventContext } from "@/contexts/event-context";

export default function EventSettlement() {
  const { t } = useTranslation();
  const { data: auth } = useGetCurrentAuthUser();
  const { eventId } = useEventContext();

  const { data: report, isLoading } = useGetSettlementReport(eventId || null);

  const fmt = (n?: number | null, cur?: string) => formatCurrency(n ?? 0, cur ?? "COP");

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">{t("settlement.title")}</h1>
        <p className="text-muted-foreground">{t("settlement.loading")}</p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">{t("settlement.title")}</h1>
        <p className="text-muted-foreground">{t("settlement.noData")}</p>
      </div>
    );
  }

  const currency = report.currencyCode ?? "COP";
  const isNonCop = currency !== "COP";
  const cop = report.copConversion;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("settlement.title")}</h1>
          <p className="text-muted-foreground mt-1">
            {report.eventName} — {t("settlement.generatedAt", { date: fmtDateTime(report.generatedAt) })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-sm">{currency}</Badge>
          <Badge variant={report.eventClosed ? "destructive" : "default"} className="text-sm">
            {report.eventClosed ? t("settlement.eventClosed") : t("settlement.eventActive")}
          </Badge>
        </div>
      </div>

      {isNonCop && cop && (
        <div className="p-3 bg-muted/50 border border-border rounded-lg text-sm text-muted-foreground">
          1 {currency} = {cop.rate.toLocaleString(undefined, { maximumFractionDigits: 2 })} COP
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4" /> {t("settlement.grossSales")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmt(report.totals.grossSales, currency)}</p>
            {isNonCop && cop && <p className="text-xs text-muted-foreground mt-1">{fmt(cop.copTotals.grossSales, "COP")}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> {t("settlement.tips")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmt(report.totals.tips, currency)}</p>
            {isNonCop && cop && <p className="text-xs text-muted-foreground mt-1">{fmt(cop.copTotals.tips, "COP")}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Percent className="w-4 h-4" /> {t("settlement.commissions")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmt(report.totals.commissions, currency)}</p>
            {isNonCop && cop && <p className="text-xs text-muted-foreground mt-1">{fmt(cop.copTotals.commissions, "COP")}</p>}
            <p className="text-xs text-muted-foreground">{t("settlement.commissionDesc")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Receipt className="w-4 h-4" /> {t("settlement.netPayout")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmt(report.totals.netPayout, currency)}</p>
            {isNonCop && cop && <p className="text-xs text-muted-foreground mt-1">{fmt(cop.copTotals.netPayout, "COP")}</p>}
            <p className="text-xs text-muted-foreground">{t("settlement.transactionCount", { count: report.totals.transactionCount })}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settlement.merchantBreakdown")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("settlement.colMerchant")}</TableHead>
                <TableHead>{t("settlement.colCommission")}</TableHead>
                <TableHead className="text-right">{t("settlement.colGross")} ({currency})</TableHead>
                <TableHead className="text-right">{t("settlement.colTips")} ({currency})</TableHead>
                <TableHead className="text-right">{t("settlement.colCommissions")} ({currency})</TableHead>
                <TableHead className="text-right">{t("settlement.colNet")} ({currency})</TableHead>
                <TableHead className="text-right">{t("settlement.colTransactions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.merchants.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">{t("settlement.noMerchants")}</TableCell></TableRow>
              ) : (
                report.merchants.map((m) => (
                  <TableRow key={m.merchantId}>
                    <TableCell className="font-medium">{m.merchantName}</TableCell>
                    <TableCell className="font-mono text-sm">{m.commissionRatePercent}%</TableCell>
                    <TableCell className="text-right font-mono">{fmt(m.grossSales, currency)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(m.tips, currency)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(m.commissions, currency)}</TableCell>
                    <TableCell className="text-right font-mono font-bold">{fmt(m.netPayout, currency)}</TableCell>
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
