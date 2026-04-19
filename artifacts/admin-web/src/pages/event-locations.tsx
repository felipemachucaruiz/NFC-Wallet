import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetCurrentAuthUser,
  useListLocations,
  useCreateLocation,
  useUpdateLocation,
  useAssignUserToLocation,
  useRemoveUserFromLocation,
  useListUsers,
  useListMerchants,
  getListLocationsQueryKey,
} from "@workspace/api-client-react";
import type { Location } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, MoreHorizontal, Pencil, UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEventContext } from "@/contexts/event-context";

type LocationForm = { name: string; merchantId: string; active: boolean };
const emptyForm: LocationForm = { name: "", merchantId: "", active: true };

export default function EventLocations() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: auth } = useGetCurrentAuthUser();
  const { eventId } = useEventContext();

  const { data, isLoading } = useListLocations({ eventId: eventId || undefined });
  const locations = data?.locations ?? [];
  const { data: usersData } = useListUsers();
  const allUsers = usersData?.users ?? [];
  const eventUsers = allUsers.filter((u) => u.eventId === eventId);
  const { data: merchantsData } = useListMerchants({ eventId: eventId || undefined });
  const merchants = merchantsData?.merchants ?? [];

  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [selected, setSelected] = useState<Location | null>(null);
  const [form, setForm] = useState<LocationForm>(emptyForm);
  const [assignUserId, setAssignUserId] = useState("");

  const createLocation = useCreateLocation();
  const updateLocation = useUpdateLocation();
  const assignUser = useAssignUserToLocation();
  const removeUser = useRemoveUserFromLocation();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListLocationsQueryKey({ eventId }) });

  const filtered = locations.filter((l) => l.name.toLowerCase().includes(search.toLowerCase()));

  const openEdit = (location: Location) => {
    setSelected(location);
    setForm({ name: location.name, merchantId: location.merchantId, active: location.active });
    setEditOpen(true);
  };

  const handleCreate = () => {
    if (!eventId || !form.merchantId) return;
    createLocation.mutate(
      { data: { name: form.name, eventId, merchantId: form.merchantId } },
      {
        onSuccess: () => { toast({ title: t("locations.created") }); setCreateOpen(false); setForm(emptyForm); invalidate(); },
        onError: (e: unknown) => toast({ title: t("common.error"), description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  const handleUpdate = () => {
    if (!selected) return;
    updateLocation.mutate(
      { locationId: selected.id, data: { name: form.name, active: form.active } },
      {
        onSuccess: () => { toast({ title: t("locations.updated") }); setEditOpen(false); invalidate(); },
        onError: (e: unknown) => toast({ title: t("common.error"), description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  const handleAssign = () => {
    if (!selected || !assignUserId) return;
    assignUser.mutate(
      { locationId: selected.id, data: { userId: assignUserId } },
      {
        onSuccess: () => { toast({ title: t("locations.userAssigned") }); setAssignOpen(false); setAssignUserId(""); invalidate(); },
        onError: (e: unknown) => toast({ title: t("common.error"), description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  void removeUser;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("locations.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("locations.subtitle")}</p>
        </div>
        <Button data-testid="button-create-location" onClick={() => { setForm(emptyForm); setCreateOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" /> {t("locations.addLocation")}
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input data-testid="input-location-search" placeholder={t("locations.searchPlaceholder")} className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="border border-border rounded-lg bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("locations.colLocation")}</TableHead>
              <TableHead>{t("locations.colMerchant")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8">{t("common.loading")}</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">{t("locations.noLocations")}</TableCell></TableRow>
            ) : (
              filtered.map((location) => (
                <TableRow key={location.id} data-testid={`row-location-${location.id}`}>
                  <TableCell className="font-medium">{location.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{merchants.find((m) => m.id === location.merchantId)?.name ?? location.merchantId.slice(0, 8)}</TableCell>
                  <TableCell>
                    <Badge variant={location.active ? "default" : "secondary"} className="text-xs">
                      {location.active ? t("common.active") : t("common.inactive")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreHorizontal className="w-4 h-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(location)}><Pencil className="w-4 h-4 mr-2" /> {t("common.edit")}</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setSelected(location); setAssignOpen(true); }}><UserPlus className="w-4 h-4 mr-2" /> {t("locations.assignStaff")}</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("locations.addLocationTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{t("locations.locationName")}</Label>
              <Input data-testid="input-location-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>{t("locations.merchant")}</Label>
              <Select value={form.merchantId} onValueChange={(v) => setForm((f) => ({ ...f, merchantId: v }))}>
                <SelectTrigger data-testid="select-location-merchant"><SelectValue placeholder={t("locations.selectMerchant")} /></SelectTrigger>
                <SelectContent>
                  {merchants.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
            <Button data-testid="button-submit-location" onClick={handleCreate} disabled={createLocation.isPending || !form.name || !form.merchantId}>
              {createLocation.isPending ? t("locations.creating") : t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("locations.editTitle")} — {selected?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{t("locations.locationName")}</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.active} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))} />
              <Label>{t("common.active")}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleUpdate} disabled={updateLocation.isPending || !form.name}>
              {updateLocation.isPending ? t("locations.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t("locations.assignStaffTitle")} — {selected?.name}</DialogTitle></DialogHeader>
          <div className="space-y-1">
            <Label>{t("locations.staffMember")}</Label>
            <Select value={assignUserId} onValueChange={setAssignUserId}>
              <SelectTrigger data-testid="select-assign-user"><SelectValue placeholder={t("locations.selectStaff")} /></SelectTrigger>
              <SelectContent>
                {eventUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.role})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>{t("common.cancel")}</Button>
            <Button data-testid="button-submit-assign" onClick={handleAssign} disabled={assignUser.isPending || !assignUserId}>
              {assignUser.isPending ? t("locations.assigning") : t("locations.assign")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
