import { Image } from 'expo-image';
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Loading } from "@/components/ui/Loading";
import { useEventDetail } from "@/hooks/useEventsApi";
import { formatCurrency } from "@/utils/format";
import type { TicketAvailability } from "@/types/events";

// ─── Palette ─────────────────────────────────────────────────────────────────
const CYAN = "#00f1ff";
const DARK_BG = "#0a0a0a";
const CARD_BG = "rgba(17,17,17,0.80)";
const CARD_BORDER = "rgba(255,255,255,0.08)";
const TEXT = "#ffffff";
const TEXT_SECONDARY = "rgba(255,255,255,0.60)";
const TEXT_MUTED = "rgba(255,255,255,0.35)";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function seededRand(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

function extractVimeoId(url: string): string | null {
  const match = url.match(/(?:vimeo\.com\/(?:[^/]+\/)*)(\d+)/);
  if (match) return match[1];
  if (/^\d+$/.test(url.trim())) return url.trim();
  return null;
}

function availabilityVariant(a: TicketAvailability): "success" | "warning" | "danger" {
  if (a === "available") return "success";
  if (a === "limited") return "warning";
  return "danger";
}

function getDateLocale(lang: string): string {
  return lang === "en" ? "en-US" : "es-CO";
}

// ─── Floating Graphics ────────────────────────────────────────────────────────
interface FloatingItemData {
  url: string;
  opacity: number;
  left: number;
  top: number;
  size: number;
  // 4 waypoints for x, y, rotation — mirrors web CSS keyframe variants
  xs: [number, number, number, number];
  ys: [number, number, number, number];
  rots: [number, number, number, number];
  // duration per segment (ms)
  segDur: [number, number, number, number];
  delay: number;
}

const EASING = Easing.inOut(Easing.sin);

function FloatingGraphicItem({ item }: { item: FloatingItemData }) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const rot = useSharedValue(0);

  useEffect(() => {
    const makeSeq = (vals: [number, number, number, number]) =>
      withRepeat(
        withSequence(
          withTiming(vals[0], { duration: item.segDur[0], easing: EASING }),
          withTiming(vals[1], { duration: item.segDur[1], easing: EASING }),
          withTiming(vals[2], { duration: item.segDur[2], easing: EASING }),
          withTiming(vals[3], { duration: item.segDur[3], easing: EASING }),
        ),
        -1,
        false,
      );

    tx.value = withDelay(item.delay, makeSeq(item.xs));
    ty.value = withDelay(item.delay, makeSeq(item.ys));
    rot.value = withDelay(item.delay, makeSeq(item.rots));
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { rotate: `${rot.value}deg` },
    ],
  }));

  return (
    <Animated.Image
      source={{ uri: item.url }}
      style={[
        {
          position: "absolute",
          left: `${item.left}%` as any,
          top: `${item.top}%` as any,
          width: item.size,
          height: item.size,
          opacity: item.opacity,
        },
        animStyle,
      ]}
      resizeMode="contain"
    />
  );
}

function FloatingGraphics({ graphics }: { graphics: Array<{ url: string; opacity: number }> }) {
  const items = useMemo<FloatingItemData[]>(() =>
    graphics.flatMap((g, gi) =>
      Array.from({ length: 8 }, (_, i) => {
        const r = (o: number) => seededRand((gi * 100 + i) * 7 + o);
        // Total duration 24–44 s, split into 4 segments with slight variation
        const totalMs = (24 + r(4) * 20) * 1000;
        const s0 = totalMs * (0.20 + r(20) * 0.05);
        const s1 = totalMs * (0.25 + r(21) * 0.05);
        const s2 = totalMs * (0.20 + r(22) * 0.05);
        const s3 = totalMs - s0 - s1 - s2;
        return {
          url: g.url,
          opacity: g.opacity,
          left: r(0) * 92,
          top: r(1) * 92,
          size: 34 + r(2) * 50,
          delay: r(5) * 14000,
          // x: alternating directions like web keyframes
          xs: [
            (r(6) - 0.5) * 56,
            (r(7) - 0.5) * 84,
            (r(8) - 0.5) * 42,
            0,
          ],
          // y: always drifts upward (negative), returns to 0
          ys: [
            -r(9) * 48,
            -r(10) * 82,
            -r(11) * 58,
            0,
          ],
          // rotation: alternating sign
          rots: [
            (r(12) - 0.5) * 32,
            (r(13) - 0.5) * 44,
            (r(14) - 0.5) * 28,
            0,
          ],
          segDur: [s0, s1, s2, s3],
        };
      }),
    ),
  [graphics]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {items.map((item, i) => (
        <FloatingGraphicItem key={i} item={item} />
      ))}
    </View>
  );
}

