import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetCurrentAuthUser,
  useListMerchants,
  useCreateMerchant,
  useUpdateMerchant,
  useDeleteMerchant,
  getListMerchantsQueryKey,
} from "@workspace/api-client-react";
import type { Merchant } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

type MerchantForm = { name: string; commissionRatePercent: string; retencionFuenteRate: string; retencionICARate: string };
const emptyForm: MerchantForm = { name: "", commissionRatePercent: "0", retencionFuenteRate: "0", retencionICARate: "0" };

export default function EventMerchants() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: auth } = useGetCurrentAuthUser();
  const eventId = auth?.user?.eventId ?? "";
  const { data, isLoading } = useListMerchants({ eventId: eventId || undefined });
  const merchants = data?.merchants ?? [];

  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selected, setSelected] = useState<Merchant | null>(null);
  const [form, setForm] = useState<MerchantForm>(emptyForm);

  const createMerchant = useCreateMerchant();
  const updateMerchant = useUpdateMerchant();
  const deleteMerchant = useDeleteMerchant();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListMerchantsQueryKey({ eventId }) });

  const filtered = merchants.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()));

  const openEdit = (merchant: Merchant) => {
    setSelected(merchant);
    setForm({
      name: merchant.name,
      commissionRatePercent: merchant.commissionRatePercent ?? "0",
      retencionFuenteRate: merchant.retencionFuenteRate ?? "0",
      retencionICARate: merchant.retencionICARate ?? "0",
    });
    setEditOpen(true);
  };

  const handleCreate = () => {
    if (!eventId) return;
    createMerchant.mutate(
      { data: { name: form.name, eventId, commissionRatePercent: form.commissionRatePercent, retencionFuenteRate: form.retencionFuenteRate, retencionICARate: form.retencionICARate } },
      {
        onSuccess: () => { toast({ title: "Merchant created" }); setCreateOpen(false); setForm(emptyForm); invalidate(); },
        onError: (e: unknown) => toast({ title: "Error", description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  const handleUpdate = () => {
    if (!selected) return;
    updateMerchant.mutate(
      { merchantId: selected.id, data: { name: form.name, commissionRatePercent: form.commissionRatePercent, retencionFuenteRate: form.retencionFuenteRate, retencionICARate: form.retencionICARate } },
      {
        onSuccess: () => { toast({ title: "Merchant updated" }); setEditOpen(false); invalidate(); },
        onError: (e: unknown) => toast({ title: "Error", description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  const handleToggleActive = (merchant: Merchant) => {
    updateMerchant.mutate(
      { merchantId: merchant.id, data: { active: !merchant.active } },
      {
        onSuccess: () => { toast({ title: merchant.active ? "Merchant deactivated" : "Merchant activated" }); invalidate(); },
        onError: (e: unknown) => toast({ title: "Error", description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  const handleDelete = () => {
    if (!selected) return;
    deleteMerchant.mutate(
      { merchantId: selected.id },
      {
        onSuccess: () => { toast({ title: "Merchant deleted" }); setDeleteOpen(false); invalidate(); },
        onError: (e: unknown) => toast({ title: "Error", description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  const FormFields = () => (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Merchant Name *</Label>
        <Input data-testid="input-merchant-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label>Commission %</Label>
          <Input data-testid="input-commission" type="text" placeholder="0.00" value={form.commissionRatePercent} onChange={(e) => setForm((f) => ({ ...f, commissionRatePercent: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label>Retencion Fuente %</Label>
          <Input data-testid="input-retencion-fuente" type="text" placeholder="0.00" value={form.retencionFuenteRate} onChange={(e) => setForm((f) => ({ ...f, retencionFuenteRate: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label>Retencion ICA %</Label>
          <Input data-testid="input-retencion-ica" type="text" placeholder="0.00" value={form.retencionICARate} onChange={(e) => setForm((f) => ({ ...f, retencionICARate: e.target.value }))} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Merchants</h1>
          <p className="text-muted-foreground mt-1">Manage vendors and their commission rates.</p>
        </div>
        <Button data-testid="button-create-merchant" onClick={() => { setForm(emptyForm); setCreateOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" /> Add Merchant
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input data-testid="input-merchant-search" placeholder="Search merchants..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="border border-border rounded-lg bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Commission</TableHead>
              <TableHead>Retencion Fuente</TableHead>
              <TableHead>Retencion ICA</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8">Loading...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No merchants found.</TableCell></TableRow>
            ) : (
              filtered.map((merchant) => (
                <TableRow key={merchant.id} data-testid={`row-merchant-${merchant.id}`}>
                  <TableCell className="font-medium">{merchant.name}</TableCell>
                  <TableCell className="font-mono text-sm">{merchant.commissionRatePercent}%</TableCell>
                  <TableCell className="font-mono text-sm">{merchant.retencionFuenteRate ?? "0"}%</TableCell>
                  <TableCell className="font-mono text-sm">{merchant.retencionICARate ?? "0"}%</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch data-testid={`toggle-merchant-${merchant.id}`} checked={merchant.active} onCheckedChange={() => handleToggleActive(merchant)} />
                      <Badge variant={merchant.active ? "default" : "secondary"} className="text-xs">{merchant.active ? "Active" : "Inactive"}</Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" data-testid={`button-merchant-menu-${merchant.id}`}><MoreHorizontal className="w-4 h-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(merchant)}><Pencil className="w-4 h-4 mr-2" /> Edit</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive" onClick={() => { setSelected(merchant); setDeleteOpen(true); }}>
                          <Trash2 className="w-4 h-4 mr-2" /> Delete
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
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Merchant</DialogTitle></DialogHeader>
          <FormFields />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button data-testid="button-submit-merchant" onClick={handleCreate} disabled={createMerchant.isPending || !form.name}>
              {createMerchant.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit — {selected?.name}</DialogTitle></DialogHeader>
          <FormFields />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button data-testid="button-submit-edit-merchant" onClick={handleUpdate} disabled={updateMerchant.isPending || !form.name}>
              {updateMerchant.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Merchant</AlertDialogTitle>
            <AlertDialogDescription>Delete {selected?.name}? This cannot be undone if transactions exist.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction data-testid="button-confirm-delete-merchant" onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteMerchant.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
