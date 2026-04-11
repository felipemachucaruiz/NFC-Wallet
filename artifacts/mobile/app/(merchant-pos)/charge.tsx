import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import React, { useState, useRef, useCallback, useEffect } from "react";
import { Animated, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useLogTransaction, useGetSigningKey, useReportTamper, useGetEvent, customFetch, type SigningKeyResponse } from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { CopAmount } from "@/components/CopAmount";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useCart } from "@/contexts/CartContext";
import { useOfflineQueue } from "@/contexts/OfflineQueueContext";
import { OfflineBanner } from "@/components/OfflineBanner";
import { isNfcSupported, scanAndWriteBracelet, cancelNfc, type TagInfo, type TagType } from "@/utils/nfc";
import { scanAndWriteDesfireBracelet, type DesfireTagInfo } from "@/utils/desfire";
import { verifyHmac, computeHmac } from "@/utils/hmac";
import { formatCurrency } from "@/utils/format";
import { SuspiciousReportModal } from "@/components/SuspiciousReportModal";
import { useAuth } from "@/contexts/AuthContext";
import { extractErrorMessage } from "@/utils/errorMessage";
import { useAlert } from "@/components/CustomAlert";
import { useEventContext, type NfcChipType } from "@/contexts/EventContext";

type ChargeStep =
  | "tip_selection"
  | "waiting"
  | "reading"
  | "verifying"
  | "insufficient"
  | "hmac_fail"
  | "writing"
  | "logging"
  | "success"
  | "manual_input"
  | "offline_limit"
  | "wrong_event"
  | "not_activated";

