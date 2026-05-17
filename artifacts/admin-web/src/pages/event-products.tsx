import { useState, useEffect, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetCurrentAuthUser,
  useGetEvent,
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
import { Plus, Search, MoreHorizontal, Pencil, Trash2, Tags, X, Check, ImageIcon, Upload } from "lucide-react";
import { CurrencyInput } from "@/components/ui/currency-input";
import { useTranslation } from "react-i18next";
import { formatCurrency } from "@/lib/currency";
import { useEventContext } from "@/contexts/event-context";

const _API_BASE = `${import.meta.env.BASE_URL}_srv`;

function apiUrl(path: string): string { return `${_API_BASE}${path}`; }
function authHeaders(): HeadersInit {
  const token = localStorage.getItem("tapee_admin_token");
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" };
}
function authToken(): string | null { return localStorage.getItem("tapee_admin_token"); }
function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("/api/")) return apiUrl(url);
  return url;
}

type ProductCategory = { id: string; name: string; eventId: string; createdAt: string };

type ProductForm = {
  name: string;
  price: string;
  cost: string;
  category: string;
  barcode: string;
  merchantId: string;
  ivaRate: string;
  ivaExento: boolean;
  active: boolean;
};

const emptyForm: ProductForm = { name: "", price: "", cost: "0", category: "", barcode: "", merchantId: "", ivaRate: "0", ivaExento: false, active: true };

