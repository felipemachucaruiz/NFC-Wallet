import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAlert } from "@/components/CustomAlert";
import { useAddToWallet, useTicketDetail } from "@/hooks/useEventsApi";
import { Loading } from "@/components/ui/Loading";
import type { MyTicket } from "@/types/events";

function safeParseJson<T>(json: string | undefined): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

function getDateLocale(lang: string): string {
  return lang === "en" ? "en-US" : "es-CO";
}

function statusVariant(status: string): "success" | "warning" | "danger" | "muted" {
  if (status === "active") return "success";
  if (status === "used") return "muted";
  if (status === "cancelled") return "danger";
  return "warning";
}

export default function TicketDetailScreen() {
  const { t, i18n } = useTranslation();
  const locale = getDateLocale(i18n.language);
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { show: showAlert } = useAlert();

  const params = useLocalSearchParams<{ ticketId: string; ticketData: string }>();
  const passedTicket = safeParseJson<MyTicket>(params.ticketData);
  const ticketId = params.ticketId ?? passedTicket?.id ?? "";

  const { data: fetchedTicket, isPending: isFetching } = useTicketDetail(ticketId);
  const ticket: MyTicket | null = passedTicket ?? fetchedTicket ?? null;

  const { mutate: addToWallet, isPending: walletLoading } = useAddToWallet();
  const [qrExpanded, setQrExpanded] = useState(false);

  if (isFetching && !ticket) {
    return <Loading label={t("common.loading")} />;
  }

  if (!ticket) {
    return (
      <View style={[styles.container, { backgroundColor: C.background }]}>
        <View style={[styles.header, { paddingTop: isWeb ? 67 : insets.top + 8 }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={C.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: C.text }]}>{t("tickets.ticketDetail")}</Text>
          <View style={{ width: 30 }} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: C.textSecondary, textAlign: "center" }}>
            {t("common.error")}
          </Text>
        </View>
      </View>
    );
  }

  const startDate = new Date(ticket.startsAt);
  const isIOS = Platform.OS === "ios";
  const walletPlatform = isIOS ? "apple" : "google";
  const walletLabel = isIOS ? t("tickets.addAppleWallet") : t("tickets.addGoogleWallet");

  const handleAddToWallet = () => {
    addToWallet(
      { ticketId: ticket.id, platform: walletPlatform },
      {
        onSuccess: (result) => {
          if (result.passUrl) {
            Linking.openURL(result.passUrl).catch(() => {});
          }
        },
        onError: (err: unknown) => {
          const msg = (err as { message?: string }).message ?? t("common.unknownError");
          showAlert(t("common.error"), msg);
        },
      },
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <View style={[styles.header, { paddingTop: isWeb ? 67 : insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={C.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: C.text }]}>{t("tickets.ticketDetail")}</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}>
        <Pressable onPress={() => setQrExpanded(!qrExpanded)}>
          <Card style={{ alignItems: "center", gap: 12 }}>
            <View
              style={[
                styles.qrContainer,
                qrExpanded && styles.qrContainerExpanded,
                { backgroundColor: "#fff", borderColor: C.border },
              ]}
            >
              <QRCode
                value={ticket.qrCode}
                size={qrExpanded ? 240 : 160}
                backgroundColor="#fff"
                color="#000"
              />
            </View>
            <Text style={[styles.qrHint, { color: C.textMuted }]}>
              {t("tickets.tapToEnlarge")}
            </Text>
          </Card>
        </Pressable>

        <Card style={{ gap: 10 }}>
          <Text style={[styles.eventName, { color: C.text }]}>{ticket.eventName}</Text>
          <View style={styles.infoRow}>
            <Feather name="tag" size={14} color={C.primary} />
            <Text style={[styles.infoText, { color: C.primary }]}>
              {ticket.ticketTypeName}
              {ticket.sectionName ? ` · ${ticket.sectionName}` : ""}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Feather name="calendar" size={14} color={C.textSecondary} />
            <Text style={[styles.infoText, { color: C.text }]}>
              {startDate.toLocaleDateString(locale, {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Feather name="map-pin" size={14} color={C.textSecondary} />
            <Text style={[styles.infoText, { color: C.text }]}>{ticket.venueName}</Text>
          </View>
          <View style={{ marginTop: 4 }}>
            <Badge label={t(`tickets.status_${ticket.status}`)} variant={statusVariant(ticket.status)} />
          </View>
        </Card>

        {ticket.validDays && ticket.validDays.length > 0 && (
          <Card style={{ gap: 8 }}>
            <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>
              {t("tickets.validDaysTitle").toUpperCase()}
            </Text>
            {ticket.validDays.map((day) => {
              const isCheckedIn = ticket.checkedInDays?.includes(day.dayNumber);
              return (
                <View key={day.dayNumber} style={[styles.dayRow, { borderColor: C.border }]}>
                  <View
                    style={[
                      styles.dayIcon,
                      {
                        backgroundColor: isCheckedIn ? C.successLight : C.inputBg,
                      },
                    ]}
                  >
                    <Feather
                      name={isCheckedIn ? "check-circle" : "circle"}
                      size={16}
                      color={isCheckedIn ? C.success : C.textMuted}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.dayName, { color: C.text }]}>
                      {t("events.dayLabel", { n: day.dayNumber })} · {day.label}
                    </Text>
                    <Text style={[styles.dayDate, { color: C.textSecondary }]}>
                      {new Date(day.date).toLocaleDateString(locale, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </Text>
                  </View>
                  {isCheckedIn && (
                    <Badge label={t("tickets.checkedIn")} variant="success" size="sm" />
                  )}
                </View>
              );
            })}
          </Card>
        )}

        <Card style={{ gap: 8 }}>
          <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>
            {t("tickets.attendeeInfo").toUpperCase()}
          </Text>
          <View style={styles.infoRow}>
            <Feather name="user" size={14} color={C.textSecondary} />
            <Text style={[styles.infoText, { color: C.text }]}>{ticket.attendeeName}</Text>
          </View>
          <View style={styles.infoRow}>
            <Feather name="mail" size={14} color={C.textSecondary} />
            <Text style={[styles.infoText, { color: C.text }]}>{ticket.attendeeEmail}</Text>
          </View>
          <View style={styles.infoRow}>
            <Feather name="phone" size={14} color={C.textSecondary} />
            <Text style={[styles.infoText, { color: C.text }]}>{ticket.attendeePhone}</Text>
          </View>
        </Card>

        {Platform.OS !== "web" && (
          <Button
            title={walletLabel}
            onPress={handleAddToWallet}
            loading={walletLoading}
            variant="secondary"
            fullWidth
            icon={isIOS ? "smartphone" : "smartphone"}
          />
        )}
      </ScrollView>
    </View>
  );
}

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
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  scroll: { padding: 20, gap: 16 },
  qrContainer: {
    width: 200,
    height: 200,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  qrContainerExpanded: {
    width: 280,
    height: 280,
  },
  qrHint: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  eventName: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  infoText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  dayIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  dayName: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  dayDate: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
});