const STEP_KEYS: Record<ChargeStep, string> = {
  tip_selection: "pos.tipSelection",
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
  wrong_event: "pos.wrongEvent",
  not_activated: "pos.braceletNotActivated",
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

function isChipAllowed(tagType: TagType, allowedNfcTypes: NfcChipType[]): boolean {
  if (tagType === "MIFARE_CLASSIC") return allowedNfcTypes.includes("mifare_classic");
  if (tagType === "DESFIRE_EV3") return allowedNfcTypes.includes("desfire_ev3");
  if (tagType === "MIFARE_ULTRALIGHT_C") return allowedNfcTypes.includes("mifare_ultralight_c");
  return allowedNfcTypes.includes("ntag_21x");
}

export default function ChargeScreen() {
  const { t } = useTranslation();
  const { show: showAlert } = useAlert();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const { user } = useAuth();
  const { currencyCode } = useEventContext();
  const fmt = (n: number) => formatCurrency(n, currencyCode);
  const { data: eventData } = useGetEvent(user?.eventId ?? "", {
    query: { enabled: !!user?.eventId },
  });
  const eventTyped = eventData as { nfcChipType?: NfcChipType; allowedNfcTypes?: NfcChipType[] } | undefined;
  const configuredAllowedTypes: NfcChipType[] = eventTyped?.allowedNfcTypes ?? [eventTyped?.nfcChipType ?? "ntag_21x"];

  const params = useLocalSearchParams<{ locationId: string }>();
  const locationId = params.locationId ?? "";

  const { items: cartItems, total: liveTotal, clearCart } = useCart();
  const { enqueue, cachedHmacSecret, updateCachedHmacSecret, updateOfflineLimits, isOfflineLimitReached, unsyncedSpend, offlineSyncLimit, syncNow } = useOfflineQueue();

  const [snapshotItems] = useState(() => [...cartItems]);
  const [snapshotTotal] = useState(() => liveTotal);
  const displayItems = snapshotItems.length > 0 ? snapshotItems : cartItems;
  const total = snapshotTotal > 0 ? snapshotTotal : liveTotal;
  const { data: keyData } = useGetSigningKey();
  const keyDataTyped = keyData as unknown as {
    hmacSecret?: string;
    legacyHmacSecret?: string | null;
    desfireAesKey?: string;
    ultralightCDesKey?: string;
    offlineSyncLimit?: number;
  } | undefined;
  const networkHmacSecret = keyDataTyped?.hmacSecret ?? "";
  const legacyHmacSecret = keyDataTyped?.legacyHmacSecret ?? null;
  const desfireAesKey = keyDataTyped?.desfireAesKey ?? "";
  const ultralightCDesKey = keyDataTyped?.ultralightCDesKey ?? "";
  const hmacSecret = networkHmacSecret || cachedHmacSecret;
  const legacyKeysForScan = legacyHmacSecret ? [legacyHmacSecret] : [];

  React.useEffect(() => {
    if (networkHmacSecret) {
      updateCachedHmacSecret(networkHmacSecret);
    }
  }, [networkHmacSecret, updateCachedHmacSecret]);

  React.useEffect(() => {
    if (keyDataTyped?.offlineSyncLimit) {
      updateOfflineLimits(keyDataTyped.offlineSyncLimit);
    }
  }, [keyDataTyped?.offlineSyncLimit, updateOfflineLimits]);

  const logTransaction = useLogTransaction();
  const reportTamper = useReportTamper();

  const [step, setStep] = useState<ChargeStep>("tip_selection");
  const [braceletBalance, setBraceletBalance] = useState<number | null>(null);
  const [braceletUid, setBraceletUid] = useState<string | null>(null);
  const [manualUid, setManualUid] = useState("");
  const [tagInfo, setTagInfo] = useState<TagInfo | DesfireTagInfo | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [nfcModalVisible, setNfcModalVisible] = useState(false);
  const [nfcWriteRetrying, setNfcWriteRetrying] = useState(false);
  const scanningRef = useRef(false);
  const cancelledRef = useRef(false);
  const writeRetryRef = useRef(0);
  const MAX_WRITE_RETRIES = 3;

  const [selectedTipPercent, setSelectedTipPercent] = useState<number | null>(null);
  const [customTipPercent, setCustomTipPercent] = useState("");
  const [confirmedTipAmount, setConfirmedTipAmount] = useState(0);
  const [confirmedTipPercent, setConfirmedTipPercent] = useState<number | null>(null);

  const parsedCustomPct = customTipPercent !== "" ? parseFloat(customTipPercent) : NaN;
  const validCustomPct = !isNaN(parsedCustomPct) && isFinite(parsedCustomPct) && parsedCustomPct >= 0 && parsedCustomPct <= 100;
  const activeTipPercent = selectedTipPercent !== null
    ? selectedTipPercent
    : (validCustomPct ? parsedCustomPct : null);
  const previewTipAmount = activeTipPercent !== null
    ? Math.round(total * activeTipPercent / 100)
    : 0;

  const chargeTotal = total + confirmedTipAmount;
  const shortfall = braceletBalance != null ? chargeTotal - braceletBalance : 0;

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

  const fetchServerPendingTopUp = async (uid: string): Promise<number> => {
    try {
      const data = await customFetch(`/api/bracelets/${encodeURIComponent(uid)}`) as {
        pendingTopUpAmount?: number | null;
      } | null;
      if (data?.pendingTopUpAmount && data.pendingTopUpAmount > 0) {
        return data.pendingTopUpAmount;
      }
    } catch {}
    return 0;
  };

  const logAndFinish = async (uid: string, newBalance: number, newCounter: number, newHmac?: string) => {
    setStep("logging");
    const lineItems = snapshotItems.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
      unitPrice: i.price,
      unitCost: i.cost,
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
          ...(confirmedTipAmount > 0 ? { tipAmount: confirmedTipAmount } : {}),
          offlineCreatedAt: new Date().toISOString(),
          ...(newHmac ? { hmac: newHmac } : {}),
        },
      });
    } catch (err: unknown) {
      const errMsg = extractErrorMessage(err, "Unknown charge error");
      if (errMsg.includes("BRACELET_NOT_ACTIVATED")) {
        setStep("not_activated");
        return;
      }
      if (errMsg.includes("BRACELET_WRONG_EVENT")) {
        setStep("wrong_event");
        return;
      }
      if (errMsg.includes("EVENT_ENDED")) {
        showAlert(t("common.error"), t("pos.eventEnded"));
        setStep("waiting");
        return;
      }
      await enqueue({
        locationId,
        nfcUid: uid,
        newBalance,
        counter: newCounter,
        lineItems,
        grossAmount: total,
        tipAmount: confirmedTipAmount,
        hmac: newHmac,
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
      hmacOk = await verifyHmac(balance, counter, hmac, hmacSecret, uid, legacyKeysForScan);
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
    if (balance < chargeTotal) {
      setBraceletBalance(balance);
      setBraceletUid(uid);
      setStep("insufficient");
      return;
    }
    const newBalance = balance - chargeTotal;
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
    writeRetryRef.current = 0;
    setNfcWriteRetrying(false);
    setStep("reading");
    let aborted = false;
    let uid = "";
    let newBalance = 0;
    let newCounter = 0;
    let writtenHmac = "";

    const onlyDesfire = configuredAllowedTypes.length === 1 && configuredAllowedTypes[0] === "desfire_ev3";

    if (onlyDesfire) {
      if (!desfireAesKey) {
        scanningRef.current = false;
        setNfcModalVisible(false);
        setStep("waiting");
        showAlert(t("common.error"), t("pos.desfireNoKey"));
        return;
      }
      try {
        await scanAndWriteDesfireBracelet(async (payload, detectedTagInfo) => {
          setTagInfo(detectedTagInfo);
          setStep("verifying");

          const pendingTopUp = await fetchServerPendingTopUp(payload.uid);
          const effectiveBalance = payload.balance + pendingTopUp;

          if (effectiveBalance < chargeTotal) {
            setBraceletBalance(effectiveBalance);
            setBraceletUid(payload.uid);
            setStep("insufficient");
            aborted = true;
            setNfcModalVisible(false);
            return null;
          }

          uid = payload.uid;
          newBalance = effectiveBalance - chargeTotal;
          newCounter = payload.counter + 1;
          setStep("writing");
          return { uid, balance: newBalance, counter: newCounter, hmac: payload.hmac };
        }, desfireAesKey);
      } catch {
        if (!aborted && !cancelledRef.current) {
          scanningRef.current = false;
          setNfcModalVisible(false);
          setNfcWriteRetrying(false);
          setStep("waiting");
          showAlert(t("common.error"), t("pos.readError"));
        }
        scanningRef.current = false;
        return;
      }
    } else {
      // Track whether the NFC read succeeded but the write failed
      // so we can distinguish write errors from read errors for retry logic.
      let readSucceeded = false;

      const doScan = async (): Promise<boolean> => {
        try {
          await scanAndWriteBracelet(async (payload, detectedTagInfo) => {
            setTagInfo(detectedTagInfo);

            if (!isChipAllowed(detectedTagInfo.type, configuredAllowedTypes)) {
              const allowedLabels = configuredAllowedTypes
                .map((ct) => {
                  if (ct === "mifare_classic") return "MIFARE Classic";
                  if (ct === "desfire_ev3") return "DESFire EV3";
                  if (ct === "mifare_ultralight_c") return "MIFARE Ultralight C";
                  return "NTAG 21x";
                })
                .join(", ");
              aborted = true;
              setNfcModalVisible(false);
              setStep("waiting");
              showAlert(
                t("common.error"),
                t("eventAdmin.nfcChipMismatch", { expected: allowedLabels, detected: detectedTagInfo.label }),
              );
              return null;
            }

            setStep("verifying");
            let hmacOk = true;
            if (hmacSecret && payload.hmac) {
              hmacOk = await verifyHmac(payload.balance, payload.counter, payload.hmac, hmacSecret, payload.uid, legacyKeysForScan);
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

            const pendingTopUp = await fetchServerPendingTopUp(payload.uid);
            const effectiveBalance = payload.balance + pendingTopUp;

            if (effectiveBalance < chargeTotal) {
              setBraceletBalance(effectiveBalance);
              setBraceletUid(payload.uid);
              setStep("insufficient");
              aborted = true;
              setNfcModalVisible(false);
              return null;
            }

            uid = payload.uid;
            newBalance = effectiveBalance - chargeTotal;
            newCounter = payload.counter + 1;
            readSucceeded = true;
            setStep("writing");
            writtenHmac = await computeHmac(newBalance, newCounter, hmacSecret, uid);
            return { uid, balance: newBalance, counter: newCounter, hmac: writtenHmac };
          }, {
            expectedChipType: configuredAllowedTypes.includes("mifare_classic") && configuredAllowedTypes.length === 1 ? "mifare_classic" : "ntag_21x",
            ultralightCKeyHex: ultralightCDesKey || undefined,
          });
          return true;
        } catch {
          return false;
        }
      };

      let success = await doScan();

      // If the scan failed after a successful read (write phase failure), retry with "tap again" prompt
      while (!success && !aborted && !cancelledRef.current && readSucceeded && writeRetryRef.current < MAX_WRITE_RETRIES) {
        writeRetryRef.current += 1;
        setNfcWriteRetrying(true);
        setStep("reading");
        readSucceeded = false;
        await new Promise<void>((resolve) => setTimeout(resolve, 500));
        if (!cancelledRef.current) {
          success = await doScan();
        }
      }

      if (!success && !aborted && !cancelledRef.current) {
        scanningRef.current = false;
        setNfcModalVisible(false);
        setNfcWriteRetrying(false);
        setStep("waiting");
        showAlert(t("common.error"), t("pos.readError"));
        return;
      }
    }

    scanningRef.current = false;
    setNfcWriteRetrying(false);
    if (!aborted) {
      setNfcModalVisible(false);
      await logAndFinish(uid, newBalance, newCounter, writtenHmac || undefined);
    }
  };

  const handleCancelNfcModal = async () => {
    cancelledRef.current = true;
    await cancelNfc().catch(() => {});
    scanningRef.current = false;
    writeRetryRef.current = 0;
    setNfcWriteRetrying(false);
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
      showAlert(t("common.error"), t("pos.syncError"));
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

  const handleTipConfirm = (noTip?: boolean) => {
    if (noTip) {
      setConfirmedTipAmount(0);
      setConfirmedTipPercent(null);
    } else {
      setConfirmedTipAmount(previewTipAmount);
      setConfirmedTipPercent(activeTipPercent);
    }
    setStep("waiting");
  };

  const StepIcon = () => {
    const icons: Partial<Record<ChargeStep, { icon: string; color: string; bg: string }>> = {
      tip_selection: { icon: "dollar-sign", color: C.primary, bg: C.primaryLight },
      waiting: { icon: "wifi", color: C.primary, bg: C.primaryLight },
      reading: { icon: "wifi", color: C.primary, bg: C.primaryLight },
      verifying: { icon: "shield", color: C.warning, bg: C.warningLight },
      writing: { icon: "edit-3", color: C.primary, bg: C.primaryLight },
      logging: { icon: "upload-cloud", color: C.primary, bg: C.primaryLight },
      success: { icon: "check-circle", color: C.success, bg: C.successLight },
      hmac_fail: { icon: "alert-triangle", color: C.danger, bg: C.dangerLight },
      insufficient: { icon: "alert-circle", color: C.warning, bg: C.warningLight },
      offline_limit: { icon: "wifi-off", color: C.danger, bg: C.dangerLight },
      wrong_event: { icon: "slash", color: C.danger, bg: C.dangerLight },
      not_activated: { icon: "alert-circle", color: C.warning, bg: C.warningLight },
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
              <CopAmount amount={item.price * item.quantity} size={13} bold={false} color={C.textSecondary} />
            </View>
          ))}
          {displayItems.length > 3 && (
            <Text style={[styles.moreItems, { color: C.textMuted }]}>
              {t("pos.moreItems", { count: displayItems.length - 3 })}
            </Text>
          )}
          {confirmedTipAmount > 0 && (
            <View style={styles.lineItem}>
              <Text style={[styles.lineItemName, { color: C.textSecondary }]}>{t("pos.tipLabel")}</Text>
              <CopAmount amount={confirmedTipAmount} size={13} bold={false} color={C.textSecondary} />
            </View>
          )}
          <View style={[styles.totalRow, { borderTopColor: C.separator }]}>
            <Text style={[styles.totalLabel, { color: C.text }]}>{t("common.total")}</Text>
            <CopAmount amount={chargeTotal} size={22} />
          </View>
        </Card>
      </View>

      <View style={styles.centerSection}>
        <StepIcon />

        {step !== "success" && step !== "hmac_fail" && step !== "insufficient" && step !== "manual_input" && step !== "offline_limit" && step !== "wrong_event" && step !== "not_activated" && step !== "tip_selection" && (
          <Text style={[styles.stepTitle, { color: C.text }]}>{t(STEP_KEYS[step] || "pos.tapBracelet")}</Text>
        )}

        {step === "tip_selection" && (
          <View style={styles.tipSelectionBox}>
            <Text style={[styles.stepTitle, { color: C.text }]}>{t("pos.tipSelection")}</Text>
            <Text style={[styles.tipSubtitle, { color: C.textSecondary }]}>{t("pos.tipSubtitle")}</Text>
            <View style={styles.tipPresetsRow}>
              {[5, 10, 20].map((pct) => (
                <Pressable
                  key={pct}
                  onPress={() => {
                    setSelectedTipPercent(pct);
                    setCustomTipPercent("");
                  }}
                  style={[
                    styles.tipPresetBtn,
                    {
                      backgroundColor: selectedTipPercent === pct ? C.primary : C.card,
                      borderColor: selectedTipPercent === pct ? C.primary : C.border,
                    },
                  ]}
                >
                  <Text style={[styles.tipPresetText, { color: selectedTipPercent === pct ? "#fff" : C.text }]}>
                    {pct}%
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={[styles.customTipRow, { borderColor: C.border, backgroundColor: C.inputBg }]}>
              <TextInput
                style={[styles.customTipInput, { color: C.text }]}
                placeholder={t("pos.customTip")}
                placeholderTextColor={C.textMuted}
                keyboardType="numeric"
                value={customTipPercent}
                onChangeText={(v) => {
                  setCustomTipPercent(v);
                  setSelectedTipPercent(null);
                }}
              />
              <Text style={[styles.customTipSuffix, { color: C.textSecondary }]}>%</Text>
            </View>
            {(previewTipAmount > 0) && (
              <View style={[styles.tipPreviewBox, { backgroundColor: C.primaryLight, borderColor: C.primary }]}>
                <Text style={[styles.tipPreviewText, { color: C.primary }]}>
                  {t("pos.tipAmount", { amount: fmt(previewTipAmount), pct: activeTipPercent?.toFixed(0) })}
                </Text>
              </View>
            )}
          </View>
        )}

        {step === "offline_limit" && (
          <View style={styles.insufficientBox}>
            <Text style={[styles.stepTitle, { color: C.danger }]}>{t("pos.offlineLimitReached")}</Text>
            <Text style={[styles.shortfallText, { color: C.textSecondary }]}>
              {t("pos.offlineLimitDetail", { spent: fmt(unsyncedSpend), limit: fmt(offlineSyncLimit) })}
            </Text>
          </View>
        )}

        {step === "insufficient" && (
          <View style={styles.insufficientBox}>
            <Text style={[styles.stepTitle, { color: C.text }]}>{t("pos.insufficientBalance")}</Text>
            <Text style={[styles.shortfallText, { color: C.danger }]}>
              {t("pos.shortfall", { amount: fmt(shortfall) })}
            </Text>
            <Text style={[styles.currentBalText, { color: C.textSecondary }]}>
              {t("pos.currentBalance")}: {fmt(braceletBalance ?? 0)}
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

        {step === "wrong_event" && (
          <View style={styles.insufficientBox}>
            <Text style={[styles.stepTitle, { color: C.danger }]}>{t("pos.wrongEvent")}</Text>
            <Text style={[styles.shortfallText, { color: C.textSecondary }]}>{t("pos.wrongEventDetail")}</Text>
          </View>
        )}

        {step === "not_activated" && (
          <View style={styles.insufficientBox}>
            <Text style={[styles.stepTitle, { color: C.warning }]}>{t("pos.braceletNotActivated")}</Text>
            <Text style={[styles.shortfallText, { color: C.textSecondary }]}>{t("pos.braceletNotActivatedDetail")}</Text>
          </View>
        )}

        {step === "success" && (
          <View style={styles.successBox}>
            <Text style={[styles.stepTitle, { color: C.success }]}>{t("pos.chargeSuccess")}</Text>
            <View style={[styles.balanceRow, { backgroundColor: C.card, borderColor: C.border }]}>
              <Text style={[styles.balanceLabel, { color: C.textSecondary }]}>{t("pos.newBalance")}</Text>
              <CopAmount amount={braceletBalance} size={24} positive />
            </View>
            {confirmedTipAmount > 0 && (
              <View style={[styles.tipPreviewBox, { backgroundColor: C.successLight, borderColor: C.success }]}>
                <Text style={[styles.tipPreviewText, { color: C.success }]}>
                  {t("pos.tipAmount", { amount: fmt(confirmedTipAmount), pct: confirmedTipPercent?.toFixed(0) ?? "—" })}
                </Text>
              </View>
            )}
            {tagInfo && <TagBadge tagInfo={tagInfo} colors={C} />}
          </View>
        )}
      </View>

      <View style={[styles.bottom, { paddingBottom: isWeb ? 34 : insets.bottom + 16, paddingHorizontal: 20 }]}>
        {step === "tip_selection" && (
          <View style={{ gap: 10 }}>
            <Button
              title={
                previewTipAmount > 0
                  ? t("pos.confirmTip", { amount: fmt(previewTipAmount) })
                  : t("pos.confirmTipNoAmount")
              }
              onPress={() => handleTipConfirm(false)}
              variant="primary"
              size="lg"
              fullWidth
              disabled={activeTipPercent === null}
            />
            <Button
              title={t("pos.noTip")}
              onPress={() => handleTipConfirm(true)}
              variant="ghost"
              size="md"
              fullWidth
            />
          </View>
        )}
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
          <Button title={t("common.retry")} onPress={() => {
            setStep("waiting");
            setNfcModalVisible(true);
            scanningRef.current = false;
            startNfcScan();
          }} variant="primary" size="lg" fullWidth />
        )}
        {step === "hmac_fail" && (
          <Button title={t("common.cancel")} onPress={() => router.back()} variant="danger" size="lg" fullWidth />
        )}
        {step === "wrong_event" && (
          <Button title={t("common.back")} onPress={() => router.back()} variant="danger" size="lg" fullWidth />
        )}
        {step === "not_activated" && (
          <Button title={t("common.back")} onPress={() => router.back()} variant="primary" size="lg" fullWidth />
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
              {nfcWriteRetrying ? t("bank.retryingWrite") : (isNfcActiveStep ? t("pos.reading") : t("bank.acercarManilla"))}
            </Text>
            <Text style={[styles.modalSubtitle, { color: C.textSecondary }]}>
              {nfcWriteRetrying ? t("bank.keepSteadyRetry") : t("bank.holdSteady")}
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
  tipSelectionBox: { alignItems: "center", gap: 12, width: "100%" },
  tipSubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: -8 },
  tipPresetsRow: { flexDirection: "row", gap: 10, justifyContent: "center" },
  tipPresetBtn: { paddingHorizontal: 22, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, minWidth: 72, alignItems: "center" },
  tipPresetText: { fontSize: 18, fontFamily: "Inter_700Bold" },
  customTipRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 2, width: "100%" },
  customTipInput: { flex: 1, fontSize: 16, fontFamily: "Inter_400Regular", paddingVertical: 12 },
  customTipSuffix: { fontSize: 16, fontFamily: "Inter_500Medium", paddingLeft: 4 },
  tipPreviewBox: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, alignSelf: "stretch", alignItems: "center" },
  tipPreviewText: { fontSize: 15, fontFamily: "Inter_600SemiBold", textAlign: "center" },
});
