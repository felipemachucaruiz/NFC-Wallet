import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useAlert } from "@/components/CustomAlert";
import { useAddToWallet, useTicketDetail, useTransferTicket } from "@/hooks/useEventsApi";
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

function extractDominantColorFromCanvas(
  imageUri: string,
  callback: (color: string) => void,
) {
  if (Platform.OS !== "web") {
    callback("rgba(90,50,180,0.35)");
    return;
  }
  const img = new (window as any).Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 20;
      canvas.height = 20;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, 20, 20);
      const data = ctx.getImageData(0, 0, 20, 20).data;
      let r = 0, g = 0, b = 0, count = 0;
      for (let i = 0; i < data.length; i += 4) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        count++;
      }
      r = Math.round(r / count);
      g = Math.round(g / count);
      b = Math.round(b / count);
      callback(`rgba(${r},${g},${b},0.45)`);
    } catch {
      callback("rgba(90,50,180,0.35)");
    }
  };
  img.onerror = () => callback("rgba(90,50,180,0.35)");
  img.src = imageUri;
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

  const skipFetch = !!passedTicket;
  const { data: fetchedTicket, isPending: isFetching } = useTicketDetail(skipFetch ? "" : ticketId);
  const ticket: MyTicket | null = passedTicket ?? fetchedTicket ?? null;

  const { mutate: addToWallet, isPending: walletLoading } = useAddToWallet();
  const { mutate: transferTicket, isPending: transferLoading } = useTransferTicket();
  const [qrExpanded, setQrExpanded] = useState(false);
  const [dominantColor, setDominantColor] = useState("rgba(90,50,180,0.35)");
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferName, setTransferName] = useState("");
  const [transferEmail, setTransferEmail] = useState("");
  const [transferPhone, setTransferPhone] = useState("");

  useEffect(() => {
    if (ticket?.eventCoverImageUrl) {
      extractDominantColorFromCanvas(ticket.eventCoverImageUrl, setDominantColor);
    }
  }, [ticket?.eventCoverImageUrl]);

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

  const handleTransfer = () => {
    if (!transferName.trim() || !transferEmail.trim()) return;
    transferTicket(
      {
        ticketId: ticket!.id,
        recipientName: transferName.trim(),
        recipientEmail: transferEmail.trim(),
        recipientPhone: transferPhone.trim() || undefined,
      },
      {
        onSuccess: () => {
          setShowTransfer(false);
          setTransferName("");
          setTransferEmail("");
          setTransferPhone("");
          showAlert(
            t("tickets.transferSuccess", "Transferida"),
            t("tickets.transferSuccessMsg", "La entrada ha sido transferida exitosamente."),
          );
          router.back();
        },
        onError: (err: unknown) => {
          const msg = (err as { message?: string }).message ?? t("common.unknownError");
          showAlert(t("common.error"), msg);
        },
      },
    );
  };

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

  const hasImage = !!ticket.eventCoverImageUrl;

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <View style={[styles.header, { paddingTop: isWeb ? 67 : insets.top + 8, zIndex: 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <Text style={[styles.headerTitle, { color: "#fff" }]}>{t("tickets.eTicket", "E-Ticket")}</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}>
        <View style={[styles.ticketCard, { backgroundColor: "#111111" }]}>
          <View style={[styles.imageSection, { backgroundColor: dominantColor }]}>
            {hasImage ? (
              <Image
                source={{ uri: ticket.eventCoverImageUrl }}
                style={styles.heroImage}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.heroImage, { backgroundColor: dominantColor }]}>
                <Feather name="music" size={48} color="rgba(255,255,255,0.3)" />
              </View>
            )}
            <View style={styles.imageOverlay} />
          </View>

          {ticket.qrCode ? (
            <Pressable
              onPress={() => setQrExpanded(!qrExpanded)}
              style={styles.qrSection}
            >
              <View style={[styles.qrBox, qrExpanded && styles.qrBoxExpanded]}>
                <QRCode
                  value={ticket.qrCode}
                  size={qrExpanded ? 220 : 160}
                  backgroundColor="#fff"
                  color="#000"
                />
              </View>
              <Text style={styles.qrHint}>
                {t("tickets.tapToEnlarge")}
              </Text>
            </Pressable>
          ) : (
            <View style={styles.qrSection}>
              <View style={styles.qrBox}>
                <Feather name="alert-circle" size={40} color="rgba(0,0,0,0.3)" />
              </View>
            </View>
          )}

          <View style={styles.separator}>
            <View style={[styles.separatorCircle, styles.separatorCircleLeft, { backgroundColor: C.background }]} />
            <View style={styles.separatorLine} />
            <View style={[styles.separatorCircle, styles.separatorCircleRight, { backgroundColor: C.background }]} />
          </View>

          <View style={styles.detailsSection}>
            <Text style={styles.eventName}>{ticket.eventName}</Text>
            <View style={styles.infoRow}>
              <Feather name="map-pin" size={14} color="rgba(255,255,255,0.5)" />
              <Text style={styles.infoText}>{ticket.venueName}</Text>
            </View>

            <View style={styles.dateTimeRow}>
              <View style={styles.dateTimeItem}>
                <Text style={styles.dateTimeLabel}>{t("tickets.dateLabel", "Fecha")}</Text>
                <Text style={styles.dateTimeValue}>
                  {startDate.toLocaleDateString(locale, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </Text>
              </View>
              <View style={styles.dateTimeItem}>
                <Text style={styles.dateTimeLabel}>{t("tickets.timeLabel", "Hora")}</Text>
                <Text style={styles.dateTimeValue}>
                  {startDate.toLocaleTimeString(locale, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
            </View>

            <View style={styles.ticketTypeRow}>
              <View style={styles.ticketTypeBadge}>
                <Feather name="tag" size={12} color={C.primary} />
                <Text style={[styles.ticketTypeText, { color: C.primary }]}>
                  {ticket.ticketTypeName}
                  {ticket.sectionName ? ` · ${ticket.sectionName}` : ""}
                </Text>
              </View>
              <Badge label={t(`tickets.status_${ticket.status}`)} variant={statusVariant(ticket.status)} size="sm" />
            </View>
          </View>

          {ticket.validDays && ticket.validDays.length > 0 && (
            <View style={styles.daysSection}>
              <Text style={styles.sectionLabel}>
                {t("tickets.validDaysTitle").toUpperCase()}
              </Text>
              {ticket.validDays.map((day) => {
                const isCheckedIn = ticket.checkedInDays?.includes(day.dayNumber);
                return (
                  <View key={day.dayNumber} style={styles.dayRow}>
                    <View
                      style={[
                        styles.dayIcon,
                        {
                          backgroundColor: isCheckedIn ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.05)",
                        },
                      ]}
                    >
                      <Feather
                        name={isCheckedIn ? "check-circle" : "circle"}
                        size={14}
                        color={isCheckedIn ? "#22c55e" : "rgba(255,255,255,0.3)"}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.dayName}>
                        {t("events.dayLabel", { n: day.dayNumber })} · {day.label}
                      </Text>
                      <Text style={styles.dayDate}>
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
            </View>
          )}

          <View style={styles.attendeeSection}>
            <Text style={styles.sectionLabel}>
              {t("tickets.attendeeInfo").toUpperCase()}
            </Text>
            <View style={styles.infoRow}>
              <Feather name="user" size={14} color="rgba(255,255,255,0.5)" />
              <Text style={styles.infoText}>{ticket.attendeeName}</Text>
            </View>
            <View style={styles.infoRow}>
              <Feather name="mail" size={14} color="rgba(255,255,255,0.5)" />
              <Text style={styles.infoText}>{ticket.attendeeEmail}</Text>
            </View>
            {ticket.attendeePhone && (
              <View style={styles.infoRow}>
                <Feather name="phone" size={14} color="rgba(255,255,255,0.5)" />
                <Text style={styles.infoText}>{ticket.attendeePhone}</Text>
              </View>
            )}
          </View>
        </View>

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

        {ticket.status === "active" && (
          <Pressable
            onPress={() => setShowTransfer(true)}
            style={[styles.transferBtn, { borderColor: "rgba(255,255,255,0.15)" }]}
          >
            <Feather name="send" size={16} color="rgba(255,255,255,0.7)" />
            <Text style={styles.transferBtnText}>
              {t("tickets.transferTicket", "Transferir entrada")}
            </Text>
          </Pressable>
        )}
      </ScrollView>

      <Modal
        visible={showTransfer}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTransfer(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setShowTransfer(false)}>
            <Pressable style={[styles.modalContent, { backgroundColor: C.card }]} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalHandle} />
              <Text style={[styles.modalTitle, { color: C.text }]}>
                {t("tickets.transferTicket", "Transferir entrada")}
              </Text>
              <Text style={[styles.modalSubtitle, { color: C.textSecondary }]}>
                {t("tickets.transferDesc", "Ingresa los datos de la persona a quien deseas transferir esta entrada.")}
              </Text>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: C.textSecondary }]}>
                  {t("tickets.recipientName", "Nombre")} *
                </Text>
                <TextInput
                  style={[styles.input, { color: C.text, borderColor: "rgba(255,255,255,0.15)", backgroundColor: "rgba(255,255,255,0.05)" }]}
                  value={transferName}
                  onChangeText={setTransferName}
                  placeholder={t("tickets.recipientNamePlaceholder", "Nombre completo")}
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  autoCapitalize="words"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: C.textSecondary }]}>
                  {t("tickets.recipientEmail", "Correo electrónico")} *
                </Text>
                <TextInput
                  style={[styles.input, { color: C.text, borderColor: "rgba(255,255,255,0.15)", backgroundColor: "rgba(255,255,255,0.05)" }]}
                  value={transferEmail}
                  onChangeText={setTransferEmail}
                  placeholder="correo@ejemplo.com"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: C.textSecondary }]}>
                  {t("tickets.recipientPhone", "Teléfono (WhatsApp)")}
                </Text>
                <TextInput
                  style={[styles.input, { color: C.text, borderColor: "rgba(255,255,255,0.15)", backgroundColor: "rgba(255,255,255,0.05)" }]}
                  value={transferPhone}
                  onChangeText={setTransferPhone}
                  placeholder="+57 300 123 4567"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  keyboardType="phone-pad"
                />
              </View>

              <Pressable
                onPress={handleTransfer}
                disabled={transferLoading || !transferName.trim() || !transferEmail.trim()}
                style={[
                  styles.transferConfirmBtn,
                  (!transferName.trim() || !transferEmail.trim()) && { opacity: 0.5 },
                ]}
              >
                {transferLoading ? (
                  <ActivityIndicator color="#000" size="small" />
                ) : (
                  <>
                    <Feather name="send" size={16} color="#000" />
                    <Text style={styles.transferConfirmText}>
                      {t("tickets.confirmTransfer", "Transferir")}
                    </Text>
                  </>
                )}
              </Pressable>

              <Pressable onPress={() => setShowTransfer(false)} style={styles.cancelBtn}>
                <Text style={[styles.cancelBtnText, { color: C.textSecondary }]}>
                  {t("common.cancel", "Cancelar")}
                </Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
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
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  scroll: { paddingHorizontal: 16, paddingTop: 0, gap: 16 },
  ticketCard: {
    borderRadius: 24,
    overflow: "hidden",
    marginTop: Platform.OS === "web" ? 80 : 0,
  },
  imageSection: {
    height: 220,
    overflow: "hidden",
    position: "relative",
  },
  heroImage: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  qrSection: {
    alignItems: "center",
    marginTop: -60,
    paddingBottom: 16,
    zIndex: 5,
  },
  qrBox: {
    width: 200,
    height: 200,
    borderRadius: 20,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  qrBoxExpanded: {
    width: 260,
    height: 260,
  },
  qrHint: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.4)",
    marginTop: 8,
  },
  separator: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 0,
    height: 24,
    position: "relative",
  },
  separatorCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    position: "absolute",
  },
  separatorCircleLeft: {
    left: -12,
  },
  separatorCircleRight: {
    right: -12,
  },
  separatorLine: {
    flex: 1,
    height: 1,
    borderStyle: "dashed",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    marginHorizontal: 16,
  },
  detailsSection: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 8,
  },
  eventName: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  infoText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.7)",
    flex: 1,
  },
  dateTimeRow: {
    flexDirection: "row",
    gap: 24,
    marginTop: 4,
  },
  dateTimeItem: {
    gap: 2,
  },
  dateTimeLabel: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.4)",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  dateTimeValue: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#fff",
  },
  ticketTypeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  ticketTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  ticketTypeText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  daysSection: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "rgba(255,255,255,0.4)",
    letterSpacing: 0.8,
  },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  dayIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  dayName: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#fff",
  },
  dayDate: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.5)",
  },
  attendeeSection: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 8,
  },
  transferBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  transferBtnText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.7)",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 12,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginBottom: 20,
    lineHeight: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    marginBottom: 6,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  transferConfirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#00f1ff",
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  transferConfirmText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#000",
  },
  cancelBtn: {
    alignItems: "center",
    paddingVertical: 14,
    marginTop: 4,
  },
  cancelBtnText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
});
