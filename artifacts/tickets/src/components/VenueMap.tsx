import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";
import type { EventData, TicketType, TicketTypeUnit, VenueSection } from "@/data/types";

interface VenueMapProps {
  event: EventData;
  onSelectTicket: (ticket: TicketType, sectionName: string) => void;
  onSelectUnit?: (ticket: TicketType, unit: TicketTypeUnit) => void;
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

export function VenueMap({ event, onSelectTicket, onSelectUnit, selectedUnitId }: VenueMapProps) {
  const { t } = useTranslation();
  const [selectedSection, setSelectedSection] = useState<VenueSection | null>(null);
  const [hoveredUnitId, setHoveredUnitId] = useState<string | null>(null);

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 text-xs">
        <LegendItem color="#22c55e" label={t("venueMap.legend.available")} />
        <LegendItem color="#eab308" label={t("venueMap.legend.limited")} />
        <LegendItem color="#ef4444" label={t("venueMap.legend.soldOut")} />
        {mappedUnits.length > 0 && (
          <LegendItem color="#f59e0b" label={t("venueMap.legend.vipTable", "VIP Table")} isCircle />
        )}
      </div>

      <div className="bg-card rounded-xl border border-border p-4">
        {event.floorplanImage ? (
          <div className="relative w-full aspect-[16/10] rounded-lg overflow-hidden">
            <img
              src={event.floorplanImage}
              alt={t("venueMap.title")}
              className="absolute inset-0 w-full h-full object-contain select-none pointer-events-none"
            />
            {hasSvgPaths && event.sections.map((section) => {
              if (!section.svgPath) return null;
              const rect = parseSvgRect(section.svgPath);
              if (!rect) return null;
              const isSelected = selectedSection?.id === section.id;
              return (
                <div
                  key={section.id}
                  className="absolute border-2 rounded-sm flex items-center justify-center cursor-pointer transition-all duration-150"
                  style={{
                    left: `${rect.x}%`,
                    top: `${rect.y}%`,
                    width: `${rect.w}%`,
                    height: `${rect.h}%`,
                    borderColor: isSelected ? "hsl(184, 100%, 50%)" : (section.color || "#22c55e"),
                    backgroundColor: getSectionColor(section.color, section.status, isSelected),
                    zIndex: isSelected ? 10 : 5,
                    borderWidth: isSelected ? 3 : 2,
                  }}
                  onClick={() => setSelectedSection(isSelected ? null : section)}
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
              const isHovered = hoveredUnitId === unit.id;
              const isSold = unit.status !== "available";
              const markerColor = isSold ? "#6b7280" : isSelected ? "#00f1ff" : "#f59e0b";
              return (
                <div
                  key={unit.id}
                  className={`absolute flex flex-col items-center transition-transform duration-150 ${isSold ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                  style={{
                    left: `${unit.mapX}%`,
                    top: `${unit.mapY}%`,
                    transform: `translate(-50%, -100%) ${isHovered || isSelected ? "scale(1.3)" : "scale(1)"}`,
                    zIndex: isSelected ? 25 : isHovered ? 22 : 15,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isSold && onSelectUnit) onSelectUnit(ticketType, unit);
                  }}
                  onMouseEnter={() => setHoveredUnitId(unit.id)}
                  onMouseLeave={() => setHoveredUnitId(null)}
                >
                  <div
                    className={`rounded-full flex items-center justify-center text-[10px] sm:text-xs font-bold text-white border-2 shadow-lg ${isSelected ? "w-8 h-8 sm:w-9 sm:h-9" : "w-6 h-6 sm:w-7 sm:h-7"}`}
                    style={{ backgroundColor: markerColor, borderColor: isSelected ? "#fff" : "rgba(0,0,0,0.4)" }}
                  >
                    {unit.unitNumber}
                  </div>
                  <div className="w-0 h-0 border-l-[4px] border-r-[4px] border-t-[5px] border-l-transparent border-r-transparent" style={{ borderTopColor: markerColor }} />
                  {(isHovered || isSelected) && (
                    <div className="absolute top-full mt-1 bg-popover border border-border rounded-md px-2 py-1 text-[10px] whitespace-nowrap shadow-xl z-30">
                      <span className="font-semibold">{unit.unitLabel}</span>
                      {isSold && <span className="ml-1 text-red-400">({t("venueMap.legend.soldOut")})</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : hasSvgPaths ? (
          <div className="relative w-full aspect-square bg-[#1a1a1a] rounded-lg">
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
            {event.sections.map((section) => {
              if (!section.svgPath) return null;
              const rect = parseSvgRect(section.svgPath);
              if (!rect) return null;
              const isSelected = selectedSection?.id === section.id;
              return (
                <div
                  key={section.id}
                  className="absolute border-2 rounded-sm flex items-center justify-center cursor-pointer transition-all duration-150"
                  style={{
                    left: `${rect.x}%`,
                    top: `${rect.y}%`,
                    width: `${rect.w}%`,
                    height: `${rect.h}%`,
                    borderColor: isSelected ? "hsl(184, 100%, 50%)" : (section.color || "#22c55e"),
                    backgroundColor: getSectionColor(section.color, section.status, isSelected),
                    zIndex: isSelected ? 10 : 5,
                    borderWidth: isSelected ? 3 : 2,
                  }}
                  onClick={() => setSelectedSection(isSelected ? null : section)}
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
              const isHovered = hoveredUnitId === unit.id;
              const isSold = unit.status !== "available";
              const markerColor = isSold ? "#6b7280" : isSelected ? "#00f1ff" : "#f59e0b";
              return (
                <div
                  key={unit.id}
                  className={`absolute flex flex-col items-center transition-transform duration-150 ${isSold ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                  style={{
                    left: `${unit.mapX}%`,
                    top: `${unit.mapY}%`,
                    transform: `translate(-50%, -100%) ${isHovered || isSelected ? "scale(1.3)" : "scale(1)"}`,
                    zIndex: isSelected ? 25 : isHovered ? 22 : 15,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isSold && onSelectUnit) onSelectUnit(ticketType, unit);
                  }}
                  onMouseEnter={() => setHoveredUnitId(unit.id)}
                  onMouseLeave={() => setHoveredUnitId(null)}
                >
                  <div
                    className={`rounded-full flex items-center justify-center text-[10px] sm:text-xs font-bold text-white border-2 shadow-lg ${isSelected ? "w-8 h-8 sm:w-9 sm:h-9" : "w-6 h-6 sm:w-7 sm:h-7"}`}
                    style={{ backgroundColor: markerColor, borderColor: isSelected ? "#fff" : "rgba(0,0,0,0.4)" }}
                  >
                    {unit.unitNumber}
                  </div>
                  <div className="w-0 h-0 border-l-[4px] border-r-[4px] border-t-[5px] border-l-transparent border-r-transparent" style={{ borderTopColor: markerColor }} />
                  {(isHovered || isSelected) && (
                    <div className="absolute top-full mt-1 bg-popover border border-border rounded-md px-2 py-1 text-[10px] whitespace-nowrap shadow-xl z-30">
                      <span className="font-semibold">{unit.unitLabel}</span>
                      {isSold && <span className="ml-1 text-red-400">({t("venueMap.legend.soldOut")})</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center justify-center aspect-[16/10] text-muted-foreground text-sm">
            {t("venueMap.selectSection")}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {event.sections.map((section) => {
          const isSelected = selectedSection?.id === section.id;
          return (
            <button
              key={section.id}
              className={`w-full text-left p-3 rounded-lg border transition-colors ${
                isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
              }`}
              onClick={() => setSelectedSection(isSelected ? null : section)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: section.color }} />
                  <div>
                    <span className="font-medium text-sm">{section.name}</span>
                    {section.sectionType && <span className="block text-xs text-muted-foreground">{section.sectionType}</span>}
                  </div>
                </div>
                <SectionStatusBadge status={section.status} />
              </div>
            </button>
          );
        })}
      </div>

      {selectedSection && (
        <div className="p-4 rounded-xl border border-primary/30 bg-card">
          <h3 className="font-semibold text-base mb-3">{selectedSection.name}</h3>
          {selectedSection.ticketTypes.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {selectedSection.ticketTypes.map((tt) => (
                <div key={tt.id} className="p-3 rounded-lg border border-border">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-sm font-medium">{tt.name}</span>
                    <span className="text-primary font-bold text-sm">{formatPrice(tt.price, event.currencyCode)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{tt.validDays}</p>
                  <Button
                    size="sm"
                    disabled={tt.status === "sold_out"}
                    onClick={() => onSelectTicket(tt, selectedSection.name)}
                    className="w-full"
                  >
                    {tt.status === "sold_out" ? t("event.soldOut") : t("venueMap.selectTicket")}
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("venueMap.noTicketsInSection", "No tickets available in this section")}</p>
          )}
        </div>
      )}
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

function SectionStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  switch (status) {
    case "available":
      return <Badge className="bg-emerald-600/20 text-emerald-400 border-emerald-600/30 text-xs">{t("venueMap.legend.available")}</Badge>;
    case "limited":
      return <Badge className="bg-amber-600/20 text-amber-400 border-amber-600/30 text-xs">{t("venueMap.legend.limited")}</Badge>;
    case "sold_out":
      return <Badge className="bg-red-600/20 text-red-400 border-red-600/30 text-xs">{t("venueMap.legend.soldOut")}</Badge>;
    default:
      return <Badge className="bg-gray-600/20 text-gray-400 border-gray-600/30 text-xs">{t("venueMap.legend.na")}</Badge>;
  }
}

function getSectionColor(sectionColor: string, status: string, isSelected: boolean): string {
  const opacity = isSelected ? 0.6 : 0.35;
  const hex = sectionColor || "#22c55e";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}
