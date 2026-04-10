import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";
import type { EventData, TicketType, VenueSection } from "@/data/types";

interface VenueMapProps {
  event: EventData;
  onSelectTicket: (ticket: TicketType, sectionName: string) => void;
}

export function VenueMap({ event, onSelectTicket }: VenueMapProps) {
  const { t } = useTranslation();
  const [selectedSection, setSelectedSection] = useState<VenueSection | null>(null);

  const hasSvgPaths = event.sections.some((s) => s.svgPath);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 text-xs">
        <LegendItem color="#22c55e" label={t("venueMap.legend.available")} />
        <LegendItem color="#eab308" label={t("venueMap.legend.limited")} />
        <LegendItem color="#ef4444" label={t("venueMap.legend.soldOut")} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card rounded-xl border border-border p-4">
          {event.floorplanImage && hasSvgPaths ? (
            <div className="relative w-full">
              <img
                src={event.floorplanImage}
                alt={t("venueMap.title")}
                className="w-full rounded-lg object-contain"
              />
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="absolute inset-0 w-full h-full rounded-lg"
                style={{ pointerEvents: "none" }}
              >
                {event.sections.map((section) => {
                  if (!section.svgPath) return null;
                  const isSelected = selectedSection?.id === section.id;
                  return (
                    <g key={section.id} style={{ pointerEvents: "all" }}>
                      <path
                        d={section.svgPath}
                        fill={getSectionColor(section.color, section.status, isSelected)}
                        stroke={isSelected ? "hsl(184, 100%, 50%)" : "rgba(255,255,255,0.6)"}
                        strokeWidth={isSelected ? 0.8 : 0.4}
                        className="cursor-pointer transition-all duration-150"
                        onClick={() => setSelectedSection(isSelected ? null : section)}
                      />
                      {(() => {
                        const center = getPathCenter(section.svgPath);
                        return (
                          <text
                            x={center.x}
                            y={center.y}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fill="white"
                            fontSize="3"
                            fontWeight="700"
                            fontFamily="sans-serif"
                            className="pointer-events-none"
                            style={{ textShadow: "0 0 3px rgba(0,0,0,0.8)" }}
                          >
                            {section.name}
                          </text>
                        );
                      })()}
                    </g>
                  );
                })}
              </svg>
            </div>
          ) : event.floorplanImage ? (
            <img
              src={event.floorplanImage}
              alt={t("venueMap.title")}
              className="w-full rounded-lg object-contain"
            />
          ) : hasSvgPaths ? (
            <svg
              viewBox="0 0 100 100"
              className="w-full aspect-square"
              role="img"
              aria-label={t("venueMap.title")}
            >
              <rect x="35" y="42" width="30" height="16" rx="2" fill="hsl(0, 0%, 15%)" stroke="hsl(0, 0%, 20%)" strokeWidth="0.5" />
              <text x="50" y="51" textAnchor="middle" dominantBaseline="central" fill="hsl(0, 0%, 50%)" fontSize="4" fontFamily="sans-serif">STAGE</text>
              {event.sections.map((section) => {
                if (!section.svgPath) return null;
                const isSelected = selectedSection?.id === section.id;
                return (
                  <g key={section.id}>
                    <path
                      d={section.svgPath}
                      fill={getSectionColor(section.color, section.status, isSelected)}
                      stroke={isSelected ? "hsl(184, 100%, 50%)" : "rgba(255,255,255,0.3)"}
                      strokeWidth={isSelected ? 0.8 : 0.4}
                      className="cursor-pointer transition-all duration-150"
                      onClick={() => setSelectedSection(isSelected ? null : section)}
                    />
                    <text
                      x={getPathCenter(section.svgPath).x}
                      y={getPathCenter(section.svgPath).y}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="white"
                      fontSize="3"
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
          ) : (
            <div className="flex items-center justify-center aspect-[16/10] text-muted-foreground text-sm">
              {t("venueMap.selectSection")}
            </div>
          )}
        </div>

        <div className="space-y-2">
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
                    <span className="font-medium text-sm">{section.name}</span>
                  </div>
                  <SectionStatusBadge status={section.status} />
                </div>
              </button>
            );
          })}

          {selectedSection && (
            <div className="mt-3 p-4 rounded-xl border border-primary/30 bg-card">
              <h3 className="font-semibold text-base mb-3">{selectedSection.name}</h3>
              {selectedSection.ticketTypes.length > 0 ? (
                <div className="space-y-3">
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

function getSectionColor(sectionColor: string, status: string, isSelected: boolean): string {
  const opacity = isSelected ? 0.7 : 0.4;
  const hex = sectionColor || "#22c55e";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
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
