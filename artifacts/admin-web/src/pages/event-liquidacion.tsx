import { useQuery, useQueries } from "@tanstack/react-query";
import { useGetCurrentAuthUser } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, TrendingUp, Ticket, ReceiptText, BadgePercent, Banknote, HandCoins, FileDown, FileText, Sheet } from "lucide-react";
import { useEventContext } from "@/contexts/event-context";
import {
  apiFetchTickets,
  apiFetchTicketTypes,
  apiFetchPricingStages,
  apiFetchEvent,
} from "@/lib/api";
import { downloadLiquidacionCSV, downloadLiquidacionPDF, downloadLiquidacionExcel } from "@/lib/export-liquidacion";

function fmt(amount: number, currency = "COP"): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

interface BreakdownRow {
  typeName: string;
  stageName: string;
  count: number;
  unitPrice: number;
  serviceFeePerTicket: number;
  gross: number;
  totalServiceFees: number;
  commission: number;
  netPromoter: number;
}

function buildBreakdown(
  tickets: ReturnType<typeof apiFetchTickets> extends Promise<infer T> ? T : never,
  ticketTypes: { id: string; name: string }[],
  stagesByType: Record<string, { id: string; name: string; price: number; displayOrder: number }[]>,
  commissionRate: number,
): BreakdownRow[] {
  const active = tickets.filter(t => t.status !== "cancelled");
  const typeMap = Object.fromEntries(ticketTypes.map(tt => [tt.id, tt]));
  const grouped = new Map<string, BreakdownRow>();

  for (const t of active) {
    const typeId = t.ticketTypeId ?? "__unknown__";
    const key = `${typeId}__${t.unitPrice}`;
    const tt = typeId !== "__unknown__" ? typeMap[typeId] : null;

    let stageName = "Precio único";
    const stages = typeId !== "__unknown__" ? (stagesByType[typeId] ?? []) : [];
    if (stages.length > 1) {
      const match = stages.find(s => s.price === t.unitPrice);
      stageName = match ? match.name : `$${t.unitPrice.toLocaleString("es-CO")}`;
    }

    const existing = grouped.get(key);
    if (existing) {
      existing.count += 1;
      existing.gross += t.unitPrice;
      existing.totalServiceFees += t.serviceFeeAmount;
      existing.commission += Math.round(t.unitPrice * commissionRate);
      existing.netPromoter += t.unitPrice - Math.round(t.unitPrice * commissionRate);
    } else {
      grouped.set(key, {
        typeName: tt?.name ?? "Sin tipo",
        stageName,
        count: 1,
        unitPrice: t.unitPrice,
        serviceFeePerTicket: t.serviceFeeAmount,
        gross: t.unitPrice,
        totalServiceFees: t.serviceFeeAmount,
        commission: Math.round(t.unitPrice * commissionRate),
        netPromoter: t.unitPrice - Math.round(t.unitPrice * commissionRate),
      });
    }
  }

  return [...grouped.values()].sort(
    (a, b) => a.typeName.localeCompare(b.typeName) || a.unitPrice - b.unitPrice,
  );
}

