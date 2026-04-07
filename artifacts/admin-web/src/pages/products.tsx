import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListProducts,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  useListMerchants,
  useListEvents,
  getListProductsQueryKey,
  customFetch,
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
import { Plus, Search, MoreHorizontal, Pencil, Trash2, ImageIcon, Upload, X } from "lucide-react";
import { useTranslation } from "react-i18next";

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

const emptyForm: ProductForm = { name: "", priceCop: "", costCop: "0", category: "", barcode: "", merchantId: "", ivaRate: "0", ivaExento: false, active: true };

export default function Products() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [eventFilter, setEventFilter] = useState("all");
  const [merchantFilter, setMerchantFilter] = useState("all");

  const { data: eventsData } = useListEvents();
  const events = eventsData?.events ?? [];

  const productParams: Record<string, string> = {};
  if (eventFilter !== "all") productParams.eventId = eventFilter;
  if (merchantFilter !== "all") productParams.merchantId = merchantFilter;
  const { data, isLoading } = useListProducts(Object.keys(productParams).length > 0 ? productParams as any : undefined);
  const products = data?.products ?? [];

  const { data: merchantsData } = useListMerchants(eventFilter !== "all" ? { eventId: eventFilter } : undefined);
  const merchants = merchantsData?.merchants ?? [];

  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selected, setSelected] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });

  const filtered = products.filter((p) => {
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.barcode ?? "").toLowerCase().includes(q);
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
    setCurrentImageUrl((product as Product & { imageUrl?: string | null }).imageUrl ?? null);
    setImageFile(null);
    setImagePreview(null);
    setEditOpen(true);
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleImageUpload = async () => {
    if (!selected || !imageFile) return;
    setImageUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", imageFile);
      const result = await customFetch<{ imageUrl: string }>(`/api/products/${selected.id}/image`, {
        method: "POST",
        body: fd,
      });
      setCurrentImageUrl(result.imageUrl);
      setImageFile(null);
      setImagePreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast({ title: t("products.imageUploaded") });
      invalidate();
    } catch (e: unknown) {
      toast({ title: t("common.error"), description: (e as { message?: string }).message, variant: "destructive" });
    } finally {
      setImageUploading(false);
    }
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
        onSuccess: () => { toast({ title: t("products.created") }); setCreateOpen(false); setForm(emptyForm); invalidate(); },
        onError: (e: unknown) => toast({ title: t("common.error"), description: (e as { message?: string }).message, variant: "destructive" }),
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
        onSuccess: () => { toast({ title: t("products.updated") }); setEditOpen(false); invalidate(); },
        onError: (e: unknown) => toast({ title: t("common.error"), description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  const handleDelete = () => {
    if (!selected) return;
    deleteProduct.mutate(
      { productId: selected.id },
      {
        onSuccess: () => { toast({ title: t("products.deleted") }); setDeleteOpen(false); invalidate(); },
        onError: (e: unknown) => toast({ title: t("common.error"), description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("products.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("products.subtitle")}</p>
        </div>
        <Button data-testid="button-create-product" onClick={() => { setForm(emptyForm); setCreateOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" /> {t("products.addProduct")}
        </Button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t("products.searchPlaceholder")} className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={eventFilter} onValueChange={(v) => { setEventFilter(v); setMerchantFilter("all"); }}>
          <SelectTrigger className="w-48"><SelectValue placeholder={t("products.allEvents")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("products.allEvents")}</SelectItem>
            {events.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={merchantFilter} onValueChange={setMerchantFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder={t("products.allMerchants")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("products.allMerchants")}</SelectItem>
            {merchants.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="border border-border rounded-lg bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12"></TableHead>
              <TableHead>{t("products.colProduct")}</TableHead>
              <TableHead>{t("products.colMerchant")}</TableHead>
              <TableHead className="text-right">{t("products.colPrice")}</TableHead>
              <TableHead>{t("products.colCategory")}</TableHead>
              <TableHead>{t("products.colIVA")}</TableHead>
              <TableHead>{t("products.colStatus")}</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8">{t("common.loading")}</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">{t("products.noProducts")}</TableCell></TableRow>
            ) : (
              filtered.map((product) => {
                const imgUrl = (product as Product & { imageUrl?: string | null }).imageUrl;
                return (
                <TableRow key={product.id}>
                  <TableCell>
                    {imgUrl ? (
                      <img src={imgUrl} alt={product.name} className="w-9 h-9 rounded object-cover border border-border" />
                    ) : (
                      <div className="w-9 h-9 rounded border border-border bg-muted flex items-center justify-center">
                        <ImageIcon className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{merchants.find((m) => m.id === product.merchantId)?.name ?? product.merchantId.slice(0, 8)}</TableCell>
                  <TableCell className="text-right font-mono">${product.priceCop.toLocaleString()}</TableCell>
                  <TableCell className="text-sm">{product.category ?? "—"}</TableCell>
                  <TableCell className="text-sm">{product.ivaExento ? t("products.ivaExempt") : `${product.ivaRate}%`}</TableCell>
                  <TableCell>
                    <Badge variant={product.active ? "default" : "secondary"} className="text-xs">{product.active ? t("common.active") : t("common.inactive")}</Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="w-4 h-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(product)}><Pencil className="w-4 h-4 mr-2" /> {t("products.edit")}</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive" onClick={() => { setSelected(product); setDeleteOpen(true); }}><Trash2 className="w-4 h-4 mr-2" /> {t("common.delete")}</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );})
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("products.addProductTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>{t("products.productName")}</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>{t("products.priceCOP")}</Label><Input type="number" min="0" value={form.priceCop} onChange={(e) => setForm((f) => ({ ...f, priceCop: e.target.value }))} /></div>
              <div className="space-y-1"><Label>{t("products.costCOP")}</Label><Input type="number" min="0" value={form.costCop} onChange={(e) => setForm((f) => ({ ...f, costCop: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>{t("products.category")}</Label><Input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} /></div>
              <div className="space-y-1"><Label>{t("products.barcode")}</Label><Input value={form.barcode} onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))} /></div>
            </div>
            <div className="space-y-1">
              <Label>{t("products.merchant")}</Label>
              <Select value={form.merchantId} onValueChange={(v) => setForm((f) => ({ ...f, merchantId: v }))}>
                <SelectTrigger><SelectValue placeholder={t("products.selectMerchant")} /></SelectTrigger>
                <SelectContent>{merchants.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>{t("products.ivaRate")}</Label><Input type="text" value={form.ivaRate} onChange={(e) => setForm((f) => ({ ...f, ivaRate: e.target.value }))} /></div>
              <div className="flex items-center gap-2 pt-6"><Switch checked={form.ivaExento} onCheckedChange={(v) => setForm((f) => ({ ...f, ivaExento: v }))} /><Label>{t("products.ivaExento")}</Label></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleCreate} disabled={createProduct.isPending || !form.name || !form.priceCop || !form.merchantId}>
              {createProduct.isPending ? t("products.creating") : t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("products.editTitle")} — {selected?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>{t("products.productName")}</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>{t("products.priceCOP")}</Label><Input type="number" min="0" value={form.priceCop} onChange={(e) => setForm((f) => ({ ...f, priceCop: e.target.value }))} /></div>
              <div className="space-y-1"><Label>{t("products.costCOP")}</Label><Input type="number" min="0" value={form.costCop} onChange={(e) => setForm((f) => ({ ...f, costCop: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>{t("products.category")}</Label><Input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} /></div>
              <div className="space-y-1"><Label>{t("products.barcode")}</Label><Input value={form.barcode} onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>{t("products.ivaRate")}</Label><Input type="text" value={form.ivaRate} onChange={(e) => setForm((f) => ({ ...f, ivaRate: e.target.value }))} /></div>
              <div className="flex items-center gap-2 pt-6"><Switch checked={form.ivaExento} onCheckedChange={(v) => setForm((f) => ({ ...f, ivaExento: v }))} /><Label>{t("products.ivaExento")}</Label></div>
            </div>
            <div className="flex items-center gap-2"><Switch checked={form.active} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))} /><Label>{t("common.active")}</Label></div>

            <div className="space-y-2 pt-1 border-t border-border">
              <Label>{t("products.productImage")}</Label>
              <div className="flex items-start gap-3">
                <div className="w-20 h-20 rounded-lg border border-border bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {imagePreview ? (
                    <img src={imagePreview} alt="preview" className="w-full h-full object-cover" />
                  ) : currentImageUrl ? (
                    <img src={currentImageUrl} alt={form.name} className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon className="w-8 h-8 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="text-sm cursor-pointer"
                      onChange={handleImageFileChange}
                    />
                    {imageFile && (
                      <Button variant="ghost" size="icon" onClick={() => { setImageFile(null); setImagePreview(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}>
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                  {imageFile && (
                    <Button size="sm" onClick={handleImageUpload} disabled={imageUploading} className="w-full">
                      <Upload className="w-3 h-3 mr-1.5" />
                      {imageUploading ? t("products.uploading") : t("products.uploadImage")}
                    </Button>
                  )}
                  {currentImageUrl && !imageFile && (
                    <p className="text-xs text-muted-foreground">{t("products.imageSet")}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleUpdate} disabled={updateProduct.isPending || !form.name || !form.priceCop}>
              {updateProduct.isPending ? t("products.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("products.deleteProduct")}</AlertDialogTitle>
            <AlertDialogDescription>{t("products.deleteConfirm", { name: selected?.name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteProduct.isPending ? t("products.deleting") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
