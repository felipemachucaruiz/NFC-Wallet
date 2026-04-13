import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
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
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";
import { useZoneCache } from "@/contexts/ZoneCacheContext";
import { isNfcSupported, scanBracelet, cancelNfc } from "@/utils/nfc";
import { API_BASE_URL } from "@/constants/domain";

let Haptics: typeof import("expo-haptics") | null = null;
try {
  Haptics = require("expo-haptics");
} catch {}

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

type ScanState = "scanning" | "registering" | "success" | "error";

interface RegisterResult {
  braceletNfcUid: string;
  zoneGranted: boolean;
  alreadyExisted?: boolean;
}

const GATE_FETCH_TIMEOUT = 8000;
function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GATE_FETCH_TIMEOUT);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export default function RegisterDirectScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { token, user } = useAuth();
  const { getZoneById } = useZoneCache();

  const assignedZone = user?.gateZoneId ? getZoneById(user.gateZoneId) : null;

  const [scanState, setScanState] = useState<ScanState>("scanning");
  const [result, setResult] = useState<RegisterResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [sessionCount, setSessionCount] = useState(0);
  const [lastUid, setLastUid] = useState<string | null>(null);

  const scanningRef = useRef(false);
  const cancelledRef = useRef(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const nfcAvailable = isNfcSupported();

  useEffect(() => {
    if (scanState !== "scanning") return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.2, duration: 650, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 650, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [scanState]);

  useEffect(() => {
    if (scanState !== "success" && scanState !== "error") return;
    Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    const duration = 5;
    setCountdown(duration);
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          handleScanNext();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [scanState]);

  const doScan = useCallback(async () => {
    if (scanningRef.current || !nfcAvailable) return;
    scanningRef.current = true;
    cancelledRef.current = false;
    setScanState("scanning");
    setResult(null);
    setErrorMsg("");
    fadeAnim.setValue(0);

    try {
      const scanResult = await scanBracelet();

      if (cancelledRef.current) return;

      const nfcUid = scanResult.payload.uid;
      setLastUid(nfcUid);
      setScanState("registering");
      triggerHaptic("light");

      const resp = await fetchWithTimeout(`${API_BASE_URL}/gate/bracelet-register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ braceletNfcUid: nfcUid }),
      });

      if (cancelledRef.current) return;

      const data = await resp.json();

      if (!resp.ok) {
        const code = data?.error ?? "UNKNOWN";
        if (code === "BRACELET_WRONG_EVENT") {
          setErrorMsg(t("gate.braceletWrongEvent"));
        } else {
          setErrorMsg(data?.message ?? t("gate.directRegisterError"));
        }
        triggerHaptic("error");
        setScanState("error");
        return;
      }

      setResult({
        braceletNfcUid: nfcUid,
        zoneGranted: data.zoneGranted ?? false,
        alreadyExisted: !data.ok,
      });
      setSessionCount((n) => n + 1);
      triggerHaptic("success");
      setScanState("success");
    } catch (err: unknown) {
      if (cancelledRef.current) return;
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("cancelled") || msg.includes("aborted")) return;
      setErrorMsg(t("gate.directRegisterError"));
      triggerHaptic("error");
      setScanState("error");
    } finally {
      scanningRef.current = false;
    }
  }, [nfcAvailable, token, t]);

  const handleScanNext = useCallback(() => {
    cancelNfc().catch(() => {});
    setResult(null);
    setErrorMsg("");
    fadeAnim.setValue(0);
    setScanState("scanning");
    setTimeout(() => doScan(), 300);
  }, [doScan, fadeAnim]);

  useFocusEffect(
    useCallback(() => {
      cancelledRef.current = false;
      if (nfcAvailable) {
        setTimeout(() => doScan(), 200);
      }
      return () => {
        cancelledRef.current = true;
        cancelNfc().catch(() => {});
      };
    }, [doScan, nfcAvailable])
  );

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: isWeb ? 67 : insets.top + 16,
            backgroundColor: C.card,
            borderBottomColor: C.border,
          },
        ]}
      >
        <Pressable onPress={() => { cancelNfc().catch(() => {}); router.back(); }} hitSlop={10}>
          <Feather name="arrow-left" size={22} color={C.text} />
        </Pressable>
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={[styles.headerTitle, { color: C.text }]}>{t("gate.registerBraceletDirect")}</Text>
          {user?.eventName ? (
            <Text style={[styles.headerSub, { color: C.textSecondary }]}>{user.eventName}</Text>
          ) : null}
        </View>
        {sessionCount > 0 && (
          <View style={[styles.countBadge, { backgroundColor: C.primary }]}>
            <Text style={[styles.countText, { color: C.primaryText }]}>{sessionCount}</Text>
          </View>
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}
        alwaysBounceVertical={false}
      >
        {assignedZone && (
          <View style={[styles.zoneBadge, { backgroundColor: assignedZone.colorHex + "22", borderColor: assignedZone.colorHex }]}>
            <View style={[styles.zoneDot, { backgroundColor: assignedZone.colorHex }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.zoneBadgeLabel, { color: assignedZone.colorHex }]}>{t("gate.yourZone")}</Text>
              <Text style={[styles.zoneBadgeName, { color: assignedZone.colorHex }]}>{assignedZone.name}</Text>
            </View>
          </View>
        )}

        {(scanState === "scanning" || scanState === "registering") && (
          <View style={styles.scanCenter}>
            <Animated.View
              style={[
                styles.nfcPulse,
                {
                  backgroundColor: C.primaryLight,
                  transform: [{ scale: pulseAnim }],
                },
              ]}
            >
              <Feather
                name={scanState === "registering" ? "loader" : "wifi"}
                size={56}
                color={C.primary}
              />
            </Animated.View>
            <Text style={[styles.scanTitle, { color: C.text }]}>
              {scanState === "registering" ? t("gate.directRegistering") : t("gate.tapBraceletRegister")}
            </Text>
            <Text style={[styles.scanHint, { color: C.textSecondary }]}>
              {scanState === "registering"
                ? t("gate.directRegisteringHint")
                : t("gate.tapBraceletRegisterHint")}
            </Text>
          </View>
        )}

        {scanState === "success" && result && (
          <Animated.View style={[styles.resultCard, { backgroundColor: C.card, borderColor: "#16a34a", opacity: fadeAnim }]}>
            <View style={[styles.resultIcon, { backgroundColor: "#dcfce7" }]}>
              <Feather name="check-circle" size={44} color="#16a34a" />
            </View>
            <Text style={[styles.resultTitle, { color: "#16a34a" }]}>{t("gate.braceletRegistered")}</Text>
            <Text style={[styles.resultUid, { color: C.textSecondary }]}>{result.braceletNfcUid}</Text>
            {result.zoneGranted && assignedZone ? (
              <View style={[styles.zoneGrantRow, { backgroundColor: assignedZone.colorHex + "22", borderColor: assignedZone.colorHex }]}>
                <View style={[styles.zoneDot, { backgroundColor: assignedZone.colorHex }]} />
                <Text style={[styles.zoneGrantText, { color: assignedZone.colorHex }]}>
                  {t("gate.accessGranted", { zone: assignedZone.name })}
                </Text>
              </View>
            ) : null}
            <Text style={[styles.countdownText, { color: C.textMuted }]}>
              {t("gate.nextScanIn", { count: countdown })}
            </Text>
            <Button title={t("gate.scanNext")} onPress={handleScanNext} variant="primary" size="md" fullWidth />
          </Animated.View>
        )}

        {scanState === "error" && (
          <Animated.View style={[styles.resultCard, { backgroundColor: C.card, borderColor: C.danger ?? "#ef4444", opacity: fadeAnim }]}>
            <View style={[styles.resultIcon, { backgroundColor: C.dangerLight ?? "#fee2e2" }]}>
              <Feather name="x-circle" size={44} color={C.danger ?? "#ef4444"} />
            </View>
            <Text style={[styles.resultTitle, { color: C.danger ?? "#ef4444" }]}>{t("gate.directRegisterFailed")}</Text>
            <Text style={[styles.resultSub, { color: C.textSecondary }]}>{errorMsg}</Text>
            {lastUid ? (
              <Text style={[styles.resultUid, { color: C.textMuted }]}>{lastUid}</Text>
            ) : null}
            <Text style={[styles.countdownText, { color: C.textMuted }]}>
              {t("gate.nextScanIn", { count: countdown })}
            </Text>
            <Button title={t("gate.tryAgain")} onPress={handleScanNext} variant="primary" size="md" fullWidth />
          </Animated.View>
        )}

        {!nfcAvailable && (
          <View style={styles.scanCenter}>
            <View style={[styles.nfcPulse, { backgroundColor: C.warningLight }]}>
              <Feather name="wifi-off" size={56} color={C.warning} />
            </View>
            <Text style={[styles.scanTitle, { color: C.text }]}>{t("gate.nfcNotAvailable")}</Text>
            <Text style={[styles.scanHint, { color: C.textSecondary }]}>{t("gate.nfcNotAvailableHint")}</Text>
          </View>
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
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  countBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  countText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  body: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    gap: 20,
    alignItems: "stretch",
  },
  zoneBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
  },
  zoneDot: { width: 14, height: 14, borderRadius: 7 },
  zoneBadgeLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8 },
  zoneBadgeName: { fontSize: 18, fontFamily: "Inter_700Bold", marginTop: 2 },
  scanCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    paddingVertical: 48,
  },
  nfcPulse: {
    width: 120,
    height: 120,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  scanTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  scanHint: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", maxWidth: 280 },
  resultCard: {
    borderRadius: 20,
    borderWidth: 2,
    padding: 28,
    alignItems: "center",
    gap: 14,
  },
  resultIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  resultTitle: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  resultSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  resultUid: { fontSize: 12, fontFamily: "Inter_400Regular", letterSpacing: 1 },
  zoneGrantRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    width: "100%",
  },
  zoneGrantText: { fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1 },
  countdownText: { fontSize: 13, fontFamily: "Inter_400Regular" },
});
