import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
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
import { isNfcSupported, scanBraceletUID } from "@/utils/nfc";
import { useLinkBracelet } from "@/hooks/useAttendeeApi";

function normalizeUid(raw: string): string {
  const clean = raw.replace(/[:\s\-]/g, "").toUpperCase();
  if (clean.length === 0) return "";
  return clean.match(/.{1,2}/g)?.join(":") ?? clean;
}

type State = "idle" | "scanning" | "linking" | "success" | "error" | "already";

export default function AddBraceletScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const params = useLocalSearchParams<{ prefillUid?: string }>();
  const [uidInput, setUidInput] = useState(params.prefillUid ?? "");
  const [nfcAvailable, setNfcAvailable] = useState(false);
  const [state, setState] = useState<State>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [linkedUid, setLinkedUid] = useState("");

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const { mutate: linkBracelet } = useLinkBracelet();

  useEffect(() => {
    setNfcAvailable(isNfcSupported());
  }, []);

  useEffect(() => {
    if (state !== "scanning") return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.12, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [state]);

  const doLink = (uid: string) => {
    setState("linking");
    linkBracelet(
      { uid },
      {
        onSuccess: (res) => {
          setLinkedUid(res.uid);
          setState("success");
        },
        onError: (err) => {
          if (err.message === "BRACELET_ALREADY_LINKED") {
            setState("already");
          } else if (err.message === "BRACELET_FLAGGED") {
            setErrorMsg(t("addBracelet.flaggedMsg"));
            setState("error");
          } else {
            setErrorMsg(err.message || t("common.unknownError"));
            setState("error");
          }
        },
      }
    );
  };

  const handleNfcScan = async () => {
    if (state === "scanning" || state === "linking") return;
    setState("scanning");
    try {
      const uid = await scanBraceletUID();
      if (uid) {
        doLink(uid);
      } else {
        setState("idle");
      }
    } catch {
      setState("idle");
    }
  };

  const normalizedManualUid = normalizeUid(uidInput);
  const isValidManual = [8, 14, 20].includes(normalizedManualUid.replace(/:/g, "").length);

  const handleManualLink = () => {
    if (!isValidManual) return;
    doLink(normalizedManualUid);
  };

  const handleReset = () => {
    setState("idle");
    setUidInput("");
    setErrorMsg("");
    setLinkedUid("");
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.background }}
      contentContainerStyle={{
        paddingBottom: isWeb ? 34 : insets.bottom + 40,
        paddingTop: isWeb ? 67 : insets.top + 16,
        paddingHorizontal: 20,
        gap: 20,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={22} color={C.text} />
        </Pressable>
        <Text style={[styles.title, { color: C.text }]}>{t("addBracelet.title")}</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Success state */}
      {state === "success" && (
        <View style={[styles.resultCard, { backgroundColor: C.successLight, borderColor: C.success }]}>
          <Feather name="check-circle" size={48} color={C.success} />
          <Text style={[styles.resultTitle, { color: C.success }]}>{t("addBracelet.successTitle")}</Text>
          <Text style={[styles.resultUid, { color: C.textSecondary }]}>{linkedUid}</Text>
          <Text style={[styles.resultSub, { color: C.textSecondary }]}>{t("addBracelet.successMsg")}</Text>
          <Button title={t("common.back")} onPress={() => router.back()} variant="primary" style={{ marginTop: 8 }} />
        </View>
      )}

      {/* Already linked state */}
      {state === "already" && (
        <View style={[styles.resultCard, { backgroundColor: C.primaryLight, borderColor: C.primary }]}>
          <Feather name="link" size={48} color={C.primary} />
          <Text style={[styles.resultTitle, { color: C.primary }]}>{t("addBracelet.alreadyLinkedTitle")}</Text>
          <Text style={[styles.resultSub, { color: C.textSecondary }]}>{t("addBracelet.alreadyLinkedMsg")}</Text>
          <Button title={t("common.back")} onPress={() => router.back()} variant="primary" style={{ marginTop: 8 }} />
        </View>
      )}

      {/* Error state */}
      {state === "error" && (
        <View style={[styles.resultCard, { backgroundColor: C.dangerLight, borderColor: C.danger }]}>
          <Feather name="alert-triangle" size={48} color={C.danger} />
          <Text style={[styles.resultTitle, { color: C.danger }]}>{t("common.error")}</Text>
          <Text style={[styles.resultSub, { color: C.textSecondary }]}>{errorMsg}</Text>
          <Button title={t("common.retry")} onPress={handleReset} variant="primary" style={{ marginTop: 8 }} />
        </View>
      )}

      {/* Main flow (idle / scanning / linking) */}
      {(state === "idle" || state === "scanning" || state === "linking") && (
        <>
          {/* NFC section */}
          {nfcAvailable && (
            <View style={[styles.nfcCard, { backgroundColor: C.card, borderColor: state === "scanning" ? C.primary : C.border }]}>
              <Animated.View style={[styles.nfcIconWrap, { backgroundColor: C.primaryLight, transform: [{ scale: state === "scanning" ? pulseAnim : 1 }] }]}>
                {state === "linking" ? (
                  <ActivityIndicator color={C.primary} size="large" />
                ) : (
                  <Feather name="wifi" size={36} color={C.primary} />
                )}
              </Animated.View>

              <Text style={[styles.nfcTitle, { color: C.text }]}>
                {state === "scanning" ? t("addBracelet.scanning") : state === "linking" ? t("addBracelet.linking") : t("addBracelet.scanNfc")}
              </Text>
              <Text style={[styles.nfcSub, { color: C.textSecondary }]}>
                {state === "scanning" ? t("addBracelet.scanningHint") : t("addBracelet.nfcHint")}
              </Text>

              {state === "idle" && (
                <Pressable
                  style={[styles.nfcBtn, { backgroundColor: C.primary }]}
                  onPress={handleNfcScan}
                >
                  <Feather name="wifi" size={18} color="#fff" />
                  <Text style={styles.nfcBtnText}>{t("addBracelet.startScan")}</Text>
                </Pressable>
              )}

              {state === "scanning" && (
                <Pressable
                  style={[styles.nfcBtn, { backgroundColor: C.dangerLight, borderWidth: 1, borderColor: C.danger }]}
                  onPress={handleReset}
                >
                  <Text style={[styles.nfcBtnText, { color: C.danger }]}>{t("common.cancel")}</Text>
                </Pressable>
              )}
            </View>
          )}

          {/* Manual entry section */}
          <View style={[styles.manualCard, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={[styles.manualTitle, { color: C.textSecondary }]}>
              {nfcAvailable ? t("addBracelet.orEnterManual") : t("addBracelet.enterManual")}
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
                value={uidInput}
                onChangeText={(v) => setUidInput(v.toUpperCase())}
                placeholder={t("addBracelet.uidPlaceholder")}
                placeholderTextColor={C.textMuted}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={state === "idle"}
              />
              <Pressable
                style={[
                  styles.manualBtn,
                  { backgroundColor: isValidManual && state === "idle" ? C.primary : C.border },
                ]}
                onPress={handleManualLink}
                disabled={!isValidManual || state !== "idle"}
              >
                {state === "linking" && !nfcAvailable ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Feather name="arrow-right" size={20} color="#fff" />
                )}
              </Pressable>
            </View>

            <Text style={[styles.manualHint, { color: C.textMuted }]}>{t("addBracelet.uidHint")}</Text>

            {normalizedManualUid.length > 0 && (
              <View style={[styles.uidPreview, { backgroundColor: C.primaryLight, borderColor: C.primary }]}>
                <Feather name="tag" size={13} color={C.primary} />
                <Text style={[styles.uidPreviewText, { color: C.primary }]}>{normalizedManualUid}</Text>
                {isValidManual && <Feather name="check-circle" size={13} color={C.primary} />}
              </View>
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  backBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  resultCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 28,
    alignItems: "center",
    gap: 12,
  },
  resultTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  resultUid: { fontSize: 13, fontFamily: "Inter_500Medium", letterSpacing: 1 },
  resultSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
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
  nfcBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  nfcBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
  manualCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  manualTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8 },
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
  uidPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  uidPreviewText: { flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold", letterSpacing: 1 },
});
