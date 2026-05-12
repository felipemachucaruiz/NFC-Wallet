import { useColorScheme } from "@/hooks/useColorScheme";
import { Image } from 'expo-image';
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { Badge } from "@/components/ui/Badge";
import { Loading } from "@/components/ui/Loading";
import { ScreenBackground } from "@/components/ui/ScreenBackground";
import { Empty } from "@/components/ui/Empty";
import { useMyTickets, useTransferTicket, useAddToWallet } from "@/hooks/useEventsApi";
import QRCode from "react-native-qrcode-svg";
import { useAlert } from "@/components/CustomAlert";
import { Linking } from 'react-native';
import type { MyTicket } from "@/types/events";

const appleWalletBadge = require("@/assets/images/apple-wallet-badge.png");
const googleWalletBadge = require("@/assets/images/google-wallet-badge.png");

function isArchivedTicket(ticket: MyTicket) {
  return ticket.status === "used" || ticket.status === "cancelled";
}

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

function TicketCard({ ticket, onPress, archived }: { ticket: MyTicket; onPress: () => void; archived?: boolean }) {
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const { t, i18n } = useTranslation();
  const locale = getDateLocale(i18n.language);

  const startDate = ticket.startsAt ? new Date(ticket.startsAt) : null;
  const venue = shortVenue(ticket.venueName);

  return (
    <Pressable
      style={[
        styles.ticketCard,
        { backgroundColor: C.card, borderColor: C.border },
        archived && { opacity: 0.6 },
      ]}
      onPress={onPress}
    >
      <View style={styles.ticketImageWrap}>
        {ticket.eventCoverImageUrl ? (
          <Image source={{ uri: ticket.eventCoverImageUrl }} style={styles.ticketCoverImage} contentFit="cover" />
        ) : (
          <View style={[styles.ticketCoverImage, { backgroundColor: C.inputBg, alignItems: "center", justifyContent: "center" }]}>
            <Feather name="tag" size={32} color={C.textMuted} />
          </View>
        )}
        <View style={styles.ticketBadgeOverlay}>
          <Badge label={t(`tickets.status_${ticket.status}`, ticket.status)} variant={statusVariant(ticket.status)} size="sm" />
        </View>
        {archived && (
          <View style={styles.usedStampOverlay}>
            <View style={styles.usedStamp}>
              <Feather name="check-circle" size={14} color="#fff" />
              <Text style={styles.usedStampText}>{t("tickets.status_used", "Usada")}</Text>
            </View>
          </View>
        )}
      </View>

      <View style={styles.ticketInfo}>
        <Text style={[styles.ticketEventName, { color: archived ? C.textMuted : C.text }]} numberOfLines={1}>
          {ticket.eventName}
        </Text>
        <Text style={[styles.ticketTypeName, { color: archived ? C.textMuted : C.primary }]} numberOfLines={1}>
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
  const { mutate: addToWallet, isPending: walletLoading } = useAddToWallet();

  const isIOS = Platform.OS === "ios";
  const walletPlatform = isIOS ? "apple" : "google";
  const walletLabel = isIOS ? t("tickets.addAppleWallet") : t("tickets.addGoogleWallet");

  const handleAddToWallet = () => {
    if (!ticket) return;
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
          const msg = (err as { message?: string }).message ?? t("common.unknownError");
          showAlert(t("common.error"), msg);
        },
      },
    );
  };

  if (!ticket) return null;

  const openMaps = () => {
    if (!ticket.latitude || !ticket.longitude) return;
    const lat = ticket.latitude;
    const lng = ticket.longitude;
    const label = encodeURIComponent(ticket.venueName);
    const openGoogle = () => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`);
    const openWaze = () => Linking.openURL(`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`);
    const openApple = () => Linking.openURL(`maps://?q=${label}@${lat},${lng}`);
    const buttons = [
      { text: "Google Maps", onPress: openGoogle },
      { text: "Waze", onPress: openWaze },
      ...(Platform.OS === "ios" ? [{ text: "Apple Maps", onPress: openApple }] : []),
      { text: t("common.cancel"), style: "cancel" as const },
    ];
    Alert.alert(t("events.openMaps", "¿Cómo llegar?"), undefined, buttons);
  };

  const startDate = ticket.startsAt ? new Date(ticket.startsAt) : null;
  const isValidDate = startDate && !isNaN(startDate.getTime());
  const venue = shortVenue(ticket.venueName);
  const isTransferable = ticket.status === "valid" || ticket.status === "active";
  const archived = isArchivedTicket(ticket);

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
                      contentFit="cover"
                    />
                  ) : (
                    <View style={[styles.flyerImage, { backgroundColor: "#1a1a2e", alignItems: "center", justifyContent: "center" }]}>
                      <Feather name="music" size={48} color="rgba(255,255,255,0.2)" />
                    </View>
                  )}
                  <View style={styles.flyerOverlay} />
                  {archived && (
                    <View style={styles.modalArchivedBanner}>
                      <Feather name="archive" size={14} color="#fff" />
                      <Text style={styles.modalArchivedBannerText}>{t("tickets.archivedEvent", "Evento archivado")}</Text>
                    </View>
                  )}
                </View>

                <View style={styles.qrWrap}>
                  {ticket.qrCode ? (
                    <View style={[{ backgroundColor: "#fff", padding: 8, borderRadius: 8 }, archived && { opacity: 0.4 }]}>
                      <QRCode
                        value={ticket.qrCode}
                        size={180}
                        backgroundColor="#fff"
                        color="#000"
                        logo={require("../../assets/images/icon.png")}
                        logoSize={38}
                        logoBorderRadius={8}
                        logoBackgroundColor="#fff"
                      />
                    </View>
                  ) : (
                    <View style={[styles.qrImage, { alignItems: "center", justifyContent: "center", backgroundColor: "#fff" }]}>
                      <Feather name="alert-circle" size={32} color="#ccc" />
                    </View>
                  )}
                  {archived && (
                    <View style={styles.qrUsedLabel}>
                      <Feather name="check-circle" size={13} color="rgba(255,255,255,0.5)" />
                      <Text style={styles.qrUsedLabelText}>{t("tickets.status_used", "Usada")}</Text>
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

                  {ticket.latitude && ticket.longitude ? (
                    <Pressable onPress={openMaps} style={styles.locationBtn}>
                      <Feather name="navigation" size={13} color="#00f1ff" />
                      <Text style={styles.locationBtnText}>{t("events.getDirections", "Cómo llegar")}</Text>
                    </Pressable>
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

              {!archived && !showTransfer && Platform.OS !== "web" && (
                <Pressable
                  onPress={handleAddToWallet}
                  disabled={walletLoading}
                  style={styles.walletBadgeBtn}
                >
                  {walletLoading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Image
                      source={isIOS ? appleWalletBadge : googleWalletBadge}
                      style={styles.walletBadgeImg}
                      contentFit="contain"
                    />
                  )}
                </Pressable>
              )}

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
  const allTickets = (data as { tickets?: MyTicket[] } | undefined)?.tickets ?? [];

  const activeTickets = allTickets.filter((t) => !isArchivedTicket(t));
  const archivedTickets = allTickets.filter((t) => isArchivedTicket(t));

  const [refreshing, setRefreshing] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<MyTicket | null>(null);
  const [showArchived, setShowArchived] = useState(false);

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

  const renderArchivedItem = useCallback(
    ({ item }: { item: MyTicket }) => (
      <TicketCard ticket={item} onPress={() => setSelectedTicket(item)} archived />
    ),
    [],
  );

  if (isPending) return <Loading label={t("common.loading")} />;

  const listData = showArchived
    ? [...activeTickets, { _type: "archiveHeader" as const }, ...archivedTickets]
    : activeTickets;

  return (
    <ScreenBackground style={styles.container}>
      <View style={[styles.header, { paddingTop: isWeb ? 67 : insets.top + 8 }]}>
        <Text style={[styles.title, { color: C.text }]}>{t("tickets.myTickets")}</Text>
      </View>

      <FlatList
        data={listData}
        keyExtractor={(item, index) =>
          "_type" in item ? "archive-header" : item.id
        }
        renderItem={({ item }) => {
          if ("_type" in item && item._type === "archiveHeader") {
            return null;
          }
          const ticket = item as MyTicket;
          const archived = isArchivedTicket(ticket);
          return (
            <TicketCard
              ticket={ticket}
              onPress={() => setSelectedTicket(ticket)}
              archived={archived}
            />
          );
        }}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: isWeb ? 34 : insets.bottom + 100 },
          allTickets.length === 0 && { flex: 1 },
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
        ListFooterComponent={
          archivedTickets.length > 0 ? (
            <View style={styles.archiveSection}>
              <Pressable
                style={[styles.archiveToggle, { borderColor: C.border, backgroundColor: C.card }]}
                onPress={() => setShowArchived((v) => !v)}
              >
                <View style={styles.archiveToggleLeft}>
                  <Feather name="archive" size={16} color={C.textSecondary} />
                  <Text style={[styles.archiveToggleLabel, { color: C.textSecondary }]}>
                    {t("tickets.archivedEvents", "Eventos archivados")}
                  </Text>
                  <View style={[styles.archiveCountBadge, { backgroundColor: C.inputBg }]}>
                    <Text style={[styles.archiveCountText, { color: C.textMuted }]}>
                      {archivedTickets.length}
                    </Text>
                  </View>
                </View>
                <Feather
                  name={showArchived ? "chevron-up" : "chevron-down"}
                  size={16}
                  color={C.textMuted}
                />
              </Pressable>

              {showArchived && (
                <View style={styles.archivedList}>
                  {archivedTickets.map((ticket) => (
                    <TicketCard
                      key={ticket.id}
                      ticket={ticket}
                      onPress={() => setSelectedTicket(ticket)}
                      archived
                    />
                  ))}
                </View>
              )}
            </View>
          ) : null
        }
      />

      <TicketModal
        ticket={selectedTicket}
        visible={!!selectedTicket}
        onClose={() => setSelectedTicket(null)}
      />
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 8 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  listContent: { paddingHorizontal: 20, paddingTop: 8, gap: 12 },
  ticketCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  ticketImageWrap: { width: "100%", aspectRatio: 1, position: "relative" },
  ticketCoverImage: { width: "100%", height: "100%" },
  ticketBadgeOverlay: { position: "absolute", top: 10, right: 10 },
  ticketInfo: { padding: 12, gap: 3 },
  ticketEventName: { fontSize: 15, fontFamily: "Inter_700Bold" },
  ticketTypeName: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  ticketMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  ticketMetaText: { fontSize: 11, fontFamily: "Inter_400Regular", flex: 1 },
  daysRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 },
  dayChip: { flexDirection: "row", alignItems: "center", gap: 3, borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  dayChipText: { fontSize: 10, fontFamily: "Inter_500Medium" },

  usedStampOverlay: { position: "absolute", bottom: 10, left: 10 },
  usedStamp: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  usedStampText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#fff" },

  archiveSection: { marginTop: 8, gap: 0 },
  archiveToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  archiveToggleLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  archiveToggleLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  archiveCountBadge: { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  archiveCountText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  archivedList: { gap: 12 },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#0a0a0a", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "92%", paddingTop: 12 },
  modalHandle: { width: 40, height: 4, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 2, alignSelf: "center", marginBottom: 16 },

  ticketCardModal: { marginHorizontal: 16, borderRadius: 20, overflow: "hidden" },
  flyerWrap: { height: 260, position: "relative" },
  flyerImage: { width: "100%", height: "100%" },
  flyerOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.1)" },

  modalArchivedBanner: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingVertical: 6,
  },
  modalArchivedBannerText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#fff" },

  qrWrap: { alignItems: "center", marginTop: -55, zIndex: 5, paddingBottom: 4 },
  qrImage: { width: 170, height: 170, borderRadius: 16, backgroundColor: "#fff", shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 16, elevation: 12 },
  qrUsedLabel: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6, marginBottom: 4 },
  qrUsedLabelText: { fontSize: 11, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.4)" },

  perforationRow: { flexDirection: "row", alignItems: "center", height: 24, position: "relative" },
  perfCircle: { width: 24, height: 24, borderRadius: 12, position: "absolute", zIndex: 2 },
  perfLeft: { left: -12 },
  perfRight: { right: -12 },
  perfDash: { flex: 1, height: 1, borderStyle: "dashed", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", marginHorizontal: 16 },

  detailsWrap: { paddingHorizontal: 20, paddingBottom: 20, paddingTop: 8, gap: 8 },
  detailsEventName: { fontSize: 19, fontFamily: "Inter_700Bold", color: "#fff" },
  detailsRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  detailsLocation: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.55)", flex: 1 },
  locationBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: "rgba(0,241,255,0.3)", backgroundColor: "rgba(0,241,255,0.07)" },
  locationBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#00f1ff" },
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

  walletBadgeBtn: { alignItems: "center", justifyContent: "center", marginHorizontal: 16, marginTop: 12, minHeight: 50 },
  walletBadgeImg: { width: 190, height: 50 },

  transferBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginHorizontal: 16, marginTop: 10, paddingVertical: 13, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
  transferBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.7)" },

  transferForm: { marginHorizontal: 16, marginTop: 12, marginBottom: 8, padding: 16, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 16, gap: 10 },
  transferHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  transferTitle: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
  transferDesc: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.5)" },
  inputLabel: { fontSize: 12, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.5)" },
  input: { height: 42, borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", backgroundColor: "rgba(255,255,255,0.05)", paddingHorizontal: 12, fontSize: 14, fontFamily: "Inter_400Regular", color: "#fff" },
  transferConfirmBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 44, borderRadius: 12, backgroundColor: "#00f1ff" },
  transferConfirmText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#000" },

  successCard: { margin: 16, padding: 24, alignItems: "center", gap: 12 },
  successIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(34,197,94,0.15)", alignItems: "center", justifyContent: "center" },
  successTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff" },
  successMsg: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.5)", textAlign: "center" },
  closeDoneBtn: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  closeDoneBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.7)" },
});
