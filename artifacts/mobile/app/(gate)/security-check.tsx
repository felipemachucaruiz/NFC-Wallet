import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import type { AccessZone } from "@/contexts/ZoneCacheContext";

type ScanState = "zone-select" | "scanning" | "checking" | "result" | "error";

interface CheckResult {
  granted: boolean;
  attendeeName: string | null;
  zones: AccessZone[];
  reason?: string;
}

export default function SecurityCheckScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { token, user } = useAuth();
  const { zones } = useZoneCache();

  const [scanState, setScanState] = useState<ScanState>("zone-select");
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(user?.gateZoneId ?? null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [countdown, setCountdown] = useState(0);
  const scanningRef = useRef(false);
  const cancelledRef = useRef(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const fadeAnim = useRef(new Animated.Value(0)).current;

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
    if (scanState !== "result" || !result) return;
    Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();

    setCountdown(8);
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
  }, [scanState, result]);

  useFocusEffect(
    useCallback(() => {
      cancelledRef.current = false;
      return () => {
        cancelledRef.current = true;
        cancelNfc().catch(() => {});
        scanningRef.current = false;
      };
    }, [])
  );

  const startScan = useCallback(async () => {
    if (!selectedZoneId) return;
    if (scanningRef.current) return;
    scanningRef.current = true;
    cancelledRef.current = false;
    setScanState("scanning");
    setErrorMsg("");
    setResult(null);

    try {
      const scanResult = await scanBracelet();
      if (cancelledRef.current) return;

      const uid = scanResult.payload.uid;
      if (!uid) {
        setScanState("zone-select");
        return;
      }

      setScanState("checking");

      const res = await fetch(`${API_BASE_URL}/api/bracelets/${uid}/check-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ zoneId: selectedZoneId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        setErrorMsg(err.error ?? t("common.unknownError"));
        setScanState("error");
        return;
      }

      const data = await res.json() as CheckResult;
      fadeAnim.setValue(0);
      setResult(data);
      setScanState("result");
    } catch (e: unknown) {
      if (cancelledRef.current) return;
      const msg = e instanceof Error ? e.message : "";
      if (msg === "NFC_CANCELLED" || msg === "USER_CANCELLED" || msg.includes("cancel")) {
        setScanState("zone-select");
      } else {
        setErrorMsg(msg || t("common.unknownError"));
        setScanState("error");
      }
    } finally {
      scanningRef.current = false;
    }
  }, [selectedZoneId, token, t]);

  const handleScanNext = useCallback(() => {
    setResult(null);
    setErrorMsg("");
    setScanState("zone-select");
    fadeAnim.setValue(0);
  }, []);

  const selectedZone = zones.find((z) => z.id === selectedZoneId);

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
        <Pressable onPress={() => { void cancelNfc().catch(() => {}); router.back(); }} hitSlop={8}>
          <Feather name="arrow-left" size={22} color={C.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: C.text }]}>{t("gate.securityCheck")}</Text>
        <View style={{ width: 30 }} />
      </View>

      {/* Full-screen result overlay */}
      {scanState === "result" && result && (
        <Animated.View
          style={[
            styles.resultOverlay,
            { opacity: fadeAnim, backgroundColor: result.granted ? "#15803d" : "#b91c1c" },
          ]}
        >
          <Pressable style={styles.resultContent} onPress={handleScanNext}>
            <Feather
              name={result.granted ? "check-circle" : "x-circle"}
              size={96}
              color="#fff"
            />
            <Text style={styles.resultStatusText}>
              {result.granted ? t("gate.accessGranted") : t("gate.accessDenied")}
            </Text>

            {result.attendeeName ? (
              <Text style={styles.resultAttendeeName}>{result.attendeeName}</Text>
            ) : null}

            {result.zones.length > 0 && (
              <View style={styles.resultZoneList}>
                <Text style={styles.resultZonesLabel}>{t("gate.currentZones")}:</Text>
                <View style={styles.resultZoneBadges}>
                  {result.zones.map((z) => (
                    <View key={z.id} style={[styles.resultZoneBadge, { backgroundColor: z.colorHex + "33", borderColor: z.colorHex }]}>
                      <View style={[styles.resultZoneDot, { backgroundColor: z.colorHex }]} />
                      <Text style={[styles.resultZoneBadgeText, { color: "#fff" }]}>{z.name}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            <View style={[styles.countdownBadge, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
              <Text style={styles.countdownText}>{t("gate.scanNext")} ({countdown})</Text>
            </View>
          </Pressable>
        </Animated.View>
      )}

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 24,
          paddingBottom: isWeb ? 34 : insets.bottom + 40,
          gap: 20,
        }}
      >
        {/* Zone selector */}
        <View style={[styles.section, { backgroundColor: C.card, borderColor: C.border }]}>
          <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>{t("gate.checkingZone")}</Text>
          {zones.length === 0 ? (
            <Text style={[styles.noZones, { color: C.textMuted }]}>{t("zones.empty")}</Text>
          ) : (
            <View style={styles.zoneGrid}>
              {zones.map((z) => (
                <Pressable
                  key={z.id}
                  onPress={() => setSelectedZoneId(z.id)}
                  style={[
                    styles.zoneChip,
                    {
                      backgroundColor: selectedZoneId === z.id ? z.colorHex : C.inputBg,
                      borderColor: selectedZoneId === z.id ? z.colorHex : C.border,
                    },
                  ]}
                >
                  <View style={[styles.zoneChipDot, { backgroundColor: selectedZoneId === z.id ? "#fff" : z.colorHex }]} />
                  <Text style={[styles.zoneChipText, { color: selectedZoneId === z.id ? "#fff" : C.text }]}>
                    {z.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* Scan state */}
        {(scanState === "zone-select" || scanState === "error") && (
          <View style={[styles.nfcCard, { backgroundColor: C.card, borderColor: C.border }]}>
            <View style={[styles.nfcIconWrap, { backgroundColor: C.primaryLight }]}>
              <Feather name="wifi" size={40} color={C.primary} />
            </View>
            <Text style={[styles.nfcTitle, { color: C.text }]}>{t("gate.tapWristband")}</Text>
            <Text style={[styles.nfcSub, { color: C.textSecondary }]}>{t("gate.tapWristbandForCheck")}</Text>

            {scanState === "error" && (
              <View style={[styles.errorBanner, { backgroundColor: C.dangerLight, borderColor: C.danger }]}>
                <Feather name="alert-circle" size={14} color={C.danger} />
                <Text style={[styles.errorText, { color: C.danger }]}>{errorMsg}</Text>
              </View>
            )}

            <Button
              title={isNfcSupported() ? t("gate.startScan") : t("common.notSupported")}
              onPress={startScan}
              variant="primary"
              disabled={!selectedZoneId || !isNfcSupported()}
              style={{ width: "100%" }}
            />
          </View>
        )}

        {scanState === "scanning" && (
          <View style={[styles.nfcCard, { backgroundColor: C.card, borderColor: C.primary }]}>
            <Animated.View
              style={[
                styles.nfcIconWrap,
                { backgroundColor: C.primaryLight, transform: [{ scale: pulseAnim }] },
              ]}
            >
              <ActivityIndicator color={C.primary} size="large" />
            </Animated.View>
            <Text style={[styles.nfcTitle, { color: C.text }]}>{t("gate.scanningWristband")}</Text>
            <Text style={[styles.nfcSub, { color: C.textSecondary }]}>{t("gate.scanningHint")}</Text>
            <Pressable
              onPress={() => { cancelledRef.current = true; cancelNfc().catch(() => {}); setScanState("zone-select"); }}
              style={[styles.cancelBtn, { borderColor: C.border }]}
            >
              <Text style={[styles.cancelText, { color: C.textSecondary }]}>{t("common.cancel")}</Text>
            </Pressable>
          </View>
        )}

        {scanState === "checking" && (
          <View style={[styles.nfcCard, { backgroundColor: C.card, borderColor: C.primary }]}>
            <ActivityIndicator size="large" color={C.primary} />
            <Text style={[styles.nfcTitle, { color: C.text }]}>{t("gate.checkingAccess")}</Text>
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
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  section: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  noZones: { fontSize: 13, fontFamily: "Inter_400Regular" },
  zoneGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  zoneChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 100,
    borderWidth: 2,
  },
  zoneChipDot: { width: 8, height: 8, borderRadius: 4 },
  zoneChipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
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
  nfcTitle: { fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  nfcSub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    width: "100%",
  },
  errorText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  cancelBtn: { borderWidth: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 32 },
  cancelText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  resultOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    justifyContent: "center",
    alignItems: "center",
  },
  resultContent: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 16,
  },
  resultStatusText: {
    fontSize: 32,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    textAlign: "center",
  },
  resultAttendeeName: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
    color: "rgba(255,255,255,0.9)",
    textAlign: "center",
  },
  resultZoneList: { alignItems: "center", gap: 8 },
  resultZonesLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "rgba(255,255,255,0.7)",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  resultZoneBadges: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  resultZoneBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 100,
    borderWidth: 2,
  },
  resultZoneDot: { width: 8, height: 8, borderRadius: 4 },
  resultZoneBadgeText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  countdownBadge: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 8,
  },
  countdownText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.85)" },
});
