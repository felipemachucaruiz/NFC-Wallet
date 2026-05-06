import { useColorScheme } from "@/hooks/useColorScheme";
import { Image } from 'expo-image';
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path, G, Ellipse, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { ScreenBackground } from "@/components/ui/ScreenBackground";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { useEventDetail } from "@/hooks/useEventsApi";
import { formatCurrency } from "@/utils/format";
import type { VenueSection, TicketType, TicketUnit, TicketAvailability } from "@/types/events";

function getSvgPathCenter(pathData: string): { cx: number; cy: number } | null {
  const nums = pathData.match(/[\d.]+/g)?.map(Number);
  if (!nums || nums.length < 4) return null;
  const xs: number[] = [], ys: number[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    xs.push(nums[i]);
    ys.push(nums[i + 1]);
  }
  if (xs.length === 0) return null;
  return {
    cx: xs.reduce((a, b) => a + b, 0) / xs.length,
    cy: ys.reduce((a, b) => a + b, 0) / ys.length,
  };
}

type MappedUnit = { unit: TicketUnit; ticketType: TicketType; section: VenueSection };

function availabilityVariant(a: TicketAvailability): "success" | "warning" | "danger" {
  if (a === "available") return "success";
  if (a === "limited") return "warning";
  return "danger";
}

const UNIT_R = 2.0;
const AR_CORRECT = 10 / 16; // compensate for 16:10 container with 100×100 viewBox

