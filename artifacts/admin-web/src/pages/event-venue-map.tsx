import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetCurrentAuthUser, useGetEvent } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Upload, Pencil, Trash2, Map, Square, Loader2, ImageIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEventContext } from "@/contexts/event-context";
import { apiFetchVenues, apiFetchSections, apiCreateSection, apiCreateVenue, apiUploadVenueFloorplan } from "@/lib/api";

const DEFAULT_COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("/api/")) return `${import.meta.env.BASE_URL}_srv${url}`;
  return url;
}

export default function EventVenueMap() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: auth } = useGetCurrentAuthUser();
  const { eventId: ctxEventId } = useEventContext();
  const resolvedEventId = auth?.user?.role === "admin" ? ctxEventId : (auth?.user?.eventId ?? "");

  const { data: eventData } = useGetEvent(resolvedEventId || "skip");
  const event = eventData as Record<string, unknown> | undefined;

  const { data: venues = [], isLoading: venuesLoading } = useQuery({
    queryKey: ["venues", resolvedEventId],
    queryFn: () => apiFetchVenues(resolvedEventId),
    enabled: !!resolvedEventId,
  });

  const autoCreateAttempted = useRef(false);

  useEffect(() => {
    if (venuesLoading || autoCreateAttempted.current || !resolvedEventId || !event) return;
    if (venues.length > 0) return;

    autoCreateAttempted.current = true;
    const eventName = (event.name as string) || "Venue";
    const venueAddress = (event.venueAddress as string) || undefined;
    const city = (event.city as string) || undefined;
    apiCreateVenue(resolvedEventId, {
      name: eventName,
      address: venueAddress,
      city,
    })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["venues", resolvedEventId] });
      })
      .catch((err) => {
        toast({ title: t("common.error"), description: String(err.message || err), variant: "destructive" });
        autoCreateAttempted.current = false;
      });
  }, [venuesLoading, venues.length, resolvedEventId, event, queryClient, toast, t]);

  const firstVenue = venues[0];
  const firstVenueId = firstVenue?.id ?? "";
  const savedFloorplan = resolveImageUrl(firstVenue?.floorplanImageUrl);

  const { data: sections = [], isLoading: sectionsLoading } = useQuery({
    queryKey: ["sections", resolvedEventId, firstVenueId],
    queryFn: () => apiFetchSections(resolvedEventId, firstVenueId),
    enabled: !!resolvedEventId && !!firstVenueId,
  });

  const createMutation = useMutation({
    mutationFn: (body: { name: string; capacity?: number }) =>
      apiCreateSection(resolvedEventId, firstVenueId, body),
    onSuccess: () => {
      toast({ title: t("venueMap.sectionCreated") });
      queryClient.invalidateQueries({ queryKey: ["sections", resolvedEventId, firstVenueId] });
      setDialogOpen(false);
    },
    onError: (e: Error) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => apiUploadVenueFloorplan(resolvedEventId, firstVenueId, file),
    onSuccess: () => {
      toast({ title: t("venueMap.imageUploaded") });
      queryClient.invalidateQueries({ queryKey: ["venues", resolvedEventId] });
    },
    onError: (e: Error) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", color: "#3b82f6", capacity: "" });

  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);
  const [drawMode, setDrawMode] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const bgImage = savedFloorplan;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: t("common.error"), description: "Only image files are allowed", variant: "destructive" });
      return;
    }
    uploadMutation.mutate(file);
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
    const width = Math.abs(drawCurrent.x - drawStart.x);
    const height = Math.abs(drawCurrent.y - drawStart.y);

    if (width < 2 || height < 2) return;

    setForm({ name: "", color: DEFAULT_COLORS[sections.length % DEFAULT_COLORS.length], capacity: "" });
    setDialogOpen(true);
    setDrawMode(false);
  }, [isDrawing, drawStart, drawCurrent, sections.length]);

  const handleSaveSection = () => {
    if (!form.name) {
      toast({ title: t("common.error"), description: t("venueMap.nameRequired"), variant: "destructive" });
      return;
    }
    createMutation.mutate({
      name: form.name,
      capacity: parseInt(form.capacity) || undefined,
    });
  };

  const drawRect = drawStart && drawCurrent && isDrawing ? {
    x: Math.min(drawStart.x, drawCurrent.x),
    y: Math.min(drawStart.y, drawCurrent.y),
    width: Math.abs(drawCurrent.x - drawStart.x),
    height: Math.abs(drawCurrent.y - drawStart.y),
  } : null;

  const isLoading = venuesLoading || sectionsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!firstVenueId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("venueMap.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("venueMap.subtitle")}</p>
        </div>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin opacity-50" />
            <p>{t("common.loading")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("venueMap.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("venueMap.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending}>
            {uploadMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            {bgImage ? t("venueMap.changeImage", "Change Floorplan") : t("venueMap.uploadImage")}
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
                      <ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">{t("venueMap.uploadHint")}</p>
                      <Button variant="outline" size="sm" className="mt-3" onClick={() => fileInputRef.current?.click()}>
                        <Upload className="w-3.5 h-3.5 mr-1.5" /> {t("venueMap.uploadImage")}
                      </Button>
                    </div>
                  </div>
                )}

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
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: section.colorHex || "#3b82f6" }} />
                        <div className="min-w-0">
                          <p className="font-medium truncate">{section.name}</p>
                          <p className="text-xs text-muted-foreground">{t("venueMap.capacityLabel")}: {section.capacity ?? "—"}</p>
                        </div>
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
            <DialogTitle>{t("venueMap.newSection")}</DialogTitle>
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
            <Button onClick={handleSaveSection} disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
