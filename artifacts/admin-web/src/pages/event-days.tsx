import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetCurrentAuthUser } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, CalendarDays, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEventContext } from "@/contexts/event-context";
import { apiFetchEventDays, apiCreateEventDay, apiUpdateEventDay, apiDeleteEventDay } from "@/lib/api";

export default function EventDays() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: auth } = useGetCurrentAuthUser();
  const { eventId } = useEventContext();
  const resolvedEventId = auth?.user?.role === "admin" ? eventId : (auth?.user?.eventId ?? "");

  const { data: days = [], isLoading, isError, error } = useQuery({
    queryKey: ["eventDays", resolvedEventId],
    queryFn: () => apiFetchEventDays(resolvedEventId),
    enabled: !!resolvedEventId,
  });

  const createMutation = useMutation({
    mutationFn: (body: { label: string; date: string; doorsOpenAt?: string; doorsCloseAt?: string }) =>
      apiCreateEventDay(resolvedEventId, body),
    onSuccess: () => {
      toast({ title: t("eventDays.created") });
      queryClient.invalidateQueries({ queryKey: ["eventDays", resolvedEventId] });
      setDialogOpen(false);
    },
    onError: (e: Error) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ dayId, body }: { dayId: string; body: Record<string, unknown> }) =>
      apiUpdateEventDay(resolvedEventId, dayId, body),
    onSuccess: () => {
      toast({ title: t("eventDays.updated", "Day updated") });
      queryClient.invalidateQueries({ queryKey: ["eventDays", resolvedEventId] });
      setEditDialogOpen(false);
      setEditingDay(null);
    },
    onError: (e: Error) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (dayId: string) => apiDeleteEventDay(resolvedEventId, dayId),
    onSuccess: () => {
      toast({ title: t("eventDays.deleted", "Day deleted") });
      queryClient.invalidateQueries({ queryKey: ["eventDays", resolvedEventId] });
      setDeleteConfirmId(null);
    },
    onError: (e: Error) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ label: "", date: "", doorsOpenAt: "14:00", doorsCloseAt: "23:00" });

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingDay, setEditingDay] = useState<any>(null);
  const [editForm, setEditForm] = useState({ label: "", date: "", doorsOpenAt: "", doorsCloseAt: "" });

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const openCreate = () => {
    setForm({ label: "", date: "", doorsOpenAt: "14:00", doorsCloseAt: "23:00" });
    setDialogOpen(true);
  };

  const openEdit = (day: any) => {
    setEditingDay(day);
    const openTime = day.doorsOpenAt ? extractTime(day.doorsOpenAt) : "";
    const closeTime = day.doorsCloseAt ? extractTime(day.doorsCloseAt) : "";
    setEditForm({
      label: day.label || "",
      date: day.date || "",
      doorsOpenAt: openTime,
      doorsCloseAt: closeTime,
    });
    setEditDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.label || !form.date) {
      toast({ title: t("common.error"), description: t("eventDays.requiredFields"), variant: "destructive" });
      return;
    }
    createMutation.mutate({
      label: form.label,
      date: form.date,
      doorsOpenAt: form.doorsOpenAt ? `${form.date}T${form.doorsOpenAt}:00Z` : undefined,
      doorsCloseAt: form.doorsCloseAt ? `${form.date}T${form.doorsCloseAt}:00Z` : undefined,
    });
  };

  const handleEditSave = () => {
    if (!editingDay || !editForm.label || !editForm.date) {
      toast({ title: t("common.error"), description: t("eventDays.requiredFields"), variant: "destructive" });
      return;
    }
    updateMutation.mutate({
      dayId: editingDay.id,
      body: {
        label: editForm.label,
        date: editForm.date,
        doorsOpenAt: editForm.doorsOpenAt ? `${editForm.date}T${editForm.doorsOpenAt}:00Z` : null,
        doorsCloseAt: editForm.doorsCloseAt ? `${editForm.date}T${editForm.doorsCloseAt}:00Z` : null,
      },
    });
  };

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
        <p className="text-sm text-muted-foreground mt-1">{(error as Error)?.message || t("common.unknownError")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("eventDays.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("eventDays.subtitle")}</p>
        </div>
        <Button onClick={openCreate} data-testid="button-add-day">
          <Plus className="w-4 h-4 mr-2" /> {t("eventDays.addDay")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="w-4 h-4" />
            {t("eventDays.daysListTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {days.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">{t("eventDays.noDays")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>{t("eventDays.colLabel")}</TableHead>
                  <TableHead>{t("eventDays.colDate")}</TableHead>
                  <TableHead>{t("eventDays.colDoorOpen")}</TableHead>
                  <TableHead>{t("eventDays.colDoorClose")}</TableHead>
                  <TableHead className="w-20">{t("common.actions", "Actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {days.map((day, i) => (
                  <TableRow key={day.id}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell className="font-medium">{day.label}</TableCell>
                    <TableCell>{day.date}</TableCell>
                    <TableCell>{day.doorsOpenAt ? formatTime(day.doorsOpenAt) : "—"}</TableCell>
                    <TableCell>{day.doorsCloseAt ? formatTime(day.doorsCloseAt) : "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEdit(day)}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setDeleteConfirmId(day.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("eventDays.addDay")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>{t("eventDays.dayLabelField")} *</Label>
              <Input
                data-testid="input-day-label"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder={t("eventDays.dayLabelPlaceholder")}
              />
            </div>
            <div className="space-y-1">
              <Label>{t("eventDays.colDate")} *</Label>
              <Input
                data-testid="input-day-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t("eventDays.colDoorOpen")}</Label>
                <Input
                  type="time"
                  value={form.doorsOpenAt}
                  onChange={(e) => setForm((f) => ({ ...f, doorsOpenAt: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>{t("eventDays.colDoorClose")}</Label>
                <Input
                  type="time"
                  value={form.doorsCloseAt}
                  onChange={(e) => setForm((f) => ({ ...f, doorsCloseAt: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editDialogOpen} onOpenChange={(open) => { setEditDialogOpen(open); if (!open) setEditingDay(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("eventDays.editDay", "Edit Day")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>{t("eventDays.dayLabelField")} *</Label>
              <Input
                value={editForm.label}
                onChange={(e) => setEditForm((f) => ({ ...f, label: e.target.value }))}
                placeholder={t("eventDays.dayLabelPlaceholder")}
              />
            </div>
            <div className="space-y-1">
              <Label>{t("eventDays.colDate")} *</Label>
              <Input
                type="date"
                value={editForm.date}
                onChange={(e) => setEditForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t("eventDays.colDoorOpen")}</Label>
                <Input
                  type="time"
                  value={editForm.doorsOpenAt}
                  onChange={(e) => setEditForm((f) => ({ ...f, doorsOpenAt: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>{t("eventDays.colDoorClose")}</Label>
                <Input
                  type="time"
                  value={editForm.doorsCloseAt}
                  onChange={(e) => setEditForm((f) => ({ ...f, doorsCloseAt: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditDialogOpen(false); setEditingDay(null); }}>{t("common.cancel")}</Button>
            <Button onClick={handleEditSave} disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirmId} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("eventDays.deleteDay", "Delete Day")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("eventDays.deleteConfirm", "Are you sure you want to delete this event day? Ticket types linked to this day may be affected.")}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>{t("common.cancel")}</Button>
            <Button
              variant="destructive"
              onClick={() => { if (deleteConfirmId) deleteMutation.mutate(deleteConfirmId); }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {t("common.delete", "Delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function extractTime(dateStr: string): string {
  if (!dateStr) return "";
  const match = dateStr.match(/T(\d{2}:\d{2})/);
  if (match) return match[1];
  if (/^\d{2}:\d{2}/.test(dateStr)) return dateStr.substring(0, 5);
  return "";
}

function formatTime(dateStr: string): string {
  if (!dateStr) return "—";
  const match = dateStr.match(/T(\d{2}:\d{2})/);
  if (match) return match[1];
  if (/^\d{2}:\d{2}/.test(dateStr)) return dateStr.substring(0, 5);
  return dateStr;
}