function ZoomableMap({
  floorplanImageUrl,
  sections,
  selectedId,
  onSelect,
  mappedUnits,
}: {
  floorplanImageUrl?: string;
  sections: VenueSection[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  mappedUnits: MappedUnit[];
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(1, Math.min(4, savedScale.value * e.scale));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1) {
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
    });

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const composed = Gesture.Simultaneous(pinch, pan);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const zoomIn = () => {
    const next = Math.min(4, savedScale.value + 0.5);
    scale.value = withTiming(next);
    savedScale.value = next;
  };

  const zoomOut = () => {
    const next = Math.max(1, savedScale.value - 0.5);
    scale.value = withTiming(next);
    savedScale.value = next;
    if (next <= 1) {
      translateX.value = withTiming(0);
      translateY.value = withTiming(0);
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;
    }
  };

  const hasFloorplan = !!floorplanImageUrl;
  const hasSvgPaths = sections.some((s) => !!s.svgPathData);
  const hasOverlay = hasSvgPaths || mappedUnits.length > 0;

  return (
    <View style={mapStyles.wrapper}>
      <GestureDetector gesture={composed}>
        <View style={[mapStyles.mapContainer, !hasFloorplan && mapStyles.mapBg]}>
          <Animated.View style={[mapStyles.mapInner, animStyle]}>
            {hasFloorplan && (
              <Image
                source={{ uri: floorplanImageUrl }}
                style={mapStyles.floorplanImage}
                contentFit="contain"
              />
            )}
            {!hasFloorplan && (
              <View style={mapStyles.stagePlaceholder}>
                <Text style={mapStyles.stageText}>STAGE</Text>
              </View>
            )}

            {/* SVG overlay: section polygons + unit markers */}
            {hasOverlay && (
              <Svg
                style={StyleSheet.absoluteFill}
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                {/* Section fill paths */}
                {hasSvgPaths && sections.map((section) => {
                  if (!section.svgPathData) return null;
                  const isSelected = selectedId === section.id;
                  const isSoldOut = section.availability === "sold_out";
                  const color = section.color || "#22c55e";
                  const fillOpacity = isSoldOut ? 0.25 : isSelected ? 0.65 : 0.35;
                  const center = getSvgPathCenter(section.svgPathData);
                  return (
                    <G
                      key={section.id}
                      onPress={() => { if (!isSoldOut) onSelect(isSelected ? null : section.id); }}
                    >
                      <Path
                        d={section.svgPathData}
                        fill={isSoldOut ? "#3f3f46" : color}
                        fillOpacity={fillOpacity}
                        stroke={isSoldOut ? "#3f3f46" : color}
                        strokeWidth={isSelected ? "0.8" : "0.5"}
                        opacity={isSoldOut ? 0.5 : 1}
                      />
                      {center && (
                        <SvgText
                          x={center.cx}
                          y={center.cy}
                          textAnchor="middle"
                          dy="1"
                          fontSize="2.5"
                          fontWeight="bold"
                          fill="white"
                        >
                          {section.name}
                        </SvgText>
                      )}
                    </G>
                  );
                })}

                {/* Numbered unit markers (VIP tables, seats, etc.) */}
                {mappedUnits.map(({ unit, section }) => {
                  if (unit.mapX == null || unit.mapY == null) return null;
                  const isSold = unit.status !== "available";
                  const isSecSelected = selectedId === section.id;
                  const color = isSold ? "#6b7280" : isSecSelected ? "#00f1ff" : "#f59e0b";
                  return (
                    <G
                      key={unit.id}
                      onPress={() => { if (!isSold) onSelect(section.id); }}
                      opacity={isSold ? 0.5 : 1}
                    >
                      <Ellipse
                        cx={unit.mapX}
                        cy={unit.mapY}
                        rx={UNIT_R * AR_CORRECT}
                        ry={UNIT_R}
                        fill={color}
                        stroke="rgba(0,0,0,0.5)"
                        strokeWidth="0.4"
                      />
                      <SvgText
                        x={unit.mapX}
                        y={unit.mapY}
                        textAnchor="middle"
                        dy="0.8"
                        fontSize={UNIT_R * 0.85}
                        fontWeight="bold"
                        fill="white"
                      >
                        {unit.unitNumber}
                      </SvgText>
                    </G>
                  );
                })}
              </Svg>
            )}
          </Animated.View>
        </View>
      </GestureDetector>

      <View style={mapStyles.zoomBtns}>
        <Pressable onPress={zoomIn} style={mapStyles.zoomBtn}>
          <Feather name="plus" size={16} color="#fff" />
        </Pressable>
        <Pressable onPress={zoomOut} style={mapStyles.zoomBtn}>
          <Feather name="minus" size={16} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

export default function VenueMapScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const params = useLocalSearchParams<{ eventId: string }>();
  const eventId = params.eventId ?? "";

  const { data: event, isPending } = useEventDetail(eventId);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);

  if (isPending || !event) return <Loading label={t("common.loading")} />;

  const sections = event.venueMap?.sections ?? [];
  const floorplanImageUrl = event.venueMap?.floorplanImageUrl;
  const selectedSection = sections.find((s) => s.id === selectedSectionId);
  const hasMap = sections.length > 0;

  const mappedUnits = useMemo<MappedUnit[]>(() => {
    const result: MappedUnit[] = [];
    for (const section of sections) {
      for (const tt of section.ticketTypes) {
        if (!tt.isNumberedUnits || !tt.units) continue;
        for (const u of tt.units) {
          if (u.mapX != null && u.mapY != null) {
            result.push({ unit: u, ticketType: tt, section });
          }
        }
      }
    }
    return result;
  }, [sections]);

  const handleSelectTicketType = (tt: TicketType, section: VenueSection) => {
    router.push({
      pathname: "/ticket-quantity",
      params: {
        eventId: event.id,
        ticketTypeId: tt.id,
        ticketTypeName: tt.name,
        price: String(tt.price),
        serviceFee: String(tt.serviceFee),
        maxPerOrder: String(tt.maxPerOrder ?? 10),
        currencyCode: event.currencyCode,
        eventName: event.name,
        sectionName: section.name,
        validDays: tt.validDays ? JSON.stringify(tt.validDays) : "",
        isNumberedUnits: tt.isNumberedUnits ? "1" : "0",
        ticketsPerUnit: String(tt.ticketsPerUnit ?? 1),
        unitLabel: tt.unitLabel ?? "",
        units: tt.units ? JSON.stringify(tt.units) : "[]",
      },
    });
  };

  return (
    <ScreenBackground style={styles.container}>
      <View style={[styles.header, { paddingTop: isWeb ? 67 : insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={C.text} />
        </Pressable>
        <Text style={[styles.title, { color: C.text }]}>{t("events.venueMap")}</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}>
        <Card style={{ padding: 16, gap: 12 }}>
          <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>
            {t("events.selectSection").toUpperCase()}
          </Text>

          {hasMap ? (
            <ZoomableMap
              floorplanImageUrl={floorplanImageUrl}
              sections={sections}
              selectedId={selectedSectionId}
              onSelect={setSelectedSectionId}
              mappedUnits={mappedUnits}
            />
          ) : (
            <View style={mapStyles.emptyMap}>
              <Feather name="map" size={36} color={C.textMuted} />
              <Text style={{ color: C.textMuted, marginTop: 8, fontFamily: "Inter_400Regular" }}>
                {t("events.noMap", "Sin mapa disponible")}
              </Text>
            </View>
          )}

          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: "#22c55e" }]} />
              <Text style={[styles.legendText, { color: C.textSecondary }]}>{t("events.availability_available")}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: "#eab308" }]} />
              <Text style={[styles.legendText, { color: C.textSecondary }]}>{t("events.availability_limited")}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: "#ef4444" }]} />
              <Text style={[styles.legendText, { color: C.textSecondary }]}>{t("events.availability_sold_out")}</Text>
            </View>
          </View>
        </Card>

        {selectedSection && (
          <Card style={{ gap: 12 }}>
            <Text style={[styles.selectedSectionName, { color: C.text }]}>
              {selectedSection.name}
            </Text>
            {selectedSection.ticketTypes.length === 0 && (
              <Text style={{ color: C.textSecondary, fontFamily: "Inter_400Regular", fontSize: 13 }}>
                {t("events.noTicketsInSection", "No hay boletas disponibles en esta sección")}
              </Text>
            )}
            {selectedSection.ticketTypes.map((tt) => (
              <View key={tt.id} style={[styles.ticketTypeRow, { borderColor: C.border }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.ttName, { color: C.text }]}>{tt.name}</Text>
                  {tt.validDays && tt.validDays.length > 0 && (
                    <Text style={[styles.ttDays, { color: C.textSecondary }]}>
                      {t("events.validDays")}: {tt.validDays.map((d) => t("events.dayLabel", { n: d })).join(", ")}
                    </Text>
                  )}
                  <Text style={[styles.ttPrice, { color: C.primary }]}>
                    {formatCurrency(tt.price, event.currencyCode)}
                  </Text>
                </View>
                <Button
                  title={t("events.select")}
                  onPress={() => handleSelectTicketType(tt, selectedSection)}
                  variant="primary"
                  size="sm"
                  disabled={tt.availability === "sold_out"}
                />
              </View>
            ))}
          </Card>
        )}

        <Card style={{ gap: 8 }}>
          <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>
            {t("events.allSections").toUpperCase()}
          </Text>
          {sections.map((section) => (
            <Pressable
              key={section.id}
              onPress={() =>
                section.availability !== "sold_out" &&
                setSelectedSectionId(section.id)
              }
              style={[
                styles.sectionListRow,
                {
                  borderColor: C.border,
                  backgroundColor:
                    selectedSectionId === section.id ? C.primaryLight : "transparent",
                },
              ]}
            >
              <View
                style={[
                  styles.sectionDot,
                  { backgroundColor: section.color || "#22c55e" },
                ]}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.sectionListName, { color: C.text }]}>{section.name}</Text>
                {section.ticketTypes.length > 0 && (
                  <Text style={[styles.sectionListPrice, { color: C.textSecondary }]}>
                    {t("events.from")}{" "}
                    {formatCurrency(
                      Math.min(...section.ticketTypes.map((tt) => tt.price)),
                      event.currencyCode,
                    )}
                  </Text>
                )}
              </View>
              <Badge
                label={t(`events.availability_${section.availability}`)}
                variant={availabilityVariant(section.availability)}
                size="sm"
              />
            </Pressable>
          ))}
        </Card>
      </ScrollView>
    </ScreenBackground>
  );
}

