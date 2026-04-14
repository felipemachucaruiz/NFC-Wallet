import { useState, useCallback } from "react";
import { customFetch } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Download, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

type Order = {
  orderId: string;
  eventId: string;
  eventName: string;
  buyerName: string | null;
  buyerEmail: string;
  paymentMethod: string | null;
  wompiTransactionId: string | null;
  ticketCount: number;
  totalAmount: number;
  saleDate: string;
};

type SalesResponse = {
  orders: Order[];
  total: number;
  page: number;
  pageSize: number;
  totals: {
    totalOrders: number;
    totalTickets: number;
    totalRevenue: number;
  };
};

type Event = { id: string; name: string };
type TicketType = { id: string; name: string };

const PAGE_SIZE = 50;

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(cents / 100);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-CO", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function AuditorTicketSales() {
  const { toast } = useToast();
  const [eventId, setEventId] = useState("");
  const [ticketTypeId, setTicketTypeId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);

  const buildQueryParams = useCallback((overrides: Record<string, string | number> = {}) => {
    const params = new URLSearchParams();
    if (eventId) params.set("eventId", eventId);
    if (ticketTypeId) params.set("ticketTypeId", ticketTypeId);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    params.set("page", String(overrides.page ?? page));
    params.set("pageSize", String(PAGE_SIZE));
    return params.toString();
  }, [eventId, ticketTypeId, dateFrom, dateTo, page]);

  const { data: salesData, isLoading: salesLoading } = useQuery<SalesResponse>({
    queryKey: ["auditor-ticket-sales", eventId, ticketTypeId, dateFrom, dateTo, page],
    queryFn: () => customFetch<SalesResponse>(`/api/auditor/ticket-sales?${buildQueryParams()}`),
  });

  const { data: eventsData } = useQuery<{ events: Event[] }>({
    queryKey: ["auditor-events"],
    queryFn: () => customFetch<{ events: Event[] }>("/api/auditor/events"),
  });

  const { data: ticketTypesData } = useQuery<{ ticketTypes: TicketType[] }>({
    queryKey: ["auditor-ticket-types", eventId],
    queryFn: () => eventId ? customFetch<{ ticketTypes: TicketType[] }>(`/api/auditor/ticket-types?eventId=${encodeURIComponent(eventId)}`) : Promise.resolve({ ticketTypes: [] }),
    enabled: !!eventId,
  });

  const events = eventsData?.events ?? [];
  const ticketTypes = ticketTypesData?.ticketTypes ?? [];
  const orders = salesData?.orders ?? [];
  const total = salesData?.total ?? 0;
  const totals = salesData?.totals;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleApplyFilters = () => {
    setPage(1);
  };

  const handleDownloadCsv = async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      if (eventId) params.set("eventId", eventId);
      if (ticketTypeId) params.set("ticketTypeId", ticketTypeId);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      const blob = await customFetch<Blob>(`/api/auditor/ticket-sales/export.csv?${params.toString()}`, { responseType: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `auditoria-ventas-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Exportación exitosa", description: "El archivo CSV fue descargado correctamente." });
    } catch {
      toast({ title: "Error de exportación", description: "No se pudo descargar el archivo CSV.", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Ventas de Boletas</h1>
        <p className="text-muted-foreground mt-1">
          Vista de auditoría — órdenes confirmadas/pagadas en todos los eventos
        </p>
      </div>

      {/* Filters */}
      <div className="border border-border rounded-lg bg-card p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div className="space-y-1">
            <Label>Evento</Label>
            <Select value={eventId || "all"} onValueChange={(v) => { setEventId(v === "all" ? "" : v); setTicketTypeId(""); }}>
              <SelectTrigger data-testid="select-event-filter">
                <SelectValue placeholder="Todos los eventos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los eventos</SelectItem>
                {events.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Tipo de Boleta</Label>
            <Select value={ticketTypeId || "all"} onValueChange={(v) => setTicketTypeId(v === "all" ? "" : v)} disabled={!eventId}>
              <SelectTrigger data-testid="select-ticket-type-filter">
                <SelectValue placeholder={eventId ? "Todos los tipos" : "Selecciona un evento primero"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                {ticketTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Fecha desde</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              data-testid="input-date-from"
            />
          </div>

          <div className="space-y-1">
            <Label>Fecha hasta</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              data-testid="input-date-to"
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Button onClick={handleApplyFilters} data-testid="button-apply-filters">
            <Search className="w-4 h-4 mr-2" />
            Aplicar Filtros
          </Button>
          <Button
            variant="outline"
            onClick={handleDownloadCsv}
            disabled={isExporting}
            data-testid="button-download-csv"
          >
            <Download className="w-4 h-4 mr-2" />
            {isExporting ? "Exportando..." : "Descargar CSV"}
          </Button>
        </div>
      </div>

      {/* Totals summary */}
      {totals && (
        <div className="grid grid-cols-3 gap-4">
          <div className="border border-border rounded-lg bg-card p-4 text-center">
            <p className="text-2xl font-bold">{totals.totalOrders.toLocaleString("es-CO")}</p>
            <p className="text-sm text-muted-foreground">Órdenes</p>
          </div>
          <div className="border border-border rounded-lg bg-card p-4 text-center">
            <p className="text-2xl font-bold">{totals.totalTickets.toLocaleString("es-CO")}</p>
            <p className="text-sm text-muted-foreground">Boletas</p>
          </div>
          <div className="border border-border rounded-lg bg-card p-4 text-center">
            <p className="text-2xl font-bold">{formatCurrency(totals.totalRevenue)}</p>
            <p className="text-sm text-muted-foreground">Ingresos Totales</p>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="border border-border rounded-lg bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Evento</TableHead>
              <TableHead>ID Orden</TableHead>
              <TableHead>Nombre Comprador</TableHead>
              <TableHead>Correo Comprador</TableHead>
              <TableHead>Método de Pago</TableHead>
              <TableHead>ID Wompi</TableHead>
              <TableHead className="text-right">Boletas</TableHead>
              <TableHead className="text-right">Monto Total</TableHead>
              <TableHead>Fecha Venta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {salesLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8">Cargando...</TableCell>
              </TableRow>
            ) : orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  No se encontraron órdenes confirmadas con los filtros seleccionados.
                </TableCell>
              </TableRow>
            ) : (
              orders.map((order) => (
                <TableRow key={order.orderId} data-testid={`row-order-${order.orderId}`}>
                  <TableCell className="font-medium max-w-[160px] truncate">{order.eventName}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{order.orderId.slice(0, 8)}...</TableCell>
                  <TableCell className="text-sm">{order.buyerName ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{order.buyerEmail}</TableCell>
                  <TableCell>
                    {order.paymentMethod ? (
                      <Badge variant="outline" className="text-xs capitalize">{order.paymentMethod}</Badge>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {order.wompiTransactionId ? `${order.wompiTransactionId.slice(0, 12)}...` : "—"}
                  </TableCell>
                  <TableCell className="text-right font-medium">{order.ticketCount}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(order.totalAmount)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{formatDate(order.saleDate)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Mostrando {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, total)} de {total} órdenes
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span>Página {page} de {totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
