import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  Alert,
  Animated,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useLogTransaction, useGetSigningKey, useReportTamper, useGetEvent } from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { CopAmount } from "@/components/CopAmount";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useCart } from "@/contexts/CartContext";
import { useOfflineQueue } from "@/contexts/OfflineQueueContext";
import { OfflineBanner } from "@/components/OfflineBanner";
import { isNfcSupported, scanAndWriteBracelet, cancelNfc, type TagInfo, type TagType } from "@/utils/nfc";
import { verifyHmac, computeHmac } from "@/utils/hmac";
import { formatCOP } from "@/utils/format";
import { SuspiciousReportModal } from "@/components/SuspiciousReportModal";
import { useAuth } from "@/contexts/AuthContext";
import type { NfcChipType } from "@/contexts/EventContext";

type ChargeStep =
  | "waiting"
  | "reading"
  | "verifying"
  | "insufficient"
  | "hmac_fail"
  | "writing"
  | "logging"
  | "success"
  | "manual_input"
  | "offline_limit";

const STEP_KEYS: Record<ChargeStep, string> = {
  waiting: "pos.tapBracelet",
  reading: "pos.reading",
  verifying: "pos.verifying",
  insufficient: "pos.insufficientBalance",
  hmac_fail: "pos.hmacFailed",
  writing: "pos.writing",
  logging: "pos.processing",
  success: "pos.chargeSuccess",
  manual_input: "bank.manualUid",
  offline_limit: "pos.offlineLimitReached",
};

function TagBadge({ tagInfo, colors }: { tagInfo: TagInfo; colors: typeof Colors.light }) {
  const label =
    tagInfo.memoryBytes > 0
      ? `${tagInfo.label} · ${tagInfo.memoryBytes} B`
      : tagInfo.label;
  return (
    <View style={[tagBadgeStyles.badge, { backgroundColor: colors.primaryLight }]}>
      <Feather name="cpu" size={11} color={colors.primary} />
      <Text style={[tagBadgeStyles.text, { color: colors.primary }]}>{label}</Text>
    </View>
  );
}

const tagBadgeStyles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: "center",
  },
  text: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
});

function isChipCompatible(tagType: TagType, nfcChipType: NfcChipType): boolean {
  if (nfcChipType === "mifare_classic") {
    return tagType === "MIFARE_CLASSIC";
  }
  return tagType !== "MIFARE_CLASSIC";
}

