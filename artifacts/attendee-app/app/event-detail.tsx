import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { useEventDetail } from "@/hooks/useEventsApi";
import { formatCurrency } from "@/utils/format";
import type { TicketAvailability } from "@/types/events";

function availabilityVariant(a: TicketAvailability): "success" | "warning" | "danger" {
  if (a === "available") return "success";
  if (a === "limited") return "warning";
  return "danger";
}

function getDateLocale(lang: string): string {
  return lang === "en" ? "en-US" : "es-CO";
}

export default function EventDetailScreen() {
  const { t, i18n } = useTranslation();
  const locale = getDateLocale(i18n.language);
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const params = useLocalSearchParams<{ eventId: string }>();
  const eventId = params.eventId ?? "";

  const { data: event, isPending, isError } = useEventDetail(eventId);

  const [flyerVisible, setFlyerVisible] = useState(false);

  if (isPending) return <Loading label={t("common.loading")} />;
  if (isError || !event) {
    return (
      <View style={[styles.container, { backgroundColor: C.background }]}>
        <View style={[styles.topBar, { paddingTop: isWeb ? 67 : insets.top + 8 }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={C.text} />
          </Pressable>
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: C.textSecondary }}>{t("common.error")}</Text>
        </View>
      </View>
    );
  }

  const allSoldOut = event.ticketTypes.every((tt) => tt.availability === "sold_out");
  const salesNotStarted = event.salesStartAt && new Date(event.salesStartAt) > new Date();

  const handleBuyTickets = () => {
    if (event.venueMap) {
      router.push({ pathname: "/venue-map", params: { eventId: event.id } });
    } else if (event.ticketTypes.length > 0) {
      const tt = event.ticketTypes.find((t) => t.availability !== "sold_out") ?? event.ticketTypes[0];
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
          sectionName: tt.sectionName ?? "",
          validDays: tt.validDays ? JSON.stringify(tt.validDays) : "",
        },
      });
    }
  };

  const openMaps = () => {
    if (!event.latitude || !event.longitude) return;
    const label = encodeURIComponent(event.venueName);
    const url =
      Platform.OS === "ios"
        ? `maps:0,0?q=${label}@${event.latitude},${event.longitude}`
        : `geo:${event.latitude},${event.longitude}?q=${event.latitude},${event.longitude}(${label})`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(
        `https://www.google.com/maps/search/?api=1&query=${event.latitude},${event.longitude}`,
      );
    });
  };

  const startDate = new Date(event.startsAt);

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>
        <View style={styles.heroWrap}>
          {event.coverImageUrl ? (
            <Image source={{ uri: event.coverImageUrl }} style={styles.heroImage} resizeMode="cover" />
          ) : (
            <View style={[styles.heroImage, { backgroundColor: C.inputBg }]} />
          )}
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.85)"]}
            style={styles.heroGradient}
          />
          <View style={[styles.heroContent, { paddingTop: isWeb ? 67 : insets.top + 8 }]}>
            <Pressable onPress={() => router.back()} style={styles.heroBackBtn}>
              <Feather name="arrow-left" size={22} color="#fff" />
            </Pressable>
          </View>
          <View style={styles.heroBottom}>
            <Text style={styles.heroTitle}>{event.name}</Text>
            <View style={styles.heroMeta}>
              <Feather name="calendar" size={14} color="rgba(255,255,255,0.8)" />
              <Text style={styles.heroMetaText}>
                {startDate.toLocaleDateString(locale, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
                {" · "}
                {startDate.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
              </Text>
            </View>
            <View style={styles.heroMeta}>
              <Feather name="map-pin" size={14} color="rgba(255,255,255,0.8)" />
              <Text style={styles.heroMetaText}>
                {event.venueName} · {event.city}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.body}>
          {event.flyerImageUrl && (
            <Pressable onPress={() => setFlyerVisible(true)}>
              <Card style={{ padding: 0, overflow: "hidden" }}>
                <Image
                  source={{ uri: event.flyerImageUrl }}
                  style={styles.flyerThumb}
                  resizeMode="cover"
                />
                <View style={styles.flyerOverlay}>
                  <Feather name="maximize-2" size={16} color="#fff" />
                  <Text style={styles.flyerOverlayText}>{t("events.viewFlyer")}</Text>
                </View>
              </Card>
            </Pressable>
          )}

          <Card style={{ gap: 10 }}>
            <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>
              {t("events.eventInfo").toUpperCase()}
            </Text>
            <InfoRow icon="tag" label={t(`events.category_${event.category}`)} color={C} />
            {event.minAge != null && event.minAge > 0 && (
              <InfoRow icon="alert-circle" label={`${t("events.minAge")}: ${event.minAge}+`} color={C} />
            )}
            <InfoRow icon="map-pin" label={event.venueAddress} color={C} />
          </Card>

          {event.multiDay && event.days && event.days.length > 0 && (
            <Card style={{ gap: 8 }}>
              <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>
                {t("events.schedule").toUpperCase()}
              </Text>
              {event.days.map((day) => (
                <View key={day.dayNumber} style={[styles.dayRow, { borderColor: C.border }]}>
                  <View style={[styles.dayBadge, { backgroundColor: C.primaryLight }]}>
                    <Text style={[styles.dayBadgeText, { color: C.primary }]}>
                      {t("events.dayLabel", { n: day.dayNumber })}
                    </Text>
                  </View>
                  <Text style={[styles.dayLabel, { color: C.text }]}>{day.label}</Text>
                  <Text style={[styles.dayDate, { color: C.textSecondary }]}>
                    {new Date(day.date).toLocaleDateString(locale, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </Text>
                </View>
              ))}
            </Card>
          )}

          {event.description && (
            <Card style={{ gap: 8 }}>
              <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>
                {t("events.details").toUpperCase()}
              </Text>
              {event.description.split("\n").map((paragraph, idx) => (
                <Text key={idx} style={[styles.descriptionText, { color: C.text }]}>
                  {paragraph}
                </Text>
              ))}
            </Card>
          )}

          {event.latitude != null && event.longitude != null && (
            <Card style={{ padding: 0, overflow: "hidden" }}>
              <Pressable onPress={openMaps}>
                <Image
                  source={{
                    uri: `https://maps.googleapis.com/maps/api/staticmap?center=${event.latitude},${event.longitude}&zoom=15&size=600x200&markers=color:red%7C${event.latitude},${event.longitude}&key=`,
                  }}
                  style={styles.mapImage}
                  resizeMode="cover"
                />
                <View style={styles.mapFallback}>
                  <Feather name="map" size={24} color={C.primary} />
                  <Text style={[styles.mapText, { color: C.primary }]}>
                    {t("events.openMaps")}
                  </Text>
                </View>
              </Pressable>
            </Card>
          )}

          <Card style={{ gap: 8 }}>
            <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>
              {t("events.pricing").toUpperCase()}
            </Text>
            {event.ticketTypes.map((tt) => (
              <View key={tt.id} style={[styles.pricingRow, { borderColor: C.border }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.pricingName, { color: C.text }]}>{tt.name}</Text>
                  {tt.sectionName && (
                    <Text style={[styles.pricingSection, { color: C.textMuted }]}>
                      {tt.sectionName}
                    </Text>
                  )}
                  {tt.validDays && tt.validDays.length > 0 && (
                    <Text style={[styles.pricingDays, { color: C.textSecondary }]}>
                      {t("events.validDays")}: {tt.validDays.map((d) => t("events.dayLabel", { n: d })).join(", ")}
                    </Text>
                  )}
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <Text style={[styles.pricingPrice, { color: C.text }]}>
                    {formatCurrency(tt.price, event.currencyCode)}
                  </Text>
                  <Badge
                    label={t(`events.availability_${tt.availability}`)}
                    variant={availabilityVariant(tt.availability)}
                    size="sm"
                  />
                </View>
              </View>
            ))}
          </Card>
        </View>
      </ScrollView>

      {!salesNotStarted && (
        <View style={[styles.ctaBar, { paddingBottom: insets.bottom + 16, backgroundColor: C.background }]}>
          <Button
            title={allSoldOut ? t("events.soldOut") : t("events.buyTickets")}
            onPress={handleBuyTickets}
            disabled={allSoldOut}
            variant="primary"
            fullWidth
            size="lg"
          />
        </View>
      )}

      <Modal visible={flyerVisible} transparent animationType="fade">
        <View style={styles.flyerModal}>
          <Pressable style={styles.flyerModalClose} onPress={() => setFlyerVisible(false)}>
            <Feather name="x" size={28} color="#fff" />
          </Pressable>
          {event.flyerImageUrl && (
            <Image
              source={{ uri: event.flyerImageUrl }}
              style={styles.flyerFullImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

function InfoRow({ icon, label, color: C }: { icon: React.ComponentProps<typeof Feather>["name"]; label: string; color: typeof Colors.dark }) {
  return (
    <View style={styles.infoRow}>
      <Feather name={icon} size={14} color={C.textSecondary} />
      <Text style={[styles.infoRowText, { color: C.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { paddingHorizontal: 20, paddingBottom: 8 },
  backBtn: { padding: 4 },
  heroWrap: { position: "relative", height: 320 },
  heroImage: { width: "100%", height: "100%" },
  heroGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 200,
  },
  heroContent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
  },
  heroBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    gap: 6,
  },
  heroTitle: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    lineHeight: 30,
  },
  heroMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  heroMetaText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.8)",
  },
  body: { padding: 20, gap: 16 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  infoRowText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  dayBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  dayBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  dayLabel: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    flex: 1,
  },
  dayDate: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  descriptionText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
  },
  mapImage: {
    width: "100%",
    height: 150,
  },
  mapFallback: {
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    justifyContent: "center",
  },
  mapText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  pricingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 12,
  },
  pricingName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  pricingSection: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  pricingDays: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  pricingPrice: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  ctaBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
  },
  flyerThumb: {
    width: "100%",
    height: 200,
  },
  flyerOverlay: {
    position: "absolute",
    bottom: 8,
    right: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  flyerOverlayText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  flyerModal: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  flyerModalClose: {
    position: "absolute",
    top: 50,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  flyerFullImage: {
    width: "90%",
    height: "80%",
  },
});
