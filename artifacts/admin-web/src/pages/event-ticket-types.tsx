import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetCurrentAuthUser } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateTimePicker } from "@/components/ui/datetime-picker";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Ticket, Loader2, Trash2, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEventContext } from "@/contexts/event-context";
import {
  apiFetchTicketTypes,
  apiCreateTicketType,
  apiUpdateTicketType,
  apiFetchVenues,
  apiFetchSections,
  apiFetchEventDays,
  apiFetchPricingStages,
  apiCreatePricingStage,
  apiUpdatePricingStage,
  apiDeletePricingStage,
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
  isNumberedUnits: boolean;
  unitLabel: string;
  ticketsPerUnit: string;
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
  isNumberedUnits: false,
  unitLabel: "",
  ticketsPerUnit: "",
};

type StageForm = {
  name: string;
  price: string;
  startsAt: string;
  endsAt: string;
};

const emptyStageForm: StageForm = { name: "", price: "", startsAt: "", endsAt: "" };

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

  const [stagesDialogOpen, setStagesDialogOpen] = useState(false);
  const [stagesTypeId, setStagesTypeId] = useState<string>("");
  const [stagesTypeName, setStagesTypeName] = useState<string>("");

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
      isNumberedUnits: tt.isNumberedUnits ?? false,
      unitLabel: tt.unitLabel ?? "",
      ticketsPerUnit: tt.ticketsPerUnit ? String(tt.ticketsPerUnit) : "",
    });
    setDialogOpen(true);
  };

  const openStages = (tt: (typeof ticketTypes)[0]) => {
    setStagesTypeId(tt.id);
    setStagesTypeName(tt.name);
    setStagesDialogOpen(true);
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
      isNumberedUnits: form.isNumberedUnits,
      unitLabel: form.isNumberedUnits ? (form.unitLabel || undefined) : undefined,
      ticketsPerUnit: form.isNumberedUnits ? (parseInt(form.ticketsPerUnit, 10) || 1) : undefined,
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
                  <TableHead className="w-24">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ticketTypes.map((tt) => (
                  <TableRow key={tt.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {tt.name}
                        {tt.isNumberedUnits && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {tt.unitLabel || t("ticketTypes.numberedUnits", "Palcos")}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
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
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(tt)} title={t("ticketTypes.editTicketType")}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openStages(tt)} title={t("ticketTypes.pricingStages")}>
                          <TrendingUp className="w-3.5 h-3.5" />
                        </Button>
                      </div>
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
                <Label>{t("ticketTypes.basePrice")} (COP) *</Label>
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
                <DateTimePicker
                  value={form.saleStart}
                  onChange={(v) => setForm((f) => ({ ...f, saleStart: v }))}
                />
              </div>
              <div className="space-y-1">
                <Label>{t("ticketTypes.saleEnd")}</Label>
                <DateTimePicker
                  value={form.saleEnd}
                  onChange={(v) => setForm((f) => ({ ...f, saleEnd: v }))}
                />
              </div>
            </div>

            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label>{t("ticketTypes.numberedUnits", "Numbered Units (Palcos)")}</Label>
                  <p className="text-xs text-muted-foreground">{t("ticketTypes.numberedUnitsDesc", "Enable to sell numbered units like VIP tables or palcos")}</p>
                </div>
                <Switch
                  checked={form.isNumberedUnits}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, isNumberedUnits: v }))}
                />
              </div>
              {form.isNumberedUnits && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>{t("ticketTypes.unitLabel", "Unit Label")}</Label>
                    <Input
                      value={form.unitLabel}
                      onChange={(e) => setForm((f) => ({ ...f, unitLabel: e.target.value }))}
                      placeholder={t("ticketTypes.unitLabelPlaceholder", "e.g. Palco, Mesa, Box")}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{t("ticketTypes.ticketsPerUnit", "Tickets per Unit")}</Label>
                    <Input
                      type="number"
                      min="1"
                      value={form.ticketsPerUnit}
                      onChange={(e) => setForm((f) => ({ ...f, ticketsPerUnit: e.target.value }))}
                      placeholder="1"
                    />
                  </div>
                </div>
              )}
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

      {stagesDialogOpen && (
        <PricingStagesDialog
          eventId={resolvedEventId}
          typeId={stagesTypeId}
          typeName={stagesTypeName}
          open={stagesDialogOpen}
          onOpenChange={setStagesDialogOpen}
        />
      )}
    </div>
  );
}