const mapStyles = StyleSheet.create({
  wrapper: {
    width: "100%",
    aspectRatio: 16 / 10,
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
  },
  mapContainer: {
    width: "100%",
    height: "100%",
    overflow: "hidden",
    borderRadius: 12,
  },
  mapBg: {
    backgroundColor: "#1a1a2e",
  },
  mapInner: {
    width: "100%",
    height: "100%",
    position: "relative",
  },
  floorplanImage: {
    position: "absolute",
    width: "100%",
    height: "100%",
  },
  stagePlaceholder: {
    position: "absolute",
    left: "35%",
    top: "42%",
    width: "30%",
    height: "16%",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  stageText: {
    color: "rgba(255,255,255,0.5)",
    fontFamily: "Inter_700Bold",
    fontSize: 11,
  },
  zoomBtns: {
    position: "absolute",
    top: 8,
    right: 8,
    gap: 4,
  },
  zoomBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyMap: {
    width: "100%",
    aspectRatio: 16 / 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
  },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  backBtn: { padding: 4 },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  scroll: { padding: 20, gap: 16 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  legendRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  selectedSectionName: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  ticketTypeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 12,
  },
  ttName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  ttDays: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  ttPrice: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  sectionListRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderRadius: 8,
  },
  sectionDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  sectionListName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  sectionListPrice: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
});
