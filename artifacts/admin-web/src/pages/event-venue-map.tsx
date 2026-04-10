import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetCurrentAuthUser, useGetEvent } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Pencil, Trash2, Map, Square, Loader2, ImageIcon, MapPin, Save, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEventContext } from "@/contexts/event-context";
import { apiFetchVenues, apiFetchSections, apiCreateSection, apiUpdateSection, apiDeleteSection, apiCreateVenue, apiUploadVenueFloorplan, apiFetchTicketTypes, apiFetchTicketTypeUnits, apiUpdateUnitPositions } from "@/lib/api";

const DEFAULT_COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

function safe(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try { return JSON.stringify(v); } catch { return "[object]"; }
}

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
        toast({ title: t("common.error"), description: safe(err.message || err), variant: "destructive" });
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
    mutationFn: (body: { name: string; capacity?: number; totalTickets: number; colorHex?: string; svgPathData?: string }) =>
      apiCreateSection(resolvedEventId, firstVenueId, body),
    onSuccess: () => {
      toast({ title: t("venueMap.sectionCreated") });
      queryClient.invalidateQueries({ queryKey: ["sections", resolvedEventId, firstVenueId] });
      setDialogOpen(false);
      setDrawStart(null);
      setDrawCurrent(null);
      drawnRectRef.current = null;
    },
    onError: (e: Error) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ sectionId, body }: { sectionId: string; body: { name?: string; capacity?: number; totalTickets?: number; colorHex?: string; sectionType?: string } }) =>
      apiUpdateSection(resolvedEventId, firstVenueId, sectionId, body),
    onSuccess: () => {
      toast({ title: t("venueMap.sectionUpdated", "Section updated") });
      queryClient.invalidateQueries({ queryKey: ["sections", resolvedEventId, firstVenueId] });
      setEditDialogOpen(false);
      setEditingSection(null);
    },
    onError: (e: Error) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (sectionId: string) =>
      apiDeleteSection(resolvedEventId, firstVenueId, sectionId),
    onSuccess: () => {
      toast({ title: t("venueMap.sectionDeleted", "Section deleted") });
      queryClient.invalidateQueries({ queryKey: ["sections", resolvedEventId, firstVenueId] });
      setDeleteConfirmId(null);
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
  const [form, setForm] = useState({ name: "", color: "#3b82f6", capacity: "", sectionType: "" });

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<any>(null);
  const [editForm, setEditForm] = useState({ name: "", color: "#3b82f6", capacity: "", sectionType: "" });
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);
  const [drawMode, setDrawMode] = useState(false);
  const drawnRectRef = useRef<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null);
  const isDrawingRef = useRef(false);

  const [unitPlaceMode, setUnitPlaceMode] = useState(false);
  const [selectedTicketTypeId, setSelectedTicketTypeId] = useState<string>("");
  const [placingUnitId, setPlacingUnitId] = useState<string | null>(null);
  const [unitPositions, setUnitPositions] = useState<Record<string, { mapX: number; mapY: number }>>({});
  const [unitPositionsDirty, setUnitPositionsDirty] = useState(false);
  const [draggingUnitId, setDraggingUnitId] = useState<string | null>(null);

  const { data: ticketTypes = [] } = useQuery({
    queryKey: ["ticketTypes", resolvedEventId],
    queryFn: () => apiFetchTicketTypes(resolvedEventId),
    enabled: !!resolvedEventId,
  });

  const numberedTicketTypes = ticketTypes.filter((tt) => tt.isNumberedUnits);

  const { data: units = [], isLoading: unitsLoading } = useQuery({
    queryKey: ["ticketTypeUnits", resolvedEventId, selectedTicketTypeId],
    queryFn: () => apiFetchTicketTypeUnits(resolvedEventId, selectedTicketTypeId),
    enabled: !!resolvedEventId && !!selectedTicketTypeId,
  });

  useEffect(() => {
    if (units.length > 0) {
      const positions: Record<string, { mapX: number; mapY: number }> = {};
      for (const u of units) {
        if (u.mapX != null && u.mapY != null) {
          positions[u.id] = { mapX: parseFloat(u.mapX), mapY: parseFloat(u.mapY) };
        }
      }
      setUnitPositions(positions);
      setUnitPositionsDirty(false);
    } else {
      setUnitPositions({});
      setUnitPositionsDirty(false);
    }
  }, [units]);

  const savePositionsMutation = useMutation({
    mutationFn: () => {
      const positions = Object.entries(unitPositions).map(([unitId, pos]) => ({
        unitId,
        mapX: pos.mapX,
        mapY: pos.mapY,
      }));
      return apiUpdateUnitPositions(resolvedEventId, selectedTicketTypeId, positions);
    },
    onSuccess: () => {
      toast({ title: t("venueMap.unitPositionsSaved", "Unit positions saved") });
      queryClient.invalidateQueries({ queryKey: ["ticketTypeUnits", resolvedEventId, selectedTicketTypeId] });
      setUnitPositionsDirty(false);
    },
    onError: (e: Error) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const handleMapClickForUnit = useCallback((e: React.MouseEvent) => {
    if (!unitPlaceMode || !placingUnitId || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setUnitPositions((prev) => ({ ...prev, [placingUnitId]: { mapX: Math.round(x * 100) / 100, mapY: Math.round(y * 100) / 100 } }));
    setUnitPositionsDirty(true);
    const currentIdx = units.findIndex((u) => u.id === placingUnitId);
    const nextUnplaced = units.find((u, i) => i > currentIdx && !unitPositions[u.id] && u.id !== placingUnitId);
    setPlacingUnitId(nextUnplaced?.id ?? null);
  }, [unitPlaceMode, placingUnitId, units, unitPositions]);

  const handleUnitDragStart = useCallback((unitId: string, e: React.MouseEvent) => {
    if (!unitPlaceMode) return;
    e.stopPropagation();
    e.preventDefault();
    setDraggingUnitId(unitId);
  }, [unitPlaceMode]);

  const handleMapMouseMoveForDrag = useCallback((e: React.MouseEvent) => {
    if (!draggingUnitId || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setUnitPositions((prev) => ({ ...prev, [draggingUnitId]: { mapX: Math.round(x * 100) / 100, mapY: Math.round(y * 100) / 100 } }));
    setUnitPositionsDirty(true);
  }, [draggingUnitId]);

  const handleMapMouseUpForDrag = useCallback(() => {
    setDraggingUnitId(null);
  }, []);

  const existingTypes = [...new Set(sections.map((s: any) => safe(s.sectionType)).filter(Boolean))];

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
    isDrawingRef.current = true;
    drawnRectRef.current = null;
    setIsDrawing(true);
    setDrawStart({ x, y });
    setDrawCurrent({ x, y });
  }, [drawMode]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDrawingRef.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setDrawCurrent({ x, y });
  }, []);

  const handleCanvasMouseUp = useCallback(() => {
    if (!isDrawingRef.current || !drawStart || !drawCurrent) return;
    isDrawingRef.current = false;
    setIsDrawing(false);

    const width = Math.abs(drawCurrent.x - drawStart.x);
    const height = Math.abs(drawCurrent.y - drawStart.y);

    if (width < 2 || height < 2) {
      setDrawStart(null);
      setDrawCurrent(null);
      return;
    }

    drawnRectRef.current = { start: { ...drawStart }, end: { ...drawCurrent } };
    setForm({ name: "", color: DEFAULT_COLORS[sections.length % DEFAULT_COLORS.length], capacity: "", sectionType: "" });
    setDialogOpen(true);
    setDrawMode(false);
  }, [drawStart, drawCurrent, sections.length]);

  const handleSaveSection = () => {
    if (!form.name) {
      toast({ title: t("common.error"), description: t("venueMap.nameRequired"), variant: "destructive" });
      return;
    }
    const cap = parseInt(form.capacity) || 0;

    let svgPathData: string | undefined;
    const saved = drawnRectRef.current;
    if (saved) {
      const x = Math.min(saved.start.x, saved.end.x);
      const y = Math.min(saved.start.y, saved.end.y);
      const w = Math.abs(saved.end.x - saved.start.x);
      const h = Math.abs(saved.end.y - saved.start.y);
      svgPathData = `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
    }

    createMutation.mutate({
      name: form.name,
      capacity: cap || undefined,
      totalTickets: cap,
      colorHex: form.color,
      sectionType: form.sectionType || undefined,
      svgPathData,
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
            <>
              <Button
                variant={drawMode ? "default" : "outline"}
                onClick={() => { setDrawMode(!drawMode); if (!drawMode) setUnitPlaceMode(false); }}
                data-testid="button-draw-mode"
              >
                <Square className="w-4 h-4 mr-2" /> {t("venueMap.drawSection")}
              </Button>
            </>
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
                className={`relative w-full aspect-[16/10] bg-muted/50 rounded-lg border-2 border-dashed overflow-hidden ${drawMode ? "cursor-crosshair" : ""} ${unitPlaceMode && placingUnitId ? "cursor-crosshair" : ""}`}
                onMouseDown={(e) => { if (unitPlaceMode && placingUnitId && !draggingUnitId) { handleMapClickForUnit(e); } else { handleCanvasMouseDown(e); } }}
                onMouseMove={(e) => { if (draggingUnitId) { handleMapMouseMoveForDrag(e); } else { handleCanvasMouseMove(e); } }}
                onMouseUp={(e) => { if (draggingUnitId) { handleMapMouseUpForDrag(); } else { handleCanvasMouseUp(); } }}
                onMouseLeave={() => { if (isDrawingRef.current) { isDrawingRef.current = false; setIsDrawing(false); setDrawStart(null); setDrawCurrent(null); } if (draggingUnitId) setDraggingUnitId(null); }}
              >
                {bgImage ? (
                  <img
                    src={bgImage}
                    alt="Venue"
                    className="absolute inset-0 w-full h-full object-contain select-none pointer-events-none"
                    style={{ zIndex: 0 }}
                    draggable={false}
                  />
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

                {sections.map((section: any) => {
                  if (!section.svgPathData) return null;
                  const rect = parseSvgRect(section.svgPathData);
                  if (!rect) return null;
                  return (
                    <div
                      key={section.id}
                      className="absolute border-2 rounded-sm flex items-center justify-center pointer-events-none"
                      style={{
                        left: `${rect.x}%`,
                        top: `${rect.y}%`,
                        width: `${rect.w}%`,
                        height: `${rect.h}%`,
                        borderColor: section.colorHex || "#3b82f6",
                        backgroundColor: `${section.colorHex || "#3b82f6"}33`,
                        zIndex: 5,
                      }}
                    >
                      <span className="text-xs font-semibold text-white drop-shadow-md truncate px-1">{safe(section.name)}</span>
                    </div>
                  );
                })}

                {drawRect && (
                  <div
                    className="absolute border-2 border-primary bg-primary/20 rounded-sm pointer-events-none"
                    style={{
                      left: `${drawRect.x}%`,
                      top: `${drawRect.y}%`,
                      width: `${drawRect.width}%`,
                      height: `${drawRect.height}%`,
                      zIndex: 10,
                    }}
                  />
                )}

                {unitPlaceMode && units.map((unit) => {
                  const pos = unitPositions[unit.id];
                  if (!pos) return null;
                  const isActive = placingUnitId === unit.id;
                  const statusColor = unit.status === "available" ? "#22c55e" : unit.status === "reserved" ? "#f59e0b" : "#ef4444";
                  return (
                    <div
                      key={unit.id}
                      className={`absolute flex flex-col items-center cursor-grab active:cursor-grabbing select-none ${isActive ? "z-30" : "z-20"}`}
                      style={{
                        left: `${pos.mapX}%`,
                        top: `${pos.mapY}%`,
                        transform: "translate(-50%, -100%)",
                      }}
                      onMouseDown={(e) => handleUnitDragStart(unit.id, e)}
                      onClick={(e) => { e.stopPropagation(); if (unitPlaceMode) setPlacingUnitId(unit.id); }}
                    >
                      <div
                        className={`rounded-full w-6 h-6 flex items-center justify-center text-[10px] font-bold text-white border-2 shadow-lg ${isActive ? "ring-2 ring-white ring-offset-1 ring-offset-background" : ""}`}
                        style={{ backgroundColor: statusColor, borderColor: "rgba(0,0,0,0.3)" }}
                      >
                        {safe(unit.unitNumber)}
                      </div>
                      <div className="w-0 h-0 border-l-[4px] border-r-[4px] border-t-[5px] border-l-transparent border-r-transparent" style={{ borderTopColor: statusColor }} />
                    </div>
                  );
                })}
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
                  {sections.map((section: any) => (
                    <div
                      key={section.id}
                      className="flex items-center justify-between p-2 rounded-md border text-sm"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: section.colorHex || "#3b82f6" }} />
                        <div className="min-w-0">
                          <p className="font-medium truncate">{safe(section.name)}</p>
                          <div className="flex items-center gap-2">
                            {section.sectionType && <span className="text-xs text-primary">{safe(section.sectionType)}</span>}
                            <p className="text-xs text-muted-foreground">{t("venueMap.capacityLabel")}: {safe(section.capacity) || "—"}</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => {
                            setEditingSection(section);
                            setEditForm({ name: safe(section.name), color: safe(section.colorHex) || "#3b82f6", capacity: safe(section.capacity), sectionType: safe(section.sectionType) });
                            setEditDialogOpen(true);
                          }}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setDeleteConfirmId(section.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {numberedTicketTypes.length > 0 && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  {t("venueMap.placeUnitsTitle", "Place Units on Map")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t("venueMap.selectTicketType", "Ticket Type")}</Label>
                  <Select
                    value={selectedTicketTypeId}
                    onValueChange={(val) => {
                      setSelectedTicketTypeId(val);
                      setPlacingUnitId(null);
                      setUnitPlaceMode(false);
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder={t("venueMap.selectTicketTypePlaceholder", "Select a numbered ticket type...")} />
                    </SelectTrigger>
                    <SelectContent>
                      {numberedTicketTypes.map((tt) => (
                        <SelectItem key={tt.id} value={tt.id}>{safe(tt.name)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedTicketTypeId && !unitsLoading && units.length > 0 && (
                  <>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant={unitPlaceMode ? "default" : "outline"}
                        className="text-xs h-7"
                        onClick={() => {
                          const entering = !unitPlaceMode;
                          setUnitPlaceMode(entering);
                          setDrawMode(false);
                          if (entering) {
                            const firstUnplaced = units.find((u) => !unitPositions[u.id]);
                            setPlacingUnitId(firstUnplaced?.id ?? units[0]?.id ?? null);
                          } else {
                            setPlacingUnitId(null);
                          }
                        }}
                      >
                        <MapPin className="w-3 h-3 mr-1" />
                        {unitPlaceMode ? t("venueMap.exitPlaceMode", "Exit Place Mode") : t("venueMap.enterPlaceMode", "Place Mode")}
                      </Button>
                      {unitPositionsDirty && (
                        <Button
                          size="sm"
                          variant="default"
                          className="text-xs h-7"
                          onClick={() => savePositionsMutation.mutate()}
                          disabled={savePositionsMutation.isPending}
                        >
                          {savePositionsMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
                          {t("common.save")}
                        </Button>
                      )}
                    </div>

                    {unitPlaceMode && placingUnitId && (
                      <p className="text-xs text-primary">
                        {t("venueMap.clickToPlace", "Click on the map to place:")} <strong>{safe(units.find((u) => u.id === placingUnitId)?.unitLabel)}</strong>
                      </p>
                    )}

                    <div className="grid grid-cols-4 gap-1 max-h-40 overflow-y-auto">
                      {units.map((unit) => {
                        const hasPosition = !!unitPositions[unit.id];
                        const isSelected = placingUnitId === unit.id;
                        const statusColor = unit.status === "available" ? "bg-green-500" : unit.status === "reserved" ? "bg-yellow-500" : "bg-red-500";
                        return (
                          <button
                            key={unit.id}
                            type="button"
                            className={`relative text-[10px] font-medium px-1 py-1 rounded border text-center transition-all ${
                              isSelected
                                ? "border-primary bg-primary/20 text-primary"
                                : hasPosition
                                  ? "border-green-500/50 bg-green-500/10 text-green-400"
                                  : "border-muted-foreground/30 bg-muted/50 text-muted-foreground"
                            }`}
                            onClick={() => { if (unitPlaceMode) setPlacingUnitId(unit.id); }}
                            title={safe(unit.unitLabel)}
                          >
                            <span className={`absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full ${statusColor}`} />
                            {safe(unit.unitNumber)}
                            {hasPosition && !isSelected && (
                              <button
                                className="absolute -top-1 -right-1 w-3 h-3 bg-destructive rounded-full flex items-center justify-center"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setUnitPositions((prev) => {
                                    const next = { ...prev };
                                    delete next[unit.id];
                                    return next;
                                  });
                                  setUnitPositionsDirty(true);
                                }}
                              >
                                <X className="w-2 h-2 text-white" />
                              </button>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> {t("venueMap.placed", "Placed")}</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-muted-foreground/50" /> {t("venueMap.unplaced", "Not placed")}</span>
                    </div>
                  </>
                )}

                {selectedTicketTypeId && unitsLoading && (
                  <div className="flex justify-center py-4">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) {
          setDrawStart(null);
          setDrawCurrent(null);
          drawnRectRef.current = null;
        }
      }}>
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
            <div className="space-y-1">
              <Label>{t("venueMap.sectionTypeLabel", "Section Type")}</Label>
              <Input
                value={form.sectionType}
                onChange={(e) => setForm((f) => ({ ...f, sectionType: e.target.value }))}
                placeholder={t("venueMap.sectionTypePlaceholder", "e.g. General, VIP Table, Palco...")}
                list="section-type-suggestions"
              />
              <datalist id="section-type-suggestions">
                {existingTypes.map((type) => <option key={type} value={type} />)}
              </datalist>
            </div>
            <div className="space-y-1">
              <Label>{t("venueMap.sectionColor", "Color")}</Label>
              <div className="flex gap-2 flex-wrap">
                {DEFAULT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`w-7 h-7 rounded-full border-2 transition-all ${form.color === c ? "border-white scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setForm((f) => ({ ...f, color: c }))}
                  />
                ))}
              </div>
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

      <Dialog open={editDialogOpen} onOpenChange={(open) => { setEditDialogOpen(open); if (!open) setEditingSection(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("venueMap.editSection", "Edit Section")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>{t("venueMap.sectionName")} *</Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={t("venueMap.sectionNamePlaceholder")}
              />
            </div>
            <div className="space-y-1">
              <Label>{t("venueMap.sectionCapacity")}</Label>
              <Input
                type="number"
                min="0"
                value={editForm.capacity}
                onChange={(e) => setEditForm((f) => ({ ...f, capacity: e.target.value }))}
                placeholder={t("venueMap.capacityPlaceholder")}
              />
            </div>
            <div className="space-y-1">
              <Label>{t("venueMap.sectionTypeLabel", "Section Type")}</Label>
              <Input
                value={editForm.sectionType}
                onChange={(e) => setEditForm((f) => ({ ...f, sectionType: e.target.value }))}
                placeholder={t("venueMap.sectionTypePlaceholder", "e.g. General, VIP Table, Palco...")}
                list="edit-section-type-suggestions"
              />
              <datalist id="edit-section-type-suggestions">
                {existingTypes.map((type) => <option key={type} value={type} />)}
              </datalist>
            </div>
            <div className="space-y-1">
              <Label>{t("venueMap.sectionColor", "Color")}</Label>
              <div className="flex gap-2 flex-wrap">
                {DEFAULT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`w-7 h-7 rounded-full border-2 transition-all ${editForm.color === c ? "border-white scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setEditForm((f) => ({ ...f, color: c }))}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditDialogOpen(false); setEditingSection(null); }}>{t("common.cancel")}</Button>
            <Button
              onClick={() => {
                if (!editingSection || !editForm.name) return;
                const cap = parseInt(editForm.capacity) || 0;
                updateMutation.mutate({
                  sectionId: editingSection.id,
                  body: { name: editForm.name, capacity: cap || undefined, totalTickets: cap, colorHex: editForm.color, sectionType: editForm.sectionType || undefined },
                });
              }}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirmId} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("venueMap.deleteSection", "Delete Section")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("venueMap.deleteConfirm", "Are you sure you want to delete this section? This action cannot be undone. Sections with linked ticket types cannot be deleted.")}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>{t("common.cancel")}</Button>
            <Button
              variant="destructive"
              onClick={() => { if (deleteConfirmId) deleteMutation.mutate(deleteConfirmId); }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {t("common.delete", "Delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function parseSvgRect(pathData: string): { x: number; y: number; w: number; h: number } | null {
  const nums = pathData.match(/[\d.]+/g)?.map(Number);
  if (!nums || nums.length < 8) return null;
  const xs = [nums[0], nums[2], nums[4], nums[6]];
  const ys = [nums[1], nums[3], nums[5], nums[7]];
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}
