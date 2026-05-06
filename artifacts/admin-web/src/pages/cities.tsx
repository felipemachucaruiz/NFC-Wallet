import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2, Power, ImageIcon, Loader2, MapPin } from "lucide-react";

const API_BASE = `${import.meta.env.BASE_URL}_srv`;
function apiUrl(path: string) { return `${API_BASE}${path}`; }
function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("tapee_admin_token");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}
function authHeadersNoContentType(): Record<string, string> {
  const token = localStorage.getItem("tapee_admin_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface City {
  id: string;
  name: string;
  country: string;
  coverImageUrl: string | null;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
}

const STORAGE_ORIGIN = `${import.meta.env.BASE_URL}_srv`;
function resolveImageUrl(path: string | null | undefined): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `${STORAGE_ORIGIN}${path}`;
}

async function fetchCities(): Promise<City[]> {
  const res = await fetch(apiUrl("/api/cities"), { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error fetching cities");
  return data.cities;
}

async function createCity(formData: FormData): Promise<City> {
  const res = await fetch(apiUrl("/api/cities"), { method: "POST", headers: authHeadersNoContentType(), body: formData });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error creating city");
  return data.city;
}

async function updateCity(id: string, formData: FormData): Promise<City> {
  const res = await fetch(apiUrl(`/api/cities/${id}`), { method: "PUT", headers: authHeadersNoContentType(), body: formData });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error updating city");
  return data.city;
}

async function toggleCity(id: string): Promise<City> {
  const res = await fetch(apiUrl(`/api/cities/${id}/toggle`), { method: "PATCH", headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error toggling city");
  return data.city;
}

async function deleteCity(id: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/cities/${id}`), { method: "DELETE", headers: authHeaders() });
  if (!res.ok) { const data = await res.json(); throw new Error(data.error ?? "Error deleting city"); }
}

interface CityFormState {
  name: string;
  country: string;
  displayOrder: string;
  isActive: boolean;
  imageFile: File | null;
  imagePreview: string | null;
}

const emptyForm: CityFormState = {
  name: "",
  country: "Colombia",
  displayOrder: "0",
  isActive: true,
  imageFile: null,
  imagePreview: null,
};

function cityToForm(city: City): CityFormState {
  return {
    name: city.name,
    country: city.country,
    displayOrder: String(city.displayOrder),
    isActive: city.isActive,
    imageFile: null,
    imagePreview: resolveImageUrl(city.coverImageUrl),
  };
}

export default function CitiesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCity, setEditingCity] = useState<City | null>(null);
  const [form, setForm] = useState<CityFormState>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<City | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: cities = [], isLoading } = useQuery({ queryKey: ["admin-cities"], queryFn: fetchCities });

  const createMutation = useMutation({
    mutationFn: createCity,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-cities"] }); setDialogOpen(false); toast({ title: "Ciudad creada" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, formData }: { id: string; formData: FormData }) => updateCity(id, formData),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-cities"] }); setDialogOpen(false); toast({ title: "Ciudad actualizada" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: toggleCity,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-cities"] }),
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCity,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-cities"] }); setDeleteTarget(null); toast({ title: "Ciudad eliminada" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  function openCreate() {
    setEditingCity(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(city: City) {
    setEditingCity(city);
    setForm(cityToForm(city));
    setDialogOpen(true);
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setForm((f) => ({ ...f, imageFile: file, imagePreview: URL.createObjectURL(file) }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { toast({ title: "El nombre es requerido", variant: "destructive" }); return; }
    if (!editingCity && !form.imageFile) { toast({ title: "La foto de portada es requerida", variant: "destructive" }); return; }

    const fd = new FormData();
    fd.append("name", form.name.trim());
    fd.append("country", form.country.trim() || "Colombia");
    fd.append("displayOrder", form.displayOrder || "0");
    fd.append("isActive", String(form.isActive));
    if (form.imageFile) fd.append("image", form.imageFile);

    if (editingCity) {
      updateMutation.mutate({ id: editingCity.id, formData: fd });
    } else {
      createMutation.mutate(fd);
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ciudades</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gestiona las ciudades que aparecen como filtro visual en la app de asistentes
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" />
          Nueva ciudad
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : cities.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <MapPin className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No hay ciudades configuradas</p>
          <p className="text-sm">Agrega ciudades con fotos para el filtro visual de la app</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Foto</TableHead>
                <TableHead>Ciudad</TableHead>
                <TableHead>País</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cities.map((city) => (
                <TableRow key={city.id}>
                  <TableCell className="text-muted-foreground text-sm">{city.displayOrder}</TableCell>
                  <TableCell>
                    {city.coverImageUrl ? (
                      <img
                        src={resolveImageUrl(city.coverImageUrl)}
                        alt={city.name}
                        className="h-12 w-20 object-cover rounded border border-border"
                      />
                    ) : (
                      <div className="h-12 w-20 rounded border border-border bg-muted flex items-center justify-center">
                        <ImageIcon className="w-5 h-5 text-muted-foreground opacity-40" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{city.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{city.country}</TableCell>
                  <TableCell>
                    <Badge variant={city.isActive ? "default" : "secondary"}>
                      {city.isActive ? "Activa" : "Inactiva"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => toggleMutation.mutate(city.id)} title={city.isActive ? "Desactivar" : "Activar"}>
                        <Power className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(city)} title="Editar">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(city)} title="Eliminar">
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
            <DialogTitle>{editingCity ? "Editar ciudad" : "Nueva ciudad"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Foto de portada {!editingCity && "*"}</Label>
              <div
                className="relative border-2 border-dashed border-border rounded-lg overflow-hidden cursor-pointer hover:border-primary/50 transition-colors"
                style={{ minHeight: 120 }}
                onClick={() => fileInputRef.current?.click()}
              >
                {form.imagePreview ? (
                  <img src={form.imagePreview} alt="preview" className="w-full h-40 object-cover" />
                ) : (
                  <div className="flex flex-col items-center justify-center h-32 text-muted-foreground text-sm gap-1">
                    <ImageIcon className="w-8 h-8 opacity-40" />
                    <span>Clic para subir foto</span>
                    <span className="text-xs">Recomendado: 600×400 px (paisaje)</span>
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="city-name">Nombre *</Label>
                <Input
                  id="city-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ej: Bogotá"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="city-country">País</Label>
                <Input
                  id="city-country"
                  value={form.country}
                  onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                  placeholder="Colombia"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="city-order">Orden de aparición</Label>
                <Input
                  id="city-order"
                  type="number"
                  min={0}
                  value={form.displayOrder}
                  onChange={(e) => setForm((f) => ({ ...f, displayOrder: e.target.value }))}
                />
              </div>
              <div className="flex items-center gap-3 pt-6">
                <Switch checked={form.isActive} onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))} />
                <Label>{form.isActive ? "Activa" : "Inactiva"}</Label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingCity ? "Guardar cambios" : "Crear ciudad"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar ciudad?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará "<strong>{deleteTarget?.name}</strong>" permanentemente.
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
