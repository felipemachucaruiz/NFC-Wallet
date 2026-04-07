import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListEvents,
  useCreateEvent,
  useUpdateEvent,
  getListEventsQueryKey,
} from "@workspace/api-client-react";
import type { Event } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Pencil, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LocationMapPicker } from "@/components/LocationMapPicker";

type EventForm = {
  name: string;
  description: string;
  venueAddress: string;
  startsAt: string;
  endsAt: string;
};

const emptyForm: EventForm = { name: "", description: "", venueAddress: "", startsAt: "", endsAt: "" };

export default function Events() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useListEvents();
  const events = data?.events ?? [];

  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [form, setForm] = useState<EventForm>(emptyForm);
  const [mapPickerOpen, setMapPickerOpen] = useState(false);

  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });

  const filtered = events.filter((e) => {
    const q = search.toLowerCase();
    return e.name.toLowerCase().includes(q) || (e.venueAddress ?? "").toLowerCase().includes(q);
  });

  const openCreate = () => {
    setForm(emptyForm);
    setCreateOpen(true);
  };

  const openEdit = (event: Event) => {
    setSelectedEvent(event);
    setForm({
      name: event.name,
      description: event.description ?? "",
      venueAddress: event.venueAddress ?? "",
      startsAt: event.startsAt ? event.startsAt.slice(0, 16) : "",
      endsAt: event.endsAt ? event.endsAt.slice(0, 16) : "",
    });
    setEditOpen(true);
  };

  const handleCreate = () => {
    createEvent.mutate(
      { data: { ...form, startsAt: form.startsAt || undefined, endsAt: form.endsAt || undefined } },
      {
        onSuccess: () => { toast({ title: t("events.created") }); setCreateOpen(false); invalidate(); },
        onError: (e: unknown) => toast({ title: t("common.error"), description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  const handleUpdate = () => {
    if (!selectedEvent) return;
    updateEvent.mutate(
      { eventId: selectedEvent.id, data: { ...form, startsAt: form.startsAt || undefined, endsAt: form.endsAt || undefined } },
      {
        onSuccess: () => { toast({ title: t("events.updated") }); setEditOpen(false); invalidate(); },
        onError: (e: unknown) => toast({ title: t("common.error"), description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  const handleToggleActive = (event: Event) => {
    updateEvent.mutate(
      { eventId: event.id, data: { active: !event.active } },
      {
        onSuccess: () => { toast({ title: event.active ? t("events.deactivated") : t("events.activated") }); invalidate(); },
        onError: (e: unknown) => toast({ title: t("common.error"), description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  const FormFields = () => (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>{t("events.eventName")}</Label>
        <Input data-testid="input-event-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
      </div>
      <div className="space-y-1">
        <Label>{t("events.description")}</Label>
        <Input data-testid="input-event-description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
      </div>
      <div className="space-y-1">
        <Label>{t("events.venueAddress")}</Label>
        <div className="flex gap-2">
          <Input
            data-testid="input-event-venue"
            value={form.venueAddress}
            onChange={(e) => setForm((f) => ({ ...f, venueAddress: e.target.value }))}
            className="flex-1"
            placeholder={t("locationPicker.addressPlaceholder")}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0"
            title={t("locationPicker.pickOnMap")}
            onClick={() => setMapPickerOpen(true)}
          >
            <MapPin className="w-4 h-4 text-primary" />
          </Button>
        </div>
      </div>
      <LocationMapPicker
        open={mapPickerOpen}
        initialAddress={form.venueAddress}
        onConfirm={(addr) => setForm((f) => ({ ...f, venueAddress: addr }))}
        onClose={() => setMapPickerOpen(false)}
      />
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>{t("events.startsAt")}</Label>
          <Input data-testid="input-event-starts" type="datetime-local" value={form.startsAt} onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label>{t("events.endsAt")}</Label>
          <Input data-testid="input-event-ends" type="datetime-local" value={form.endsAt} onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("events.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("events.subtitle")}</p>
        </div>
        <Button data-testid="button-create-event" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" /> {t("events.newEvent")}
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input data-testid="input-event-search" placeholder={t("events.searchPlaceholder")} className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="border border-border rounded-lg bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("events.colName")}</TableHead>
              <TableHead>{t("events.colVenue")}</TableHead>
              <TableHead>{t("events.colStarts")}</TableHead>
              <TableHead>{t("events.colEnds")}</TableHead>
              <TableHead>{t("events.colStatus")}</TableHead>
              <TableHead className="w-24">{t("events.colActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8">{t("common.loading")}</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{t("events.noEvents")}</TableCell></TableRow>
            ) : (
              filtered.map((event) => (
                <TableRow key={event.id} data-testid={`row-event-${event.id}`}>
                  <TableCell className="font-medium">{event.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{event.venueAddress ?? "—"}</TableCell>
                  <TableCell className="text-sm">{event.startsAt ? new Date(event.startsAt).toLocaleDateString() : "—"}</TableCell>
                  <TableCell className="text-sm">{event.endsAt ? new Date(event.endsAt).toLocaleDateString() : "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        data-testid={`toggle-event-active-${event.id}`}
                        checked={event.active}
                        onCheckedChange={() => handleToggleActive(event)}
                      />
                      <Badge variant={event.active ? "default" : "secondary"} className="text-xs">
                        {event.active ? t("common.active") : t("common.inactive")}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" data-testid={`button-edit-event-${event.id}`} onClick={() => openEdit(event)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("events.createEvent")}</DialogTitle></DialogHeader>
          <FormFields />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
            <Button data-testid="button-submit-event" onClick={handleCreate} disabled={createEvent.isPending || !form.name}>
              {createEvent.isPending ? t("events.creating") : t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("events.editEvent")} — {selectedEvent?.name}</DialogTitle></DialogHeader>
          <FormFields />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>{t("common.cancel")}</Button>
            <Button data-testid="button-submit-edit-event" onClick={handleUpdate} disabled={updateEvent.isPending || !form.name}>
              {updateEvent.isPending ? t("events.saving") : t("events.saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
