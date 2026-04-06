import {
  useGetCurrentAuthUser,
  useGetSettlementReport,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DollarSign, TrendingUp, Percent, Receipt } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function EventSettlement() {
  const { t } = useTranslation();
  const { data: auth } = useGetCurrentAuthUser();
  const eventId = auth?.user?.eventId ?? "";

  const { data: report, isLoading } = useGetSettlementReport(eventId || null);

  const fmt = (n?: number | null) => (n ?? 0).toLocaleString();

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("settlement.title")}</h1>
          <p className="text-muted-foreground mt-1">
            {report.eventName} — {t("settlement.generatedAt", { date: new Date(report.generatedAt).toLocaleString() })}
          </p>
        </div>
        <Badge variant={report.eventClosed ? "destructive" : "default"} className="text-sm">
          {report.eventClosed ? t("settlement.eventClosed") : t("settlement.eventActive")}
        </Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4" /> {t("settlement.grossSales")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">${fmt(report.totals.grossSalesCop)}</p>
            <p className="text-xs text-muted-foreground">{t("settlement.cop")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> {t("settlement.tips")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">${fmt(report.totals.tipsCop)}</p>
            <p className="text-xs text-muted-foreground">{t("settlement.cop")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Percent className="w-4 h-4" /> {t("settlement.commissions")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">${fmt(report.totals.commissionsCop)}</p>
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
            <p className="text-2xl font-bold">${fmt(report.totals.netPayoutCop)}</p>
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
                <TableHead className="text-right">{t("settlement.colGross")}</TableHead>
                <TableHead className="text-right">{t("settlement.colTips")}</TableHead>
                <TableHead className="text-right">{t("settlement.colCommissions")}</TableHead>
                <TableHead className="text-right">{t("settlement.colNet")}</TableHead>
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
