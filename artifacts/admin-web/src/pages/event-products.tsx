import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetCurrentAuthUser,
  useListProducts,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  useListMerchants,
  getListProductsQueryKey,
} from "@workspace/api-client-react";
import type { Product } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

type ProductForm = {
  name: string;
  priceCop: string;
  costCop: string;
  category: string;
  barcode: string;
  merchantId: string;
  ivaRate: string;
  ivaExento: boolean;
  active: boolean;
};

const emptyForm: ProductForm = {
  name: "",
  priceCop: "",
  costCop: "0",
  category: "",
  barcode: "",
  merchantId: "",
  ivaRate: "0",
  ivaExento: false,
  active: true,
};

export default function EventProducts() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: auth } = useGetCurrentAuthUser();
  const eventId = auth?.user?.eventId ?? "";

  const { data, isLoading } = useListProducts();
  const products = data?.products ?? [];
  const { data: merchantsData } = useListMerchants({ eventId: eventId || undefined });
  const merchants = merchantsData?.merchants ?? [];

  const [search, setSearch] = useState("");
  const [merchantFilter, setMerchantFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selected, setSelected] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });

  const merchantIds = new Set(merchants.map((m) => m.id));
  const eventProducts = products.filter((p) => merchantIds.has(p.merchantId));

  const filtered = eventProducts.filter((p) => {
    const q = search.toLowerCase();
    const matchesSearch = p.name.toLowerCase().includes(q) || (p.barcode ?? "").toLowerCase().includes(q);
    const matchesMerchant = merchantFilter === "all" || p.merchantId === merchantFilter;
    return matchesSearch && matchesMerchant;
  });

  const openEdit = (product: Product) => {
    setSelected(product);
    setForm({
      name: product.name,
      priceCop: String(product.priceCop),
      costCop: String(product.costCop),
      category: product.category ?? "",
      barcode: product.barcode ?? "",
      merchantId: product.merchantId,
      ivaRate: product.ivaRate ?? "0",
      ivaExento: product.ivaExento ?? false,
      active: product.active,
    });
    setEditOpen(true);
  };

  const handleCreate = () => {
    if (!form.merchantId) return;
    createProduct.mutate(
      {
        data: {
          name: form.name,
          priceCop: parseInt(form.priceCop),
          costCop: parseInt(form.costCop) || undefined,
          merchantId: form.merchantId,
          category: form.category || undefined,
          barcode: form.barcode || undefined,
          ivaRate: form.ivaRate || undefined,
          ivaExento: form.ivaExento || undefined,
        },
      },
      {
        onSuccess: () => { toast({ title: "Product created" }); setCreateOpen(false); setForm(emptyForm); invalidate(); },
        onError: (e: unknown) => toast({ title: "Error", description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  const handleUpdate = () => {
    if (!selected) return;
    updateProduct.mutate(
      {
        productId: selected.id,
        data: {
          name: form.name,
          priceCop: parseInt(form.priceCop),
          costCop: parseInt(form.costCop) || undefined,
          category: form.category || undefined,
          barcode: form.barcode || undefined,
          ivaRate: form.ivaRate || undefined,
          ivaExento: form.ivaExento,
          active: form.active,
        },
      },
      {
        onSuccess: () => { toast({ title: "Product updated" }); setEditOpen(false); invalidate(); },
        onError: (e: unknown) => toast({ title: "Error", description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  const handleDelete = () => {
    if (!selected) return;
    deleteProduct.mutate(
      { productId: selected.id },
      {
        onSuccess: () => { toast({ title: "Product deleted" }); setDeleteOpen(false); invalidate(); },
        onError: (e: unknown) => toast({ title: "Error", description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  const FormFields = () => (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Product Name *</Label>
        <Input data-testid="input-product-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Price (COP) *</Label>
          <Input data-testid="input-product-price" type="number" min="0" value={form.priceCop} onChange={(e) => setForm((f) => ({ ...f, priceCop: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label>Cost (COP)</Label>
          <Input type="number" min="0" value={form.costCop} onChange={(e) => setForm((f) => ({ ...f, costCop: e.target.value }))} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Category</Label>
          <Input data-testid="input-product-category" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="e.g. Bebidas" />
        </div>
        <div className="space-y-1">
          <Label>Barcode</Label>
          <Input data-testid="input-product-barcode" value={form.barcode} onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))} placeholder="Optional" />
        </div>
      </div>
      {!editOpen && (
        <div className="space-y-1">
          <Label>Merchant *</Label>
          <Select value={form.merchantId} onValueChange={(v) => setForm((f) => ({ ...f, merchantId: v }))}>
            <SelectTrigger data-testid="select-product-merchant"><SelectValue placeholder="Select merchant" /></SelectTrigger>
            <SelectContent>
              {merchants.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>IVA Rate (%)</Label>
          <Input data-testid="input-product-iva" type="text" value={form.ivaRate} onChange={(e) => setForm((f) => ({ ...f, ivaRate: e.target.value }))} />
        </div>
        <div className="flex items-center gap-2 pt-6">
          <Switch checked={form.ivaExento} onCheckedChange={(v) => setForm((f) => ({ ...f, ivaExento: v }))} />
          <Label>IVA Exento</Label>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={form.active} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))} />
        <Label>Active</Label>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Products</h1>
          <p className="text-muted-foreground mt-1">Manage products and pricing per merchant.</p>
        </div>
        <Button data-testid="button-create-product" onClick={() => { setForm(emptyForm); setCreateOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" /> Add Product
        </Button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input data-testid="input-product-search" placeholder="Search products..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={merchantFilter} onValueChange={setMerchantFilter}>
          <SelectTrigger className="w-48" data-testid="select-merchant-filter">
            <SelectValue placeholder="All merchants" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All merchants</SelectItem>
            {merchants.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="border border-border rounded-lg bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Merchant</TableHead>
              <TableHead className="text-right">Price (COP)</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Barcode</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8">Loading...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No products found.</TableCell></TableRow>
            ) : (
              filtered.map((product) => (
                <TableRow key={product.id} data-testid={`row-product-${product.id}`}>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{merchants.find((m) => m.id === product.merchantId)?.name ?? product.merchantId.slice(0, 8)}</TableCell>
                  <TableCell className="text-right font-mono">${product.priceCop.toLocaleString()}</TableCell>
                  <TableCell className="text-sm">{product.category ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{product.barcode ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={product.active ? "default" : "secondary"} className="text-xs">{product.active ? "Active" : "Inactive"}</Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreHorizontal className="w-4 h-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(product)}><Pencil className="w-4 h-4 mr-2" /> Edit</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive" onClick={() => { setSelected(product); setDeleteOpen(true); }}>
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
          <DialogHeader><DialogTitle>Add Product</DialogTitle></DialogHeader>
          <FormFields />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button data-testid="button-submit-product" onClick={handleCreate} disabled={createProduct.isPending || !form.name || !form.priceCop || !form.merchantId}>
              {createProduct.isPending ? "Creating..." : "Create"}
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
            <Button data-testid="button-submit-edit-product" onClick={handleUpdate} disabled={updateProduct.isPending || !form.name || !form.priceCop}>
              {updateProduct.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product</AlertDialogTitle>
            <AlertDialogDescription>Delete "{selected?.name}"? This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction data-testid="button-confirm-delete-product" onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteProduct.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
