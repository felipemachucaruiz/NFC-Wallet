import { useState } from "react";
import { useGetCurrentAuthUser, useGetEvent } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, GripVertical, CalendarDays } from "lucide-react";
import { useTranslation } from "react-i18next";

type EventDay = {
  id: string;
  label: string;
  date: string;
  doorOpenTime: string;
  doorCloseTime: string;
  order: number;
};

export default function EventDays() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: auth } = useGetCurrentAuthUser();
  const eventId = auth?.user?.eventId ?? "";
  const { data: eventData } = useGetEvent(eventId || "");
  const event = eventData as Record<string, unknown> | undefined;

  const [days, setDays] = useState<EventDay[]>(() => {
    if (event?.startsAt) {
      return [{
        id: "day-1",
        label: t("eventDays.dayLabel", { number: 1 }),
        date: String(event.startsAt).slice(0, 10),
        doorOpenTime: "14:00",
        doorCloseTime: "23:00",
        order: 1,
      }];
    }
    return [];
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDay, setEditingDay] = useState<EventDay | null>(null);
  const [form, setForm] = useState({ label: "", date: "", doorOpenTime: "14:00", doorCloseTime: "23:00" });

  const openCreate = () => {
    setEditingDay(null);
    setForm({ label: "", date: "", doorOpenTime: "14:00", doorCloseTime: "23:00" });
    setDialogOpen(true);
  };

  const openEdit = (day: EventDay) => {
    setEditingDay(day);
    setForm({ label: day.label, date: day.date, doorOpenTime: day.doorOpenTime, doorCloseTime: day.doorCloseTime });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.label || !form.date) {
      toast({ title: t("common.error"), description: t("eventDays.requiredFields"), variant: "destructive" });
      return;
    }

    if (editingDay) {
      setDays((prev) => prev.map((d) => d.id === editingDay.id ? { ...d, ...form } : d));
      toast({ title: t("eventDays.updated") });
    } else {
      const newDay: EventDay = {
        id: `day-${Date.now()}`,
        label: form.label,
        date: form.date,
        doorOpenTime: form.doorOpenTime,
        doorCloseTime: form.doorCloseTime,
        order: days.length + 1,
      };
      setDays((prev) => [...prev, newDay]);
      toast({ title: t("eventDays.created") });
    }
    setDialogOpen(false);
  };

  const handleDelete = (id: string) => {
    setDays((prev) => prev.filter((d) => d.id !== id).map((d, i) => ({ ...d, order: i + 1 })));
    toast({ title: t("eventDays.deleted") });
  };

  const moveDay = (index: number, direction: -1 | 1) => {
    const newDays = [...days];
    const target = index + direction;
    if (target < 0 || target >= newDays.length) return;
    [newDays[index], newDays[target]] = [newDays[target], newDays[index]];
    setDays(newDays.map((d, i) => ({ ...d, order: i + 1 })));
  };

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
                  <TableHead className="w-32">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {days.map((day, i) => (
                  <TableRow key={day.id} data-testid={`row-day-${day.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <GripVertical className="w-3 h-3 text-muted-foreground cursor-grab" />
                        <button onClick={() => moveDay(i, -1)} className="text-xs text-muted-foreground hover:text-foreground" disabled={i === 0}>▲</button>
                        <button onClick={() => moveDay(i, 1)} className="text-xs text-muted-foreground hover:text-foreground" disabled={i === days.length - 1}>▼</button>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{day.label}</TableCell>
                    <TableCell>{day.date}</TableCell>
                    <TableCell>{day.doorOpenTime}</TableCell>
                    <TableCell>{day.doorCloseTime}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(day)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(day.id)}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
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
            <DialogTitle>{editingDay ? t("eventDays.editDay") : t("eventDays.addDay")}</DialogTitle>
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
                  value={form.doorOpenTime}
                  onChange={(e) => setForm((f) => ({ ...f, doorOpenTime: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>{t("eventDays.colDoorClose")}</Label>
                <Input
                  type="time"
                  value={form.doorCloseTime}
                  onChange={(e) => setForm((f) => ({ ...f, doorCloseTime: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleSave}>{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
