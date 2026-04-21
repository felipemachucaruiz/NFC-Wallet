import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2, Power, ExternalLink, ImageIcon, Loader2, GripVertical } from "lucide-react";

const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_URL || "https://prod.tapee.app").replace(/\/+$/, "")
  : `${import.meta.env.BASE_URL}_srv`;

function apiUrl(path: string) { return `${API_BASE}${path}`; }
function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("tapee_admin_token");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}
function authHeadersNoContentType(): Record<string, string> {
  const token = localStorage.getItem("tapee_admin_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface Ad {
  id: string;
  title: string;
  imageUrl: string;
  linkUrl: string | null;
  isActive: boolean;
  displayOrder: number;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
}

const STORAGE_ORIGIN = "https://prod.tapee.app";
function resolveImageUrl(path: string | null | undefined): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `${STORAGE_ORIGIN}${path}`;
}

async function fetchAds(): Promise<Ad[]> {
  const res = await fetch(apiUrl("/api/ads"), { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error fetching ads");
  return data.ads;
}

async function createAd(formData: FormData): Promise<Ad> {
  const res = await fetch(apiUrl("/api/ads"), { method: "POST", headers: authHeadersNoContentType(), body: formData });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error creating ad");
  return data.ad;
}

async function updateAd(id: string, formData: FormData): Promise<Ad> {
  const res = await fetch(apiUrl(`/api/ads/${id}`), { method: "PUT", headers: authHeadersNoContentType(), body: formData });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error updating ad");
  return data.ad;
}

async function toggleAd(id: string): Promise<Ad> {
  const res = await fetch(apiUrl(`/api/ads/${id}/toggle`), { method: "PATCH", headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error toggling ad");
  return data.ad;
}

async function deleteAd(id: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/ads/${id}`), { method: "DELETE", headers: authHeaders() });
  if (!res.ok) { const data = await res.json(); throw new Error(data.error ?? "Error deleting ad"); }
}

interface AdFormState {
  title: string;
  linkUrl: string;
  isActive: boolean;
  displayOrder: string;
  startsAt: string;
  endsAt: string;
  imageFile: File | null;
  imagePreview: string | null;
}

const emptyForm: AdFormState = {
  title: "",
  linkUrl: "",
  isActive: true,
  displayOrder: "0",
  startsAt: "",
  endsAt: "",
  imageFile: null,
  imagePreview: null,
};

function adToForm(ad: Ad): AdFormState {
  return {
    title: ad.title,
    linkUrl: ad.linkUrl ?? "",
    isActive: ad.isActive,
    displayOrder: String(ad.displayOrder),
    startsAt: ad.startsAt ? ad.startsAt.slice(0, 16) : "",
    endsAt: ad.endsAt ? ad.endsAt.slice(0, 16) : "",
    imageFile: null,
    imagePreview: resolveImageUrl(ad.imageUrl),
  };
}

export default function AdsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAd, setEditingAd] = useState<Ad | null>(null);
  const [form, setForm] = useState<AdFormState>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<Ad | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: ads = [], isLoading } = useQuery({ queryKey: ["admin-ads"], queryFn: fetchAds });

  const createMutation = useMutation({
    mutationFn: createAd,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-ads"] }); setDialogOpen(false); toast({ title: "Anuncio creado" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, formData }: { id: string; formData: FormData }) => updateAd(id, formData),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-ads"] }); setDialogOpen(false); toast({ title: "Anuncio actualizado" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: toggleAd,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-ads"] }),
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAd,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-ads"] }); setDeleteTarget(null); toast({ title: "Anuncio eliminado" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  function openCreate() {
    setEditingAd(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(ad: Ad) {
    setEditingAd(ad);
    setForm(adToForm(ad));
    setDialogOpen(true);
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setForm((f) => ({ ...f, imageFile: file, imagePreview: preview }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { toast({ title: "El título es requerido", variant: "destructive" }); return; }
    if (!editingAd && !form.imageFile) { toast({ title: "La imagen es requerida", variant: "destructive" }); return; }

    const fd = new FormData();
    fd.append("title", form.title.trim());
    fd.append("linkUrl", form.linkUrl.trim());
    fd.append("isActive", String(form.isActive));
    fd.append("displayOrder", form.displayOrder || "0");
    if (form.startsAt) fd.append("startsAt", new Date(form.startsAt).toISOString());
    if (form.endsAt) fd.append("endsAt", new Date(form.endsAt).toISOString());
    if (form.imageFile) fd.append("image", form.imageFile);

    if (editingAd) {
      updateMutation.mutate({ id: editingAd.id, formData: fd });
    } else {
      createMutation.mutate(fd);
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Anuncios</h1>
          <p className="text-sm text-muted-foreground mt-1">Gestiona los banners publicitarios que aparecen en la tienda de tickets</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" />
          Nuevo anuncio
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : ads.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No hay anuncios</p>
          <p className="text-sm">Crea el primer banner publicitario</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Vista previa</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Enlace</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Vigencia</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ads.map((ad) => (
                <TableRow key={ad.id}>
                  <TableCell className="text-muted-foreground text-sm">{ad.displayOrder}</TableCell>
                  <TableCell>
                    <img
                      src={resolveImageUrl(ad.imageUrl)}
                      alt={ad.title}
                      className="h-12 w-28 object-cover rounded border border-border"
                    />
                  </TableCell>
                  <TableCell className="font-medium">{ad.title}</TableCell>
                  <TableCell>
                    {ad.linkUrl ? (
                      <a href={ad.linkUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline text-sm truncate max-w-[160px]">
                        <ExternalLink className="w-3 h-3 shrink-0" />
                        {ad.linkUrl}
                      </a>
                    ) : <span className="text-muted-foreground text-sm">—</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={ad.isActive ? "default" : "secondary"}>
                      {ad.isActive ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {ad.startsAt || ad.endsAt ? (
                      <span>
                        {ad.startsAt ? new Date(ad.startsAt).toLocaleDateString("es-CO") : "—"}
                        {" → "}
                        {ad.endsAt ? new Date(ad.endsAt).toLocaleDateString("es-CO") : "—"}
                      </span>
                    ) : "Siempre"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => toggleMutation.mutate(ad.id)} title={ad.isActive ? "Desactivar" : "Activar"}>
                        <Power className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(ad)} title="Editar">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(ad)} title="Eliminar">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingAd ? "Editar anuncio" : "Nuevo anuncio"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Imagen del banner *</Label>
              <div
                className="relative border-2 border-dashed border-border rounded-lg overflow-hidden cursor-pointer hover:border-primary/50 transition-colors"
                style={{ minHeight: 100 }}
                onClick={() => fileInputRef.current?.click()}
              >
                {form.imagePreview ? (
                  <img src={form.imagePreview} alt="preview" className="w-full h-36 object-cover" />
                ) : (
                  <div className="flex flex-col items-center justify-center h-24 text-muted-foreground text-sm gap-1">
                    <ImageIcon className="w-8 h-8 opacity-40" />
                    <span>Clic para subir imagen</span>
                    <span className="text-xs">Recomendado: 1200×230 px</span>
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ad-title">Título *</Label>
              <Input id="ad-title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Ej: Concierto Rock Nacional" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ad-link">URL de destino (opcional)</Label>
              <Input id="ad-link" value={form.linkUrl} onChange={(e) => setForm((f) => ({ ...f, linkUrl: e.target.value }))} placeholder="https://..." />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ad-order">Orden de aparición</Label>
                <Input id="ad-order" type="number" min={0} value={form.displayOrder} onChange={(e) => setForm((f) => ({ ...f, displayOrder: e.target.value }))} />
              </div>
              <div className="flex items-center gap-3 pt-6">
                <Switch checked={form.isActive} onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))} />
                <Label>{form.isActive ? "Activo" : "Inactivo"}</Label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ad-starts">Desde (opcional)</Label>
                <Input id="ad-starts" type="datetime-local" value={form.startsAt} onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ad-ends">Hasta (opcional)</Label>
                <Input id="ad-ends" type="datetime-local" value={form.endsAt} onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))} />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingAd ? "Guardar cambios" : "Crear anuncio"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar anuncio?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará "<strong>{deleteTarget?.title}</strong>" permanentemente. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
