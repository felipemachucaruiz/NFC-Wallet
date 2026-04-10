import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Svg, { Path } from "react-native-svg";
import Colors from "@/constants/colors";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { useEventDetail } from "@/hooks/useEventsApi";
import { formatCurrency } from "@/utils/format";
import type { VenueSection, TicketType, TicketAvailability } from "@/types/events";

function availabilityColor(a: TicketAvailability): string {
  if (a === "available") return "#22c55e";
  if (a === "limited") return "#eab308";
  return "#ef4444";
}

function availabilityVariant(a: TicketAvailability): "success" | "warning" | "danger" {
  if (a === "available") return "success";
  if (a === "limited") return "warning";
  return "danger";
}

function SvgVenueMap({
  viewBox,
  sections,
  selectedId,
  onSelect,
}: {
  viewBox: string;
  sections: VenueSection[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <View style={svgStyles.container}>
      <Svg viewBox={viewBox} width="100%" height="100%" style={svgStyles.svg}>
        {sections.map((section) => {
          const isSelected = selectedId === section.id;
          const isSoldOut = section.availability === "sold_out";
          const fillColor = isSoldOut
            ? "#3f3f46"
            : isSelected
            ? availabilityColor(section.availability)
            : `${availabilityColor(section.availability)}60`;
          const strokeColor = isSelected
            ? "#ffffff"
            : availabilityColor(section.availability);

          if (section.svgPathData) {
            return (
              <Path
                key={section.id}
                d={section.svgPathData}
                fill={fillColor}
                stroke={strokeColor}
                strokeWidth={isSelected ? 3 : 1.5}
                opacity={isSoldOut ? 0.4 : 1}
                onPress={() => {
                  if (!isSoldOut) onSelect(isSelected ? null : section.id);
                }}
              />
            );
          }

          return null;
        })}
      </Svg>
    </View>
  );
}

function BlockVenueMap({
  sections,
  selectedId,
  onSelect,
}: {
  sections: VenueSection[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <View style={blockStyles.container}>
      {sections.map((section) => {
        const isSelected = selectedId === section.id;
        const isSoldOut = section.availability === "sold_out";
        const bgColor = isSoldOut
          ? "#3f3f46"
          : isSelected
          ? availabilityColor(section.availability)
          : `${availabilityColor(section.availability)}40`;

        return (
          <Pressable
            key={section.id}
            onPress={() =>
              !isSoldOut && onSelect(isSelected ? null : section.id)
            }
            style={[
              blockStyles.block,
              {
                backgroundColor: bgColor,
                borderColor: isSelected
                  ? availabilityColor(section.availability)
                  : "transparent",
                opacity: isSoldOut ? 0.5 : 1,
              },
            ]}
          >
            <Text
              style={[
                blockStyles.blockText,
                { color: isSelected ? "#000" : "#fff" },
              ]}
            >
              {section.name}
            </Text>
          </Pressable>
        );
      })}
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
  const viewBox = event.venueMap?.svgViewBox ?? "";
  const hasSvgData = sections.some((s) => !!s.svgPathData);
  const selectedSection = sections.find((s) => s.id === selectedSectionId);

  const handleSelectTicketType = (tt: TicketType, section: VenueSection) => {
    router.push({
      pathname: "/ticket-quantity",
      params: {
        eventId: event.id,
        ticketTypeId: tt.id,
        ticketTypeName: tt.name,
        price: String(tt.price),
        serviceFee: String(tt.serviceFee),
        maxPerOrder: String(tt.maxPerOrder),
        currencyCode: event.currencyCode,
        eventName: event.name,
        sectionName: section.name,
        validDays: tt.validDays ? JSON.stringify(tt.validDays) : "",
      },
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
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

          {hasSvgData && viewBox ? (
            <SvgVenueMap
              viewBox={viewBox}
              sections={sections}
              selectedId={selectedSectionId}
              onSelect={setSelectedSectionId}
            />
          ) : (
            <BlockVenueMap
              sections={sections}
              selectedId={selectedSectionId}
              onSelect={setSelectedSectionId}
            />
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
              <View style={[styles.sectionDot, { backgroundColor: availabilityColor(section.availability) }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.sectionListName, { color: C.text }]}>{section.name}</Text>
                <Text style={[styles.sectionListPrice, { color: C.textSecondary }]}>
                  {t("events.from")} {formatCurrency(
                    Math.min(...section.ticketTypes.map((tt) => tt.price)),
                    event.currencyCode,
                  )}
                </Text>
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
    </View>
  );
}

const svgStyles = StyleSheet.create({
  container: {
    width: "100%",
    aspectRatio: 1.5,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#1a1a2e",
  },
  svg: {
    flex: 1,
  },
});

const blockStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
    paddingVertical: 16,
  },
  block: {
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 20,
    minWidth: "40%",
    alignItems: "center",
    justifyContent: "center",
  },
  blockText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
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
