import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
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
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/contexts/AuthContext";
import { isNfcSupported, scanBracelet, cancelNfc } from "@/utils/nfc";
import { API_BASE_URL } from "@/constants/domain";
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
  | "scanning"
  | "scanned"
  | "submitting"
  | "success"
  | "already_registered"
  | "error"
  | "qr_scanning"
  | "ticket_validating"
  | "ticket_confirmed"
  | "ticket_nfc_scanning"
  | "ticket_registering"
  | "ticket_success"
  | "ticket_error";

interface AlreadyRegisteredInfo {
  zoneName: string | null;
  zoneColor: string | null;
  registeredAt: string | null;
  registeredByUsername: string | null;
}

function normalizeUid(raw: string): string {
  const clean = raw.replace(/[:\s\-]/g, "").toUpperCase();
  if (clean.length === 0) return "";
  return clean.match(/.{1,2}/g)?.join(":") ?? clean;
}

function formatDateTime(isoString: string | null, locale: string): string {
  if (!isoString) return "–";
  try {
    const d = new Date(isoString);
    return d.toLocaleString(locale === "es" ? "es-CO" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

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

export default function RegisterWristbandScreen() {
  const { t, i18n } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { token } = useAuth();

  const [nfcAvailable, setNfcAvailable] = useState(false);
  const [pageState, setPageState] = useState<PageState>("ready");
  const [scannedUid, setScannedUid] = useState("");
  const [manualUid, setManualUid] = useState("");
  const [guestName, setGuestName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [successCountdown, setSuccessCountdown] = useState(0);
  const [alreadyRegisteredInfo, setAlreadyRegisteredInfo] =
    useState<AlreadyRegisteredInfo | null>(null);

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

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scanningRef = useRef(false);
  const qrProcessedRef = useRef(false);

  const cameraPermissionHook = useCameraPermissions ? useCameraPermissions() : null;
  const cameraPermission = cameraPermissionHook ? cameraPermissionHook[0] : null;
  const requestCameraPermission = cameraPermissionHook ? cameraPermissionHook[1] : null;

  useEffect(() => {
    setNfcAvailable(isNfcSupported());
  }, []);

  useEffect(() => {
    if (pageState !== "scanning" && pageState !== "ticket_nfc_scanning") return;
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

  const doNfcScan = useCallback(async () => {
    if (scanningRef.current) return;
    scanningRef.current = true;
    setPageState("scanning");
    setErrorMsg("");
    try {
      const result = await scanBracelet();
      const uid = result.payload.uid;
      if (uid) {
        setScannedUid(uid);
        setPageState("scanned");
        triggerHaptic("light");
      } else {
        setPageState("ready");
      }
    } catch (err: unknown) {
      const msg = extractErrorMessage(err, "");
      if (msg === "NFC_CANCELLED" || msg === "USER_CANCELLED") {
        setPageState("ready");
      } else {
        setErrorMsg(t("gate.scanFailed"));
        setPageState("ready");
      }
    } finally {
      scanningRef.current = false;
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      if (isNfcSupported() && pageState === "ready" && !showQrScanner) {
        void doNfcScan();
      }
      return () => {
        void cancelNfc().catch(() => {});
      };
    }, []),
  );

  useEffect(() => {
    if (pageState === "success" || pageState === "ticket_success") {
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

  const useManualUid = () => {
    const normalized = normalizeUid(manualUid);
    if (!normalized) return;
    setScannedUid(normalized);
    setPageState("scanned");
    setManualUid("");
  };

  const handleConfirm = async () => {
    const uid = scannedUid;
    if (!uid) return;
    setPageState("submitting");
    setErrorMsg("");
    try {
      const body: Record<string, unknown> = { nfcUid: uid };
      if (guestName.trim()) body.attendeeName = guestName.trim();
      if (phone.trim()) body.phone = phone.trim();
      if (email.trim()) body.email = email.trim();

      const res = await fetch(`${API_BASE_URL}/api/bracelets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (res.status === 409) {
        const payload = (await res.json().catch(() => ({}))) as {
          error?: string;
          registrationInfo?: AlreadyRegisteredInfo;
        };
        if (
          payload.error === "BRACELET_ALREADY_REGISTERED" &&
          payload.registrationInfo
        ) {
          setAlreadyRegisteredInfo(payload.registrationInfo);
          setPageState("already_registered");
        } else {
          setErrorMsg(t("gate.alreadyRegistered"));
          setAlreadyRegisteredInfo(null);
          setPageState("already_registered");
        }
        triggerHaptic("error");
        return;
      }

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setErrorMsg(err.error ?? t("common.unknownError"));
        setPageState("scanned");
        triggerHaptic("error");
        return;
      }

      triggerHaptic("success");
      setPageState("success");
    } catch {
      setErrorMsg(t("common.unknownError"));
      setPageState("scanned");
      triggerHaptic("error");
    }
  };

  const handleQrScanned = useCallback(
    async (data: string) => {
      if (qrProcessedRef.current) return;
      qrProcessedRef.current = true;
      triggerHaptic("light");
      setShowQrScanner(false);
      setPageState("ticket_validating");
      setErrorMsg("");

      try {
        const res = await fetch(`${API_BASE_URL}/api/gate/validate-ticket`, {
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
          }
          setErrorMsg(`${errTitle}\n${errHint}`);
          setPageState("ticket_error");
          triggerHaptic("error");
          return;
        }

        if (payload.isAlreadyCheckedIn) {
          const checkedTime = formatTime(payload.alreadyCheckedInAt, i18n.language ?? "es");
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
        setErrorMsg(t("common.unknownError"));
        setPageState("ticket_error");
        triggerHaptic("error");
      }
    },
    [t, token, i18n.language],
  );

  const handleTicketNfcTap = useCallback(async () => {
    if (scanningRef.current) return;
    scanningRef.current = true;
    setPageState("ticket_nfc_scanning");

    try {
      const result = await scanBracelet();
      const uid = result.payload.uid;
      if (!uid) {
        setPageState("ticket_confirmed");
        scanningRef.current = false;
        return;
      }

      setPageState("ticket_registering");

      const res = await fetch(`${API_BASE_URL}/api/gate/ticket-checkin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          qrToken,
          braceletNfcUid: uid,
        }),
      });

      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errCode = payload.error as string;
        if (errCode === "ALREADY_CHECKED_IN") {
          const checkedTime = formatTime(payload.checkedInAt, i18n.language ?? "es");
          setErrorMsg(
            `${t("gate.ticketAlreadyUsed")}\n${t("gate.ticketAlreadyUsedHint", { time: checkedTime })}`,
          );
        } else if (errCode === "BRACELET_WRONG_EVENT") {
          setErrorMsg(t("gate.ticketBraceletWrongEvent"));
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

      triggerHaptic("success");
      setPageState("ticket_success");
    } catch (err: unknown) {
      const msg = extractErrorMessage(err, "");
      if (msg === "NFC_CANCELLED" || msg === "USER_CANCELLED") {
        setPageState("ticket_confirmed");
      } else {
        setErrorMsg(t("gate.scanFailed"));
        setPageState("ticket_error");
        triggerHaptic("error");
      }
    } finally {
      scanningRef.current = false;
    }
  }, [t, token, qrToken, i18n.language]);

  const resetForNext = () => {
    setScannedUid("");
    setGuestName("");
    setPhone("");
    setEmail("");
    setErrorMsg("");
    setAlreadyRegisteredInfo(null);
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
    if (isNfcSupported()) {
      void doNfcScan();
    }
  };

  const openQrScanner = async () => {
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
    void cancelNfc().catch(() => {});
    setShowQrScanner(true);
    setPageState("qr_scanning");
  };

  const normalizedManual = normalizeUid(manualUid);
  const isValidManual = [8, 14, 20].includes(
    normalizedManual.replace(/:/g, "").length,
  );
  const locale = i18n.language ?? "es";

  const isTicketFlow =
    pageState === "qr_scanning" ||
    pageState === "ticket_validating" ||
    pageState === "ticket_confirmed" ||
    pageState === "ticket_nfc_scanning" ||
    pageState === "ticket_registering" ||
    pageState === "ticket_success" ||
    pageState === "ticket_error";

  const hasCamera = CameraView !== null && Platform.OS !== "web";

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
          gap: 20,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
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
            {isTicketFlow ? t("gate.ticketScan") : t("gate.registerWristband")}
          </Text>
          <View style={{ width: 32 }} />
        </View>

        {/* ===== TICKET SUCCESS ===== */}
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
                ? t("gate.ticketSuccessHint", {
                    name: ticketSuccessName,
                    zone: ticketSuccessZone,
                  })
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
              title={t("gate.ticketScanAnother")}
              onPress={resetForNext}
              variant="primary"
              style={{ marginTop: 4, width: "100%" }}
            />
          </View>
        )}

        {/* ===== TICKET ERROR ===== */}
        {pageState === "ticket_error" && (
          <View
            style={[
              styles.resultCard,
              { backgroundColor: C.dangerLight, borderColor: C.danger },
            ]}
          >
            <View
              style={[
                styles.alreadyIconWrap,
                { backgroundColor: C.danger + "22" },
              ]}
            >
              <Feather name="x-circle" size={40} color={C.danger} />
            </View>
            <Text style={[styles.resultTitle, { color: C.danger }]}>
              {t("gate.ticketError")}
            </Text>
            {errorMsg ? (
              <Text
                style={[styles.resultSub, { color: C.textSecondary, textAlign: "center" }]}
              >
                {errorMsg}
              </Text>
            ) : null}
            <Button
              title={t("gate.ticketScanAnother")}
              onPress={resetForNext}
              variant="primary"
              style={{ marginTop: 4, width: "100%" }}
            />
          </View>
        )}

        {/* ===== TICKET VALIDATING ===== */}
        {pageState === "ticket_validating" && (
          <View
            style={[
              styles.nfcCard,
              { backgroundColor: C.card, borderColor: C.primary },
            ]}
          >
            <ActivityIndicator size="large" color={C.primary} />
            <Text style={[styles.nfcTitle, { color: C.text }]}>
              {t("gate.ticketValidating")}
            </Text>
          </View>
        )}

        {/* ===== TICKET CONFIRMED - Show attendee info + NFC tap ===== */}
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
            />
          )}

        {/* ===== QR CAMERA SCANNER ===== */}
        {pageState === "qr_scanning" && showQrScanner && CameraView && (
          <View style={styles.qrContainer}>
            <View style={styles.qrCameraWrap}>
              <CameraView
                style={styles.qrCamera}
                facing="back"
                barcodeScannerSettings={{
                  barcodeTypes: ["qr"],
                }}
                onBarcodeScanned={(result: { data: string }) => {
                  if (result?.data) {
                    handleQrScanned(result.data);
                  }
                }}
              />
              <View style={styles.qrOverlay}>
                <View style={styles.qrCornerTL} />
                <View style={styles.qrCornerTR} />
                <View style={styles.qrCornerBL} />
                <View style={styles.qrCornerBR} />
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
                if (isNfcSupported()) void doNfcScan();
              }}
            >
              <Feather name="x" size={18} color={C.text} />
              <Text style={[styles.qrCancelText, { color: C.text }]}>
                {t("common.cancel")}
              </Text>
            </Pressable>
          </View>
        )}

        {/* ===== ORIGINAL NFC REGISTRATION FLOW ===== */}

        {/* Success state — auto-resets */}
        {pageState === "success" && (
          <View
            style={[
              styles.resultCard,
              { backgroundColor: C.successLight, borderColor: C.success },
            ]}
          >
            <Feather name="check-circle" size={52} color={C.success} />
            <Text style={[styles.resultTitle, { color: C.success }]}>
              {t("gate.registerSuccess")}
            </Text>
            <Text style={[styles.resultUid, { color: C.textSecondary }]}>
              {scannedUid}
            </Text>
            <Text style={[styles.resultSub, { color: C.textSecondary }]}>
              {t("gate.registerSuccessHint")}
            </Text>
            <View
              style={[
                styles.countdownBadge,
                { backgroundColor: C.successLight, borderColor: C.success },
              ]}
            >
              <Text style={[styles.countdownText, { color: C.success }]}>
                {t("gate.registerNext")} ({successCountdown})
              </Text>
            </View>
            <Button
              title={t("gate.registerNextNow")}
              onPress={resetForNext}
              variant="primary"
              style={{ marginTop: 4, width: "100%" }}
            />
          </View>
        )}

        {/* Already-registered interstitial */}
        {pageState === "already_registered" && (
          <View
            style={[
              styles.resultCard,
              {
                backgroundColor: C.warningLight ?? C.dangerLight,
                borderColor: C.warning ?? C.danger,
              },
            ]}
          >
            <View
              style={[
                styles.alreadyIconWrap,
                { backgroundColor: (C.warning ?? C.danger) + "22" },
              ]}
            >
              <Feather
                name="alert-circle"
                size={40}
                color={C.warning ?? C.danger}
              />
            </View>
            <Text
              style={[
                styles.resultTitle,
                { color: C.warning ?? C.danger },
              ]}
            >
              {t("gate.alreadyRegistered")}
            </Text>
            <Text style={[styles.resultUid, { color: C.textSecondary }]}>
              {scannedUid}
            </Text>
            <Text style={[styles.resultSub, { color: C.textSecondary }]}>
              {t("gate.alreadyRegisteredHint")}
            </Text>

            <View
              style={[
                styles.infoTable,
                { backgroundColor: C.card, borderColor: C.border },
              ]}
            >
              <View style={styles.infoRow}>
                <View style={styles.infoRowLeft}>
                  {alreadyRegisteredInfo?.zoneColor ? (
                    <View
                      style={[
                        styles.zoneColorDot,
                        {
                          backgroundColor:
                            alreadyRegisteredInfo.zoneColor,
                        },
                      ]}
                    />
                  ) : (
                    <Feather
                      name="map-pin"
                      size={14}
                      color={C.textSecondary}
                    />
                  )}
                  <Text
                    style={[
                      styles.infoLabel,
                      { color: C.textSecondary },
                    ]}
                  >
                    {t("gate.alreadyRegisteredZone")}
                  </Text>
                </View>
                <Text style={[styles.infoValue, { color: C.text }]}>
                  {alreadyRegisteredInfo?.zoneName ??
                    t("gate.alreadyRegisteredNoZone")}
                </Text>
              </View>

              <View
                style={[styles.infoSep, { backgroundColor: C.border }]}
              />

              <View style={styles.infoRow}>
                <View style={styles.infoRowLeft}>
                  <Feather
                    name="clock"
                    size={14}
                    color={C.textSecondary}
                  />
                  <Text
                    style={[
                      styles.infoLabel,
                      { color: C.textSecondary },
                    ]}
                  >
                    {t("gate.alreadyRegisteredAt")}
                  </Text>
                </View>
                <Text style={[styles.infoValue, { color: C.text }]}>
                  {formatDateTime(
                    alreadyRegisteredInfo?.registeredAt ?? null,
                    locale,
                  )}
                </Text>
              </View>

              <View
                style={[styles.infoSep, { backgroundColor: C.border }]}
              />

              <View style={styles.infoRow}>
                <View style={styles.infoRowLeft}>
                  <Feather
                    name="user"
                    size={14}
                    color={C.textSecondary}
                  />
                  <Text
                    style={[
                      styles.infoLabel,
                      { color: C.textSecondary },
                    ]}
                  >
                    {t("gate.alreadyRegisteredBy")}
                  </Text>
                </View>
                <Text style={[styles.infoValue, { color: C.text }]}>
                  {alreadyRegisteredInfo?.registeredByUsername
                    ? `@${alreadyRegisteredInfo.registeredByUsername}`
                    : t("gate.alreadyRegisteredUnknownUser")}
                </Text>
              </View>
            </View>

            <Button
              title={t("gate.registerAnother")}
              onPress={resetForNext}
              variant="primary"
              style={{ marginTop: 4, width: "100%" }}
            />
          </View>
        )}

        {/* Scanning / Ready — NFC + QR section */}
        {(pageState === "ready" || pageState === "scanning") && !showQrScanner && (
          <>
            {/* QR Scan button */}
            {hasCamera && (
              <Pressable
                style={[styles.qrScanBtn, { backgroundColor: "#7c3aed", }]}
                onPress={openQrScanner}
              >
                <View style={[styles.qrScanIconWrap, { backgroundColor: "rgba(255,255,255,0.15)" }]}>
                  <Feather name="camera" size={28} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.qrScanBtnTitle, { color: "#fff" }]}>
                    {t("gate.ticketScanQr")}
                  </Text>
                  <Text style={[styles.qrScanBtnSub, { color: "rgba(255,255,255,0.75)" }]}>
                    {t("gate.ticketScanHint")}
                  </Text>
                </View>
                <Feather name="arrow-right" size={20} color="rgba(255,255,255,0.7)" />
              </Pressable>
            )}

            {hasCamera && (
              <Text style={[styles.orDivider, { color: C.textMuted }]}>
                {t("gate.ticketOrNfc")}
              </Text>
            )}

            {nfcAvailable && (
              <View
                style={[
                  styles.nfcCard,
                  {
                    backgroundColor: C.card,
                    borderColor:
                      pageState === "scanning" ? C.primary : C.border,
                  },
                ]}
              >
                <Animated.View
                  style={[
                    styles.nfcIconWrap,
                    {
                      backgroundColor: C.primaryLight,
                      transform: [
                        {
                          scale:
                            pageState === "scanning" ? pulseAnim : 1,
                        },
                      ],
                    },
                  ]}
                >
                  {pageState === "scanning" ? (
                    <ActivityIndicator color={C.primary} size="large" />
                  ) : (
                    <Feather name="wifi" size={40} color={C.primary} />
                  )}
                </Animated.View>

                <Text style={[styles.nfcTitle, { color: C.text }]}>
                  {pageState === "scanning"
                    ? t("gate.scanningWristband")
                    : t("gate.tapWristband")}
                </Text>
                <Text style={[styles.nfcSub, { color: C.textSecondary }]}>
                  {pageState === "scanning"
                    ? t("gate.scanningHint")
                    : t("gate.tapWristbandHint")}
                </Text>

                {pageState === "ready" && (
                  <Pressable
                    style={[styles.nfcBtn, { backgroundColor: C.primary }]}
                    onPress={doNfcScan}
                  >
                    <Feather name="wifi" size={18} color={C.primaryText} />
                    <Text
                      style={[
                        styles.nfcBtnText,
                        { color: C.primaryText },
                      ]}
                    >
                      {t("gate.startScan")}
                    </Text>
                  </Pressable>
                )}
              </View>
            )}
          </>
        )}

        {/* Error message inline */}
        {errorMsg &&
          (pageState === "ready" || pageState === "scanned") && (
            <View
              style={[
                styles.errorBanner,
                { backgroundColor: C.dangerLight, borderColor: C.danger },
              ]}
            >
              <Feather name="alert-triangle" size={16} color={C.danger} />
              <Text style={[styles.errorText, { color: C.danger }]}>
                {errorMsg}
              </Text>
            </View>
          )}

        {/* Manual UID entry */}
        {pageState === "ready" && !showQrScanner && (
          <View
            style={[
              styles.manualCard,
              { backgroundColor: C.card, borderColor: C.border },
            ]}
          >
            <Text
              style={[styles.manualTitle, { color: C.textSecondary }]}
            >
              {nfcAvailable
                ? t("gate.orManualUid")
                : t("gate.enterManualUid")}
            </Text>
            <View style={styles.manualRow}>
              <TextInput
                style={[
                  styles.manualInput,
                  {
                    backgroundColor: C.inputBg,
                    color: C.text,
                    borderColor: isValidManual ? C.primary : C.border,
                  },
                ]}
                value={manualUid}
                onChangeText={(v) => setManualUid(v.toUpperCase())}
                placeholder="A1B2C3D4"
                placeholderTextColor={C.textMuted}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <Pressable
                style={[
                  styles.manualBtn,
                  {
                    backgroundColor: isValidManual
                      ? C.primary
                      : C.border,
                  },
                ]}
                onPress={useManualUid}
                disabled={!isValidManual}
              >
                <Feather
                  name="arrow-right"
                  size={20}
                  color={isValidManual ? C.primaryText : C.textMuted}
                />
              </Pressable>
            </View>
            <Text style={[styles.manualHint, { color: C.textMuted }]}>
              {t("gate.manualUidHint")}
            </Text>
          </View>
        )}

        {/* Scanned UID + form */}
        {(pageState === "scanned" || pageState === "submitting") && (
          <>
            <View
              style={[
                styles.uidCard,
                { backgroundColor: C.primaryLight, borderColor: C.primary },
              ]}
            >
              <Feather name="wifi" size={20} color={C.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.uidLabel, { color: C.primary }]}>
                  {t("gate.wristbandUid")}
                </Text>
                <Text style={[styles.uidValue, { color: C.text }]}>
                  {scannedUid}
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  setScannedUid("");
                  setErrorMsg("");
                  setPageState("ready");
                  if (isNfcSupported()) void doNfcScan();
                }}
                hitSlop={8}
              >
                <Feather name="x" size={18} color={C.textSecondary} />
              </Pressable>
            </View>

            <View
              style={[
                styles.formCard,
                { backgroundColor: C.card, borderColor: C.border },
              ]}
            >
              <Text
                style={[styles.formTitle, { color: C.textSecondary }]}
              >
                {t("gate.guestInfo")}
              </Text>
              <Input
                label={`${t("gate.guestName")} (${t("common.optional")})`}
                value={guestName}
                onChangeText={setGuestName}
                placeholder={t("gate.guestNamePlaceholder")}
                editable={pageState !== "submitting"}
              />
              <Input
                label={`${t("gate.guestPhone")} (${t("common.optional")})`}
                value={phone}
                onChangeText={setPhone}
                placeholder="300 000 0000"
                keyboardType="phone-pad"
                editable={pageState !== "submitting"}
              />
              <Input
                label={`${t("gate.guestEmail")} (${t("common.optional")})`}
                value={email}
                onChangeText={setEmail}
                placeholder="email@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                editable={pageState !== "submitting"}
              />
            </View>

            <Button
              title={
                pageState === "submitting"
                  ? t("common.processing")
                  : t("gate.confirmRegister")
              }
              onPress={handleConfirm}
              variant="primary"
              loading={pageState === "submitting"}
              disabled={pageState === "submitting"}
            />
          </>
        )}

        {/* Session check-in history */}
        {!isTicketFlow && pageState !== "qr_scanning" && sessionHistory.length > 0 && (
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
  resultUid: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    letterSpacing: 1,
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
  alreadyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  infoTable: {
    width: "100%",
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  infoRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  infoLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  infoValue: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    textAlign: "right",
    flex: 1,
  },
  infoSep: { height: 1, marginHorizontal: 16 },
  zoneColorDot: { width: 12, height: 12, borderRadius: 6 },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  errorText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  nfcCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 28,
    alignItems: "center",
    gap: 14,
  },
  nfcIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  nfcTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  nfcSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  nfcBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  nfcBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  manualCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  manualTitle: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  manualRow: { flexDirection: "row", gap: 10 },
  manualInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  manualBtn: {
    width: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  manualHint: { fontSize: 12, fontFamily: "Inter_400Regular" },
  uidCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  uidLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  uidValue: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
    marginTop: 2,
  },
  formCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    gap: 14,
  },
  formTitle: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  qrScanBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 16,
    padding: 18,
  },
  qrScanIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  qrScanBtnTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  qrScanBtnSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  orDivider: {
    textAlign: "center",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.8,
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
  qrCornerTL: {
    ...QR_CORNER,
    top: 40,
    left: 40,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 8,
  },
  qrCornerTR: {
    ...QR_CORNER,
    top: 40,
    right: 40,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 8,
  },
  qrCornerBL: {
    ...QR_CORNER,
    bottom: 40,
    left: 40,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 8,
  },
  qrCornerBR: {
    ...QR_CORNER,
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
});
