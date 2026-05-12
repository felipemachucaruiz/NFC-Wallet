import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGetCurrentAuthUser } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Users, Loader2, Phone, Calendar, User, CreditCard, ChevronDown, FileDown, FileText, Sheet } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEventContext } from "@/contexts/event-context";
import { apiFetchTickets, apiFetchTicketTypes, apiFetchEvent, type AdminTicket } from "@/lib/api";
import { downloadAttendeesCSV, downloadAttendeesPDF, downloadAttendeesExcel } from "@/lib/export-attendees";

const SEX_LABELS: Record<string, string> = {
  male: "Masculino",
  female: "Femenino",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  valid: "default",
  used: "secondary",
  cancelled: "destructive",
};

export default function EventAttendees() {
  const { t } = useTranslation();
  const { data: auth } = useGetCurrentAuthUser();
  const { eventId } = useEventContext();
  const resolvedEventId = auth?.user?.role === "admin" ? eventId : (auth?.user?.eventId ?? "");

  const { data: tickets = [], isLoading, isError, error: fetchError } = useQuery({
    queryKey: ["eventTickets", resolvedEventId],
    queryFn: () => apiFetchTickets(resolvedEventId),
    enabled: !!resolvedEventId,
  });

  const { data: ticketTypesData } = useQuery({
    queryKey: ["ticketTypes", resolvedEventId],
    queryFn: () => apiFetchTicketTypes(resolvedEventId),
    enabled: !!resolvedEventId,
  });

  const { data: eventData } = useQuery({
    queryKey: ["event", resolvedEventId],
    queryFn: () => apiFetchEvent(resolvedEventId),
    enabled: !!resolvedEventId,
  });

  const ticketTypeMap = Object.fromEntries(
    (ticketTypesData ?? []).map((tt: { id: string; name: string }) => [tt.id, tt.name])
  );

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AdminTicket | null>(null);
  const PAGE_SIZE = 100;

  const filtered = tickets.filter((t) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !search ||
      t.attendeeName.toLowerCase().includes(q) ||
      t.attendeeEmail.toLowerCase().includes(q) ||
      (t.attendeePhone ?? "").includes(q) ||
      (t.attendeeIdDocument ?? "").toLowerCase().includes(q) ||
      t.orderId.toLowerCase().includes(q);
    const matchesStatus = statusFilter === "all" || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-20 text-destructive">
        <p className="font-semibold">{t("common.error")}</p>
        <p className="text-sm text-muted-foreground mt-1">{(fetchError as Error)?.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Asistentes</h1>
        <p className="text-muted-foreground mt-1">
          Información completa de todos los asistentes registrados — {tickets.length} en total
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, correo, teléfono, documento u orden..."
            className="pl-9"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="valid">Válida</SelectItem>
            <SelectItem value="used">Usada</SelectItem>
            <SelectItem value="cancelled">Cancelada</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          disabled={filtered.length === 0 || !eventData}
          onClick={() => eventData && downloadAttendeesCSV(filtered, ticketTypeMap, eventData)}
        >
          <FileDown className="w-4 h-4 mr-1.5" />
          CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={filtered.length === 0 || !eventData}
          onClick={() => eventData && downloadAttendeesPDF(filtered, ticketTypeMap, eventData)}
        >
          <FileText className="w-4 h-4 mr-1.5" />
          PDF
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={filtered.length === 0 || !eventData}
          onClick={() => eventData && downloadAttendeesExcel(filtered, ticketTypeMap, eventData)}
        >
          <Sheet className="w-4 h-4 mr-1.5" />
          Excel
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6 overflow-x-auto">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No se encontraron asistentes</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Correo</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Tipo de boleta</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Orden</TableHead>
                  <TableHead className="w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((ticket) => (
                  <TableRow
                    key={ticket.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelected(ticket)}
                  >
                    <TableCell className="font-medium">{ticket.attendeeName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{ticket.attendeeEmail}</TableCell>
                    <TableCell className="text-sm">{ticket.attendeePhone ?? "—"}</TableCell>
                    <TableCell className="text-sm font-mono">{ticket.attendeeIdDocument ?? "—"}</TableCell>
                    <TableCell className="text-sm">
                      {ticket.ticketTypeId ? (ticketTypeMap[ticket.ticketTypeId] ?? ticket.ticketTypeId.slice(0, 8)) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[ticket.status] ?? "outline"}>
                        {ticket.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {ticket.orderId.slice(0, 8)}
                    </TableCell>
                    <TableCell>
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {totalPages > 1 && (
            <div className="pt-4 flex justify-between items-center text-xs text-muted-foreground">
              <span>Mostrando {paged.length} de {filtered.length} asistentes</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
                <span className="flex items-center px-2">{page} / {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Siguiente</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Detalle del asistente</DialogTitle>
          </DialogHeader>
          {selected && <AttendeeDetail ticket={selected} ticketTypeName={selected.ticketTypeId ? (ticketTypeMap[selected.ticketTypeId] ?? null) : null} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AttendeeDetail({ ticket, ticketTypeName }: { ticket: AdminTicket; ticketTypeName: string | null }) {
  const rows: { icon: React.ReactNode; label: string; value: string | null }[] = [
    { icon: <User className="w-4 h-4" />, label: "Nombre", value: ticket.attendeeName },
    { icon: <Search className="w-4 h-4" />, label: "Correo", value: ticket.attendeeEmail },
    { icon: <Phone className="w-4 h-4" />, label: "Teléfono", value: ticket.attendeePhone },
    { icon: <CreditCard className="w-4 h-4" />, label: "Documento", value: ticket.attendeeIdDocument },
    { icon: <Calendar className="w-4 h-4" />, label: "Fecha de nacimiento", value: ticket.attendeeDateOfBirth },
    { icon: <User className="w-4 h-4" />, label: "Sexo", value: ticket.attendeeSex ? (SEX_LABELS[ticket.attendeeSex] ?? ticket.attendeeSex) : null },
  ];

  const raceRows: { label: string; value: string | null | undefined }[] = [
    { label: "Talla camiseta", value: ticket.shirtSize },
    { label: "Tipo de sangre", value: ticket.bloodType },
    { label: "Contacto de emergencia", value: ticket.emergencyContactName },
    { label: "Tel. emergencia", value: ticket.emergencyContactPhone },
    { label: "EPS", value: ticket.eps },
  ].filter(r => r.value);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Badge variant={STATUS_VARIANT[ticket.status] ?? "outline"} className="text-sm">
          {ticket.status}
        </Badge>
        {ticketTypeName && (
          <span className="text-sm text-muted-foreground">{ticketTypeName}</span>
        )}
      </div>

      <div className="divide-y divide-border rounded-lg border">
        {rows.map(({ icon, label, value }) => (
          <div key={label} className="flex items-center gap-3 px-4 py-3">
            <span className="text-muted-foreground shrink-0">{icon}</span>
            <span className="text-sm text-muted-foreground w-36 shrink-0">{label}</span>
            <span className="text-sm font-medium truncate">{value ?? "—"}</span>
          </div>
        ))}
      </div>

      {raceRows.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Datos carrera</p>
          <div className="divide-y divide-border rounded-lg border">
            {raceRows.map(({ label, value }) => (
              <div key={label} className="flex items-center gap-3 px-4 py-3">
                <span className="text-sm text-muted-foreground w-36 shrink-0">{label}</span>
                <span className="text-sm font-medium truncate">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
        <div className="flex gap-2">
          <span className="w-20 shrink-0">ID boleta:</span>
          <span className="font-mono">{ticket.id}</span>
        </div>
        <div className="flex gap-2">
          <span className="w-20 shrink-0">Orden:</span>
          <span className="font-mono">{ticket.orderId}</span>
        </div>
        <div className="flex gap-2">
          <span className="w-20 shrink-0">Registro:</span>
          <span>{new Date(ticket.createdAt).toLocaleString("es-CO", { timeZone: "America/Bogota" })}</span>
        </div>
      </div>
    </div>
  );
}
