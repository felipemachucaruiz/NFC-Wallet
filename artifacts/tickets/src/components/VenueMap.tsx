import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import type { EventData, TicketType, TicketTypeUnit, VenueSection } from "@/data/types";

interface VenueMapProps {
  event: EventData;
  onSelectTicket: (ticket: TicketType, sectionName: string) => void;
  onSelectUnit?: (ticket: TicketType, unit: TicketTypeUnit) => void;
  onSectionClick?: (sectionId: string) => void;
  selectedUnitId?: string | null;
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

function useZoomPan() {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const lastTranslate = useRef({ x: 0, y: 0 });
  const lastPinchDist = useRef<number | null>(null);
  const lastPinchScale = useRef(1);

  const clampTranslate = useCallback((tx: number, ty: number, s: number) => {
    const maxOffset = ((s - 1) / s) * 50;
    return {
      x: Math.max(-maxOffset, Math.min(maxOffset, tx)),
      y: Math.max(-maxOffset, Math.min(maxOffset, ty)),
    };
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setScale((prev) => {
      const next = Math.min(4, Math.max(1, prev + delta));
      if (next === 1) setTranslate({ x: 0, y: 0 });
      else setTranslate((t) => clampTranslate(t.x, t.y, next));
      return next;
    });
  }, [clampTranslate]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (scale <= 1) return;
    isPanning.current = true;
    panStart.current = { x: e.clientX, y: e.clientY };
    lastTranslate.current = { ...translate };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [scale, translate]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanning.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = ((e.clientX - panStart.current.x) / rect.width) * 100;
    const dy = ((e.clientY - panStart.current.y) / rect.height) * 100;
    setTranslate(clampTranslate(lastTranslate.current.x + dx, lastTranslate.current.y + dy, scale));
  }, [scale, clampTranslate]);

  const handlePointerUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastPinchDist.current = Math.sqrt(dx * dx + dy * dy);
      lastPinchScale.current = scale;
    }
  }, [scale]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastPinchDist.current !== null) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const ratio = dist / lastPinchDist.current;
      const next = Math.min(4, Math.max(1, lastPinchScale.current * ratio));
      setScale(next);
      if (next === 1) setTranslate({ x: 0, y: 0 });
      else setTranslate((t) => clampTranslate(t.x, t.y, next));
    }
  }, [clampTranslate]);

  const handleTouchEnd = useCallback(() => {
    lastPinchDist.current = null;
  }, []);

  const zoomIn = useCallback(() => {
    setScale((prev) => {
      const next = Math.min(4, prev + 0.5);
      setTranslate((t) => clampTranslate(t.x, t.y, next));
      return next;
    });
  }, [clampTranslate]);

  const zoomOut = useCallback(() => {
    setScale((prev) => {
      const next = Math.max(1, prev - 0.5);
      if (next === 1) setTranslate({ x: 0, y: 0 });
      else setTranslate((t) => clampTranslate(t.x, t.y, next));
      return next;
    });
  }, [clampTranslate]);

  const resetZoom = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  return {
    scale, translate, containerRef,
    handleWheel, handlePointerDown, handlePointerMove, handlePointerUp,
    handleTouchStart, handleTouchMove, handleTouchEnd,
    zoomIn, zoomOut, resetZoom,
  };
}

