import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetCurrentAuthUser,
  useListAccessZones,
  useCreateAccessZone,
  useUpdateAccessZone,
  useDeleteAccessZone,
  getListAccessZonesQueryKey,
} from "@workspace/api-client-react";
import type { AccessZone } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

type ZoneForm = { name: string; description: string; colorHex: string; rank: string; upgradePriceCop: string };
const emptyForm: ZoneForm = { name: "", description: "", colorHex: "#6366f1", rank: "0", upgradePriceCop: "" };

export default function EventAccessZones() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: auth } = useGetCurrentAuthUser();
  const eventId = auth?.user?.eventId ?? "";

  const { data, isLoading } = useListAccessZones(eventId, { query: { enabled: !!eventId, queryKey: getListAccessZonesQueryKey(eventId) } });
  const zones = data?.zones ?? [];

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selected, setSelected] = useState<AccessZone | null>(null);
  const [form, setForm] = useState<ZoneForm>(emptyForm);

  const createZone = useCreateAccessZone();
  const updateZone = useUpdateAccessZone();
  const deleteZone = useDeleteAccessZone();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListAccessZonesQueryKey(eventId) });

  const openEdit = (zone: AccessZone) => {
    setSelected(zone);
    setForm({
      name: zone.name,
      description: zone.description ?? "",
      colorHex: zone.colorHex ?? "#6366f1",
      rank: String(zone.rank),
      upgradePriceCop: zone.upgradePriceCop != null ? String(zone.upgradePriceCop) : "",
    });
    setEditOpen(true);
  };

  const handleCreate = () => {
    if (!eventId) return;
    createZone.mutate(
      {
        eventId,
        data: {
          name: form.name,
          rank: parseInt(form.rank),
          description: form.description || undefined,
          colorHex: form.colorHex || undefined,
          upgradePriceCop: form.upgradePriceCop ? parseInt(form.upgradePriceCop) : undefined,
        }
      },
      {
        onSuccess: () => { toast({ title: t("accessZones.created") }); setCreateOpen(false); setForm(emptyForm); invalidate(); },
        onError: (e: unknown) => toast({ title: t("common.error"), description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  const handleUpdate = () => {
    if (!selected || !eventId) return;
    updateZone.mutate(
      {
        eventId,
        zoneId: selected.id,
        data: {
          name: form.name,
          rank: parseInt(form.rank),
          description: form.description || undefined,
          colorHex: form.colorHex || undefined,
          upgradePriceCop: form.upgradePriceCop ? parseInt(form.upgradePriceCop) : null,
        }
      },
      {
        onSuccess: () => { toast({ title: t("accessZones.updated") }); setEditOpen(false); invalidate(); },
        onError: (e: unknown) => toast({ title: t("common.error"), description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  const handleDelete = () => {
    if (!selected || !eventId) return;
    deleteZone.mutate(
      { eventId, zoneId: selected.id },
      {
        onSuccess: () => { toast({ title: t("accessZones.deleted") }); setDeleteOpen(false); invalidate(); },
        onError: (e: unknown) => toast({ title: t("common.error"), description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  const FormFields = () => (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>{t("accessZones.zoneName")}</Label>
        <Input data-testid="input-zone-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
      </div>
      <div className="space-y-1">
        <Label>{t("accessZones.description")}</Label>
        <Input data-testid="input-zone-description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label>{t("accessZones.rank")}</Label>
          <Input data-testid="input-zone-rank" type="number" min="0" value={form.rank} onChange={(e) => setForm((f) => ({ ...f, rank: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label>{t("accessZones.color")}</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={form.colorHex}
              onChange={(e) => setForm((f) => ({ ...f, colorHex: e.target.value }))}
              className="w-10 h-9 rounded border border-border cursor-pointer"
              data-testid="input-zone-color"
            />
            <Input value={form.colorHex} onChange={(e) => setForm((f) => ({ ...f, colorHex: e.target.value }))} className="font-mono text-sm" />
          </div>
        </div>
        <div className="space-y-1">
          <Label>{t("accessZones.upgradePriceCop")}</Label>
          <Input data-testid="input-zone-price" type="number" min="0" value={form.upgradePriceCop} onChange={(e) => setForm((f) => ({ ...f, upgradePriceCop: e.target.value }))} placeholder={t("accessZones.free")} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("accessZones.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("accessZones.subtitle")}</p>
        </div>
        <Button data-testid="button-create-zone" onClick={() => { setForm(emptyForm); setCreateOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" /> {t("accessZones.addZone")}
        </Button>
      </div>

      <div className="border border-border rounded-lg bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("accessZones.colZone")}</TableHead>
              <TableHead>{t("accessZones.colRank")}</TableHead>
              <TableHead>{t("accessZones.colUpgradePrice")}</TableHead>
              <TableHead>{t("accessZones.colDescription")}</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8">{t("common.loading")}</TableCell></TableRow>
            ) : !eventId ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">{t("accessZones.noEvent")}</TableCell></TableRow>
            ) : zones.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">{t("accessZones.noZones")}</TableCell></TableRow>
            ) : (
              [...zones].sort((a, b) => a.rank - b.rank).map((zone) => (
                <TableRow key={zone.id} data-testid={`row-zone-${zone.id}`}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {zone.colorHex && (
                        <div className="w-4 h-4 rounded-full border border-border flex-shrink-0" style={{ backgroundColor: zone.colorHex }} />
                      )}
                      <span className="font-medium">{zone.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{zone.rank}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {zone.upgradePriceCop != null ? `$${zone.upgradePriceCop.toLocaleString()}` : <span className="text-muted-foreground">{t("accessZones.free")}</span>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{zone.description ?? "—"}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" data-testid={`button-zone-menu-${zone.id}`}><MoreHorizontal className="w-4 h-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(zone)}><Pencil className="w-4 h-4 mr-2" /> {t("common.edit")}</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive" onClick={() => { setSelected(zone); setDeleteOpen(true); }}>
                          <Trash2 className="w-4 h-4 mr-2" /> {t("common.delete")}
                        </DropdownMenuItem>
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
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t("accessZones.addZoneTitle")}</DialogTitle></DialogHeader>
          <FormFields />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
            <Button data-testid="button-submit-zone" onClick={handleCreate} disabled={createZone.isPending || !form.name}>
              {createZone.isPending ? t("accessZones.creating") : t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t("accessZones.editZoneTitle")} — {selected?.name}</DialogTitle></DialogHeader>
          <FormFields />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>{t("common.cancel")}</Button>
            <Button data-testid="button-submit-edit-zone" onClick={handleUpdate} disabled={updateZone.isPending || !form.name}>
              {updateZone.isPending ? t("accessZones.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("accessZones.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("accessZones.deleteDesc", { name: selected?.name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction data-testid="button-confirm-delete-zone" onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteZone.isPending ? t("accessZones.deleting") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
