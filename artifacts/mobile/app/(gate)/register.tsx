import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { Button } from "@/components/ui/Button";
import { extractErrorMessage } from "@/utils/errorMessage";
import { useAuth } from "@/contexts/AuthContext";
import { isNfcSupported, scanBracelet, cancelNfc } from "@/utils/nfc";
import { useOfflineGate } from "@/hooks/useOfflineGate";
import {
  verifyQrTokenOffline,
  resolveTicketOffline,
} from "@/utils/offlineTickets";
import { API_BASE_URL } from "@/constants/domain";

const GATE_FETCH_TIMEOUT = 5000;

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = GATE_FETCH_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}
import {
  TicketConfirmation,
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
  | "ticket_validating"
  | "ticket_confirmed"
  | "ticket_nfc_scanning"
  | "ticket_registering"
  | "ticket_success"
  | "ticket_error";

function formatTime(isoString: string | Date | null, locale: string): string {
  if (!isoString) return "–";
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString(locale === "es" ? "es-CO" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
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

export default function RegisterBraceletScreen() {
  const { t, i18n } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { token } = useAuth();
  const { isOnline, eventData, pendingCount } = useOfflineGate();

  const [pageState, setPageState] = useState<PageState>("ready");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [successCountdown, setSuccessCountdown] = useState(0);

  const [ticketAttendee, setTicketAttendee] = useState<TicketAttendee | null>(null);
  const [ticketInfo, setTicketInfo] = useState<TicketInfo | null>(null);
  const [ticketZone, setTicketZone] = useState<TicketZone | null>(null);
  const [ticketTodayDayIndex, setTicketTodayDayIndex] = useState(0);
  const [ticketCheckinHistory, setTicketCheckinHistory] = useState<CheckinHistoryEntry[]>([]);
  const [qrToken, setQrToken] = useState("");
  const [ticketSuccessName, setTicketSuccessName] = useState("");
  const [ticketSuccessZone, setTicketSuccessZone] = useState("");
  const [ticketSuccessBraceletUid, setTicketSuccessBraceletUid] = useState("");
  const [sessionHistory, setSessionHistory] = useState<CheckinHistoryListItem[]>([]);
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [nfcRetryError, setNfcRetryError] = useState<string | null>(null);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scanningRef = useRef(false);
  const qrProcessedRef = useRef(false);
  const barcodeInputRef = useRef<TextInput>(null);
  const barcodePausedRef = useRef(false);
  const refocusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const REFOCUS_DELAY_MS = 4000;

  const cameraPermissionHook = useCameraPermissions ? useCameraPermissions() : null;
  const cameraPermission = cameraPermissionHook ? cameraPermissionHook[0] : null;
  const requestCameraPermission = cameraPermissionHook ? cameraPermissionHook[1] : null;

  const locale = i18n.language ?? "es";
  const hasCamera = CameraView !== null && Platform.OS !== "web";

  const scheduleRefocus = useCallback(() => {
    if (refocusTimerRef.current) clearTimeout(refocusTimerRef.current);
    refocusTimerRef.current = setTimeout(() => {
      barcodePausedRef.current = false;
      if (pageState === "ready") barcodeInputRef.current?.focus();
    }, REFOCUS_DELAY_MS);
  }, [pageState]);

  const pauseBarcodeFocus = useCallback(() => {
    barcodePausedRef.current = true;
    barcodeInputRef.current?.blur();
    scheduleRefocus();
  }, [scheduleRefocus]);

  const refocusBarcodeInput = useCallback(() => {
    if (!barcodePausedRef.current && pageState === "ready") {
      setTimeout(() => barcodeInputRef.current?.focus(), 100);
    }
  }, [pageState]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" && !barcodePausedRef.current && pageState === "ready") {
        barcodeInputRef.current?.focus();
      }
    });
    return () => subscription.remove();
  }, [pageState]);

  useEffect(() => {
    return () => {
      if (refocusTimerRef.current) clearTimeout(refocusTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (pageState === "ready" && !showQrScanner) {
      const t = setTimeout(() => barcodeInputRef.current?.focus(), 300);
      return () => clearTimeout(t);
    }
  }, [pageState, showQrScanner]);

  useEffect(() => {
    if (pageState !== "ticket_nfc_scanning") return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 650,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pageState]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        void cancelNfc().catch(() => {});
      };
    }, []),
  );

  useEffect(() => {
    if (pageState === "ticket_success") {
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
        setPageState("ticket_error");
        triggerHaptic("error");
        return;
      }
      const result = verifyQrTokenOffline(data, eventData);
      if (!result) {
        setErrorMsg(`${t("gate.ticketInvalid")}\n${t("gate.ticketInvalidHint")}`);
        setPageState("ticket_error");
        triggerHaptic("error");
        return;
      }
      const resolved = resolveTicketOffline(result.ticketId, eventData);
      if (!resolved) {
        setErrorMsg(`${t("gate.ticketAttendeeNotFound")}\n${t("gate.ticketAttendeeNotFoundHint")}`);
        setPageState("ticket_error");
        triggerHaptic("error");
        return;
      }
      if (resolved.ticket.status === "cancelled") {
        setErrorMsg(`${t("gate.ticketInvalid")}\n${t("gate.ticketInvalidHint")}`);
        setPageState("ticket_error");
        triggerHaptic("error");
        return;
      }
      if (resolved.todayDayIndex < 0) {
        setErrorMsg(`${t("gate.ticketEventNotStarted")}\n${t("gate.ticketEventNotStartedHint")}`);
        setPageState("ticket_error");
        triggerHaptic("error");
        return;
      }
      const todayCheckin = resolved.checkins.find(c => c.eventDayIndex === resolved.todayDayIndex);
      if (todayCheckin) {
        const checkedTime = formatTime(todayCheckin.checkedInAt, locale);
        setErrorMsg(`${t("gate.ticketAlreadyUsed")}\n${t("gate.ticketAlreadyUsedHint", { time: checkedTime })}`);
        setPageState("ticket_error");
        triggerHaptic("error");
        return;
      }
      if (resolved.validDays.length > 0 && !resolved.validDays.includes(resolved.todayDayIndex)) {
        setErrorMsg(`${t("gate.ticketWrongDay")}\n${t("gate.ticketWrongDayHint")}`);
        setPageState("ticket_error");
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
      setPageState("ticket_confirmed");
      triggerHaptic("success");
    },
    [eventData, t, locale],
  );

  const validateTicket = useCallback(
    async (data: string) => {
      setPageState("ticket_validating");
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
          if (errCode === "WRONG_EVENT") {
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
          setPageState("ticket_error");
          triggerHaptic("error");
          return;
        }

        if (payload.isAlreadyCheckedIn) {
          const checkedTime = formatTime(payload.alreadyCheckedInAt, locale);
          setErrorMsg(
            `${t("gate.ticketAlreadyUsed")}\n${t("gate.ticketAlreadyUsedHint", { time: checkedTime })}`,
          );
          setPageState("ticket_error");
          triggerHaptic("error");
          return;
        }

        if (!payload.isValidForToday) {
          setErrorMsg(`${t("gate.ticketWrongDay")}\n${t("gate.ticketWrongDayHint")}`);
          setPageState("ticket_error");
          triggerHaptic("error");
          return;
        }

        setTicketAttendee(payload.attendee);
        setTicketInfo(payload.ticket);
        setTicketZone(payload.zone);
        setTicketTodayDayIndex(payload.todayDayIndex);
        setTicketCheckinHistory(payload.checkinHistory ?? []);
        setQrToken(data);
        setPageState("ticket_confirmed");
        triggerHaptic("success");
      } catch {
        validateTicketOffline(data);
      }
    },
    [t, token, locale, isOnline, validateTicketOffline],
  );

  const handleBarcodeSubmit = useCallback(() => {
    const trimmed = barcodeInput.trim();
    if (!trimmed) return;
    setBarcodeInput("");
    validateTicket(trimmed);
  }, [barcodeInput, validateTicket]);

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

  const handleTicketNfcTap = useCallback(async () => {
    if (scanningRef.current) return;
    scanningRef.current = true;
    setNfcRetryError(null);
    setPageState("ticket_nfc_scanning");

    let nfcDone = false;
    try {
      const result = await scanBracelet();
      nfcDone = true;
      const uid = result.payload.uid;
      if (!uid) {
        setPageState("ticket_confirmed");
        scanningRef.current = false;
        return;
      }

      setPageState("ticket_registering");

      const res = await fetchWithTimeout(`${API_BASE_URL}/api/gate/ticket-checkin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          qrToken,
          braceletNfcUid: uid,
        }),
      }, 8000);

      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errCode = payload.error as string;
        if (errCode === "ALREADY_CHECKED_IN") {
          const checkedTime = formatTime(payload.checkedInAt, locale);
          setErrorMsg(
            `${t("gate.ticketAlreadyUsed")}\n${t("gate.ticketAlreadyUsedHint", { time: checkedTime })}`,
          );
        } else if (errCode === "BRACELET_WRONG_EVENT") {
          setErrorMsg(t("gate.ticketBraceletWrongEvent"));
        } else if (errCode === "EVENT_NOT_STARTED") {
          setErrorMsg(`${t("gate.ticketEventNotStarted")}\n${t("gate.ticketEventNotStartedHint")}`);
        } else if (errCode === "WRONG_DAY") {
          setErrorMsg(`${t("gate.ticketWrongDay")}\n${t("gate.ticketWrongDayHint")}`);
        } else {
          setErrorMsg(payload.message ?? t("gate.ticketError"));
        }
        setPageState("ticket_error");
        triggerHaptic("error");
        scanningRef.current = false;
        return;
      }

      const attendeeName = payload.attendee?.fullName ?? "";
      const zoneName = payload.zone?.name ?? "";

      setTicketSuccessName(attendeeName);
      setTicketSuccessZone(zoneName);
      setTicketSuccessBraceletUid(uid);

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

      setNfcRetryError(null);
      triggerHaptic("success");
      setPageState("ticket_success");
    } catch (err: unknown) {
      const msg = extractErrorMessage(err, "");
      if (msg === "NFC_CANCELLED" || msg === "USER_CANCELLED") {
        setPageState("ticket_confirmed");
      } else if (nfcDone) {
        // NFC read succeeded but network request failed — show error state (real issue)
        setErrorMsg(t("gate.scanFailed"));
        setPageState("ticket_error");
        triggerHaptic("error");
      } else {
        // NFC read itself failed (tag lost, connection issue, etc.) — let user retry
        const isTagLost = msg.toLowerCase().includes("tag") || msg.toLowerCase().includes("lost") || msg.toLowerCase().includes("connection");
        const retryMsg = isTagLost
          ? t("gate.nfcTagLost")
          : t("gate.nfcScanRetry");
        setNfcRetryError(retryMsg);
        setPageState("ticket_confirmed");
        triggerHaptic("error");
      }
    } finally {
      scanningRef.current = false;
    }
  }, [t, token, qrToken, locale]);

  const resetForNext = () => {
    setErrorMsg("");
    setNfcRetryError(null);
    setTicketAttendee(null);
    setTicketInfo(null);
    setTicketZone(null);
    setQrToken("");
    setTicketSuccessName("");
    setTicketSuccessZone("");
    setTicketSuccessBraceletUid("");
    qrProcessedRef.current = false;
    setPageState("ready");
    setShowQrScanner(false);
    setBarcodeInput("");
    setTimeout(() => barcodeInputRef.current?.focus(), 200);
  };

  const openQrScanner = async () => {
    void cancelNfc().catch(() => {});
    if (!cameraPermission?.granted && requestCameraPermission) {
      const perm = await requestCameraPermission();
      if (!perm.granted) {
        setErrorMsg(t("gate.ticketCameraPermissionDenied"));
        setPageState("ticket_error");
        triggerHaptic("error");
        return;
      }
    }
    qrProcessedRef.current = false;
    setShowQrScanner(true);
    setPageState("qr_scanning");
  };

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
            onPress={() => {
              void cancelNfc().catch(() => {});
              router.back();
            }}
            style={styles.backBtn}
            hitSlop={8}
          >
            <Feather name="arrow-left" size={22} color={C.text} />
          </Pressable>
          <Text style={[styles.title, { color: C.text }]}>
            {t("gate.registerBracelet")}
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

        {pageState === "ticket_success" && (
          <View
            style={[
              styles.resultCard,
              { backgroundColor: "#16a34a11", borderColor: "#16a34a" },
            ]}
          >
            <Feather name="check-circle" size={52} color="#16a34a" />
            <Text style={[styles.resultTitle, { color: "#16a34a" }]}>
              {t("gate.ticketSuccess")}
            </Text>
            <Text style={[styles.resultSub, { color: C.textSecondary }]}>
              {ticketSuccessZone
                ? t("gate.ticketSuccessHint", { name: ticketSuccessName, zone: ticketSuccessZone })
                : t("gate.ticketSuccessNoZone", { name: ticketSuccessName })}
            </Text>
            {ticketSuccessBraceletUid ? (
              <View style={styles.successMeta}>
                <Feather name="wifi" size={14} color={C.textMuted} />
                <Text style={[styles.successMetaText, { color: C.textMuted }]}>
                  {ticketSuccessBraceletUid}
                </Text>
              </View>
            ) : null}
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

        {pageState === "ticket_error" && (
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

        {pageState === "ticket_validating" && (
          <View style={[styles.loadingCard, { backgroundColor: C.card, borderColor: C.primary }]}>
            <ActivityIndicator size="large" color={C.primary} />
            <Text style={[styles.loadingText, { color: C.text }]}>
              {t("gate.ticketValidating")}
            </Text>
          </View>
        )}

        {(pageState === "ticket_confirmed" ||
          pageState === "ticket_nfc_scanning" ||
          pageState === "ticket_registering") &&
          ticketAttendee &&
          ticketInfo && (
            <TicketConfirmation
              attendee={ticketAttendee}
              ticket={ticketInfo}
              zone={ticketZone}
              todayDayIndex={ticketTodayDayIndex}
              checkinHistory={ticketCheckinHistory}
              onTapBracelet={handleTicketNfcTap}
              isRegistering={
                pageState === "ticket_nfc_scanning" ||
                pageState === "ticket_registering"
              }
              nfcError={nfcRetryError}
            />
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
                setTimeout(() => barcodeInputRef.current?.focus(), 200);
              }}
            >
              <Feather name="x" size={18} color={C.text} />
              <Text style={[styles.qrCancelText, { color: C.text }]}>{t("common.cancel")}</Text>
            </Pressable>
          </View>
        )}

        {pageState === "ready" && !showQrScanner && (
          <>
            <View style={[styles.scannerCard, { backgroundColor: C.card, borderColor: C.border }]}>
              <View style={styles.scannerHeader}>
                <Feather name="maximize" size={20} color={C.primary} />
                <Text style={[styles.scannerTitle, { color: C.text }]}>
                  {t("gate.scanBarcode")}
                </Text>
              </View>
              <TextInput
                ref={barcodeInputRef}
                style={[
                  styles.barcodeInput,
                  {
                    backgroundColor: C.inputBg,
                    color: C.text,
                    borderColor: barcodeInput.trim() ? C.primary : C.border,
                  },
                ]}
                value={barcodeInput}
                onChangeText={setBarcodeInput}
                onSubmitEditing={handleBarcodeSubmit}
                onBlur={refocusBarcodeInput}
                placeholder={t("gate.barcodeInputPlaceholder")}
                placeholderTextColor={C.textMuted}
                autoFocus
                showSoftInputOnFocus={false}
                returnKeyType="go"
                blurOnSubmit={false}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={[styles.barcodeHint, { color: C.textMuted }]}>
                {t("gate.barcodeInputHint")}
              </Text>
              {barcodeInput.trim() ? (
                <Button
                  title={t("gate.ticketValidating").replace("...", "")}
                  onPress={() => { pauseBarcodeFocus(); handleBarcodeSubmit(); }}
                  variant="primary"
                  style={{ marginTop: 4 }}
                />
              ) : null}
            </View>

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
  successMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  successMetaText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.5,
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
});
