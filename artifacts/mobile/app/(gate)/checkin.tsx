import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useBarcodeScanner, BROADCAST_MODE } from "@/hooks/useBarcodeScanner";
import { sendTestScan } from "@/modules/barcode-receiver/src";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";
import { cancelNfc, scanBracelet, isNfcSupported } from "@/utils/nfc";
import { useEventContext } from "@/contexts/EventContext";
import { getChipHint, isChipAllowed, chipTypeLabel } from "@/utils/chipType";
import { useOfflineGate } from "@/hooks/useOfflineGate";
import {
  verifyQrTokenOffline,
  resolveTicketOffline,
  addOfflineCheckin,
} from "@/utils/offlineTickets";
import { API_BASE_URL } from "@/constants/domain";

const GATE_FETCH_TIMEOUT = 5000;

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = GATE_FETCH_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}
import {
  CheckinHistoryList,
  type TicketAttendee,
  type TicketInfo,
  type TicketZone,
  type CheckinHistoryEntry,
  type CheckinHistoryListItem,
} from "@/components/TicketConfirmation";

let CameraView: React.ComponentType<any> | null = null;
let useCameraPermissions: (() => [any, () => Promise<any>]) | null = null;
try {
  const cam = require("expo-camera");
  CameraView = cam.CameraView ?? null;
  useCameraPermissions = cam.useCameraPermissions ?? null;
} catch {
  CameraView = null;
  useCameraPermissions = null;
}

let Haptics: typeof import("expo-haptics") | null = null;
try {
  Haptics = require("expo-haptics");
} catch {
  Haptics = null;
}

type PageState =
  | "ready"
  | "qr_scanning"
  | "validating"
  | "confirmed"
  | "submitting"
  | "bracelet_scanning"
  | "bracelet_registering"
  | "success"
  | "error";

function formatTime(isoString: string | Date | null, locale: string): string {
  if (!isoString) return "–";
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString(locale === "es" ? "es-CO" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Bogota",
    });
  } catch {
    return String(isoString);
  }
}

function triggerHaptic(type: "success" | "error" | "light") {
  if (!Haptics) return;
  try {
    if (type === "success") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (type === "error") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  } catch {}
}

function InfoRow({
  icon,
  label,
  value,
  C,
  valueBadge,
}: {
  icon: string;
  label: string;
  value: string;
  C: typeof Colors.light;
  valueBadge?: { text: string; color: string };
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoRowLeft}>
        <Feather name={icon as any} size={14} color={C.textSecondary} />
        <Text style={[styles.infoLabel, { color: C.textSecondary }]}>{label}</Text>
      </View>
      <View style={styles.infoRowRight}>
        {valueBadge ? (
          <View style={[styles.zoneBadgeSmall, { backgroundColor: valueBadge.color + "22", borderColor: valueBadge.color }]}>
            <View style={[styles.zoneDotSmall, { backgroundColor: valueBadge.color }]} />
            <Text style={[styles.zoneBadgeText, { color: valueBadge.color }]}>{valueBadge.text}</Text>
          </View>
        ) : (
          <Text style={[styles.infoValue, { color: C.text }]}>{value}</Text>
        )}
      </View>
    </View>
  );
}

