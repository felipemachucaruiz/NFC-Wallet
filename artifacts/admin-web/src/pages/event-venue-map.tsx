import { useState, useRef, useCallback, useEffect } from "react";
import { useGetCurrentAuthUser } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Upload, Pencil, Trash2, Map, Square } from "lucide-react";
import { useTranslation } from "react-i18next";

type VenueSection = {
  id: string;
  name: string;
  color: string;
  capacity: number;
  x: number;
  y: number;
  width: number;
  height: number;
  path?: string;
};

const DEFAULT_COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

export default function EventVenueMap() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: auth } = useGetCurrentAuthUser();
  const eventId = auth?.user?.eventId ?? "";

  const [bgImage, setBgImage] = useState<string | null>(null);
  const [sections, setSections] = useState<VenueSection[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<VenueSection | null>(null);
  const [form, setForm] = useState({ name: "", color: "#3b82f6", capacity: "" });

  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);
  const [drawMode, setDrawMode] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setBgImage(ev.target?.result as string);
      toast({ title: t("venueMap.imageUploaded") });
    };
    reader.readAsDataURL(file);
  };

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (!drawMode || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setIsDrawing(true);
    setDrawStart({ x, y });
    setDrawCurrent({ x, y });
  }, [drawMode]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDrawing || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setDrawCurrent({ x, y });
  }, [isDrawing]);

  const handleCanvasMouseUp = useCallback(() => {
    if (!isDrawing || !drawStart || !drawCurrent) return;
    setIsDrawing(false);
    const x = Math.min(drawStart.x, drawCurrent.x);
    const y = Math.min(drawStart.y, drawCurrent.y);
    const width = Math.abs(drawCurrent.x - drawStart.x);
    const height = Math.abs(drawCurrent.y - drawStart.y);

    if (width < 2 || height < 2) return;

    setForm({ name: "", color: DEFAULT_COLORS[sections.length % DEFAULT_COLORS.length], capacity: "" });
    setEditingSection({
      id: `section-${Date.now()}`,
      name: "",
      color: DEFAULT_COLORS[sections.length % DEFAULT_COLORS.length],
      capacity: 0,
      x, y, width, height,
    });
    setDialogOpen(true);
    setDrawMode(false);
  }, [isDrawing, drawStart, drawCurrent, sections.length]);

  const handleSaveSection = () => {
    if (!form.name) {
      toast({ title: t("common.error"), description: t("venueMap.nameRequired"), variant: "destructive" });
      return;
    }

    if (editingSection && !editingSection.name) {
      const newSection: VenueSection = {
        ...editingSection,
        name: form.name,
        color: form.color,
        capacity: parseInt(form.capacity) || 0,
      };
      setSections((prev) => [...prev, newSection]);
      toast({ title: t("venueMap.sectionCreated") });
    } else if (editingSection) {
      setSections((prev) =>
        prev.map((s) =>
          s.id === editingSection.id
            ? { ...s, name: form.name, color: form.color, capacity: parseInt(form.capacity) || 0 }
            : s
        )
      );
      toast({ title: t("venueMap.sectionUpdated") });
    }
    setDialogOpen(false);
    setEditingSection(null);
  };

  const openEditSection = (section: VenueSection) => {
    setEditingSection(section);
    setForm({ name: section.name, color: section.color, capacity: String(section.capacity || "") });
    setDialogOpen(true);
  };

  const deleteSection = (id: string) => {
    setSections((prev) => prev.filter((s) => s.id !== id));
    toast({ title: t("venueMap.sectionDeleted") });
  };

  const drawRect = drawStart && drawCurrent && isDrawing ? {
    x: Math.min(drawStart.x, drawCurrent.x),
    y: Math.min(drawStart.y, drawCurrent.y),
    width: Math.abs(drawCurrent.x - drawStart.x),
    height: Math.abs(drawCurrent.y - drawStart.y),
  } : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("venueMap.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("venueMap.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-4 h-4 mr-2" /> {t("venueMap.uploadImage")}
          </Button>
          {bgImage && (
            <Button
              variant={drawMode ? "default" : "outline"}
              onClick={() => setDrawMode(!drawMode)}
              data-testid="button-draw-mode"
            >
              <Square className="w-4 h-4 mr-2" /> {t("venueMap.drawSection")}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Map className="w-4 h-4" />
                {t("venueMap.canvasTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                ref={canvasRef}
                className={`relative w-full aspect-[16/10] bg-muted/50 rounded-lg border-2 border-dashed overflow-hidden ${drawMode ? "cursor-crosshair" : ""}`}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={() => { if (isDrawing) { setIsDrawing(false); setDrawStart(null); setDrawCurrent(null); } }}
              >
                {bgImage ? (
                  <img src={bgImage} alt="Venue" className="absolute inset-0 w-full h-full object-contain" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <Map className="w-12 h-12 mx-auto mb-2 opacity-30" />
                      <p>{t("venueMap.uploadHint")}</p>
                    </div>
                  </div>
                )}

                {sections.map((section) => (
                  <div
                    key={section.id}
                    className="absolute border-2 rounded-sm flex items-center justify-center cursor-pointer transition-opacity hover:opacity-80"
                    style={{
                      left: `${section.x}%`,
                      top: `${section.y}%`,
                      width: `${section.width}%`,
                      height: `${section.height}%`,
                      borderColor: section.color,
                      backgroundColor: `${section.color}33`,
                    }}
                    onClick={(e) => { e.stopPropagation(); if (!drawMode) openEditSection(section); }}
                    title={`${section.name} (${section.capacity})`}
                  >
                    <span className="text-xs font-bold text-white bg-black/50 px-1 rounded truncate max-w-full">
                      {section.name}
                    </span>
                  </div>
                ))}

                {drawRect && (
                  <div
                    className="absolute border-2 border-primary bg-primary/20 rounded-sm pointer-events-none"
                    style={{
                      left: `${drawRect.x}%`,
                      top: `${drawRect.y}%`,
                      width: `${drawRect.width}%`,
                      height: `${drawRect.height}%`,
                    }}
                  />
                )}
              </div>
              {drawMode && (
                <p className="text-xs text-primary mt-2">{t("venueMap.drawHint")}</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("venueMap.sectionsTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              {sections.length === 0 ? (
                <p className="text-center text-muted-foreground py-4 text-sm">{t("venueMap.noSections")}</p>
              ) : (
                <div className="space-y-2">
                  {sections.map((section) => (
                    <div
                      key={section.id}
                      className="flex items-center justify-between p-2 rounded-md border text-sm"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: section.color }} />
                        <div className="min-w-0">
                          <p className="font-medium truncate">{section.name}</p>
                          <p className="text-xs text-muted-foreground">{t("venueMap.capacityLabel")}: {section.capacity}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditSection(section)}>
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteSection(section.id)}>
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingSection?.name ? t("venueMap.editSection") : t("venueMap.newSection")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>{t("venueMap.sectionName")} *</Label>
              <Input
                data-testid="input-section-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={t("venueMap.sectionNamePlaceholder")}
              />
            </div>
            <div className="space-y-1">
              <Label>{t("venueMap.sectionColor")}</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  className="w-10 h-10 rounded border cursor-pointer"
                />
                <div className="flex gap-1 flex-wrap">
                  {DEFAULT_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`w-6 h-6 rounded-full border-2 ${form.color === c ? "border-foreground" : "border-transparent"}`}
                      style={{ backgroundColor: c }}
                      onClick={() => setForm((f) => ({ ...f, color: c }))}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <Label>{t("venueMap.sectionCapacity")}</Label>
              <Input
                data-testid="input-section-capacity"
                type="number"
                min="0"
                value={form.capacity}
                onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
                placeholder={t("venueMap.capacityPlaceholder")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleSaveSection}>{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
