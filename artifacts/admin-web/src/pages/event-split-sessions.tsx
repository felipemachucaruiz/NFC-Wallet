import { useState } from "react";
import { useListSplitSessions, useGetEvent } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Eye, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatCurrency } from "@/lib/currency";
import { fmtDateTime } from "@/lib/date";
import { useEventContext } from "@/contexts/event-context";

type SessionItem = {
  productNameSnapshot: string;
  unitPriceSnapshot: number;
  quantity: number;
};

type SessionPayment = {
  id: string;
  braceletUid: string;
  grossAmount: number;
  newBalance: number;
  createdAt: string;
};

type SplitSession = {
  id: string;
  totalAmount: number;
  paidAmount: number;
  tipAmount: number;
  status: "open" | "completed" | "cancelled";
  locationId: string;
  createdAt: string;
  completedAt?: string | null;
  items?: SessionItem[];
  payments?: SessionPayment[];
};

export default function EventSplitSessions() {
  const { t } = useTranslation();
  const { eventId } = useEventContext();
  const { data, isLoading } = useListSplitSessions({ eventId: eventId || undefined });
  const sessions = ((data as { sessions?: SplitSession[] } | undefined)?.sessions ?? []) as SplitSession[];
  const { data: eventData } = useGetEvent(eventId || "");
  const currency = (eventData as Record<string, unknown> | undefined)?.currencyCode as string ?? "COP";
  const fmt = (n: number) => formatCurrency(n, currency);

  const [selected, setSelected] = useState<SplitSession | null>(null);

  const statusVariant = (s: string): "default" | "secondary" | "destructive" | "outline" => {
    if (s === "completed") return "default";
    if (s === "open") return "secondary";
    return "outline";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Users className="w-7 h-7" /> {t("splitSessions.title", "Pagos divididos")}
        </h1>
        <p className="text-muted-foreground mt-1">
          {t("splitSessions.subtitle", "Pedidos pagados entre varias pulseras")}
        </p>
      </div>

      <div className="border border-border rounded-lg bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("transactions.colTime")}</TableHead>
              <TableHead className="text-right">{t("splitSessions.colTotal", "Total")}</TableHead>
              <TableHead className="text-right">{t("splitSessions.colPaid", "Pagado")}</TableHead>
              <TableHead className="text-center">{t("splitSessions.colBracelets", "Pulseras")}</TableHead>
              <TableHead>{t("transactions.colStatus", "Estado")}</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8">{t("common.loading")}</TableCell></TableRow>
            ) : !eventId ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{t("transactions.noAssignedEvent")}</TableCell></TableRow>
            ) : sessions.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{t("splitSessions.empty", "Aún no hay pagos divididos")}</TableCell></TableRow>
            ) : (
              sessions.map((s) => (
                <TableRow key={s.id} data-testid={`row-split-${s.id}`}>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{fmtDateTime(s.createdAt)}</TableCell>
                  <TableCell className="text-right font-mono">{fmt(s.totalAmount)}</TableCell>
                  <TableCell className="text-right font-mono">{fmt(s.paidAmount)}</TableCell>
                  <TableCell className="text-center">{s.payments?.length ?? 0}</TableCell>
                  <TableCell><Badge variant={statusVariant(s.status)}>{t(`splitSessions.status.${s.status}`, s.status)}</Badge></TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => setSelected(s)}>
                      <Eye className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{t("splitSessions.detailTitle", "Detalle de pago dividido")}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">{t("splitSessions.colTotal", "Total")}</p>
                  <p className="font-mono font-bold">{fmt(selected.totalAmount)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">{t("splitSessions.colPaid", "Pagado")}</p>
                  <p className="font-mono font-bold">{fmt(selected.paidAmount)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">{t("transactions.colStatus", "Estado")}</p>
                  <Badge variant={statusVariant(selected.status)}>{t(`splitSessions.status.${selected.status}`, selected.status)}</Badge>
                </div>
              </div>

              {selected.items && selected.items.length > 0 && (
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wider mb-2">{t("splitSessions.items", "Items")}</p>
                  <div className="space-y-1 border border-border rounded p-2">
                    {selected.items.map((it, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span>{it.productNameSnapshot} x{it.quantity}</span>
                        <span className="font-mono">{fmt(it.unitPriceSnapshot * it.quantity)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selected.payments && selected.payments.length > 0 && (
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wider mb-2">{t("splitSessions.payments", "Pagos parciales")}</p>
                  <div className="space-y-1 border border-border rounded p-2">
                    {selected.payments.map((p) => (
                      <div key={p.id} className="flex justify-between text-sm items-center">
                        <span className="font-mono text-xs">{p.braceletUid.slice(0, 16)}…</span>
                        <span className="text-muted-foreground text-xs">{fmtDateTime(p.createdAt)}</span>
                        <span className="font-mono font-bold">{fmt(p.grossAmount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setSelected(null)}>{t("transactions.close", "Cerrar")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