export function VenueMap({ event, onSelectTicket, onSelectUnit, onSectionClick, selectedUnitId }: VenueMapProps) {
  const { t } = useTranslation();
  const [hoveredUnitId, setHoveredUnitId] = useState<string | null>(null);
  const [tappedUnitId, setTappedUnitId] = useState<string | null>(null);
  const zoom = useZoomPan();

  const hasSvgPaths = event.sections.some((s) => s.svgPath);

  const mappedUnits = useMemo(() => {
    const result: { unit: TicketTypeUnit; ticketType: TicketType; sectionName: string }[] = [];
    const allTicketTypes = [
      ...event.ticketTypes,
      ...event.sections.flatMap((s) => s.ticketTypes),
    ];
    const seen = new Set<string>();
    for (const tt of allTicketTypes) {
      if (seen.has(tt.id)) continue;
      seen.add(tt.id);
      if (!tt.isNumberedUnits || !tt.units) continue;
      const section = event.sections.find((s) => s.ticketTypes.some((st) => st.id === tt.id));
      for (const u of tt.units) {
        if (u.mapX != null && u.mapY != null) {
          result.push({ unit: u, ticketType: tt, sectionName: section?.name || tt.name });
        }
      }
    }
    return result;
  }, [event]);

  const availableCount = mappedUnits.filter((m) => m.unit.status === "available").length;
  const soldCount = mappedUnits.filter((m) => m.unit.status !== "available").length;

  const handleSectionClick = (section: VenueSection) => {
    if (onSectionClick) onSectionClick(section.id);
  };

  const handleUnitTap = (ticketType: TicketType, unit: TicketTypeUnit) => {
    if (unit.status !== "available") return;
    if (tappedUnitId === unit.id) {
      if (onSelectUnit) onSelectUnit(ticketType, unit);
      setTappedUnitId(null);
    } else {
      setTappedUnitId(unit.id);
    }
  };

  useEffect(() => {
    if (tappedUnitId) {
      const timer = setTimeout(() => setTappedUnitId(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [tappedUnitId]);

  const renderMapContent = (hasFloorplan: boolean) => (
    <>
      {hasFloorplan && (
        <img
          src={event.floorplanImage}
          alt={t("venueMap.title")}
          className="absolute inset-0 w-full h-full object-contain select-none pointer-events-none"
          draggable={false}
        />
      )}
      {!hasFloorplan && (
        <div
          className="absolute border rounded-sm flex items-center justify-center pointer-events-none"
          style={{
            left: "35%", top: "42%", width: "30%", height: "16%",
            backgroundColor: "hsl(0, 0%, 15%)", borderColor: "hsl(0, 0%, 20%)",
            zIndex: 1,
          }}
        >
          <span className="text-sm font-semibold" style={{ color: "hsl(0, 0%, 50%)" }}>STAGE</span>
        </div>
      )}
      {hasSvgPaths && event.sections.map((section) => {
        if (!section.svgPath) return null;
        const rect = parseSvgRect(section.svgPath);
        if (!rect) return null;
        return (
          <div
            key={section.id}
            className="absolute border-2 rounded-sm flex items-center justify-center cursor-pointer transition-all duration-150 hover:brightness-125"
            style={{
              left: `${rect.x}%`,
              top: `${rect.y}%`,
              width: `${rect.w}%`,
              height: `${rect.h}%`,
              borderColor: section.color || "#22c55e",
              backgroundColor: getSectionColor(section.color, section.status, false),
              zIndex: 5,
              borderWidth: 2,
            }}
            onClick={() => handleSectionClick(section)}
          >
            <span
              className="text-sm sm:text-base md:text-lg font-extrabold text-white truncate px-2 pointer-events-none"
              style={{ textShadow: "0 1px 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.6)" }}
            >
              {section.name}
            </span>
          </div>
        );
      })}
      {mappedUnits.map(({ unit, ticketType }) => {
        const isSelected = selectedUnitId === unit.id;
        const isTapped = tappedUnitId === unit.id;
        const isHovered = hoveredUnitId === unit.id;
        const isSold = unit.status !== "available";
        const markerColor = isSold ? "#6b7280" : isSelected ? "#00f1ff" : isTapped ? "#00f1ff" : "#f59e0b";
        const showTooltip = isHovered || isSelected || isTapped;
        return (
          <div
            key={unit.id}
            className={`absolute flex flex-col items-center transition-transform duration-150 ${isSold ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
            style={{
              left: `${unit.mapX}%`,
              top: `${unit.mapY}%`,
              transform: `translate(-50%, -100%) ${showTooltip ? "scale(1.3)" : "scale(1)"}`,
              zIndex: isSelected ? 25 : isTapped ? 24 : isHovered ? 22 : 15,
            }}
            onClick={(e) => {
              e.stopPropagation();
              handleUnitTap(ticketType, unit);
            }}
            onMouseEnter={() => !isSold && setHoveredUnitId(unit.id)}
            onMouseLeave={() => setHoveredUnitId(null)}
          >
            <div
              className={`rounded-full flex items-center justify-center text-[10px] sm:text-xs font-bold text-white border-2 shadow-lg ${showTooltip ? "w-8 h-8 sm:w-9 sm:h-9" : "w-6 h-6 sm:w-7 sm:h-7"}`}
              style={{
                backgroundColor: markerColor,
                borderColor: isSelected || isTapped ? "#fff" : "rgba(0,0,0,0.4)",
                boxShadow: isSelected || isTapped ? "0 0 12px rgba(0,241,255,0.5)" : undefined,
              }}
            >
              {unit.unitNumber}
            </div>
            <div className="w-0 h-0 border-l-[4px] border-r-[4px] border-t-[5px] border-l-transparent border-r-transparent" style={{ borderTopColor: markerColor }} />
            {showTooltip && (
              <div className="absolute top-full mt-1 bg-popover border border-border rounded-md px-2 py-1 text-[10px] whitespace-nowrap shadow-xl z-30">
                <span className="font-semibold">{unit.unitLabel}</span>
                {isSold && <span className="ml-1 text-red-400">({t("venueMap.legend.soldOut")})</span>}
                {!isSold && isTapped && (
                  <span className="ml-1 text-primary">
                    {t("venueMap.tapToSelect", "Tap again to select")}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );

  const hasMap = event.floorplanImage || hasSvgPaths;
  if (!hasMap && mappedUnits.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-4 text-xs">
          <LegendItem color="#22c55e" label={t("venueMap.legend.available")} />
          <LegendItem color="#eab308" label={t("venueMap.legend.limited")} />
          <LegendItem color="#ef4444" label={t("venueMap.legend.soldOut")} />
          {mappedUnits.length > 0 && (
            <>
              <LegendItem color="#f59e0b" label={`${t("venueMap.legend.vipTable", "VIP Table")} (${availableCount})`} isCircle />
              {soldCount > 0 && (
                <LegendItem color="#6b7280" label={`${t("venueMap.legend.soldOut")} (${soldCount})`} isCircle />
              )}
            </>
          )}
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border p-2 sm:p-4">
        <div className="relative">
          {mappedUnits.length > 0 && (
            <div className="absolute top-2 right-2 z-30 flex flex-col gap-1">
              <button
                type="button"
                onClick={zoom.zoomIn}
                className="w-8 h-8 bg-card/90 border border-border rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors backdrop-blur-sm"
                aria-label="Zoom in"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={zoom.zoomOut}
                className="w-8 h-8 bg-card/90 border border-border rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors backdrop-blur-sm"
                aria-label="Zoom out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              {zoom.scale > 1 && (
                <button
                  type="button"
                  onClick={zoom.resetZoom}
                  className="w-8 h-8 bg-card/90 border border-border rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors backdrop-blur-sm"
                  aria-label="Reset zoom"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          <div
            ref={zoom.containerRef}
            className={`relative w-full ${event.floorplanImage ? "aspect-[16/10]" : "aspect-square"} rounded-lg overflow-hidden ${event.floorplanImage ? "" : "bg-[#1a1a1a]"}`}
            onWheel={zoom.handleWheel}
            onPointerDown={zoom.handlePointerDown}
            onPointerMove={zoom.handlePointerMove}
            onPointerUp={zoom.handlePointerUp}
            onPointerLeave={zoom.handlePointerUp}
            onTouchStart={zoom.handleTouchStart}
            onTouchMove={zoom.handleTouchMove}
            onTouchEnd={zoom.handleTouchEnd}
            style={{ touchAction: zoom.scale > 1 ? "none" : "pan-y" }}
          >
            <div
              className="relative w-full h-full"
              style={{
                transform: `scale(${zoom.scale}) translate(${zoom.translate.x}%, ${zoom.translate.y}%)`,
                transformOrigin: "center center",
                transition: "transform 0.1s ease-out",
              }}
            >
              {renderMapContent(!!event.floorplanImage)}
            </div>
          </div>
        </div>

        {mappedUnits.length > 0 && (
          <p className="text-[10px] sm:text-xs text-muted-foreground mt-2 text-center">
            {t("venueMap.tapHint", "Tap a table number to select it. Pinch or use +/- to zoom.")}
          </p>
        )}
      </div>
    </div>
  );
}

function LegendItem({ color, label, isCircle }: { color: string; label: string; isCircle?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-3 h-3 ${isCircle ? "rounded-full" : "rounded-sm"}`} style={{ backgroundColor: color }} />
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

function getSectionColor(sectionColor: string, status: string, isSelected: boolean): string {
  const opacity = isSelected ? 0.6 : 0.35;
  const hex = sectionColor || "#22c55e";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}
