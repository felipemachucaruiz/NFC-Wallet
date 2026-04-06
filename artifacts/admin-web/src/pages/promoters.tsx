import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListPromoterCompanies,
  useCreatePromoterCompany,
  useUpdatePromoterCompany,
  useDeletePromoterCompany,
  getListPromoterCompaniesQueryKey,
} from "@workspace/api-client-react";
import type { PromoterCompany } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

type CompanyForm = { companyName: string; nit: string; address: string; phone: string; email: string };
const emptyForm: CompanyForm = { companyName: "", nit: "", address: "", phone: "", email: "" };

export default function Promoters() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useListPromoterCompanies();
  const companies = data?.companies ?? [];

  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selected, setSelected] = useState<PromoterCompany | null>(null);
  const [form, setForm] = useState<CompanyForm>(emptyForm);

  const createCompany = useCreatePromoterCompany();
  const updateCompany = useUpdatePromoterCompany();
  const deleteCompany = useDeletePromoterCompany();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListPromoterCompaniesQueryKey() });

  const filtered = companies.filter((c) => {
    const q = search.toLowerCase();
    return c.companyName.toLowerCase().includes(q) || (c.nit ?? "").includes(q) || (c.email ?? "").toLowerCase().includes(q);
  });

  const openEdit = (company: PromoterCompany) => {
    setSelected(company);
    setForm({ companyName: company.companyName, nit: company.nit ?? "", address: company.address ?? "", phone: company.phone ?? "", email: company.email ?? "" });
    setEditOpen(true);
  };

  const handleCreate = () => {
    createCompany.mutate(
      { data: { companyName: form.companyName, nit: form.nit || undefined, address: form.address || undefined, phone: form.phone || undefined, email: form.email || undefined } },
      {
        onSuccess: () => { toast({ title: "Company created" }); setCreateOpen(false); invalidate(); },
        onError: (e: unknown) => toast({ title: "Error", description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  const handleUpdate = () => {
    if (!selected) return;
    updateCompany.mutate(
      { id: selected.id, data: { companyName: form.companyName, nit: form.nit || undefined, address: form.address || undefined, phone: form.phone || undefined, email: form.email || undefined } },
      {
        onSuccess: () => { toast({ title: "Company updated" }); setEditOpen(false); invalidate(); },
        onError: (e: unknown) => toast({ title: "Error", description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  const handleDelete = () => {
    if (!selected) return;
    deleteCompany.mutate(
      { id: selected.id },
      {
        onSuccess: () => { toast({ title: "Company deleted" }); setDeleteOpen(false); invalidate(); },
        onError: (e: unknown) => toast({ title: "Error", description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  const FormFields = ({ f, setF }: { f: CompanyForm; setF: (u: (prev: CompanyForm) => CompanyForm) => void }) => (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Company Name *</Label>
        <Input data-testid="input-company-name" value={f.companyName} onChange={(e) => setF((p) => ({ ...p, companyName: e.target.value }))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>NIT</Label>
          <Input data-testid="input-company-nit" value={f.nit} onChange={(e) => setF((p) => ({ ...p, nit: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label>Phone</Label>
          <Input data-testid="input-company-phone" value={f.phone} onChange={(e) => setF((p) => ({ ...p, phone: e.target.value }))} />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Email</Label>
        <Input data-testid="input-company-email" type="email" value={f.email} onChange={(e) => setF((p) => ({ ...p, email: e.target.value }))} />
      </div>
      <div className="space-y-1">
        <Label>Address</Label>
        <Input data-testid="input-company-address" value={f.address} onChange={(e) => setF((p) => ({ ...p, address: e.target.value }))} />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Promoter Companies</h1>
          <p className="text-muted-foreground mt-1">Manage event promoter organizations.</p>
        </div>
        <Button data-testid="button-create-promoter" onClick={() => { setForm(emptyForm); setCreateOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" /> New Company
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input data-testid="input-promoter-search" placeholder="Search companies..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="border border-border rounded-lg bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>NIT</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8">Loading...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No companies found.</TableCell></TableRow>
            ) : (
              filtered.map((company) => (
                <TableRow key={company.id} data-testid={`row-promoter-${company.id}`}>
                  <TableCell className="font-medium">{company.companyName}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-sm">{company.nit ?? "—"}</TableCell>
                  <TableCell className="text-sm">{company.email ?? "—"}</TableCell>
                  <TableCell className="text-sm">{company.phone ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(company.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" data-testid={`button-promoter-menu-${company.id}`}>
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(company)}><Pencil className="w-4 h-4 mr-2" /> Edit</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive" onClick={() => { setSelected(company); setDeleteOpen(true); }}>
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
          <DialogHeader><DialogTitle>Create Promoter Company</DialogTitle></DialogHeader>
          <FormFields f={form} setF={setForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button data-testid="button-submit-promoter" onClick={handleCreate} disabled={createCompany.isPending || !form.companyName}>
              {createCompany.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit — {selected?.companyName}</DialogTitle></DialogHeader>
          <FormFields f={form} setF={setForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button data-testid="button-submit-edit-promoter" onClick={handleUpdate} disabled={updateCompany.isPending || !form.companyName}>
              {updateCompany.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Company</AlertDialogTitle>
            <AlertDialogDescription>Delete {selected?.companyName}? This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction data-testid="button-confirm-delete-promoter" onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteCompany.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