export default function ChargeScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const { user } = useAuth();
  const { data: eventData } = useGetEvent(user?.eventId ?? "", {
    query: { enabled: !!user?.eventId },
  });
  const configuredChipType: NfcChipType = (eventData as { nfcChipType?: NfcChipType } | undefined)?.nfcChipType ?? "ntag_21x";

  const params = useLocalSearchParams<{ locationId: string }>();
  const locationId = params.locationId ?? "";

  const { items: cartItems, total: liveTotal, clearCart } = useCart();
  const { enqueue, cachedHmacSecret, updateCachedHmacSecret, updateOfflineLimits, isOfflineLimitReached, unsyncedSpendCop, offlineSyncLimit, syncNow } = useOfflineQueue();

  const [snapshotItems] = useState(() => [...cartItems]);
  const [snapshotTotal] = useState(() => liveTotal);
  const displayItems = snapshotItems.length > 0 ? snapshotItems : cartItems;
  const total = snapshotTotal > 0 ? snapshotTotal : liveTotal;
  const { data: keyData } = useGetSigningKey();
  const networkHmacSecret = (keyData as unknown as { hmacSecret: string } | undefined)?.hmacSecret ?? "";
  const hmacSecret = networkHmacSecret || cachedHmacSecret;

  React.useEffect(() => {
    if (networkHmacSecret) {
      updateCachedHmacSecret(networkHmacSecret);
    }
  }, [networkHmacSecret, updateCachedHmacSecret]);

  React.useEffect(() => {
    const keyDataTyped = keyData as unknown as { offlineSyncLimit?: number } | undefined;
    if (keyDataTyped?.offlineSyncLimit) {
      updateOfflineLimits(keyDataTyped.offlineSyncLimit);
    }
  }, [keyData, updateOfflineLimits]);

  const logTransaction = useLogTransaction();
  const reportTamper = useReportTamper();

  const [step, setStep] = useState<ChargeStep>("waiting");
  const [braceletBalance, setBraceletBalance] = useState<number | null>(null);
  const [braceletUid, setBraceletUid] = useState<string | null>(null);
  const [manualUid, setManualUid] = useState("");
  const [tagInfo, setTagInfo] = useState<TagInfo | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [nfcModalVisible, setNfcModalVisible] = useState(false);
  const scanningRef = useRef(false);
  const cancelledRef = useRef(false);

  const shortfall = braceletBalance != null ? total - braceletBalance : 0;

  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const isNfcStep = nfcModalVisible;
    if (!isNfcStep) { pulseAnim.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [nfcModalVisible]);

  const logAndFinish = async (uid: string, newBalance: number, newCounter: number) => {
    setStep("logging");
    const lineItems = snapshotItems.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
      unitPriceCop: i.priceCop,
      unitCostCop: i.costCop,
    }));
    const idempotencyKey = `${uid}-${newCounter}-${Date.now()}`;
    try {
      await logTransaction.mutateAsync({
        data: {
          idempotencyKey,
          nfcUid: uid,
          locationId,
          newBalance,
          counter: newCounter,
          lineItems: lineItems.map((li) => ({ productId: li.productId, quantity: li.quantity })),
          offlineCreatedAt: new Date().toISOString(),
        },
      });
    } catch {
      await enqueue({
        locationId,
        nfcUid: uid,
        newBalance,
        counter: newCounter,
        lineItems,
        grossAmountCop: total,
      });
    }
    clearCart();
    setStep("success");
    setBraceletBalance(newBalance);
    setBraceletUid(uid);
  };

  const processCharge = async (uid: string, balance: number, counter: number, hmac: string) => {
    setStep("verifying");
    let hmacOk = true;
    if (hmacSecret && hmac) {
      hmacOk = await verifyHmac(balance, counter, hmac, hmacSecret);
    }
    if (!hmacOk) {
      setStep("hmac_fail");
      try {
        await reportTamper.mutateAsync({
          data: { nfcUid: uid, reason: "HMAC mismatch detected at merchant POS" },
        });
      } catch {}
      return;
    }
    if (balance < total) {
      setBraceletBalance(balance);
      setBraceletUid(uid);
      setStep("insufficient");
      return;
    }
    const newBalance = balance - total;
    const newCounter = counter + 1;
    await logAndFinish(uid, newBalance, newCounter);
  };

  const startNfcScan = async () => {
    if (scanningRef.current) return;
    cancelledRef.current = false;
    if (isOfflineLimitReached) {
      setNfcModalVisible(false);
      setStep("offline_limit");
      return;
    }
    if (!isNfcSupported()) {
      setNfcModalVisible(false);
      setStep("manual_input");
      return;
    }
    scanningRef.current = true;
    setStep("reading");
    let aborted = false;
    let uid = "";
    let newBalance = 0;
    let newCounter = 0;
    try {
      await scanAndWriteBracelet(async (payload, detectedTagInfo) => {
        setTagInfo(detectedTagInfo);

        if (!isChipCompatible(detectedTagInfo.type, configuredChipType)) {
          const expectedLabel = configuredChipType === "mifare_classic" ? "MIFARE Classic" : "NTAG 21x";
          Alert.alert(
            t("common.warning"),
            t("eventAdmin.nfcChipMismatch", { expected: expectedLabel, detected: detectedTagInfo.label }),
          );
        }

        setStep("verifying");
        let hmacOk = true;
        if (hmacSecret && payload.hmac) {
          hmacOk = await verifyHmac(payload.balance, payload.counter, payload.hmac, hmacSecret);
        }
        if (!hmacOk) {
          setStep("hmac_fail");
          aborted = true;
          setNfcModalVisible(false);
          try {
            await reportTamper.mutateAsync({
              data: { nfcUid: payload.uid, reason: "HMAC mismatch detected at merchant POS" },
            });
          } catch {}
          return null;
        }

        if (payload.balance < total) {
          setBraceletBalance(payload.balance);
          setBraceletUid(payload.uid);
          setStep("insufficient");
          aborted = true;
          setNfcModalVisible(false);
          return null;
        }

        uid = payload.uid;
        newBalance = payload.balance - total;
        newCounter = payload.counter + 1;
        setStep("writing");
        const newHmac = await computeHmac(newBalance, newCounter, hmacSecret);
        return { uid, balance: newBalance, counter: newCounter, hmac: newHmac };
      }, { expectedChipType: configuredChipType });
    } catch {
      if (!aborted && !cancelledRef.current) {
        scanningRef.current = false;
        setNfcModalVisible(false);
        setStep("waiting");
        Alert.alert(t("common.error"), t("pos.readError"));
      }
      scanningRef.current = false;
      return;
    }

    scanningRef.current = false;
    if (!aborted) {
      setNfcModalVisible(false);
      await logAndFinish(uid, newBalance, newCounter);
    }
  };

  const handleCancelNfcModal = async () => {
    cancelledRef.current = true;
    await cancelNfc().catch(() => {});
    scanningRef.current = false;
    setNfcModalVisible(false);
    setStep("waiting");
  };

  const handleManualConfirm = async () => {
    if (!manualUid.trim()) return;
    setStep("reading");
    await processCharge(manualUid.trim(), 0, 0, "");
    setManualUid("");
  };

  const handleSyncAndRetry = async () => {
    try {
      await syncNow();
      setStep("waiting");
    } catch {
      Alert.alert(t("common.error"), t("pos.syncError"));
    }
  };

  const stepRef = useRef(step);
  stepRef.current = step;

  useFocusEffect(
    useCallback(() => {
      cancelledRef.current = false;
      return () => {
        cancelledRef.current = true;
        cancelNfc().catch(() => {});
        scanningRef.current = false;
        setNfcModalVisible(false);
      };
    }, [])
  );

  const StepIcon = () => {
    const icons: Partial<Record<ChargeStep, { icon: string; color: string; bg: string }>> = {
      waiting: { icon: "wifi", color: C.primary, bg: C.primaryLight },
      reading: { icon: "wifi", color: C.primary, bg: C.primaryLight },
      verifying: { icon: "shield", color: C.warning, bg: C.warningLight },
      writing: { icon: "edit-3", color: C.primary, bg: C.primaryLight },
      logging: { icon: "upload-cloud", color: C.primary, bg: C.primaryLight },
      success: { icon: "check-circle", color: C.success, bg: C.successLight },
      hmac_fail: { icon: "alert-triangle", color: C.danger, bg: C.dangerLight },
      insufficient: { icon: "alert-circle", color: C.warning, bg: C.warningLight },
      offline_limit: { icon: "wifi-off", color: C.danger, bg: C.dangerLight },
    };
    const s = icons[step];
    if (!s) return null;
    return (
      <View style={[styles.stepIcon, { backgroundColor: s.bg }]}>
        <Feather name={s.icon as React.ComponentProps<typeof Feather>["name"]} size={44} color={s.color} />
      </View>
    );
  };

  const isNfcActiveStep = step === "reading" || step === "verifying" || step === "writing" || step === "logging";

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <OfflineBanner syncIssuesRoute={"/(merchant-pos)/sync-issues"} />
      <View style={styles.cartSummary}>
        <Card padding={16} style={{ marginHorizontal: 20, marginTop: 8 }}>
          {displayItems.slice(0, 3).map((item) => (
            <View key={item.productId} style={styles.lineItem}>
              <Text style={[styles.lineItemName, { color: C.textSecondary }]}>
                {item.quantity}× {item.name}
              </Text>
              <CopAmount amount={item.priceCop * item.quantity} size={13} bold={false} color={C.textSecondary} />
            </View>
          ))}
          {displayItems.length > 3 && (
            <Text style={[styles.moreItems, { color: C.textMuted }]}>
              {t("pos.moreItems", { count: displayItems.length - 3 })}
            </Text>
          )}
          <View style={[styles.totalRow, { borderTopColor: C.separator }]}>
            <Text style={[styles.totalLabel, { color: C.text }]}>{t("common.total")}</Text>
            <CopAmount amount={total} size={22} />
          </View>
        </Card>
      </View>

      <View style={styles.centerSection}>
        <StepIcon />

        {step !== "success" && step !== "hmac_fail" && step !== "insufficient" && step !== "manual_input" && step !== "offline_limit" && (
          <Text style={[styles.stepTitle, { color: C.text }]}>{t(STEP_KEYS[step] || "pos.tapBracelet")}</Text>
        )}

        {step === "offline_limit" && (
          <View style={styles.insufficientBox}>
            <Text style={[styles.stepTitle, { color: C.danger }]}>{t("pos.offlineLimitReached")}</Text>
            <Text style={[styles.shortfallText, { color: C.textSecondary }]}>
              {t("pos.offlineLimitDetail", { spent: formatCOP(unsyncedSpendCop), limit: formatCOP(offlineSyncLimit) })}
            </Text>
          </View>
        )}

        {step === "insufficient" && (
          <View style={styles.insufficientBox}>
            <Text style={[styles.stepTitle, { color: C.text }]}>{t("pos.insufficientBalance")}</Text>
            <Text style={[styles.shortfallText, { color: C.danger }]}>
              {t("pos.shortfall", { amount: formatCOP(shortfall) })}
            </Text>
            <Text style={[styles.currentBalText, { color: C.textSecondary }]}>
              {t("pos.currentBalance")}: {formatCOP(braceletBalance ?? 0)}
            </Text>
            {tagInfo && <TagBadge tagInfo={tagInfo} colors={C} />}
          </View>
        )}

        {step === "hmac_fail" && (
          <View style={styles.insufficientBox}>
            <Text style={[styles.stepTitle, { color: C.danger }]}>{t("pos.hmacFailed")}</Text>
            <Text style={[styles.shortfallText, { color: C.textSecondary }]}>{t("pos.hmacFailedDetail")}</Text>
          </View>
        )}

        {step === "success" && (
          <View style={styles.successBox}>
            <Text style={[styles.stepTitle, { color: C.success }]}>{t("pos.chargeSuccess")}</Text>
            <View style={[styles.balanceRow, { backgroundColor: C.card, borderColor: C.border }]}>
              <Text style={[styles.balanceLabel, { color: C.textSecondary }]}>{t("pos.newBalance")}</Text>
              <CopAmount amount={braceletBalance} size={24} positive />
            </View>
            {tagInfo && <TagBadge tagInfo={tagInfo} colors={C} />}
          </View>
        )}
      </View>

      <View style={[styles.bottom, { paddingBottom: isWeb ? 34 : insets.bottom + 16, paddingHorizontal: 20 }]}>
        {step === "waiting" && !isNfcSupported() && (
          <Button
            title={t("pos.enterUid")}
            onPress={() => setStep("manual_input")}
            variant="primary"
            size="lg"
            fullWidth
            testID="charge-tap-btn"
          />
        )}
        {step === "waiting" && isNfcSupported() && (
          <Button
            title={t("pos.tapBracelet")}
            onPress={() => {
              setNfcModalVisible(true);
              scanningRef.current = false;
              startNfcScan();
            }}
            variant="primary"
            size="lg"
            fullWidth
            testID="charge-tap-btn"
          />
        )}
        {isNfcActiveStep && !nfcModalVisible && (
          <Button title={t("common.loading")} onPress={() => {}} loading variant="primary" size="lg" fullWidth />
        )}
        {step === "insufficient" && (
          <View style={{ gap: 10 }}>
            <Button title={t("pos.goToBank")} onPress={() => {}} variant="secondary" size="lg" fullWidth />
            <Button title={t("common.retry")} onPress={() => {
              setStep("waiting");
              setNfcModalVisible(true);
              scanningRef.current = false;
              startNfcScan();
            }} variant="primary" size="lg" fullWidth />
          </View>
        )}
        {step === "hmac_fail" && (
          <Button title={t("common.cancel")} onPress={() => router.back()} variant="danger" size="lg" fullWidth />
        )}
        {step === "offline_limit" && (
          <View style={{ gap: 10 }}>
            <Button
              title={t("pos.syncNow")}
              onPress={handleSyncAndRetry}
              variant="primary"
              size="lg"
              fullWidth
            />
            <Button
              title={t("common.cancel")}
              onPress={() => router.back()}
              variant="ghost"
              size="md"
              fullWidth
            />
          </View>
        )}
        {step === "success" && (
          <View style={{ gap: 10 }}>
            <Button
              title={t("pos.newSale")}
              onPress={() => { router.back(); }}
              variant="success"
              size="lg"
              fullWidth
            />
            <Button
              title={t("fraud.reportSuspicious")}
              onPress={() => setShowReportModal(true)}
              variant="secondary"
              size="md"
              fullWidth
              icon="alert-triangle"
            />
          </View>
        )}
        {step === "manual_input" && (
          <View style={{ gap: 10 }}>
            <TextInput
              style={[styles.uidInput, { backgroundColor: C.inputBg, color: C.text, borderColor: C.border }]}
              placeholder={t("common.uidPlaceholder")}
              placeholderTextColor={C.textMuted}
              value={manualUid}
              onChangeText={setManualUid}
              autoCapitalize="characters"
            />
            <Button title={t("pos.charge")} onPress={handleManualConfirm} variant="primary" size="lg" fullWidth disabled={!manualUid.trim()} />
            <Button title={t("common.cancel")} onPress={() => setStep("waiting")} variant="ghost" size="md" fullWidth />
          </View>
        )}
      </View>

      {/* ── NFC Scan Modal ── */}
      <Modal
        visible={nfcModalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCancelNfcModal}
      >
        <View style={[styles.overlay, { backgroundColor: "rgba(0,0,0,0.65)" }]}>
          <View style={[styles.modalBox, { backgroundColor: C.card }]}>
            <Animated.View
              style={[styles.nfcPulse, { backgroundColor: C.primaryLight, transform: [{ scale: pulseAnim }] }]}
            >
              <Feather name="wifi" size={48} color={C.primary} />
            </Animated.View>
            <Text style={[styles.modalTitle, { color: C.text, textAlign: "center" }]}>
              {isNfcActiveStep ? t("pos.reading") : t("bank.acercarManilla")}
            </Text>
            <Text style={[styles.modalSubtitle, { color: C.textSecondary }]}>
              {t("bank.holdSteady")}
            </Text>
            <Pressable onPress={handleCancelNfcModal} style={[styles.cancelBtn, { borderColor: C.border }]}>
              <Text style={[styles.cancelText, { color: C.textSecondary }]}>{t("common.cancel")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <SuspiciousReportModal
        visible={showReportModal}
        onClose={() => setShowReportModal(false)}
        prefillUid={braceletUid ?? undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  cartSummary: { paddingTop: 8 },
  lineItem: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  lineItemName: { fontSize: 13, fontFamily: "Inter_400Regular" },
  moreItems: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, marginTop: 8, paddingTop: 10 },
  totalLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  centerSection: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 28 },
  stepIcon: { width: 100, height: 100, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  stepTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  insufficientBox: { alignItems: "center", gap: 8 },
  shortfallText: { fontSize: 15, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  currentBalText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  successBox: { alignItems: "center", gap: 16 },
  balanceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderWidth: 1, borderRadius: 14, width: "100%" },
  balanceLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  bottom: { gap: 10 },
  uidInput: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16, fontFamily: "Inter_400Regular" },
  overlay: { flex: 1, justifyContent: "center", paddingHorizontal: 28 },
  modalBox: { padding: 32, borderRadius: 24, gap: 16, alignItems: "center" },
  nfcPulse: { width: 100, height: 100, borderRadius: 50, alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  modalSubtitle: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: -8 },
  cancelBtn: { borderWidth: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 32 },
  cancelText: { fontSize: 14, fontFamily: "Inter_500Medium" },
});
