import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { Badge } from "@/components/ui/Badge";
import { Loading } from "@/components/ui/Loading";
import { Empty } from "@/components/ui/Empty";
import { useMyTickets, useTransferTicket } from "@/hooks/useEventsApi";
import { useAlert } from "@/components/CustomAlert";
import type { MyTicket } from "@/types/events";

function statusVariant(status: string): "success" | "warning" | "danger" | "muted" {
  if (status === "valid" || status === "active") return "success";
  if (status === "used") return "muted";
  if (status === "cancelled") return "danger";
  return "warning";
}

function getDateLocale(lang: string): string {
  return lang === "en" ? "en-US" : "es-CO";
}

function shortVenue(venueName: string): string {
  if (!venueName) return "";
  return venueName.split(",")[0].trim();
}

function TicketCard({ ticket, onPress }: { ticket: MyTicket; onPress: () => void }) {
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const { t, i18n } = useTranslation();
  const locale = getDateLocale(i18n.language);

  const startDate = ticket.startsAt ? new Date(ticket.startsAt) : null;
  const venue = shortVenue(ticket.venueName);

  return (
    <Pressable
      style={[styles.ticketCard, { backgroundColor: C.card, borderColor: C.border }]}
      onPress={onPress}
    >
      <View style={styles.ticketCardRow}>
        {ticket.eventCoverImageUrl ? (
          <Image source={{ uri: ticket.eventCoverImageUrl }} style={styles.ticketThumb} resizeMode="cover" />
        ) : (
          <View style={[styles.ticketThumb, { backgroundColor: C.inputBg, alignItems: "center", justifyContent: "center" }]}>
            <Feather name="tag" size={20} color={C.textMuted} />
          </View>
        )}
        <View style={styles.ticketInfo}>
          <Text style={[styles.ticketEventName, { color: C.text }]} numberOfLines={1}>
            {ticket.eventName}
          </Text>
          <Text style={[styles.ticketTypeName, { color: C.primary }]} numberOfLines={1}>
            {ticket.ticketTypeName}
            {ticket.sectionName ? ` · ${ticket.sectionName}` : ""}
          </Text>
          {startDate && !isNaN(startDate.getTime()) && (
            <View style={styles.ticketMeta}>
              <Feather name="calendar" size={11} color={C.textSecondary} />
              <Text style={[styles.ticketMetaText, { color: C.textSecondary }]}>
                {startDate.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" })}
              </Text>
            </View>
          )}
          {venue ? (
            <View style={styles.ticketMeta}>
              <Feather name="map-pin" size={11} color={C.textSecondary} />
              <Text style={[styles.ticketMetaText, { color: C.textSecondary }]} numberOfLines={1}>
                {venue}
              </Text>
            </View>
          ) : null}

          {ticket.validDays && ticket.validDays.length > 0 && (
            <View style={styles.daysRow}>
              {ticket.validDays.map((day) => {
                const isCheckedIn = ticket.checkedInDays?.includes(day.dayNumber);
                return (
                  <View
                    key={day.dayNumber}
                    style={[
                      styles.dayChip,
                      {
                        backgroundColor: isCheckedIn ? C.successLight : C.inputBg,
                        borderColor: isCheckedIn ? C.success : C.border,
                      },
                    ]}
                  >
                    {isCheckedIn && <Feather name="check" size={10} color={C.success} />}
                    <Text style={[styles.dayChipText, { color: isCheckedIn ? C.success : C.textSecondary }]}>
                      {t("events.dayLabel", { n: day.dayNumber })}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          <View style={{ marginTop: 4 }}>
            <Badge label={t(`tickets.status_${ticket.status}`, ticket.status)} variant={statusVariant(ticket.status)} size="sm" />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function TicketModal({ ticket, visible, onClose }: { ticket: MyTicket | null; visible: boolean; onClose: () => void }) {
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const { t, i18n } = useTranslation();
  const locale = getDateLocale(i18n.language);
  const insets = useSafeAreaInsets();
  const { show: showAlert } = useAlert();

  const [showTransfer, setShowTransfer] = useState(false);
  const [transferName, setTransferName] = useState("");
  const [transferEmail, setTransferEmail] = useState("");
  const [transferPhone, setTransferPhone] = useState("");
  const [transferDone, setTransferDone] = useState(false);

  const { mutate: transferTicket, isPending: transferLoading } = useTransferTicket();

  const resetTransfer = () => {
    setShowTransfer(false);
    setTransferName("");
    setTransferEmail("");
    setTransferPhone("");
    setTransferDone(false);
  };

  const handleClose = () => {
    resetTransfer();
    onClose();
  };

  const handleTransfer = () => {
    if (!ticket || !transferName.trim() || !transferEmail.trim()) return;
    transferTicket(
      {
        ticketId: ticket.id,
        recipientName: transferName.trim(),
        recipientEmail: transferEmail.trim(),
        recipientPhone: transferPhone.trim() || undefined,
      },
      {
        onSuccess: () => {
          setTransferDone(true);
          setShowTransfer(false);
        },
        onError: (err: unknown) => {
          const msg = (err as { message?: string }).message ?? t("common.unknownError", "Error desconocido");
          showAlert(t("common.error", "Error"), msg);
        },
      },
    );
  };

  if (!ticket) return null;

  const startDate = ticket.startsAt ? new Date(ticket.startsAt) : null;
  const isValidDate = startDate && !isNaN(startDate.getTime());
  const venue = shortVenue(ticket.venueName);
  const qrUrl = ticket.qrCode
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(ticket.qrCode)}&bgcolor=ffffff&color=000000&margin=10`
    : null;
  const isTransferable = ticket.status === "valid" || ticket.status === "active";

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.modalHandle} />

          {transferDone ? (
            <View style={styles.successCard}>
              <View style={styles.successIcon}>
                <Feather name="check-circle" size={36} color="#22c55e" />
              </View>
              <Text style={styles.successTitle}>{t("tickets.transferSuccess", "¡Transferida!")}</Text>
              <Text style={styles.successMsg}>
                {t("tickets.transferSuccessMsg", "La entrada fue transferida exitosamente.")}
              </Text>
              <Pressable onPress={handleClose} style={styles.closeDoneBtn}>
                <Text style={styles.closeDoneBtnText}>{t("common.close", "Cerrar")}</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
              <View style={[styles.ticketCardModal, { backgroundColor: "#111" }]}>
                <View style={styles.flyerWrap}>
                  {ticket.eventCoverImageUrl ? (
                    <Image
                      source={{ uri: ticket.eventCoverImageUrl }}
                      style={styles.flyerImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.flyerImage, { backgroundColor: "#1a1a2e", alignItems: "center", justifyContent: "center" }]}>
                      <Feather name="music" size={48} color="rgba(255,255,255,0.2)" />
                    </View>
                  )}
                  <View style={styles.flyerOverlay} />
                </View>

                <View style={styles.qrWrap}>
                  {qrUrl ? (
                    <Image source={{ uri: qrUrl }} style={styles.qrImage} resizeMode="contain" />
                  ) : (
                    <View style={[styles.qrImage, { alignItems: "center", justifyContent: "center", backgroundColor: "#fff" }]}>
                      <Feather name="alert-circle" size={32} color="#ccc" />
                    </View>
                  )}
                </View>

                <View style={styles.perforationRow}>
                  <View style={[styles.perfCircle, styles.perfLeft, { backgroundColor: "#0a0a0a" }]} />
                  <View style={styles.perfDash} />
                  <View style={[styles.perfCircle, styles.perfRight, { backgroundColor: "#0a0a0a" }]} />
                </View>

                <View style={styles.detailsWrap}>
                  <Text style={styles.detailsEventName}>{ticket.eventName}</Text>
                  {venue ? (
                    <View style={styles.detailsRow}>
                      <Feather name="map-pin" size={13} color="rgba(255,255,255,0.45)" />
                      <Text style={styles.detailsLocation}>{venue}</Text>
                    </View>
                  ) : null}

                  {isValidDate && (
                    <View style={styles.dateGrid}>
                      <View style={styles.dateItem}>
                        <Text style={styles.dateLabel}>{t("tickets.dateLabel", "FECHA")}</Text>
                        <Text style={styles.dateValue}>
                          {startDate!.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                        </Text>
                      </View>
                      <View style={styles.dateItem}>
                        <Text style={styles.dateLabel}>{t("tickets.timeLabel", "HORA")}</Text>
                        <Text style={styles.dateValue}>
                          {startDate!.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
                        </Text>
                      </View>
                    </View>
                  )}

                  <View style={styles.ticketTypeRow}>
                    <View style={styles.ticketTypeBadge}>
                      <Feather name="tag" size={12} color="#00f1ff" />
                      <Text style={styles.ticketTypeName2}>
                        {ticket.ticketTypeName}
                        {ticket.sectionName ? ` · ${ticket.sectionName}` : ""}
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusVariant(ticket.status) === "success" ? "#166534" : statusVariant(ticket.status) === "muted" ? "#374151" : "#7f1d1d" }]}>
                      <Text style={styles.statusBadgeText}>{t(`tickets.status_${ticket.status}`, ticket.status)}</Text>
                    </View>
                  </View>

                  {ticket.attendeeName ? (
                    <Text style={styles.attendeeName}>{ticket.attendeeName}</Text>
                  ) : null}
                </View>
              </View>

              {isTransferable && !showTransfer && (
                <Pressable onPress={() => setShowTransfer(true)} style={styles.transferBtn}>
                  <Feather name="send" size={15} color="rgba(255,255,255,0.8)" />
                  <Text style={styles.transferBtnText}>{t("tickets.transferTicket", "Transferir entrada")}</Text>
                </Pressable>
              )}

              {showTransfer && (
                <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
                  <View style={styles.transferForm}>
                    <View style={styles.transferHeader}>
                      <Text style={styles.transferTitle}>{t("tickets.transferTicket", "Transferir entrada")}</Text>
                      <Pressable onPress={() => setShowTransfer(false)}>
                        <Feather name="x" size={20} color="rgba(255,255,255,0.6)" />
                      </Pressable>
                    </View>
                    <Text style={styles.transferDesc}>
                      {t("tickets.transferDesc", "Ingresa los datos de quien recibirá esta entrada.")}
                    </Text>

                    <Text style={styles.inputLabel}>{t("tickets.recipientName", "Nombre")} *</Text>
                    <TextInput
                      style={styles.input}
                      value={transferName}
                      onChangeText={setTransferName}
                      placeholder={t("tickets.recipientNamePlaceholder", "Nombre completo")}
                      placeholderTextColor="rgba(255,255,255,0.25)"
                      autoCapitalize="words"
                    />

                    <Text style={styles.inputLabel}>{t("tickets.recipientEmail", "Correo electrónico")} *</Text>
                    <TextInput
                      style={styles.input}
                      value={transferEmail}
                      onChangeText={setTransferEmail}
                      placeholder="correo@ejemplo.com"
                      placeholderTextColor="rgba(255,255,255,0.25)"
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />

                    <Text style={styles.inputLabel}>{t("tickets.recipientPhone", "WhatsApp (opcional)")}</Text>
                    <TextInput
                      style={styles.input}
                      value={transferPhone}
                      onChangeText={setTransferPhone}
                      placeholder="+57 300 123 4567"
                      placeholderTextColor="rgba(255,255,255,0.25)"
                      keyboardType="phone-pad"
                    />

                    <Pressable
                      onPress={handleTransfer}
                      disabled={transferLoading || !transferName.trim() || !transferEmail.trim()}
                      style={[styles.transferConfirmBtn, (!transferName.trim() || !transferEmail.trim()) && { opacity: 0.5 }]}
                    >
                      {transferLoading ? (
                        <ActivityIndicator color="#000" size="small" />
                      ) : (
                        <>
                          <Feather name="send" size={15} color="#000" />
                          <Text style={styles.transferConfirmText}>{t("tickets.confirmTransfer", "Transferir")}</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                </KeyboardAvoidingView>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

export default function MyTicketsScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const { data, isPending, refetch } = useMyTickets();
  const tickets = (data as { tickets?: MyTicket[] } | undefined)?.tickets ?? [];

  const [refreshing, setRefreshing] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<MyTicket | null>(null);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refetch(); } finally { setRefreshing(false); }
  }, [refetch]);

  const renderItem = useCallback(
    ({ item }: { item: MyTicket }) => (
      <TicketCard ticket={item} onPress={() => setSelectedTicket(item)} />
    ),
    [],
  );

  if (isPending) return <Loading label={t("common.loading")} />;

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <View style={[styles.header, { paddingTop: isWeb ? 67 : insets.top + 8 }]}>
        <Text style={[styles.title, { color: C.text }]}>{t("tickets.myTickets")}</Text>
      </View>

      <FlatList
        data={tickets}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: isWeb ? 34 : insets.bottom + 24 },
          tickets.length === 0 && { flex: 1 },
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.primary} />
        }
        ListEmptyComponent={
          <Empty
            icon="tag"
            title={t("tickets.noTickets")}
            subtitle={t("tickets.noTicketsSub")}
            actionLabel={t("tickets.browseEvents")}
            onAction={() => router.replace("/(tabs)/events")}
          />
        }
      />

      <TicketModal
        ticket={selectedTicket}
        visible={!!selectedTicket}
        onClose={() => setSelectedTicket(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 8 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  listContent: { paddingHorizontal: 20, paddingTop: 8, gap: 12 },
  ticketCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  ticketCardRow: { flexDirection: "row" },
  ticketThumb: { width: 90, height: "100%", minHeight: 120 },
  ticketInfo: { flex: 1, padding: 12, gap: 3 },
  ticketEventName: { fontSize: 15, fontFamily: "Inter_700Bold" },
  ticketTypeName: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  ticketMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  ticketMetaText: { fontSize: 11, fontFamily: "Inter_400Regular", flex: 1 },
  daysRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 },
  dayChip: { flexDirection: "row", alignItems: "center", gap: 3, borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  dayChipText: { fontSize: 10, fontFamily: "Inter_500Medium" },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#0a0a0a", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "92%", paddingTop: 12 },
  modalHandle: { width: 40, height: 4, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 2, alignSelf: "center", marginBottom: 16 },

  ticketCardModal: { marginHorizontal: 16, borderRadius: 20, overflow: "hidden" },
  flyerWrap: { height: 200, position: "relative" },
  flyerImage: { width: "100%", height: "100%" },
  flyerOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.1)" },

  qrWrap: { alignItems: "center", marginTop: -55, zIndex: 5, paddingBottom: 12 },
  qrImage: { width: 170, height: 170, borderRadius: 16, backgroundColor: "#fff", shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 16, elevation: 12 },

  perforationRow: { flexDirection: "row", alignItems: "center", height: 24, position: "relative" },
  perfCircle: { width: 24, height: 24, borderRadius: 12, position: "absolute", zIndex: 2 },
  perfLeft: { left: -12 },
  perfRight: { right: -12 },
  perfDash: { flex: 1, height: 1, borderStyle: "dashed", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", marginHorizontal: 16 },

  detailsWrap: { paddingHorizontal: 20, paddingBottom: 20, paddingTop: 8, gap: 8 },
  detailsEventName: { fontSize: 19, fontFamily: "Inter_700Bold", color: "#fff" },
  detailsRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  detailsLocation: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.55)", flex: 1 },
  dateGrid: { flexDirection: "row", gap: 24, marginTop: 4 },
  dateItem: { gap: 2 },
  dateLabel: { fontSize: 10, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.6 },
  dateValue: { fontSize: 13, fontFamily: "Inter_500Medium", color: "#fff" },
  ticketTypeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  ticketTypeBadge: { flexDirection: "row", alignItems: "center", gap: 6 },
  ticketTypeName2: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#00f1ff" },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#fff" },
  attendeeName: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.3)", textAlign: "center", marginTop: 4 },

  transferBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginHorizontal: 16, marginTop: 12, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  transferBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.8)" },

  transferForm: { marginHorizontal: 16, marginTop: 12, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 16, padding: 16, gap: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  transferHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  transferTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
  transferDesc: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.5)", marginBottom: 8 },
  inputLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0.5 },
  input: { borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: "Inter_400Regular", color: "#fff", backgroundColor: "rgba(255,255,255,0.05)", marginBottom: 8 },
  transferConfirmBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#00f1ff", borderRadius: 12, paddingVertical: 14, marginTop: 4 },
  transferConfirmText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#000" },

  successCard: { alignItems: "center", paddingHorizontal: 24, paddingVertical: 40, gap: 12 },
  successIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: "rgba(34,197,94,0.12)", alignItems: "center", justifyContent: "center" },
  successTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff" },
  successMsg: { fontSize: 14, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.55)", textAlign: "center" },
  closeDoneBtn: { marginTop: 8, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12, backgroundColor: "#00f1ff" },
  closeDoneBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#000" },
});