export default function EventProducts() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: auth } = useGetCurrentAuthUser();
  const { eventId } = useEventContext();
  const { data: eventData } = useGetEvent(eventId || "");
  const currency = (eventData as Record<string, unknown> | undefined)?.currencyCode as string ?? "COP";
  const fmt = (n: number) => formatCurrency(n, currency);

  const { data, isLoading } = useListProducts();
  const products = data?.products ?? [];
  const { data: merchantsData } = useListMerchants({ eventId: eventId || undefined });
  const merchants = merchantsData?.merchants ?? [];

  // ── Categories ─────────────────────────────────────────────────────────────
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [savingCat, setSavingCat] = useState(false);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState("");
  const [deleteCatId, setDeleteCatId] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    if (!eventId) return;
    setCategoriesLoading(true);
    try {
      const res = await fetch(apiUrl(`/api/events/${eventId}/product-categories`), { headers: authHeaders() });
      if (res.ok) {
        const json = await res.json() as { categories: ProductCategory[] };
        setCategories(json.categories);
      }
    } finally {
      setCategoriesLoading(false);
    }
  }, [eventId]);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  const handleCreateCategory = async () => {
    if (!newCatName.trim() || !eventId) return;
    setSavingCat(true);
    try {
      const res = await fetch(apiUrl(`/api/events/${eventId}/product-categories`), {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ name: newCatName.trim() }),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) { toast({ title: t("common.error"), description: json.error, variant: "destructive" }); return; }
      setNewCatName("");
      await fetchCategories();
    } finally {
      setSavingCat(false);
    }
  };

  const handleRenameCategory = async (id: string) => {
    if (!editingCatName.trim() || !eventId) return;
    setSavingCat(true);
    try {
      const res = await fetch(apiUrl(`/api/events/${eventId}/product-categories/${id}`), {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ name: editingCatName.trim() }),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) { toast({ title: t("common.error"), description: json.error, variant: "destructive" }); return; }
      setEditingCatId(null);
      await fetchCategories();
    } finally {
      setSavingCat(false);
    }
  };

  const handleDeleteCategory = async () => {
    if (!deleteCatId || !eventId) return;
    const res = await fetch(apiUrl(`/api/events/${eventId}/product-categories/${deleteCatId}`), {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (!res.ok) {
      const json = await res.json() as { error?: string };
      toast({ title: t("common.error"), description: json.error, variant: "destructive" });
    }
    setDeleteCatId(null);
    await fetchCategories();
  };

  // ── Products ────────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [merchantFilter, setMerchantFilter] = useState("all");
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
  const [createImageFile, setCreateImageFile] = useState<File | null>(null);
  const [createImagePreview, setCreateImagePreview] = useState<string | null>(null);
  const createFileInputRef = useRef<HTMLInputElement>(null);

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
      price: String(product.price),
      cost: String(product.cost),
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
      const token = authToken();
      const res = await fetch(apiUrl(`/api/products/${selected.id}/image`), {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!res.ok) {
        const json = await res.json() as { error?: string };
        throw new Error(json.error ?? "Upload failed");
      }
      const json = await res.json() as { imageUrl: string };
      setCurrentImageUrl(json.imageUrl);
      setImageFile(null);
      setImagePreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast({ title: t("products.imageUploaded") });
      invalidate();
    } catch (e: unknown) {
      toast({ title: t("common.error"), description: (e as Error).message, variant: "destructive" });
    } finally {
      setImageUploading(false);
    }
  };

  const handleCreateImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCreateImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setCreateImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const resetCreateImage = () => {
    setCreateImageFile(null);
    setCreateImagePreview(null);
    if (createFileInputRef.current) createFileInputRef.current.value = "";
  };

  const handleCreate = () => {
    if (!form.merchantId) return;
    createProduct.mutate(
      {
        data: {
          name: form.name,
          price: parseInt(form.price),
          cost: parseInt(form.cost) || undefined,
          merchantId: form.merchantId,
          category: form.category || undefined,
          barcode: form.barcode || undefined,
          ivaRate: form.ivaRate || undefined,
          ivaExento: form.ivaExento || undefined,
        },
      },
      {
        onSuccess: async (data) => {
          let imageUploadFailed = false;
          if (createImageFile && data?.id) {
            setImageUploading(true);
            try {
              const fd = new FormData();
              fd.append("image", createImageFile);
              const token = authToken();
              const res = await fetch(apiUrl(`/api/products/${data.id}/image`), {
                method: "POST",
                headers: token ? { Authorization: `Bearer ${token}` } : {},
                body: fd,
              });
              if (!res.ok) throw new Error();
            } catch {
              imageUploadFailed = true;
              toast({ title: t("products.created"), description: t("products.imageUploadFailed", "La imagen no pudo subirse — edita el producto para intentarlo de nuevo."), variant: "destructive" });
            } finally {
              setImageUploading(false);
            }
          }
          if (!imageUploadFailed) toast({ title: t("products.created") });
          setCreateOpen(false);
          setForm(emptyForm);
          resetCreateImage();
          invalidate();
        },
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
          price: parseInt(form.price),
          cost: parseInt(form.cost) || undefined,
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

  const categorySelect = (
    <div className="space-y-1">
      <Label>{t("products.category")}</Label>
      <Select
        value={form.category || "__none__"}
        onValueChange={(v) => setForm((f) => ({ ...f, category: v === "__none__" ? "" : v }))}
      >
        <SelectTrigger data-testid="select-product-category">
          <SelectValue placeholder={t("products.noCategory")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">{t("products.noCategory")}</SelectItem>
          {categories.map((cat) => (
            <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  const productFormFields = (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>{t("products.productName")}</Label>
        <Input data-testid="input-product-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>{t("products.price")}</Label>
          <CurrencyInput data-testid="input-product-price" value={form.price} onValueChange={(v) => setForm((f) => ({ ...f, price: v }))} currencyCode={currency} />
        </div>
        <div className="space-y-1">
          <Label>{t("products.cost")}</Label>
          <CurrencyInput value={form.cost} onValueChange={(v) => setForm((f) => ({ ...f, cost: v }))} currencyCode={currency} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {categorySelect}
        <div className="space-y-1">
          <Label>{t("products.barcode")}</Label>
          <Input data-testid="input-product-barcode" value={form.barcode} onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))} placeholder={t("products.optional")} />
        </div>
      </div>
      {!editOpen && (
        <div className="space-y-1">
          <Label>{t("products.merchant")}</Label>
          <Select value={form.merchantId} onValueChange={(v) => setForm((f) => ({ ...f, merchantId: v }))}>
            <SelectTrigger data-testid="select-product-merchant"><SelectValue placeholder={t("products.selectMerchant")} /></SelectTrigger>
            <SelectContent>
              {merchants.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>{t("products.ivaRate")}</Label>
          <Input data-testid="input-product-iva" type="text" value={form.ivaRate} onChange={(e) => setForm((f) => ({ ...f, ivaRate: e.target.value }))} onFocus={(e) => { if (e.target.value === "0") { setForm((f) => ({ ...f, ivaRate: "" })); } else { e.target.select(); } }} />
        </div>
        <div className="flex items-center gap-2 pt-6">
          <Switch checked={form.ivaExento} onCheckedChange={(v) => setForm((f) => ({ ...f, ivaExento: v }))} />
          <Label>{t("products.ivaExento")}</Label>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={form.active} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))} />
        <Label>{t("common.active")}</Label>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("products.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("products.subtitleEvent")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCatOpen(true)}>
            <Tags className="w-4 h-4 mr-2" /> {t("products.manageCategories")}
          </Button>
          <Button data-testid="button-create-product" onClick={() => { setForm(emptyForm); setCreateOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" /> {t("products.addProduct")}
          </Button>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input data-testid="input-product-search" placeholder={t("products.searchPlaceholder")} className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={merchantFilter} onValueChange={setMerchantFilter}>
          <SelectTrigger className="w-48" data-testid="select-merchant-filter">
            <SelectValue placeholder={t("products.allMerchants")} />
          </SelectTrigger>
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
              <TableHead>{t("products.colProduct")}</TableHead>
              <TableHead>{t("products.colMerchant")}</TableHead>
              <TableHead className="text-right">{t("products.colPrice")}</TableHead>
              <TableHead>{t("products.colCategory")}</TableHead>
              <TableHead>{t("products.colBarcode")}</TableHead>
              <TableHead>{t("products.colStatus")}</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8">{t("common.loading")}</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">{t("products.noProducts")}</TableCell></TableRow>
            ) : (
              filtered.map((product) => (
                <TableRow key={product.id} data-testid={`row-product-${product.id}`}>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{merchants.find((m) => m.id === product.merchantId)?.name ?? product.merchantId.slice(0, 8)}</TableCell>
                  <TableCell className="text-right font-mono">{fmt(product.price)}</TableCell>
                  <TableCell className="text-sm">{product.category ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{product.barcode ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={product.active ? "default" : "secondary"} className="text-xs">
                      {product.active ? t("common.active") : t("common.inactive")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreHorizontal className="w-4 h-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(product)}><Pencil className="w-4 h-4 mr-2" /> {t("products.edit")}</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive" onClick={() => { setSelected(product); setDeleteOpen(true); }}>
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

      {/* Category Manager Dialog */}
      <Dialog open={catOpen} onOpenChange={(open) => { setCatOpen(open); if (!open) { setEditingCatId(null); setNewCatName(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Tags className="w-5 h-5" /> {t("products.manageCategoriesTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder={t("products.newCategoryPlaceholder")}
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateCategory()}
              />
              <Button onClick={handleCreateCategory} disabled={savingCat || !newCatName.trim()}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {categoriesLoading ? (
                <p className="text-sm text-muted-foreground text-center py-4">{t("common.loading")}</p>
              ) : categories.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">{t("products.noCategories")}</p>
              ) : (
                categories.map((cat) => (
                  <div key={cat.id} className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 group">
                    {editingCatId === cat.id ? (
                      <>
                        <Input
                          className="h-7 text-sm flex-1"
                          value={editingCatName}
                          onChange={(e) => setEditingCatName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleRenameCategory(cat.id); if (e.key === "Escape") setEditingCatId(null); }}
                          autoFocus
                        />
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleRenameCategory(cat.id)} disabled={savingCat}>
                          <Check className="w-3.5 h-3.5 text-green-500" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setEditingCatId(null)}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-sm">{cat.name}</span>
                        <div className="opacity-0 group-hover:opacity-100 flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingCatId(cat.id); setEditingCatName(cat.name); }}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteCatId(cat.id)}>
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setCatOpen(false)}>{t("common.close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Category Confirm */}
      <AlertDialog open={!!deleteCatId} onOpenChange={(open) => { if (!open) setDeleteCatId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("products.deleteCategoryTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("products.deleteCategoryDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCategory} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetCreateImage(); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("products.addProductTitle")}</DialogTitle></DialogHeader>
          {productFormFields}
          <div className="space-y-2 pt-1 border-t border-border">
            <Label>{t("products.productImage")}</Label>
            <div className="flex items-start gap-3">
              <div className="w-16 h-16 rounded-lg border border-border bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
                {createImagePreview ? (
                  <img src={createImagePreview} alt="preview" className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon className="w-6 h-6 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 flex items-center gap-2">
                <Input ref={createFileInputRef} type="file" accept="image/*" className="text-sm cursor-pointer" onChange={handleCreateImageFileChange} />
                {createImageFile && (
                  <Button variant="ghost" size="icon" onClick={resetCreateImage}><X className="w-4 h-4" /></Button>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateOpen(false); resetCreateImage(); }}>{t("common.cancel")}</Button>
            <Button data-testid="button-submit-product" onClick={handleCreate} disabled={createProduct.isPending || imageUploading || !form.name || !form.price || !form.merchantId}>
              {imageUploading ? t("products.uploading") : createProduct.isPending ? t("products.creating") : t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("products.editTitle")} — {selected?.name}</DialogTitle></DialogHeader>
          {productFormFields}
          <div className="space-y-2 pt-1 border-t border-border">
            <Label>{t("products.productImage")}</Label>
            <div className="flex items-start gap-3">
              <div className="w-20 h-20 rounded-lg border border-border bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
                {imagePreview ? (
                  <img src={imagePreview} alt="preview" className="w-full h-full object-cover" />
                ) : currentImageUrl ? (
                  <img src={resolveImageUrl(currentImageUrl) ?? ""} alt={form.name} className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon className="w-8 h-8 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Input ref={fileInputRef} type="file" accept="image/*" className="text-sm cursor-pointer" onChange={handleImageFileChange} />
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>{t("common.cancel")}</Button>
            <Button data-testid="button-submit-edit-product" onClick={handleUpdate} disabled={updateProduct.isPending || !form.name || !form.price}>
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
            <AlertDialogAction data-testid="button-confirm-delete-product" onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteProduct.isPending ? t("products.deleting") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
