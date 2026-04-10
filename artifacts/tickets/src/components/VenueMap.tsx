import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/data/mockEvents";
import type { EventData, TicketType, VenueSection } from "@/data/types";

interface VenueMapProps {
  event: EventData;
  onSelectTicket: (ticket: TicketType, sectionName: string) => void;
}

export function VenueMap({ event, onSelectTicket }: VenueMapProps) {
  const { t } = useTranslation();
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<VenueSection | null>(null);

  const getSectionColor = (status: string, isHovered: boolean, isSelected: boolean) => {
    const opacity = isHovered || isSelected ? 0.8 : 0.5;
    switch (status) {
      case "available": return `rgba(34, 197, 94, ${opacity})`;
      case "limited": return `rgba(234, 179, 8, ${opacity})`;
      case "sold_out": return `rgba(239, 68, 68, ${opacity})`;
      default: return `rgba(107, 114, 128, ${opacity})`;
    }
  };

  const getStrokeColor = (isSelected: boolean) => {
    return isSelected ? "hsl(184, 100%, 50%)" : "rgba(255,255,255,0.3)";
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 text-xs">
        <LegendItem color="#22c55e" label={t("venueMap.legend.available")} />
        <LegendItem color="#eab308" label={t("venueMap.legend.limited")} />
        <LegendItem color="#ef4444" label={t("venueMap.legend.soldOut")} />
        <LegendItem color="#6b7280" label={t("venueMap.legend.na")} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card rounded-xl border border-border p-4">
          <svg
            viewBox="0 0 400 400"
            className="w-full aspect-square"
            role="img"
            aria-label={t("venueMap.title")}
          >
            <rect x="150" y="170" width="100" height="60" rx="4" fill="hsl(0, 0%, 15%)" stroke="hsl(0, 0%, 20%)" strokeWidth="1" />
            <text x="200" y="205" textAnchor="middle" fill="hsl(0, 0%, 50%)" fontSize="10" fontFamily="sans-serif">STAGE</text>

            {event.sections.map((section) => {
              const isHovered = hoveredSection === section.id;
              const isSelected = selectedSection?.id === section.id;
              return (
                <g key={section.id}>
                  <path
                    d={section.svgPath}
                    fill={getSectionColor(section.status, isHovered, isSelected)}
                    stroke={getStrokeColor(isSelected)}
                    strokeWidth={isSelected ? 2.5 : 1.5}
                    className="cursor-pointer transition-all duration-150"
                    onMouseEnter={() => setHoveredSection(section.id)}
                    onMouseLeave={() => setHoveredSection(null)}
                    onClick={() => setSelectedSection(section)}
                  />
                  <text
                    x={getPathCenter(section.svgPath).x}
                    y={getPathCenter(section.svgPath).y}
                    textAnchor="middle"
                    fill="white"
                    fontSize="11"
                    fontWeight="600"
                    fontFamily="sans-serif"
                    className="pointer-events-none"
                  >
                    {section.name}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="bg-card rounded-xl border border-border p-4">
          {selectedSection ? (
            <div>
              <h3 className="font-semibold text-lg mb-1">{t("venueMap.section")}: {selectedSection.name}</h3>
              <SectionStatusBadge status={selectedSection.status} />
              <div className="mt-4 space-y-3">
                <p className="text-sm text-muted-foreground">{t("venueMap.availableTickets")}:</p>
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
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <p className="text-sm">{t("venueMap.selectSection")}</p>
            </div>
          )}
        </div>
      </div>

      <div className="md:hidden space-y-2">
        {event.sections.map((section) => (
          <button
            key={section.id}
            className={`w-full text-left p-3 rounded-lg border transition-colors ${
              selectedSection?.id === section.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
            }`}
            onClick={() => setSelectedSection(section)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: section.color }} />
                <span className="font-medium text-sm">{section.name}</span>
              </div>
              <SectionStatusBadge status={section.status} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
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

function getPathCenter(path: string): { x: number; y: number } {
  const nums = path.match(/[\d.]+/g)?.map(Number) || [];
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < nums.length; i += 2) {
    if (nums[i] !== undefined && nums[i + 1] !== undefined) {
      xs.push(nums[i]);
      ys.push(nums[i + 1]);
    }
  }
  return {
    x: xs.reduce((a, b) => a + b, 0) / (xs.length || 1),
    y: ys.reduce((a, b) => a + b, 0) / (ys.length || 1),
  };
}