export default function EventLiquidacion() {
  const { data: auth } = useGetCurrentAuthUser();
  const { eventId: ctxEventId } = useEventContext();
  const resolvedEventId = auth?.user?.role === "admin" ? ctxEventId : (auth?.user?.eventId ?? "");

  const { data: tickets = [], isLoading: ticketsLoading } = useQuery({
    queryKey: ["eventTickets", resolvedEventId],
    queryFn: () => apiFetchTickets(resolvedEventId),
    enabled: !!resolvedEventId,
  });

  const { data: ticketTypes = [], isLoading: ttLoading } = useQuery({
    queryKey: ["ticketTypes", resolvedEventId],
    queryFn: () => apiFetchTicketTypes(resolvedEventId),
    enabled: !!resolvedEventId,
  });

  const { data: eventData, isLoading: eventLoading } = useQuery({
    queryKey: ["event", resolvedEventId],
    queryFn: () => apiFetchEvent(resolvedEventId),
    enabled: !!resolvedEventId,
  });

  const stageQueries = useQueries({
    queries: ticketTypes.map(tt => ({
      queryKey: ["pricingStages", resolvedEventId, tt.id],
      queryFn: () => apiFetchPricingStages(resolvedEventId, tt.id),
      enabled: !!resolvedEventId && ticketTypes.length > 0,
    })),
  });

  const stagesLoading = stageQueries.some(q => q.isLoading);
  const isLoading = ticketsLoading || ttLoading || eventLoading || stagesLoading;

  const stagesByType: Record<string, { id: string; name: string; price: number; displayOrder: number }[]> = {};
  ticketTypes.forEach((tt, i) => {
    const data = stageQueries[i]?.data;
    if (data?.length) stagesByType[tt.id] = data.sort((a, b) => a.displayOrder - b.displayOrder);
  });

  const currency = eventData?.currencyCode ?? "COP";
  const commissionRate = parseFloat(eventData?.platformCommissionRate ?? "0") / 100;

  const rows = isLoading ? [] : buildBreakdown(tickets, ticketTypes, stagesByType, commissionRate);

  const totalTickets     = rows.reduce((s, r) => s + r.count, 0);
  const totalGross       = rows.reduce((s, r) => s + r.gross, 0);
  const totalServiceFees = rows.reduce((s, r) => s + r.totalServiceFees, 0);
  const totalCommission  = rows.reduce((s, r) => s + r.commission, 0);
  const totalTapee       = totalServiceFees + totalCommission;
  const totalNet         = totalGross - totalCommission;

  const activeTickets = tickets.filter(t => t.status !== "cancelled");
  const cancelledCount = tickets.length - activeTickets.length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Liquidación</h1>
        <p className="text-muted-foreground mt-1">
          Resumen financiero de ventas de boletas
          {eventData?.promoterCompanyName && (
            <> — <span className="font-medium">{eventData.promoterCompanyName}</span></>
          )}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          disabled={tickets.length === 0 || !eventData}
          onClick={() => eventData && downloadLiquidacionCSV(tickets, eventData)}
        >
          <FileDown className="w-4 h-4 mr-1.5" />
          CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={tickets.length === 0 || !eventData}
          onClick={() => eventData && downloadLiquidacionPDF(tickets, eventData)}
        >
          <FileText className="w-4 h-4 mr-1.5" />
          PDF
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={tickets.length === 0 || !eventData}
          onClick={() => eventData && downloadLiquidacionExcel(tickets, eventData)}
        >
          <Sheet className="w-4 h-4 mr-1.5" />
          Excel
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <SummaryCard
          icon={Ticket}
          label="Boletas vendidas"
          value={String(totalTickets)}
          sub={cancelledCount > 0 ? `${cancelledCount} canceladas excluidas` : undefined}
        />
        <SummaryCard
          icon={Banknote}
          label="Ingresos brutos"
          value={fmt(totalGross, currency)}
          sub="Valor total de boletas"
        />
        <SummaryCard
          icon={ReceiptText}
          label="Cargos por servicio"
          value={fmt(totalServiceFees, currency)}
          sub="Cobrado al comprador"
        />
        <SummaryCard
          icon={BadgePercent}
          label={`Comisión plataforma (${(commissionRate * 100).toFixed(1)}%)`}
          value={fmt(totalCommission, currency)}
          sub="Sobre ingresos brutos"
        />
        <SummaryCard
          icon={TrendingUp}
          label="Total Tapee"
          value={fmt(totalTapee, currency)}
          sub="Cargos + comisión"
          highlight="red"
        />
        <SummaryCard
          icon={HandCoins}
          label="Neto para el promotor"
          value={fmt(totalNet, currency)}
          sub="Brutos − comisión"
          highlight="green"
        />
      </div>

      {/* Breakdown table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Detalle por tipo de boleta y etapa de precio</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              No hay boletas vendidas para mostrar.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Tipo de boleta</TableHead>
                  <TableHead>Etapa / Precio</TableHead>
                  <TableHead className="text-right">Boletas</TableHead>
                  <TableHead className="text-right">Precio unit.</TableHead>
                  <TableHead className="text-right">Cargo serv./boleta</TableHead>
                  <TableHead className="text-right">Ingreso bruto</TableHead>
                  <TableHead className="text-right">Cargos serv.</TableHead>
                  <TableHead className="text-right">Comisión plat.</TableHead>
                  <TableHead className="text-right font-semibold">Neto promotor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => (
                  <TableRow key={i} className={i % 2 === 1 ? "bg-muted/20" : undefined}>
                    <TableCell className="font-medium">{row.typeName}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs font-normal">{row.stageName}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(row.unitPrice, currency)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{fmt(row.serviceFeePerTicket, currency)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(row.gross, currency)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{fmt(row.totalServiceFees, currency)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{fmt(row.commission, currency)}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
                      {fmt(row.netPromoter, currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              {rows.length > 1 && (
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/60">
                    <td className="px-4 py-3 font-bold text-sm" colSpan={2}>TOTAL</td>
                    <td className="px-4 py-3 text-right font-bold text-sm tabular-nums">{totalTickets}</td>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 text-right font-bold text-sm tabular-nums">{fmt(totalGross, currency)}</td>
                    <td className="px-4 py-3 text-right font-bold text-sm tabular-nums">{fmt(totalServiceFees, currency)}</td>
                    <td className="px-4 py-3 text-right font-bold text-sm tabular-nums">{fmt(totalCommission, currency)}</td>
                    <td className="px-4 py-3 text-right font-bold text-sm tabular-nums text-emerald-700 dark:text-emerald-400">
                      {fmt(totalNet, currency)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Commission note */}
      {commissionRate > 0 && (
        <p className="text-xs text-muted-foreground">
          * La comisión de plataforma ({(commissionRate * 100).toFixed(1)}%) se aplica sobre el precio base de cada boleta.
          Los cargos por servicio son cobrados directamente al comprador y se transfieren a Tapee.
        </p>
      )}
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
  highlight,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  highlight?: "red" | "green";
}) {
  return (
    <Card className={
      highlight === "red" ? "border-2 border-red-500 dark:border-red-500" :
      highlight === "green" ? "border-2 border-emerald-500 dark:border-emerald-500" :
      undefined
    }>
      <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0">
        <CardTitle className={`text-sm font-medium ${
          highlight === "red" ? "text-red-600 dark:text-red-400" :
          highlight === "green" ? "text-emerald-700 dark:text-emerald-400" :
          "text-muted-foreground"
        }`}>
          {label}
        </CardTitle>
        <Icon className={`h-4 w-4 ${
          highlight === "red" ? "text-red-500" :
          highlight === "green" ? "text-emerald-600" :
          "text-muted-foreground"
        }`} />
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-bold tabular-nums ${
          highlight === "red" ? "text-red-700 dark:text-red-300" :
          highlight === "green" ? "text-emerald-700 dark:text-emerald-300" :
          ""
        }`}>
          {value}
        </p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}