function PricingStagesDialog({ eventId, typeId, typeName, open, onOpenChange }: {
  eventId: string;
  typeId: string;
  typeName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: stages = [], isLoading } = useQuery({
    queryKey: ["pricingStages", eventId, typeId],
    queryFn: () => apiFetchPricingStages(eventId, typeId),
    enabled: !!typeId,
  });

  const invalidateStages = () => queryClient.invalidateQueries({ queryKey: ["pricingStages", eventId, typeId] });

  const createMutation = useMutation({
    mutationFn: (body: { name: string; price: number; startsAt: string; endsAt: string; displayOrder?: number }) =>
      apiCreatePricingStage(eventId, typeId, body),
    onSuccess: () => { toast({ title: t("ticketTypes.stageCreated") }); invalidateStages(); setShowForm(false); },
    onError: (e: Error) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ stageId, body }: { stageId: string; body: Record<string, unknown> }) =>
      apiUpdatePricingStage(eventId, typeId, stageId, body),
    onSuccess: () => { toast({ title: t("ticketTypes.stageUpdated") }); invalidateStages(); setShowForm(false); setEditingStageId(null); },
    onError: (e: Error) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (stageId: string) => apiDeletePricingStage(eventId, typeId, stageId),
    onSuccess: () => { toast({ title: t("ticketTypes.stageDeleted") }); invalidateStages(); },
    onError: (e: Error) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const [showForm, setShowForm] = useState(false);
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [form, setForm] = useState<StageForm>(emptyStageForm);

  const openAdd = () => {
    setEditingStageId(null);
    setForm({ ...emptyStageForm });
    setShowForm(true);
  };

  const toLocalDatetime = (iso: string) => {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const openEditStage = (stage: (typeof stages)[0]) => {
    setEditingStageId(stage.id);
    setForm({
      name: stage.name,
      price: String(stage.price),
      startsAt: toLocalDatetime(stage.startsAt),
      endsAt: toLocalDatetime(stage.endsAt),
    });
    setShowForm(true);
  };

  const handleSaveStage = () => {
    if (!form.name || !form.price || !form.startsAt || !form.endsAt) {
      toast({ title: t("common.error"), description: t("ticketTypes.requiredFields"), variant: "destructive" });
      return;
    }
    if (new Date(form.startsAt) >= new Date(form.endsAt)) {
      toast({ title: t("common.error"), description: t("ticketTypes.stageStart") + " < " + t("ticketTypes.stageEnd"), variant: "destructive" });
      return;
    }

    const body = {
      name: form.name,
      price: parseInt(form.price, 10),
      startsAt: new Date(form.startsAt).toISOString(),
      endsAt: new Date(form.endsAt).toISOString(),
      displayOrder: editingStageId
        ? stages.find((s) => s.id === editingStageId)?.displayOrder ?? 0
        : stages.length,
    };

    if (editingStageId) {
      updateMutation.mutate({ stageId: editingStageId, body });
    } else {
      createMutation.mutate(body);
    }
  };

  const handleDelete = (stageId: string) => {
    if (confirm(t("ticketTypes.deleteStageConfirm"))) {
      deleteMutation.mutate(stageId);
    }
  };

  const formatPrice = (v: number) => `$${v.toLocaleString("es-CO")}`;
  const formatDate = (d: string) => new Date(d).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const now = new Date();
  const activeStage = stages.find((s) => now >= new Date(s.startsAt) && now <= new Date(s.endsAt));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            {t("ticketTypes.pricingStages")} — {typeName}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{t("ticketTypes.pricingStagesDesc")}</p>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : stages.length === 0 && !showForm ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              <TrendingUp className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>{t("ticketTypes.noStages")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {stages.map((stage, idx) => {
                const isActive = activeStage?.id === stage.id;
                const isPast = now > new Date(stage.endsAt);
                const isFuture = now < new Date(stage.startsAt);

                return (
                  <div
                    key={stage.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      isActive ? "border-primary bg-primary/5" : isPast ? "opacity-50" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex items-center justify-center w-7 h-7 rounded-full bg-muted text-xs font-bold shrink-0">
                        {idx + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{stage.name}</p>
                          {isActive && <Badge variant="default" className="text-[10px] px-1.5 py-0">{t("ticketTypes.currentStage")}</Badge>}
                          {isPast && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{t("common.past", "Past")}</Badge>}
                          {isFuture && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{t("common.upcoming", "Upcoming")}</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(stage.startsAt)} → {formatDate(stage.endsAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-sm font-semibold">{formatPrice(stage.price)}</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditStage(stage)}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(stage.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {showForm && (
            <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
              <p className="text-sm font-medium">{editingStageId ? t("ticketTypes.editStage") : t("ticketTypes.addStage")}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t("ticketTypes.stageName")} *</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder={t("ticketTypes.stageNamePlaceholder")}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("ticketTypes.stagePrice")} (COP) *</Label>
                  <Input
                    type="number"
                    min="0"
                    value={form.price}
                    onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t("ticketTypes.stageStart")} *</Label>
                  <DateTimePicker
                    value={form.startsAt}
                    onChange={(v) => setForm((f) => ({ ...f, startsAt: v }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("ticketTypes.stageEnd")} *</Label>
                  <DateTimePicker
                    value={form.endsAt}
                    onChange={(v) => setForm((f) => ({ ...f, endsAt: v }))}
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => { setShowForm(false); setEditingStageId(null); }}>{t("common.cancel")}</Button>
                <Button size="sm" onClick={handleSaveStage} disabled={createMutation.isPending || updateMutation.isPending}>
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                  {t("common.save")}
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between sm:justify-between">
          {!showForm && (
            <Button variant="outline" size="sm" onClick={openAdd}>
              <Plus className="w-3.5 h-3.5 mr-1" /> {t("ticketTypes.addStage")}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.close", "Cerrar")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