export default function EntranceCheckinScreen() {
  const { t, i18n } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { token } = useAuth();
  const { isOnline, eventData, isSyncing, pendingCount, doSync, refreshPendingCount, refreshEventData } = useOfflineGate();
  const { allowedNfcTypes } = useEventContext();

  const [pageState, setPageState] = useState<PageState>("ready");
  const [errorMsg, setErrorMsg] = useState("");
  const [successCountdown, setSuccessCountdown] = useState(0);

  const [ticketAttendee, setTicketAttendee] = useState<TicketAttendee | null>(null);
  const [ticketInfo, setTicketInfo] = useState<TicketInfo | null>(null);
  const [ticketZone, setTicketZone] = useState<TicketZone | null>(null);
  const [ticketTodayDayIndex, setTicketTodayDayIndex] = useState(0);
  const [ticketCheckinHistory, setTicketCheckinHistory] = useState<CheckinHistoryEntry[]>([]);
  const [qrToken, setQrToken] = useState("");
  const [successName, setSuccessName] = useState("");
  const [successZone, setSuccessZone] = useState("");
  const [sessionHistory, setSessionHistory] = useState<CheckinHistoryListItem[]>([]);
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [braceletNfcError, setBraceletNfcError] = useState<string | null>(null);

  const qrProcessedRef = useRef(false);
  const braceletScanningRef = useRef(false);

  const cameraPermissionHook = useCameraPermissions ? useCameraPermissions() : null;
  const cameraPermission = cameraPermissionHook ? cameraPermissionHook[0] : null;
  const requestCameraPermission = cameraPermissionHook ? cameraPermissionHook[1] : null;

  const locale = i18n.language ?? "es";
  const hasCamera = CameraView !== null && Platform.OS !== "web";

  useEffect(() => {
    if (pageState === "success") {
      setSuccessCountdown(3);
      const interval = setInterval(() => {
        setSuccessCountdown((c) => {
          if (c <= 1) {
            clearInterval(interval);
            resetForNext();
            return 0;
          }
          return c - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [pageState]);

  const validateTicketOffline = useCallback(
    (data: string) => {
      if (!eventData) {
        setErrorMsg(t("gate.offlineNoData"));
        setPageState("error");
        triggerHaptic("error");
        return;
      }
      const result = verifyQrTokenOffline(data, eventData);
      if (!result) {
        setErrorMsg(`${t("gate.ticketInvalid")}\n${t("gate.ticketInvalidHint")}`);
        setPageState("error");
        triggerHaptic("error");
        return;
      }
      const resolved = resolveTicketOffline(result.ticketId, eventData);
      if (!resolved) {
        setErrorMsg(`${t("gate.ticketAttendeeNotFound")}\n${t("gate.ticketAttendeeNotFoundHint")}`);
        setPageState("error");
        triggerHaptic("error");
        return;
      }
      if (resolved.ticket.status === "cancelled") {
        setErrorMsg(`${t("gate.ticketInvalid")}\n${t("gate.ticketInvalidHint")}`);
        setPageState("error");
        triggerHaptic("error");
        return;
      }
      if (resolved.todayDayIndex < 0) {
        setErrorMsg(`${t("gate.ticketEventNotStarted")}\n${t("gate.ticketEventNotStartedHint")}`);
        setPageState("error");
        triggerHaptic("error");
        return;
      }
      const todayCheckin = resolved.checkins.find(c => c.eventDayIndex === resolved.todayDayIndex);
      if (todayCheckin) {
        const checkedTime = formatTime(todayCheckin.checkedInAt, locale);
        setErrorMsg(`${t("gate.ticketAlreadyUsed")}\n${t("gate.ticketAlreadyUsedHint", { time: checkedTime })}`);
        setPageState("error");
        triggerHaptic("error");
        return;
      }
      if (resolved.validDays.length > 0 && !resolved.validDays.includes(resolved.todayDayIndex)) {
        setErrorMsg(`${t("gate.ticketWrongDay")}\n${t("gate.ticketWrongDayHint")}`);
        setPageState("error");
        triggerHaptic("error");
        return;
      }
      const fullName = resolved.attendee
        ? [resolved.attendee.firstName, resolved.attendee.lastName].filter(Boolean).join(" ") || resolved.attendee.email
        : resolved.ticket.attendeeName;
      const attendee: TicketAttendee = resolved.attendee
        ? { id: resolved.attendee.id, firstName: resolved.attendee.firstName, lastName: resolved.attendee.lastName, fullName, email: resolved.attendee.email, phone: resolved.attendee.phone }
        : { id: "", firstName: resolved.ticket.attendeeName, lastName: "", fullName, email: resolved.ticket.attendeeEmail, phone: null };
      setTicketAttendee(attendee);
      setTicketInfo({ ticketId: resolved.ticket.id, section: "", ticketType: resolved.ticketType?.name ?? "", validDays: resolved.validDays, dayLabels: resolved.dayLabels, accessZoneId: "" });
      setTicketZone(resolved.zone ? { id: resolved.zone.id, name: resolved.zone.name, colorHex: null, rank: 0 } : null);
      setTicketTodayDayIndex(resolved.todayDayIndex);
      setTicketCheckinHistory(resolved.checkins.map(c => ({ dayIndex: c.eventDayIndex, checkedInAt: c.checkedInAt })));
      setQrToken(data);
      setPageState("confirmed");
      triggerHaptic("success");
    },
    [eventData, t, locale],
  );

  const validateTicket = useCallback(
    async (data: string) => {
      setPageState("validating");
      setErrorMsg("");

      if (!isOnline) {
        validateTicketOffline(data);
        return;
      }

      try {
        const res = await fetchWithTimeout(`${API_BASE_URL}/api/gate/validate-ticket`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ qrToken: data }),
        });

        const payload = await res.json().catch(() => ({}));

        if (!res.ok) {
          const errCode = payload.error as string;
          let errTitle = t("gate.ticketInvalid");
          let errHint = t("gate.ticketInvalidHint");
          if (errCode === "TICKET_NOT_FOUND") {
            errTitle = t("gate.ticketNotFound");
            errHint = t("gate.ticketNotFoundHint");
          } else if (errCode === "WRONG_EVENT") {
            errTitle = t("gate.ticketWrongEvent");
            errHint = t("gate.ticketWrongEventHint");
          } else if (errCode === "ATTENDEE_NOT_FOUND") {
            errTitle = t("gate.ticketAttendeeNotFound");
            errHint = t("gate.ticketAttendeeNotFoundHint");
          } else if (errCode === "EVENT_NOT_STARTED") {
            errTitle = t("gate.ticketEventNotStarted");
            errHint = t("gate.ticketEventNotStartedHint");
          } else if (errCode === "WRONG_DAY") {
            errTitle = t("gate.ticketWrongDay");
            errHint = t("gate.ticketWrongDayHint");
          }
          setErrorMsg(`${errTitle}\n${errHint}`);
          setPageState("error");
          triggerHaptic("error");
          return;
        }

        if (payload.isAlreadyCheckedIn) {
          const checkedTime = formatTime(payload.alreadyCheckedInAt, locale);
          setErrorMsg(
            `${t("gate.ticketAlreadyUsed")}\n${t("gate.ticketAlreadyUsedHint", { time: checkedTime })}`,
          );
          setPageState("error");
          triggerHaptic("error");
          return;
        }

        if (!payload.isValidForToday) {
          setErrorMsg(`${t("gate.ticketWrongDay")}\n${t("gate.ticketWrongDayHint")}`);
          setPageState("error");
          triggerHaptic("error");
          return;
        }

        setTicketAttendee(payload.attendee);
        setTicketInfo(payload.ticket);
        setTicketZone(payload.zone);
        setTicketTodayDayIndex(payload.todayDayIndex);
        setTicketCheckinHistory(payload.checkinHistory ?? []);
        setQrToken(data);
        setPageState("confirmed");
        triggerHaptic("success");
      } catch {
        validateTicketOffline(data);
      }
    },
    [t, token, locale, isOnline, validateTicketOffline],
  );

  // Must be after validateTicket — Hermes production disables TDZ checks, so referencing
  // a const before its declaration silently yields undefined, breaking the onScan callback.
  const { inputProps: barcodeInputProps, inputRef: barcodeInputRef, pauseFocus: pauseBarcodeFocus, resumeFocus: resumeBarcodeFocus } = useBarcodeScanner({
    onScan: validateTicket,
    enabled: pageState === "ready" && !showQrScanner,
    manageFocus: true,
  });

  const handleBarcodeSubmit = useCallback(() => {
    const trimmed = barcodeInputProps.value.trim();
    if (!trimmed) return;
    validateTicket(trimmed);
  }, [barcodeInputProps.value, validateTicket]);

  const handleQrScanned = useCallback(
    (data: string) => {
      if (qrProcessedRef.current) return;
      qrProcessedRef.current = true;
      triggerHaptic("light");
      setShowQrScanner(false);
      validateTicket(data);
    },
    [validateTicket],
  );

  const confirmCheckinOffline = useCallback(async () => {
    if (!ticketInfo || !ticketAttendee) return;
    try {
      await addOfflineCheckin(ticketInfo.ticketId, ticketTodayDayIndex);
      await refreshEventData();
      await refreshPendingCount();
      const attendeeName = [ticketAttendee.firstName, ticketAttendee.lastName].filter(Boolean).join(" ") || ticketAttendee.email || "";
      const zoneName = ticketZone?.name ?? "";
      setSuccessName(attendeeName);
      setSuccessZone(zoneName);
      const historyItem: CheckinHistoryListItem = {
        id: Date.now().toString(),
        ticketId: ticketInfo.ticketId,
        attendeeName,
        section: ticketInfo.section ?? null,
        ticketType: ticketInfo.ticketType ?? null,
        braceletNfcUid: null,
        eventDayIndex: ticketTodayDayIndex,
        checkedInAt: new Date().toISOString(),
      };
      setSessionHistory((prev) => [historyItem, ...prev]);
      triggerHaptic("success");
      setPageState("success");
    } catch {
      setErrorMsg(t("common.unknownError"));
      setPageState("error");
      triggerHaptic("error");
    }
  }, [ticketInfo, ticketAttendee, ticketZone, ticketTodayDayIndex, t, refreshEventData, refreshPendingCount]);

  const handleConfirmCheckin = useCallback(async () => {
    if (!qrToken) return;
    setPageState("submitting");

    if (!isOnline) {
      await confirmCheckinOffline();
      return;
    }

    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/gate/ticket-checkin-only`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ qrToken }),
      }, 8000);

      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errCode = payload.error as string;
        if (errCode === "ALREADY_CHECKED_IN") {
          const checkedTime = formatTime(payload.checkedInAt, locale);
          setErrorMsg(
            `${t("gate.ticketAlreadyUsed")}\n${t("gate.ticketAlreadyUsedHint", { time: checkedTime })}`,
          );
        } else {
          setErrorMsg(payload.message ?? t("gate.ticketError"));
        }
        setPageState("error");
        triggerHaptic("error");
        return;
      }

      const attendeeName = payload.attendee?.fullName ?? "";
      const zoneName = payload.zone?.name ?? "";

      setSuccessName(attendeeName);
      setSuccessZone(zoneName);

      const historyItem: CheckinHistoryListItem = {
        id: payload.checkin?.id ?? Date.now().toString(),
        ticketId: payload.ticket?.ticketId ?? "",
        attendeeName,
        section: payload.ticket?.section ?? null,
        ticketType: payload.ticket?.ticketType ?? null,
        braceletNfcUid: null,
        eventDayIndex: payload.todayDayIndex ?? 0,
        checkedInAt: payload.checkin?.checkedInAt ?? new Date().toISOString(),
      };
      setSessionHistory((prev) => [historyItem, ...prev]);

      triggerHaptic("success");
      setPageState("success");
    } catch {
      await confirmCheckinOffline();
    }
  }, [t, token, qrToken, locale, isOnline, confirmCheckinOffline]);

  const handleBraceletCheckin = useCallback(async () => {
    if (braceletScanningRef.current || !qrToken) return;
    braceletScanningRef.current = true;
    setBraceletNfcError(null);
    setPageState("bracelet_scanning");

    let nfcDone = false;
    try {
      const result = await scanBracelet({ expectedChipType: getChipHint(allowedNfcTypes) });
      nfcDone = true;
      if (!isChipAllowed(result.tagInfo.type, allowedNfcTypes)) {
        const expected = allowedNfcTypes.map(chipTypeLabel).join(", ");
        setBraceletNfcError(t("eventAdmin.nfcChipMismatch", { expected, detected: result.tagInfo.label }));
        setPageState("confirmed");
        braceletScanningRef.current = false;
        return;
      }
      const uid = result.payload.uid;
      if (!uid) {
        setPageState("confirmed");
        braceletScanningRef.current = false;
        return;
      }

      setPageState("bracelet_registering");

      const res = await fetchWithTimeout(`${API_BASE_URL}/api/gate/ticket-checkin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ qrToken, braceletNfcUid: uid }),
      }, 8000);

      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errCode = payload.error as string;
        if (errCode === "ALREADY_CHECKED_IN") {
          const checkedTime = formatTime(payload.checkedInAt, locale);
          setErrorMsg(`${t("gate.ticketAlreadyUsed")}\n${t("gate.ticketAlreadyUsedHint", { time: checkedTime })}`);
        } else if (errCode === "BRACELET_WRONG_EVENT") {
          setErrorMsg(t("gate.ticketBraceletWrongEvent"));
        } else if (errCode === "EVENT_NOT_STARTED") {
          setErrorMsg(`${t("gate.ticketEventNotStarted")}\n${t("gate.ticketEventNotStartedHint")}`);
        } else if (errCode === "WRONG_DAY") {
          setErrorMsg(`${t("gate.ticketWrongDay")}\n${t("gate.ticketWrongDayHint")}`);
        } else {
          setErrorMsg(payload.message ?? t("gate.ticketError"));
        }
        setPageState("error");
        triggerHaptic("error");
        braceletScanningRef.current = false;
        return;
      }

      const attendeeName = payload.attendee?.fullName ?? "";
      const zoneName = payload.zone?.name ?? "";
      setSuccessName(attendeeName);
      setSuccessZone(zoneName);

      const historyItem: CheckinHistoryListItem = {
        id: payload.checkin?.id ?? Date.now().toString(),
        ticketId: payload.ticket?.ticketId ?? "",
        attendeeName,
        section: payload.ticket?.section ?? null,
        ticketType: payload.ticket?.ticketType ?? null,
        braceletNfcUid: uid,
        eventDayIndex: payload.todayDayIndex ?? 0,
        checkedInAt: payload.checkin?.checkedInAt ?? new Date().toISOString(),
      };
      setSessionHistory((prev) => [historyItem, ...prev]);

      setBraceletNfcError(null);
      triggerHaptic("success");
      setPageState("success");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "NFC_CANCELLED" || msg === "USER_CANCELLED") {
        setPageState("confirmed");
      } else if (nfcDone) {
        // NFC read succeeded but network request failed — show full error state
        setErrorMsg(t("gate.scanFailed"));
        setPageState("error");
        triggerHaptic("error");
      } else {
        // NFC read itself failed (tag lost, etc.) — let user retry from confirmed state
        const isTagLost = msg.toLowerCase().includes("tag") || msg.toLowerCase().includes("lost") || msg.toLowerCase().includes("connection");
        setBraceletNfcError(isTagLost ? t("gate.nfcTagLost") : t("gate.nfcScanRetry"));
        setPageState("confirmed");
        triggerHaptic("error");
      }
    } finally {
      braceletScanningRef.current = false;
    }
  }, [qrToken, token, t, locale]);

  const resetForNext = () => {
    setErrorMsg("");
    setBraceletNfcError(null);
    setTicketAttendee(null);
    setTicketInfo(null);
    setTicketZone(null);
    setQrToken("");
    setSuccessName("");
    setSuccessZone("");
    qrProcessedRef.current = false;
    braceletScanningRef.current = false;
    setPageState("ready");
    setShowQrScanner(false);
    resumeBarcodeFocus();
  };

  const openQrScanner = async () => {
    void cancelNfc().catch(() => {});
    if (!cameraPermission?.granted && requestCameraPermission) {
      const perm = await requestCameraPermission();
      if (!perm.granted) {
        setErrorMsg(t("gate.ticketCameraPermissionDenied"));
        setPageState("error");
        triggerHaptic("error");
        return;
      }
    }
    qrProcessedRef.current = false;
    setShowQrScanner(true);
    setPageState("qr_scanning");
  };

  const isMultiDay = ticketInfo ? ticketInfo.validDays.length > 1 : false;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingBottom: isWeb ? 34 : insets.bottom + 40,
          paddingTop: isWeb ? 67 : insets.top + 16,
          paddingHorizontal: 20,
          gap: 16,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backBtn}
            hitSlop={8}
          >
            <Feather name="arrow-left" size={22} color={C.text} />
          </Pressable>
          <Text style={[styles.title, { color: C.text }]}>
            {t("gate.entranceCheckin")}
          </Text>
          <View style={{ width: 32 }} />
        </View>

        {!isOnline && (
          <View style={styles.offlineBanner}>
            <Feather name="wifi-off" size={14} color="#fff" />
            <Text style={styles.offlineBannerText}>{t("gate.offlineBadge")}</Text>
            {pendingCount > 0 && (
              <Text style={styles.offlineBannerCount}>{t("gate.offlineQueueCount", { count: pendingCount })}</Text>
            )}
          </View>
        )}

        {pageState === "success" && (
          <View
            style={[
              styles.resultCard,
              { backgroundColor: "#16a34a11", borderColor: "#16a34a" },
            ]}
          >
            <Feather name="check-circle" size={52} color="#16a34a" />
            <Text style={[styles.resultTitle, { color: "#16a34a" }]}>
              {t("gate.checkinSuccess")}
            </Text>
            <Text style={[styles.resultSub, { color: C.textSecondary }]}>
              {successZone
                ? t("gate.checkinSuccessHint", { name: successName, zone: successZone })
                : t("gate.checkinSuccessNoZone", { name: successName })}
            </Text>
            <View
              style={[
                styles.countdownBadge,
                { backgroundColor: "#16a34a11", borderColor: "#16a34a" },
              ]}
            >
              <Text style={[styles.countdownText, { color: "#16a34a" }]}>
                {t("gate.registerNext")} ({successCountdown})
              </Text>
            </View>
            <Button
              title={t("gate.scanNextTicket")}
              onPress={resetForNext}
              variant="primary"
              style={{ marginTop: 4, width: "100%" }}
            />
          </View>
        )}

        {pageState === "error" && (
          <View
            style={[
              styles.resultCard,
              { backgroundColor: C.dangerLight, borderColor: C.danger },
            ]}
          >
            <View style={[styles.errorIconWrap, { backgroundColor: C.danger + "22" }]}>
              <Feather name="x-circle" size={40} color={C.danger} />
            </View>
            <Text style={[styles.resultTitle, { color: C.danger }]}>
              {t("gate.ticketError")}
            </Text>
            {errorMsg ? (
              <Text style={[styles.resultSub, { color: C.textSecondary, textAlign: "center" }]}>
                {errorMsg}
              </Text>
            ) : null}
            <Button
              title={t("gate.scanNextTicket")}
              onPress={resetForNext}
              variant="primary"
              style={{ marginTop: 4, width: "100%" }}
            />
          </View>
        )}

        {pageState === "validating" && (
          <View style={[styles.loadingCard, { backgroundColor: C.card, borderColor: C.primary }]}>
            <ActivityIndicator size="large" color={C.primary} />
            <Text style={[styles.loadingText, { color: C.text }]}>
              {t("gate.ticketValidating")}
            </Text>
          </View>
        )}

        {pageState === "submitting" && (
          <View style={[styles.loadingCard, { backgroundColor: C.card, borderColor: C.primary }]}>
            <ActivityIndicator size="large" color={C.primary} />
            <Text style={[styles.loadingText, { color: C.text }]}>
              {t("gate.checkinProcessing")}
            </Text>
          </View>
        )}

        {(pageState === "confirmed") && ticketAttendee && ticketInfo && (
          <>
            <View style={[styles.validBadge, { backgroundColor: "#16a34a22", borderColor: "#16a34a" }]}>
              <Feather name="check-circle" size={20} color="#16a34a" />
              <Text style={[styles.validText, { color: "#16a34a" }]}>{t("gate.ticketValid")}</Text>
            </View>

            <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
              <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>
                {t("gate.ticketAttendeeInfo")}
              </Text>
              <InfoRow icon="user" label={t("gate.ticketFullName")} value={ticketAttendee.fullName || "—"} C={C} />
              {ticketAttendee.phone ? (
                <InfoRow icon="phone" label={t("gate.ticketPhone")} value={ticketAttendee.phone} C={C} />
              ) : null}
              {ticketAttendee.email ? (
                <InfoRow icon="mail" label={t("gate.ticketEmail")} value={ticketAttendee.email} C={C} />
              ) : null}
            </View>

            <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
              <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>
                {t("gate.ticketDetails")}
              </Text>
              {ticketInfo.section ? (
                <InfoRow
                  icon="map-pin"
                  label={t("gate.ticketSection")}
                  value={ticketInfo.section}
                  C={C}
                  valueBadge={ticketZone ? { text: ticketZone.name, color: ticketZone.colorHex ?? C.primary } : undefined}
                />
              ) : null}
              <InfoRow
                icon="tag"
                label={t("gate.ticketType")}
                value={ticketInfo.ticketType || (isMultiDay ? t("gate.ticketAbono") : t("gate.ticketSingle"))}
                C={C}
              />
              {isMultiDay && ticketInfo.dayLabels.length > 0 ? (
                <View style={styles.daysSection}>
                  <Text style={[styles.daysLabel, { color: C.textSecondary }]}>
                    {t("gate.ticketValidDays")}
                  </Text>
                  {ticketInfo.validDays.map((dayIdx, i) => {
                    const label = ticketInfo.dayLabels[i] || t("gate.ticketDay", { number: dayIdx + 1 });
                    const isToday = dayIdx === ticketTodayDayIndex;
                    const wasCheckedIn = ticketCheckinHistory.some((ch) => ch.dayIndex === dayIdx);
                    let statusIcon: string;
                    let statusColor: string;
                    let statusText: string;
                    if (wasCheckedIn && !isToday) {
                      statusIcon = "check-circle";
                      statusColor = "#16a34a";
                      statusText = t("gate.ticketDayCheckedIn");
                    } else if (isToday) {
                      statusIcon = "arrow-right";
                      statusColor = C.primary;
                      statusText = t("gate.ticketDayToday");
                    } else {
                      statusIcon = "circle";
                      statusColor = C.textMuted;
                      statusText = t("gate.ticketDayUpcoming");
                    }
                    return (
                      <View key={dayIdx} style={styles.dayRow}>
                        <Feather name={statusIcon as any} size={16} color={statusColor} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.dayLabel, { color: isToday ? C.text : C.textSecondary }]}>
                            {t("gate.ticketDay", { number: dayIdx + 1 })} — {label}
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.dayStatus,
                            { color: statusColor, fontFamily: isToday ? "Inter_700Bold" : "Inter_500Medium" },
                          ]}
                        >
                          {statusText}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>

            <Pressable
              style={[styles.checkinBtn, { backgroundColor: "#16a34a" }]}
              onPress={handleConfirmCheckin}
            >
              <Feather name="log-in" size={24} color="#fff" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.checkinBtnText, { color: "#fff" }]}>
                  {t("gate.confirmCheckin")}
                </Text>
                <Text style={[styles.checkinBtnSub, { color: "rgba(255,255,255,0.75)" }]}>
                  {t("gate.checkinOnly")}
                </Text>
              </View>
            </Pressable>

            {isNfcSupported() && (
              <>
                <Pressable
                  style={[styles.checkinBtn, { backgroundColor: "#0369a1" }]}
                  onPress={handleBraceletCheckin}
                >
                  <Feather name="radio" size={24} color="#fff" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.checkinBtnText, { color: "#fff" }]}>
                      {t("gate.registerBracelet")}
                    </Text>
                    <Text style={[styles.checkinBtnSub, { color: "rgba(255,255,255,0.75)" }]}>
                      {t("gate.ticketTapBraceletHint")}
                    </Text>
                  </View>
                </Pressable>
                {braceletNfcError ? (
                  <View style={styles.nfcErrorBanner}>
                    <Feather name="alert-triangle" size={16} color="#b45309" />
                    <Text style={styles.nfcErrorText}>{braceletNfcError}</Text>
                  </View>
                ) : null}
              </>
            )}
          </>
        )}

        {(pageState === "bracelet_scanning" || pageState === "bracelet_registering") && (
          <View style={[styles.loadingCard, { backgroundColor: C.card, borderColor: "#0369a1" }]}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: "#0369a122", alignItems: "center", justifyContent: "center" }}>
              <Feather name="radio" size={36} color="#0369a1" />
            </View>
            <Text style={[styles.loadingText, { color: C.text }]}>
              {pageState === "bracelet_scanning"
                ? t("gate.scanningWristband")
                : t("gate.ticketRegistering")}
            </Text>
            <Text style={[styles.resultSub, { color: C.textSecondary }]}>
              {t("gate.scanningHint")}
            </Text>
            {pageState === "bracelet_scanning" && (
              <Button
                title={t("common.cancel")}
                onPress={() => {
                  void cancelNfc().catch(() => {});
                  braceletScanningRef.current = false;
                  setPageState("confirmed");
                }}
                variant="secondary"
                style={{ marginTop: 8, width: "100%" }}
              />
            )}
          </View>
        )}

        {pageState === "qr_scanning" && showQrScanner && CameraView && (
          <View style={styles.qrContainer}>
            <View style={styles.qrCameraWrap}>
              <CameraView
                style={styles.qrCamera}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ["qr", "code128", "code39", "ean13", "ean8", "codabar"] }}
                onBarcodeScanned={(result: { data: string }) => {
                  if (result?.data) handleQrScanned(result.data);
                }}
              />
              <View style={styles.qrOverlay}>
                <View style={[styles.qrCorner, styles.qrCornerTL]} />
                <View style={[styles.qrCorner, styles.qrCornerTR]} />
                <View style={[styles.qrCorner, styles.qrCornerBL]} />
                <View style={[styles.qrCorner, styles.qrCornerBR]} />
              </View>
            </View>
            <Text style={[styles.qrHint, { color: C.textSecondary }]}>
              {t("gate.ticketScanHint")}
            </Text>
            <Pressable
              style={[styles.qrCancelBtn, { backgroundColor: C.card, borderColor: C.border }]}
              onPress={() => {
                setShowQrScanner(false);
                setPageState("ready");
                qrProcessedRef.current = false;
                resumeBarcodeFocus();
              }}
            >
              <Feather name="x" size={18} color={C.text} />
              <Text style={[styles.qrCancelText, { color: C.text }]}>{t("common.cancel")}</Text>
            </Pressable>
          </View>
        )}

        {pageState === "ready" && !showQrScanner && (
          <>
            {BROADCAST_MODE && (
              <View style={[styles.scannerCard, { backgroundColor: C.card, borderColor: C.primary + "55" }]}>
                <View style={styles.scannerHeader}>
                  <Feather name="maximize" size={20} color={C.primary} />
                  <Text style={[styles.scannerTitle, { color: C.text }]}>
                    Escanea con el lector de códigos de barra
                  </Text>
                </View>
                <Text style={[styles.barcodeHint, { color: C.textMuted }]}>
                  Apunta el lector al código QR del tiquete y presiona el gatillo.
                </Text>
                <Pressable
                  onPress={() => sendTestScan("TEST-BROADCAST-OK")}
                  style={[styles.testScanBtn, { borderColor: C.border }]}
                >
                  <Feather name="zap" size={14} color={C.textMuted} />
                  <Text style={[styles.testScanText, { color: C.textMuted }]}>
                    Probar evento de escaneo
                  </Text>
                </Pressable>
              </View>
            )}

            {!BROADCAST_MODE && (
            <View style={[styles.scannerCard, { backgroundColor: C.card, borderColor: C.border }]}>
              <View style={styles.scannerHeader}>
                <Feather name="maximize" size={20} color={C.primary} />
                <Text style={[styles.scannerTitle, { color: C.text }]}>
                  {t("gate.scanBarcode")}
                </Text>
              </View>
              <TextInput
                {...barcodeInputProps}
                style={[
                  styles.barcodeInput,
                  {
                    backgroundColor: C.inputBg,
                    color: C.text,
                    borderColor: barcodeInputProps.value.trim() ? C.primary : C.border,
                  },
                ]}
                onSubmitEditing={handleBarcodeSubmit}
                placeholder={t("gate.barcodeInputPlaceholder")}
                placeholderTextColor={C.textMuted}
                returnKeyType="go"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={[styles.barcodeHint, { color: C.textMuted }]}>
                {t("gate.barcodeInputHint")}
              </Text>
              {barcodeInputProps.value.trim() ? (
                <Button
                  title={t("gate.ticketValidating").replace("...", "")}
                  onPress={() => { pauseBarcodeFocus(); handleBarcodeSubmit(); }}
                  variant="primary"
                  style={{ marginTop: 4 }}
                />
              ) : null}
            </View>
            )}

            {hasCamera && (
              <>
                <Text style={[styles.orDivider, { color: C.textMuted }]}>
                  {t("gate.barcodeOrCamera")}
                </Text>
                <Pressable
                  style={[styles.cameraScanBtn, { backgroundColor: "#7c3aed" }]}
                  onPress={() => { pauseBarcodeFocus(); openQrScanner(); }}
                >
                  <View style={[styles.cameraScanIconWrap, { backgroundColor: "rgba(255,255,255,0.15)" }]}>
                    <Feather name="camera" size={24} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cameraScanBtnTitle, { color: "#fff" }]}>
                      {t("gate.ticketScanQr")}
                    </Text>
                    <Text style={[styles.cameraScanBtnSub, { color: "rgba(255,255,255,0.75)" }]}>
                      {t("gate.ticketScanHint")}
                    </Text>
                  </View>
                  <Feather name="arrow-right" size={20} color="rgba(255,255,255,0.7)" />
                </Pressable>
              </>
            )}
          </>
        )}

        {pageState !== "qr_scanning" && sessionHistory.length > 0 && (
          <CheckinHistoryList items={sessionHistory} />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const QR_CORNER = {
  position: "absolute" as const,
  width: 30,
  height: 30,
  borderColor: "#fff",
};

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  resultCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 28,
    alignItems: "center",
    gap: 12,
  },
  resultTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  resultSub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  countdownBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  countdownText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  errorIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 28,
    alignItems: "center",
    gap: 14,
  },
  loadingText: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  validBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 2,
  },
  validText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  infoRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  infoRowRight: {
    flex: 1,
    alignItems: "flex-end",
  },
  infoLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  infoValue: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    textAlign: "right",
  },
  zoneBadgeSmall: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  zoneDotSmall: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  zoneBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  daysSection: {
    marginTop: 4,
    gap: 8,
  },
  daysLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
  },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
  },
  dayLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  dayStatus: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  checkinBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 16,
    padding: 20,
  },
  checkinBtnText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  checkinBtnSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  scannerCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  scannerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  scannerTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  barcodeInput: {
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
  barcodeHint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  testScanBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 4,
  },
  testScanText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  orDivider: {
    textAlign: "center",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  cameraScanBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 16,
    padding: 18,
  },
  cameraScanIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  cameraScanBtnTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  cameraScanBtnSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  qrContainer: {
    gap: 16,
    alignItems: "center",
  },
  qrCameraWrap: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 20,
    overflow: "hidden",
    position: "relative",
  },
  qrCamera: {
    flex: 1,
  },
  qrOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  qrCorner: {
    ...QR_CORNER,
  },
  qrCornerTL: {
    top: 40,
    left: 40,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 8,
  },
  qrCornerTR: {
    top: 40,
    right: 40,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 8,
  },
  qrCornerBL: {
    bottom: 40,
    left: 40,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 8,
  },
  qrCornerBR: {
    bottom: 40,
    right: 40,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 8,
  },
  qrHint: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  qrCancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  qrCancelText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#dc2626",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  offlineBannerText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
  offlineBannerCount: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    marginLeft: 4,
  },
  nfcErrorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fef3c7",
    borderColor: "#f59e0b",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 8,
  },
  nfcErrorText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#92400e",
  },
});
