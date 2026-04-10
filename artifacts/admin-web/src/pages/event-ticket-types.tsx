import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetCurrentAuthUser } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Ticket, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEventContext } from "@/contexts/event-context";
import {
  apiFetchTicketTypes,
  apiCreateTicketType,
  apiUpdateTicketType,
  apiFetchVenues,
  apiFetchSections,
  apiFetchEventDays,
} from "@/lib/api";

type TicketForm = {
  name: string;
  sectionId: string;
  price: string;
  serviceFee: string;
  quantity: string;
  saleStart: string;
  saleEnd: string;
  active: boolean;
  selectedDays: string[];
};

const emptyForm: TicketForm = {
  name: "",
  sectionId: "",
  price: "",
  serviceFee: "",
  quantity: "",
  saleStart: "",
  saleEnd: "",
  active: true,
  selectedDays: [],
};

export default function EventTicketTypes() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: auth } = useGetCurrentAuthUser();
  const { eventId } = useEventContext();
  const resolvedEventId = auth?.user?.role === "admin" ? eventId : (auth?.user?.eventId ?? "");

  const { data: ticketTypes = [], isLoading, isError, error: fetchError } = useQuery({
    queryKey: ["ticketTypes", resolvedEventId],
    queryFn: () => apiFetchTicketTypes(resolvedEventId),
    enabled: !!resolvedEventId,
  });

  const { data: days = [] } = useQuery({
    queryKey: ["eventDays", resolvedEventId],
    queryFn: () => apiFetchEventDays(resolvedEventId),
    enabled: !!resolvedEventId,
  });

  const { data: venues = [] } = useQuery({
    queryKey: ["venues", resolvedEventId],
    queryFn: () => apiFetchVenues(resolvedEventId),
    enabled: !!resolvedEventId,
  });

  const firstVenueId = venues[0]?.id ?? "";
  const { data: sections = [] } = useQuery({
    queryKey: ["sections", resolvedEventId, firstVenueId],
    queryFn: () => apiFetchSections(resolvedEventId, firstVenueId),
    enabled: !!resolvedEventId && !!firstVenueId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["ticketTypes", resolvedEventId] });

  const createMutation = useMutation({
    mutationFn: (body: Parameters<typeof apiCreateTicketType>[1]) => apiCreateTicketType(resolvedEventId, body),
    onSuccess: () => { toast({ title: t("ticketTypes.created") }); invalidate(); setDialogOpen(false); },
    onError: (e: Error) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ typeId, body }: { typeId: string; body: Record<string, unknown> }) => apiUpdateTicketType(resolvedEventId, typeId, body),
    onSuccess: () => { toast({ title: t("ticketTypes.updated") }); invalidate(); setDialogOpen(false); },
    onError: (e: Error) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TicketForm>(emptyForm);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (tt: (typeof ticketTypes)[0]) => {
    setEditingId(tt.id);
    setForm({
      name: tt.name,
      sectionId: tt.sectionId ?? "",
      price: String(tt.price),
      serviceFee: String(tt.serviceFee),
      quantity: String(tt.quantity),
      saleStart: tt.saleStart ? tt.saleStart.slice(0, 16) : "",
      saleEnd: tt.saleEnd ? tt.saleEnd.slice(0, 16) : "",
      active: tt.isActive,
      selectedDays: tt.validEventDayIds ?? [],
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name || !form.price || !form.quantity) {
      toast({ title: t("common.error"), description: t("ticketTypes.requiredFields"), variant: "destructive" });
      return;
    }

    const body: Record<string, unknown> = {
      name: form.name,
      price: parseInt(form.price, 10),
      serviceFee: parseInt(form.serviceFee, 10) || 0,
      quantity: parseInt(form.quantity, 10),
      sectionId: form.sectionId || undefined,
      saleStart: form.saleStart ? new Date(form.saleStart).toISOString() : undefined,
      saleEnd: form.saleEnd ? new Date(form.saleEnd).toISOString() : undefined,
      isActive: form.active,
      validEventDayIds: form.selectedDays,
    };

    if (editingId) {
      updateMutation.mutate({ typeId: editingId, body });
    } else {
      createMutation.mutate(body as Parameters<typeof apiCreateTicketType>[1]);
    }
  };

  const toggleDaySelection = (dayId: string) => {
    setForm((f) => ({
      ...f,
      selectedDays: f.selectedDays.includes(dayId)
        ? f.selectedDays.filter((d) => d !== dayId)
        : [...f.selectedDays, dayId],
    }));
  };

  const formatPrice = (v: number) => `$${v.toLocaleString("es-CO")}`;

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
        <p className="text-sm text-muted-foreground mt-1">{(fetchError as Error)?.message || t("common.unknownError")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("ticketTypes.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("ticketTypes.subtitle")}</p>
        </div>
        <Button onClick={openCreate} data-testid="button-add-ticket-type">
          <Plus className="w-4 h-4 mr-2" /> {t("ticketTypes.addTicketType")}
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          {ticketTypes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Ticket className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>{t("ticketTypes.noTicketTypes")}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("ticketTypes.colName")}</TableHead>
                  <TableHead>{t("ticketTypes.colSection")}</TableHead>
                  <TableHead>{t("ticketTypes.colPrice")}</TableHead>
                  <TableHead>{t("ticketTypes.colServiceFee")}</TableHead>
                  <TableHead>{t("ticketTypes.colAvailable")}</TableHead>
                  <TableHead>{t("ticketTypes.colSold")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead className="w-16">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ticketTypes.map((tt) => (
                  <TableRow key={tt.id}>
                    <TableCell className="font-medium">{tt.name}</TableCell>
                    <TableCell>
                      {sections.find((s) => s.id === tt.sectionId)?.name || "—"}
                    </TableCell>
                    <TableCell className="font-mono">{formatPrice(tt.price)}</TableCell>
                    <TableCell className="font-mono">{formatPrice(tt.serviceFee)}</TableCell>
                    <TableCell>{tt.quantity.toLocaleString()}</TableCell>
                    <TableCell>{tt.soldCount.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant={tt.isActive ? "default" : "secondary"}>
                        {tt.isActive ? t("common.active") : t("common.inactive")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(tt)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {ticketTypes.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("ticketTypes.serviceFeesSummary")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {ticketTypes.map((tt) => (
                <div key={tt.id} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{tt.name} ({tt.quantity.toLocaleString()} × {formatPrice(tt.serviceFee)})</span>
                  <span className="font-mono">{formatPrice(tt.quantity * tt.serviceFee)}</span>
                </div>
              ))}
              <div className="border-t pt-2 flex items-center justify-between font-semibold">
                <span>{t("ticketTypes.totalServiceFee")}</span>
                <span className="font-mono text-primary">{formatPrice(ticketTypes.reduce((sum, tt) => sum + tt.quantity * tt.serviceFee, 0))}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? t("ticketTypes.editTicketType") : t("ticketTypes.addTicketType")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            <div className="space-y-1">
              <Label>{t("ticketTypes.ticketName")} *</Label>
              <Input
                data-testid="input-ticket-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={t("ticketTypes.ticketNamePlaceholder")}
              />
            </div>
            {sections.length > 0 && (
              <div className="space-y-1">
                <Label>{t("ticketTypes.colSection")}</Label>
                <Select value={form.sectionId} onValueChange={(v) => setForm((f) => ({ ...f, sectionId: v }))}>
                  <SelectTrigger><SelectValue placeholder={t("ticketTypes.selectSection")} /></SelectTrigger>
                  <SelectContent>
                    {sections.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>{t("ticketTypes.colPrice")} (COP) *</Label>
                <Input
                  data-testid="input-ticket-price"
                  type="number"
                  min="0"
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>{t("ticketTypes.colServiceFee")}</Label>
                <Input
                  data-testid="input-ticket-service-fee"
                  type="number"
                  min="0"
                  value={form.serviceFee}
                  onChange={(e) => setForm((f) => ({ ...f, serviceFee: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1">
                <Label>{t("ticketTypes.quantity")} *</Label>
                <Input
                  data-testid="input-ticket-quantity"
                  type="number"
                  min="1"
                  value={form.quantity}
                  onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t("ticketTypes.saleStart")}</Label>
                <Input
                  type="datetime-local"
                  value={form.saleStart}
                  onChange={(e) => setForm((f) => ({ ...f, saleStart: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>{t("ticketTypes.saleEnd")}</Label>
                <Input
                  type="datetime-local"
                  value={form.saleEnd}
                  onChange={(e) => setForm((f) => ({ ...f, saleEnd: e.target.value }))}
                />
              </div>
            </div>

            {days.length > 0 && (
              <div className="space-y-2">
                <Label>{t("ticketTypes.validDays")}</Label>
                <div className="space-y-1 pl-1">
                  {days.map((day) => (
                    <label key={day.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.selectedDays.includes(day.id)}
                        onChange={() => toggleDaySelection(day.id)}
                        className="rounded"
                      />
                      {day.label || day.date}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <Label>{t("common.status")}</Label>
              <Switch checked={form.active} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