// ─── Rich Text (WebView-based) ─────────────────────────────────────────────────
function RichTextView({ html }: { html: string }) {
  const [height, setHeight] = useState(0);

  const styledHtml = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><style>
    * { box-sizing: border-box; }
    body { margin:0; padding:0; background:transparent; color:rgba(255,255,255,0.75);
      font-family:-apple-system,Helvetica,sans-serif; font-size:14px; line-height:22px; }
    h1,h2,h3 { color:#fff; margin-top:16px; margin-bottom:8px; }
    strong,b { color:#fff; }
    a { color:${CYAN}; }
    p { margin:0 0 10px; }
    ul,ol { padding-left:20px; margin:0 0 10px; }
    li { margin-bottom:4px; }
    img { max-width:100%; border-radius:8px; }
  </style></head><body>${html}</body></html>`;

  return (
    <WebView
      originWhitelist={["*"]}
      source={{ html: styledHtml }}
      style={{ height: Math.max(height, 10), backgroundColor: "transparent" }}
      scrollEnabled={false}
      showsVerticalScrollIndicator={false}
      onMessage={(e) => setHeight(Number(e.nativeEvent.data) + 8)}
      injectedJavaScript="window.ReactNativeWebView.postMessage(document.documentElement.scrollHeight + '');"
    />
  );
}

// ─── Vimeo Player ─────────────────────────────────────────────────────────────
function VimeoPlayer({ videoId, title }: { videoId: string; title: string }) {
  const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#000}iframe{display:block;width:100%;height:100vh;border:0}</style></head><body><iframe src="https://player.vimeo.com/video/${videoId}?color=00f1ff&title=0&byline=0&portrait=0&dnt=1" allow="autoplay;fullscreen;picture-in-picture" allowfullscreen title="${title.replace(/"/g, "")}"></iframe></body></html>`;
  return (
    <WebView
      originWhitelist={["*"]}
      source={{ html }}
      style={styles.videoPlayer}
      allowsFullscreenVideo
      mediaPlaybackRequiresUserAction={false}
    />
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function EventDetailScreen() {
  const { t, i18n } = useTranslation();
  const locale = getDateLocale(i18n.language);
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const params = useLocalSearchParams<{ eventId: string }>();
  const eventId = params.eventId ?? "";

  const { data: event, isPending, isError } = useEventDetail(eventId);
  const [flyerVisible, setFlyerVisible] = useState(false);

  if (isPending) return <Loading label={t("common.loading")} />;
  if (isError || !event) {
    return (
      <View style={[styles.container, { backgroundColor: DARK_BG }]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 24 }}>
          <Feather name="wifi-off" size={40} color={TEXT_MUTED} />
          <Text style={{ color: TEXT_SECONDARY, textAlign: "center", fontSize: 15, fontFamily: "Inter_500Medium" }}>
            {t("common.loadError", "No se pudo cargar el evento")}
          </Text>
          <Pressable onPress={() => router.back()} style={styles.errorBack}>
            <Text style={{ color: DARK_BG, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>
              {t("common.goBack", "Volver")}
            </Text>
          </Pressable>
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
      const tt = event.ticketTypes.find((x) => x.availability !== "sold_out") ?? event.ticketTypes[0];
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
          isNumberedUnits: tt.isNumberedUnits ? "1" : "0",
          ticketsPerUnit: String(tt.ticketsPerUnit ?? 1),
          unitLabel: tt.unitLabel ?? "",
          units: tt.units ? JSON.stringify(tt.units) : "[]",
        },
      });
    }
  };

  const openMaps = () => {
    if (!event.latitude || !event.longitude) return;
    const label = encodeURIComponent(event.venueName);
    const url = Platform.OS === "ios"
      ? `maps:0,0?q=${label}@${event.latitude},${event.longitude}`
      : `geo:${event.latitude},${event.longitude}?q=${event.latitude},${event.longitude}(${label})`;
    Linking.openURL(url).catch(() =>
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${event.latitude},${event.longitude}`),
    );
  };

  const bgUrl = event.flyerImageUrl ?? event.coverImageUrl;
  const startDate = new Date(event.startsAt);
  const doorsTime = event.doorsOpenAt
    ? new Date(event.doorsOpenAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })
    : null;
  const vimeoId = event.vimeoUrl ? extractVimeoId(event.vimeoUrl) : null;

  return (
    <View style={styles.container}>
      {/* ── Fixed blurred background ── */}
      <View style={StyleSheet.absoluteFill}>
        {bgUrl ? (
          <Image
            source={{ uri: bgUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            blurRadius={22}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: DARK_BG }]} />
        )}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.78)" }]} />
      </View>

      {/* ── Floating graphics ── */}
      {event.floatingGraphics?.length ? (
        <View style={[StyleSheet.absoluteFill, { zIndex: 1 }]} pointerEvents="none">
          <FloatingGraphics graphics={event.floatingGraphics} />
        </View>
      ) : null}

      {/* ── Scrollable content ── */}
      <ScrollView
        style={{ zIndex: 2 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.heroWrap}>
          {event.coverImageUrl ? (
            <Image
              source={{ uri: event.coverImageUrl }}
              style={styles.heroImage}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.heroImage, { backgroundColor: "#111" }]} />
          )}
          <LinearGradient
            colors={["rgba(0,0,0,0)", "rgba(0,0,0,0)", "rgba(0,0,0,0.55)", DARK_BG]}
            locations={[0, 0.45, 0.75, 1]}
            style={styles.heroGradient}
          />
          {/* Back button */}
          <View style={[styles.heroTop, { paddingTop: isWeb ? 67 : insets.top + 8 }]}>
            <Pressable onPress={() => router.back()} style={styles.heroBackBtn}>
              <Feather name="arrow-left" size={22} color="#fff" />
            </Pressable>
          </View>
          {/* Title + meta */}
          <View style={styles.heroBottom}>
            <Text style={styles.heroTitle}>{event.name}</Text>
            <View style={styles.heroMeta}>
              <Feather name="calendar" size={13} color={CYAN} />
              <Text style={styles.heroMetaText}>
                {startDate.toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                {" · "}
                {startDate.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
              </Text>
            </View>
            <View style={styles.heroMeta}>
              <Feather name="map-pin" size={13} color={CYAN} />
              <Text style={styles.heroMetaText}>{event.venueName}{event.city ? ` · ${event.city}` : ""}</Text>
            </View>
          </View>
        </View>

        <View style={styles.body}>
          {/* Flyer thumbnail */}
          {event.flyerImageUrl && (
            <Pressable onPress={() => setFlyerVisible(true)}>
              <View style={styles.glassCard}>
                <Image source={{ uri: event.flyerImageUrl }} style={styles.flyerThumb} contentFit="cover" />
                <LinearGradient colors={["transparent", "rgba(0,0,0,0.7)"]} style={styles.flyerGradient} />
                <View style={styles.flyerOverlay}>
                  <Feather name="maximize-2" size={14} color="#fff" />
                  <Text style={styles.flyerOverlayText}>{t("events.viewFlyer")}</Text>
                </View>
              </View>
            </Pressable>
          )}

          {/* Info grid: date, doors, age */}
          <View style={styles.glassCard}>
            <Text style={styles.sectionLabel}>{t("events.eventInfo").toUpperCase()}</Text>
            <View style={styles.infoGrid}>
              <InfoItem icon="calendar" label={t("event.date", "Fecha")} value={
                event.days && event.days.length > 0
                  ? event.days.map((d) => new Date(d.date).toLocaleDateString(locale, { day: "numeric", month: "short" })).join(", ")
                  : startDate.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })
              } />
              {doorsTime && (
                <InfoItem icon="log-in" label={t("event.doorOpening", "Apertura de Puertas")} value={doorsTime} />
              )}
              <InfoItem
                icon="shield"
                label={t("event.minAge", "Edad Mínima")}
                value={event.minAge ? `${event.minAge}+` : t("event.allAges", "Todas las edades")}
              />
              <InfoItem icon="tag" label={t("events.category")} value={t(`events.category_${event.category}`, event.category)} />
            </View>
          </View>

          {/* Promoter / Pulep */}
          {(event.promoterCompanyName || event.promoterNit || event.pulepId) && (
            <View style={styles.glassCard}>
              <Text style={styles.sectionLabel}>{t("event.promoter", "Responsable").toUpperCase()}</Text>
              <View style={styles.infoGrid}>
                {event.promoterCompanyName && (
                  <InfoItem icon="briefcase" label={t("event.promoter", "Responsable")} value={event.promoterCompanyName} />
                )}
                {event.promoterNit && (
                  <InfoItem icon="hash" label="NIT" value={event.promoterNit} />
                )}
                {event.pulepId && (
                  <InfoItem icon="info" label="Pulep" value={event.pulepId} />
                )}
              </View>
            </View>
          )}

          {/* Description — rich text via WebView */}
          {event.description && event.description.trim().length > 0 && (
            <View style={styles.glassCard}>
              <Text style={styles.sectionLabel}>{t("events.details").toUpperCase()}</Text>
              {event.description.includes("<") ? (
                <RichTextView html={event.description} />
              ) : (
                <Text style={styles.plainText}>{event.description}</Text>
              )}
            </View>
          )}

          {/* Vimeo video */}
          {vimeoId && (
            <View style={styles.glassCard}>
              <Text style={styles.sectionLabel}>{t("event.video", "Video").toUpperCase()}</Text>
              <View style={styles.videoWrap}>
                <VimeoPlayer videoId={vimeoId} title={event.name} />
              </View>
            </View>
          )}

          {/* Multi-day schedule */}
          {event.multiDay && event.days && event.days.length > 0 && (
            <View style={styles.glassCard}>
              <Text style={styles.sectionLabel}>{t("events.schedule").toUpperCase()}</Text>
              {event.days.map((day) => (
                <View key={day.dayNumber} style={styles.dayRow}>
                  <View style={styles.dayBadge}>
                    <Text style={styles.dayBadgeText}>{t("events.dayLabel", { n: day.dayNumber })}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dayLabel}>{day.label}</Text>
                    <Text style={styles.dayDate}>
                      {new Date(day.date).toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" })}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Location */}
          {event.latitude != null && event.longitude != null && (
            <Pressable onPress={openMaps}>
              <View style={[styles.glassCard, styles.locationRow]}>
                <View style={styles.locationIcon}>
                  <Feather name="map-pin" size={20} color={CYAN} />
                </View>
                <View style={{ flex: 1 }}>
                  {event.venueName ? <Text style={styles.locationName}>{event.venueName}</Text> : null}
                  {event.venueAddress ? <Text style={styles.locationAddress}>{event.venueAddress}</Text> : null}
                </View>
                <Feather name="external-link" size={16} color={TEXT_MUTED} />
              </View>
            </Pressable>
          )}

          {/* Ticket pricing */}
          {event.ticketTypes.length > 0 && (
            <View style={styles.glassCard}>
              <Text style={styles.sectionLabel}>{t("events.pricing").toUpperCase()}</Text>
              {event.ticketTypes.map((tt) => (
                <View key={tt.id} style={styles.pricingRow}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.pricingName}>{tt.name}</Text>
                    {tt.sectionName && <Text style={styles.pricingSection}>{tt.sectionName}</Text>}
                    {tt.validDays && tt.validDays.length > 0 && (
                      <Text style={styles.pricingDays}>
                        {t("events.validDays")}: {tt.validDays.map((d) => t("events.dayLabel", { n: d })).join(", ")}
                      </Text>
                    )}
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <Text style={styles.pricingPrice}>{formatCurrency(tt.price, event.currencyCode)}</Text>
                    <Badge
                      label={t(`events.availability_${tt.availability}`)}
                      variant={availabilityVariant(tt.availability)}
                      size="sm"
                    />
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── Fixed CTA ── */}
      {!salesNotStarted && (
        <View style={[styles.ctaBar, { paddingBottom: insets.bottom + 16, zIndex: 3 }]}>
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

      {/* ── Flyer modal ── */}
      <Modal visible={flyerVisible} transparent animationType="fade">
        <View style={styles.flyerModal}>
          <Pressable style={styles.flyerModalClose} onPress={() => setFlyerVisible(false)}>
            <Feather name="x" size={28} color="#fff" />
          </Pressable>
          {event.flyerImageUrl && (
            <Image source={{ uri: event.flyerImageUrl }} style={styles.flyerFullImage} contentFit="contain" />
          )}
        </View>
      </Modal>
    </View>
  );
}

// ─── InfoItem ─────────────────────────────────────────────────────────────────
function InfoItem({ icon, label, value }: { icon: React.ComponentProps<typeof Feather>["name"]; label: string; value: string }) {
  return (
    <View style={styles.infoItem}>
      <View style={styles.infoItemBorder} />
      <View style={{ flex: 1 }}>
        <Text style={styles.infoItemLabel}>{label}</Text>
        <Text style={styles.infoItemValue} numberOfLines={2}>{value}</Text>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DARK_BG },

  heroWrap: { position: "relative", height: 340 },
  heroImage: { width: "100%", height: "100%" },
  heroGradient: { position: "absolute", left: 0, right: 0, bottom: 0, height: 220 },
  heroTop: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: 20 },
  heroBackBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center", justifyContent: "center",
  },
  heroBottom: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 20, gap: 6 },
  heroTitle: { fontSize: 26, fontFamily: "Inter_700Bold", color: TEXT, lineHeight: 32 },
  heroMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  heroMetaText: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)", flex: 1 },

  body: { padding: 16, gap: 12 },

  glassCard: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 16,
    padding: 16,
    overflow: "hidden",
  },

  sectionLabel: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.9,
    color: TEXT_SECONDARY,
    marginBottom: 12,
  },

  infoGrid: { gap: 10 },
  infoItem: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  infoItemBorder: { width: 2, borderRadius: 1, backgroundColor: CYAN, alignSelf: "stretch" },
  infoItemLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: TEXT_SECONDARY, textTransform: "uppercase", letterSpacing: 0.5 },
  infoItemValue: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: TEXT, marginTop: 1 },

  plainText: { fontSize: 14, fontFamily: "Inter_400Regular", color: TEXT_SECONDARY, lineHeight: 22 },

  videoWrap: { width: "100%", aspectRatio: 16 / 9, borderRadius: 12, overflow: "hidden", backgroundColor: "#000" },
  videoPlayer: { flex: 1, backgroundColor: "#000" },

  dayRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: CARD_BORDER },
  dayBadge: { backgroundColor: "rgba(0,241,255,0.10)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  dayBadgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: CYAN },
  dayLabel: { fontSize: 14, fontFamily: "Inter_500Medium", color: TEXT },
  dayDate: { fontSize: 12, fontFamily: "Inter_400Regular", color: TEXT_SECONDARY },

  locationRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  locationIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: "rgba(0,241,255,0.10)", alignItems: "center", justifyContent: "center" },
  locationName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: TEXT },
  locationAddress: { fontSize: 12, fontFamily: "Inter_400Regular", color: TEXT_SECONDARY, marginTop: 2 },

  pricingRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: CARD_BORDER, gap: 12 },
  pricingName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: TEXT },
  pricingSection: { fontSize: 12, fontFamily: "Inter_400Regular", color: TEXT_SECONDARY },
  pricingDays: { fontSize: 11, fontFamily: "Inter_400Regular", color: TEXT_SECONDARY },
  pricingPrice: { fontSize: 16, fontFamily: "Inter_700Bold", color: CYAN },

  ctaBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: "rgba(10,10,10,0.92)",
    borderTopWidth: 1, borderTopColor: CARD_BORDER,
  },

  flyerThumb: { width: "100%", height: 200 },
  flyerGradient: { position: "absolute", bottom: 0, left: 0, right: 0, height: 80 },
  flyerOverlay: {
    position: "absolute", bottom: 10, right: 10,
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(0,0,0,0.65)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
  },
  flyerOverlayText: { color: "#fff", fontSize: 12, fontFamily: "Inter_500Medium" },

  flyerModal: { flex: 1, backgroundColor: "rgba(0,0,0,0.95)", justifyContent: "center", alignItems: "center" },
  flyerModalClose: { position: "absolute", top: 50, right: 20, zIndex: 10, padding: 8 },
  flyerFullImage: { width: "90%", height: "80%" },

  errorBack: { backgroundColor: CYAN, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
});
