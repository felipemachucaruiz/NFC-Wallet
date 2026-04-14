import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useUpdateBraceletContact, useGetSigningKey, type SigningKeyResponse } from "@workspace/api-client-react";
import { useAttestationContext } from "@/contexts/AttestationContext";
import Colors from "@/constants/colors";
import { useAlert } from "@/components/CustomAlert";
import { CopAmount } from "@/components/CopAmount";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { OfflineBanner } from "@/components/OfflineBanner";
import { isNfcSupported, scanAndWriteBracelet, cancelNfc, type TagInfo, type TagType, type NfcChipTypeHint } from "@/utils/nfc";
import { scanAndWriteDesfireBracelet } from "@/utils/desfire";
import { computeHmac } from "@/utils/hmac";
import { formatCurrency, parseCOPInput } from "@/utils/format";
import { useEventContext } from "@/contexts/EventContext";
import { useOfflineQueue } from "@/contexts/OfflineQueueContext";
import { PhoneInput, COUNTRY_CODES, type CountryCode } from "@/components/ui/PhoneInput";
import { extractErrorMessage } from "@/utils/errorMessage";

const PENDING_NFC_WRITES_KEY = "@pendingNfcWrites";

export interface PendingNfcWrite {
  id: string;
  nfcUid: string;
  amount: number;
  newBalance: number;
  savedAt: string;
}

export async function addPendingNfcWrite(entry: PendingNfcWrite): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_NFC_WRITES_KEY);
    const existing: PendingNfcWrite[] = raw ? JSON.parse(raw) : [];
    existing.push(entry);
    await AsyncStorage.setItem(PENDING_NFC_WRITES_KEY, JSON.stringify(existing));
  } catch (e) {
    console.error("[PendingNfcWrites] Failed to save pending write:", e);
  }
}

export async function getPendingNfcWrites(): Promise<PendingNfcWrite[]> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_NFC_WRITES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function removePendingNfcWrite(id: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_NFC_WRITES_KEY);
    const existing: PendingNfcWrite[] = raw ? JSON.parse(raw) : [];
    const updated = existing.filter((e) => e.id !== id);
    await AsyncStorage.setItem(PENDING_NFC_WRITES_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error("[PendingNfcWrites] Failed to remove entry:", e);
  }
}

function parsePhoneParam(raw: string | undefined): { country: CountryCode; number: string } {
  if (!raw) return { country: COUNTRY_CODES[0], number: "" };
  const matched = COUNTRY_CODES.find((c) => raw.startsWith(c.code));
  if (matched) return { country: matched, number: raw.slice(matched.code.length).trimStart() };
  return { country: COUNTRY_CODES[0], number: raw };
}

type PaymentMethod = "cash" | "card_external" | "nequi_transfer" | "bancolombia_transfer" | "other";

const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: React.ComponentProps<typeof Feather>["name"] }[] = [
  { value: "cash", label: "Efectivo", icon: "dollar-sign" },
  { value: "card_external", label: "Tarjeta", icon: "credit-card" },
  { value: "nequi_transfer", label: "Nequi", icon: "smartphone" },
  { value: "bancolombia_transfer", label: "Bancolombia", icon: "home" },
  { value: "other", label: "Otro", icon: "more-horizontal" },
];

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
    alignSelf: "flex-start",
  },
  text: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
});

// Steps:
//  "form"         — user fills in amount / payment method
//  "writing"      — NFC write in progress (first, before saving)
//  "tap_write"    — waiting for user to tap card
//  "write_failed" — all 3 retries exhausted, server updated but chip not written
//  "saving"       — server sync in progress (after write)
//  "success"      — done (with optional write warning)

type Step = "form" | "tap_write" | "writing" | "write_failed" | "saving" | "success";

export default function TopUpScreen() {
  const { t } = useTranslation();
  const { show: showAlert } = useAlert();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { currencyCode } = useEventContext();
  const fmt = (n: number) => formatCurrency(n, currencyCode);

  const params = useLocalSearchParams<{
    uid: string;
    balance: string;
    counter: string;
    hmac: string;
    tagType: string;
    tagLabel: string;
    tagMemoryBytes: string;
    attendeeName?: string;
    phone?: string;
    email?: string;
  }>();
  const uid = params.uid ?? "";
  const currentBalance = parseInt(params.balance ?? "0", 10);
  const currentCounter = parseInt(params.counter ?? "0", 10);

  const tagInfoFromParams: TagInfo | null =
    params.tagType
      ? {
          type: params.tagType as TagType,
          label: params.tagLabel ?? params.tagType,
          memoryBytes: parseInt(params.tagMemoryBytes ?? "0", 10),
        }
      : null;

  const [amountText, setAmountText] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [step, setStep] = useState<Step>("form");
  const [writeWarning, setWriteWarning] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [writeRetryCount, setWriteRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);
  const submittingRef = useRef(false);
  const writingRef = useRef(false);
  const cancelledRef = useRef(false);
  const writeRetryRef = useRef(0);
  // txActiveRef: true from the moment the user confirms a top-up until the transaction
  // reaches a terminal state (success, write_failed, or explicit cancel/skip).
  // Used to distinguish "Android NFC briefly stole app focus mid-write" from
  // "user navigated away from the screen". When true, useFocusEffect must NOT reset
  // any state or cancel the NFC session.
  const txActiveRef = useRef(false);
  // stepRef: mirrors the `step` state synchronously (updated before the React
  // setState call). Used in useFocusEffect to guard against a race condition where
  // the NFC subsystem returns focus AFTER txActiveRef is cleared but BEFORE React
  // re-renders the success/write_failed screen — which would cause useFocusEffect
  // to reset the form, overriding the success state update.
  const stepRef = useRef<Step>("form");

  const [attendeeName, setAttendeeName] = useState(params.attendeeName ?? "");
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>(() => parsePhoneParam(params.phone).country);
  const [phone, setPhone] = useState(() => parsePhoneParam(params.phone).number);
  const [email, setEmail] = useState(params.email ?? "");

  const { data: keyData, refetch: refetchSigningKey } = useGetSigningKey();
  const networkHmacSecret = (keyData as unknown as { hmacSecret: string } | undefined)?.hmacSecret ?? "";
  const desfireAesKey = (keyData as unknown as { desfireAesKey?: string; nfcChipType?: string } | undefined)?.desfireAesKey ?? "";
  const ultralightCDesKey = (keyData as unknown as { ultralightCDesKey?: string } | undefined)?.ultralightCDesKey ?? "";
  const nfcChipType = (keyData as unknown as { nfcChipType?: string } | undefined)?.nfcChipType ?? "";
  const { enqueueTopUp, cachedHmacSecret, updateCachedHmacSecret, syncNow } = useOfflineQueue();
  const { retryAttestation } = useAttestationContext();
  const hmacSecret = networkHmacSecret || cachedHmacSecret;

  useEffect(() => {
    if (networkHmacSecret) {
      updateCachedHmacSecret(networkHmacSecret);
    }
  }, [networkHmacSecret, updateCachedHmacSecret]);

  const updateContact = useUpdateBraceletContact();

  useFocusEffect(
    useCallback(() => {
      if (txActiveRef.current) {
        // A top-up transaction is in progress. Android NFC temporarily steals
        // app focus when a tag is detected, which re-fires useFocusEffect.
        // We must NOT reset any state or cancel the NFC session here — doing so
        // would reset the retry counter to 0 (infinite retries) and kill the
        // in-flight NFC write. Just clear the cancelled flag so the retry loop
        // can continue uninterrupted after focus returns.
        cancelledRef.current = false;
        return () => {
          // Signal that focus was lost, but do NOT call cancelNfc() — the NFC
          // write must be allowed to finish. Also do NOT reset writingRef so
          // the handleStartWrite guard keeps the loop from restarting.
          cancelledRef.current = true;
        };
      }

      // Guard: stepRef is "success" or "write_failed" means the write just reached
      // a terminal state. txActiveRef was cleared synchronously before this
      // useFocusEffect fired, but the React setStep("success") update hasn't
      // rendered yet. Skip the form reset so the success/error screen can render.
      // The cleanup resets stepRef so a genuine re-navigation later shows the form.
      if (stepRef.current === "success" || stepRef.current === "write_failed") {
        return () => {
          stepRef.current = "form";
        };
      }

      // Normal navigation to this screen — reset everything.
      stepRef.current = "form";
      txActiveRef.current = false;
      setAmountText("");
      setPaymentMethod("cash");
      setStep("form");
      setWriteWarning(false);
      setWriteError(null);
      setWriteRetryCount(0);
      setIsRetrying(false);
      setShowSkipConfirm(false);
      writeRetryRef.current = 0;
      submittingRef.current = false;
      writingRef.current = false;
      cancelledRef.current = false;
      setAttendeeName(params.attendeeName ?? "");
      const parsed = parsePhoneParam(params.phone);
      setPhoneCountry(parsed.country);
      setPhone(parsed.number);
      setEmail(params.email ?? "");
      return () => {
        cancelledRef.current = true;
        cancelNfc().catch(() => {});
        writingRef.current = false;
        submittingRef.current = false;
      };
    }, [params.attendeeName, params.phone, params.email])
  );

  const amount = parseCOPInput(amountText);
  const newBalance = currentBalance + amount;
  const newCounter = currentCounter + 1;

  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const isNfcStep = step === "tap_write" || step === "writing";
    if (!isNfcStep) { pulseAnim.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [step]);

  // ─── Perform server sync (after write, or as fallback) ───────────────────────
  const syncToServer = async (offlineEnqueued: boolean) => {
    if (offlineEnqueued) {
      void syncNow().catch(() => {});
      return;
    }

    stepRef.current = "saving";
    setStep("saving");
    try {
      const contactUpdates: { attendeeName?: string; phone?: string; email?: string } = {};
      if (attendeeName.trim()) contactUpdates.attendeeName = attendeeName.trim();
      if (phone.trim()) contactUpdates.phone = phoneCountry.code + phone.trim();
      if (email.trim()) contactUpdates.email = email.trim();
      if (Object.keys(contactUpdates).length > 0) {
        await updateContact.mutateAsync({ nfcUid: uid, data: contactUpdates });
      }
    } catch {
    }
    stepRef.current = "success";
    setStep("success");
  };

  // ─── Step 1: User confirms the form → go to NFC tap ─────────────────────────
  const handleConfirm = async () => {
    if (submittingRef.current) return;
    if (amount < 1000) {
      showAlert(t("common.error"), t("bank.minimumAmount"));
      return;
    }
    submittingRef.current = true;
    cancelledRef.current = false;

    if (!hmacSecret) {
      // Try re-attesting the device and refreshing the signing key before giving up.
      // This recovers from server restarts that wipe the in-memory attestation cache.
      try {
        await retryAttestation();
        const { data: freshKey } = await refetchSigningKey();
        const freshSecret = (freshKey as unknown as { hmacSecret?: string } | undefined)?.hmacSecret ?? "";
        if (freshSecret) {
          await updateCachedHmacSecret(freshSecret);
          // Key retrieved — continue with the confirmed amount
          if (isNfcSupported()) {
            txActiveRef.current = true; // Transaction begins — guard useFocusEffect resets
            stepRef.current = "tap_write";
            setStep("tap_write");
          } else {
            showAlert(t("common.error"), t("bank.nfcRequired"));
            submittingRef.current = false;
          }
          return;
        }
      } catch {
        // Ignore retry errors — fall through to the user-facing error
      }
      showAlert(t("common.error"), t("bank.noSigningKey"));
      submittingRef.current = false;
      return;
    }

    if (isNfcSupported()) {
      txActiveRef.current = true; // Transaction begins — guard useFocusEffect resets
      stepRef.current = "tap_write";
      setStep("tap_write");
    } else {
      // NFC unavailable: cannot write bracelet → block the top-up
      showAlert(t("common.error"), t("bank.nfcRequired"));
      submittingRef.current = false;
    }
  };

  const MAX_WRITE_RETRIES = 3;

  // ─── Step 2: Auto-start NFC write (with retry for legacy chips) ──────────────
  const handleStartWrite = async () => {
    if (writingRef.current) return;
    writingRef.current = true;
    setWriteError(null);
    stepRef.current = "writing";
    setStep("writing");
    setIsRetrying(false);

    let aborted = false;

    const doScanAndWrite = async (): Promise<boolean> => {
      // writeAttempted: set true (inside onRead callback) once the chip is verified
      // and the new payload is about to be written. If an error occurs after this
      // point on non-DESFire chips, the physical write likely already succeeded
      // (Android NFC sometimes drops the session right after the last byte is
      // committed to EEPROM), so we should still record the top-up.
      let writeAttempted = false;
      let writtenHmac = "";

      try {
        if (nfcChipType === "desfire_ev3") {
          // DESFire uses an atomic CREDIT + WRITE + COMMIT transaction.
          // If COMMIT fails the chip is NOT written, so we don't set writeAttempted
          // here — a genuine retry is needed.
          await scanAndWriteDesfireBracelet(async (payload) => {
            if (payload.uid !== uid) {
              aborted = true;
              showAlert(t("common.error"), t("bank.wrongBracelet"));
              return null;
            }
            writtenHmac = await computeHmac(newBalance, newCounter, hmacSecret, uid);
            return { uid, balance: newBalance, counter: newCounter, hmac: "" };
          }, desfireAesKey);
        } else {
          const chipHint: NfcChipTypeHint | undefined =
            tagInfoFromParams?.type === "MIFARE_CLASSIC" ? "mifare_classic" : undefined;
          await scanAndWriteBracelet(async (payload, detectedTagInfo) => {
            if (payload.uid !== uid) {
              aborted = true;
              showAlert(t("common.error"), t("bank.wrongBracelet"));
              return null;
            }
            stepRef.current = "writing";
            setStep("writing");
            writtenHmac = await computeHmac(newBalance, newCounter, hmacSecret, uid);
            // Mark write as started BEFORE returning the new payload to the writer.
            // From this point on, the chip write is about to begin (or may already
            // be happening). Any error after this mark likely means the data was
            // physically committed to the chip but the NFC session dropped.
            writeAttempted = true;
            return { uid, balance: newBalance, counter: newCounter, hmac: writtenHmac };
          }, {
            expectedChipType: chipHint,
            ultralightCKeyHex: ultralightCDesKey || undefined,
          });
        }

        if (aborted) return false;

        writingRef.current = false;
        setIsRetrying(false);
        setWriteRetryCount(0);
        writeRetryRef.current = 0;
        await enqueueTopUp({
          nfcUid: uid,
          amount: amount,
          paymentMethod,
          newBalance,
          newCounter,
          hmac: writtenHmac,
        });
        submittingRef.current = false;
        // Set stepRef BEFORE clearing txActiveRef so that if useFocusEffect fires
        // between txActiveRef=false and the React re-render, the guard catches it.
        stepRef.current = "success";
        txActiveRef.current = false; // Transaction complete
        void syncToServer(true);
        setStep("success");
        return true;
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.error("[TopUp] scanAndWrite error:", errMsg);
        // Store the latest error code so it can be shown in the failed modal.
        setWriteError(errMsg);

        // If the write was already started for a non-DESFire chip and we didn't
        // abort, the chip very likely has the new balance (the NFC session just
        // dropped right at the end). Record the top-up with a warning so the
        // server stays in sync instead of silently losing the transaction.
        // NOTE: We intentionally do NOT check cancelledRef.current here —
        // on Android the NFC subsystem briefly steals app focus during the write
        // which triggers useFocusEffect cleanup and sets cancelledRef = true,
        // even though the write genuinely happened. We must always record it.
        if (writeAttempted && !aborted) {
          console.warn("[TopUp] Error after write started — recording top-up with write warning. err:", errMsg);
          try {
            writingRef.current = false;
            writeRetryRef.current = 0;
            setWriteRetryCount(0);
            setIsRetrying(false);
            await enqueueTopUp({
              nfcUid: uid,
              amount: amount,
              paymentMethod,
              newBalance,
              newCounter,
              hmac: writtenHmac,
            });
            submittingRef.current = false;
            // Set stepRef BEFORE clearing txActiveRef — same race-condition guard
            // as the normal success path (see comment above).
            stepRef.current = "success";
            txActiveRef.current = false; // Transaction complete (with warning)
            void syncToServer(true);
            setWriteWarning(true);
            setStep("success");
            return true;
          } catch (enqueueErr) {
            console.error("[TopUp] enqueueTopUp also failed after write error:", enqueueErr);
          }
        }

        return false;
      }
    };

    let success = await doScanAndWrite();

    while (!success && !aborted && !cancelledRef.current && writeRetryRef.current < MAX_WRITE_RETRIES) {
      writeRetryRef.current += 1;
      setWriteRetryCount(writeRetryRef.current);
      setIsRetrying(true);
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
      if (!cancelledRef.current) {
        success = await doScanAndWrite();
      }
    }

    if (!success && !aborted && !cancelledRef.current) {
      console.error("[TopUp] NFC write failed — all retries exhausted", {
        nfcUid: uid,
        amount: amount,
        newBalance,
        timestamp: new Date().toISOString(),
      });
      writingRef.current = false;
      // Set stepRef BEFORE clearing txActiveRef — same race-condition guard.
      stepRef.current = "write_failed";
      txActiveRef.current = false; // Transaction ended (failed)
      setIsRetrying(false);
      setWriteRetryCount(0);
      writeRetryRef.current = 0;
      setWriteError(t("bank.writeError"));
      setStep("write_failed");
    }
  };

  // ─── Auto-start NFC write when tap_write step is entered ────────────────────
  useEffect(() => {
    if (step === "tap_write") {
      handleStartWrite();
    }
  }, [step]);

  const handleSkipWrite = () => {
    setShowSkipConfirm(true);
  };

  const handleConfirmSkip = async () => {
    setShowSkipConfirm(false);
    cancelledRef.current = true;
    txActiveRef.current = false; // User skipped write — transaction done
    await cancelNfc().catch(() => {});
    writingRef.current = false;
    submittingRef.current = false;
    await addPendingNfcWrite({
      id: `${uid}_${Date.now()}`,
      nfcUid: uid,
      amount: amount,
      newBalance,
      savedAt: new Date().toISOString(),
    });
    try {
      const skipHmac = hmacSecret ? await computeHmac(newBalance, newCounter, hmacSecret, uid) : "";
      await enqueueTopUp({
        nfcUid: uid,
        amount: amount,
        paymentMethod,
        newBalance,
        newCounter,
        hmac: skipHmac,
      });
      void syncNow().catch(() => {});
    } catch {
    }
    stepRef.current = "form";
    setStep("form");
    showAlert(t("common.error"), t("bank.nfcWriteWarning"));
  };

  const handleRetryFromFailed = async () => {
    cancelledRef.current = false;
    txActiveRef.current = true; // Restarting transaction — re-arm focus guard
    writeRetryRef.current = 0;
    setWriteRetryCount(0);
    setWriteError(null);
    stepRef.current = "tap_write";
    setStep("tap_write");
  };

  const handleCancelWriting = async () => {
    cancelledRef.current = true;
    txActiveRef.current = false; // User explicitly cancelled — transaction done
    await cancelNfc().catch(() => {});
    writingRef.current = false;
    submittingRef.current = false;
    stepRef.current = "form";
    setStep("form");
  };

  // ─── Saving overlay ───────────────────────────────────────────────────────────
  if (step === "saving") {
    return (
      <View style={[styles.center, { backgroundColor: C.background }]}>
        <View style={[styles.iconBox, { backgroundColor: C.primaryLight }]}>
          <Feather name="upload-cloud" size={40} color={C.primary} />
        </View>
        <Text style={[styles.stepTitle, { color: C.text }]}>{t("common.processing")}</Text>
      </View>
    );
  }

  // ─── Success screen ───────────────────────────────────────────────────────────
  if (step === "success") {
    return (
      <View style={[styles.center, { backgroundColor: C.background }]}>
        <OfflineBanner syncIssuesRoute={"/(bank)/sync-issues"} />
        <View style={[styles.successIcon, { backgroundColor: C.successLight }]}>
          <Feather name="check-circle" size={52} color={C.success} />
        </View>
        <Text style={[styles.successTitle, { color: C.text }]}>{t("bank.topUpSuccess")}</Text>
        <View style={[styles.successAmounts, { backgroundColor: C.card, borderColor: C.border }]}>
          <View style={styles.amountRow}>
            <Text style={[styles.amountLabel, { color: C.textSecondary }]}>{t("bank.topUpLabel")}</Text>
            <CopAmount amount={amount} positive />
          </View>
          <View style={[styles.divider, { backgroundColor: C.separator }]} />
          <View style={styles.amountRow}>
            <Text style={[styles.amountLabel, { color: C.textSecondary }]}>{t("bank.newBalance")}</Text>
            <CopAmount amount={newBalance} />
          </View>
        </View>
        {tagInfoFromParams && <TagBadge tagInfo={tagInfoFromParams} colors={C} />}
        {writeWarning && (
          <View style={[styles.writeWarnBox, { backgroundColor: C.warningLight ?? "#FFF3CD", borderColor: C.warning ?? "#F59E0B" }]}>
            <Feather name="alert-circle" size={15} color={C.warning ?? "#F59E0B"} />
            <Text style={[styles.writeWarnText, { color: C.warning ?? "#92400E" }]}>
              {t("bank.nfcWriteWarning")}
            </Text>
          </View>
        )}
        <Button title={t("bank.lookup")} onPress={() => router.back()} variant="primary" size="lg" fullWidth />
      </View>
    );
  }

  // ─── Main form ────────────────────────────────────────────────────────────────
  return (
    <>
      <OfflineBanner syncIssuesRoute={"/(bank)/sync-issues"} />
      <ScrollView
        style={{ flex: 1, backgroundColor: C.background }}
        contentContainerStyle={{
          paddingTop: isWeb ? 16 : insets.top + 16,
          paddingBottom: isWeb ? 34 : insets.bottom + 100,
          paddingHorizontal: 20,
          gap: 20,
        }}
      >
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()}>
            <Feather name="arrow-left" size={24} color={C.text} />
          </Pressable>
          <Text style={[styles.pageTitle, { color: C.text }]}>{t("bank.confirmTopUp")}</Text>
          <View style={{ width: 24 }} />
        </View>

        <Card>
          <View style={styles.braceletSummary}>
            <View style={[styles.nfcIcon, { backgroundColor: C.primaryLight }]}>
              <Feather name="wifi" size={18} color={C.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.uidLabel, { color: C.textMuted }]}>{t("bank.braceletLabel")}</Text>
              <Text style={[styles.uid, { color: C.text }]}>{uid}</Text>
              {tagInfoFromParams && <TagBadge tagInfo={tagInfoFromParams} colors={C} />}
            </View>
            <CopAmount amount={currentBalance} size={18} color={C.textSecondary} bold={false} />
          </View>
        </Card>

        <Input
          label={t("bank.topUpAmount")}
          prefix="$"
          placeholder="0"
          keyboardType="numeric"
          value={amountText}
          onChangeText={setAmountText}
          error={amount > 0 && amount < 1000 ? t("bank.minimumAmount") : undefined}
        />

        {amount > 0 && (
          <Card>
            <View style={styles.newBalanceRow}>
              <Text style={[styles.newBalLabel, { color: C.textSecondary }]}>{t("bank.newBalance")}</Text>
              <CopAmount amount={newBalance} size={24} positive />
            </View>
          </Card>
        )}

        <View>
          <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>{t("bank.paymentMethod")}</Text>
          <View style={styles.methodGrid}>
            {PAYMENT_METHODS.map((m) => {
              const isSelected = paymentMethod === m.value;
              return (
                <Pressable
                  key={m.value}
                  onPress={() => setPaymentMethod(m.value)}
                  style={[
                    styles.methodBtn,
                    {
                      backgroundColor: isSelected ? C.primaryLight : C.card,
                      borderColor: isSelected ? C.primary : C.border,
                    },
                  ]}
                >
                  <Feather name={m.icon} size={20} color={isSelected ? C.primary : C.textSecondary} />
                  <Text style={[styles.methodLabel, { color: isSelected ? C.primary : C.textSecondary }]}>
                    {m.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ gap: 4 }}>
          <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>{t("bank.contactInfo")}</Text>
          <Text style={[styles.contactHint, { color: C.textMuted }]}>{t("bank.contactOptional")}</Text>
        </View>

        <TextInput
          style={[styles.contactInput, { backgroundColor: C.inputBg, color: C.text, borderColor: C.border }]}
          placeholder={t("bank.attendeeName")}
          placeholderTextColor={C.textMuted}
          value={attendeeName}
          onChangeText={setAttendeeName}
        />
        <PhoneInput
          number={phone}
          onNumberChange={setPhone}
          country={phoneCountry}
          onCountryChange={setPhoneCountry}
          placeholder={t("bank.phone")}
        />
        <TextInput
          style={[styles.contactInput, { backgroundColor: C.inputBg, color: C.text, borderColor: C.border }]}
          placeholder={t("bank.email")}
          placeholderTextColor={C.textMuted}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Button
          title={`${t("bank.confirmTopUp")} ${amount > 0 ? fmt(amount) : ""}`}
          onPress={handleConfirm}
          variant="success"
          size="lg"
          fullWidth
          disabled={amount < 1000}
          testID="confirm-topup-btn"
        />
      </ScrollView>

      {/* ── NFC Write Modal (tap_write + writing steps) ── */}
      <Modal
        visible={step === "tap_write" || step === "writing"}
        transparent
        animationType="fade"
        onRequestClose={handleCancelWriting}
      >
        <View style={[styles.overlay, { backgroundColor: "rgba(0,0,0,0.65)" }]}>
          <View style={[styles.modalBox, { backgroundColor: C.card }]}>

            {step === "writing" ? (
              // ── Writing in progress ──
              <>
                <Animated.View
                  style={[styles.nfcPulse, { backgroundColor: C.primaryLight, transform: [{ scale: pulseAnim }] }]}
                >
                  <Feather name="wifi" size={48} color={C.primary} />
                </Animated.View>
                <Text style={[styles.modalTitle, { color: C.text, textAlign: "center" }]}>
                  {isRetrying ? t("bank.retryingWrite") : t("bank.writingBracelet")}
                </Text>
                <Text style={[styles.modalSubtitle, { color: C.textSecondary }]}>
                  {isRetrying ? t("bank.keepSteadyRetry") : t("bank.holdSteady")}
                </Text>
                <Pressable onPress={handleCancelWriting} style={[styles.cancelBtn, { borderColor: C.border }]}>
                  <Text style={[styles.cancelText, { color: C.textSecondary }]}>{t("common.cancel")}</Text>
                </Pressable>
              </>
            ) : (
              // ── tap_write: NFC write starting automatically ──
              <>
                <Animated.View
                  style={[styles.nfcPulse, { backgroundColor: C.primaryLight, transform: [{ scale: pulseAnim }] }]}
                >
                  <Feather name="wifi" size={48} color={C.primary} />
                </Animated.View>

                <Text style={[styles.modalTitle, { color: C.text, textAlign: "center" }]}>
                  {t("bank.acercarManilla")}
                </Text>
                <Text style={[styles.modalSubtitle, { color: C.textSecondary }]}>
                  {t("bank.tapToWriteHint")}
                </Text>

                {writeError && (
                  <View style={[styles.errorBox, { backgroundColor: C.dangerLight ?? "#FEE2E2", borderColor: C.danger ?? "#EF4444" }]}>
                    <Feather name="alert-triangle" size={13} color={C.danger ?? "#EF4444"} />
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={[styles.errorText, { color: C.danger ?? "#991B1B" }]}>
                        {t("bank.writeRetryHint")}
                      </Text>
                      <Text style={[styles.errorCode, { color: C.danger ?? "#991B1B" }]}>
                        {writeError}
                      </Text>
                    </View>
                  </View>
                )}

                <Pressable onPress={handleCancelWriting} style={[styles.cancelBtn, { borderColor: C.border }]}>
                  <Text style={[styles.cancelText, { color: C.textSecondary }]}>{t("common.cancel")}</Text>
                </Pressable>
              </>
            )}

          </View>
        </View>
      </Modal>

      {/* ── All-retries-exhausted modal ── */}
      <Modal
        visible={step === "write_failed"}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View style={[styles.overlay, { backgroundColor: "rgba(0,0,0,0.75)" }]}>
          <View style={[styles.modalBox, { backgroundColor: C.card }]}>
            <View style={[styles.failedIconBox, { backgroundColor: C.dangerLight ?? "#FEE2E2" }]}>
              <Feather name="alert-octagon" size={40} color={C.danger ?? "#EF4444"} />
            </View>
            <Text style={[styles.modalTitle, { color: C.text, textAlign: "center" }]}>
              {t("bank.allRetriesExhausted")}
            </Text>
            <View style={[styles.failedDetailBox, { backgroundColor: C.dangerLight ?? "#FEE2E2", borderColor: C.danger ?? "#EF4444" }]}>
              <Text style={[styles.failedDetailText, { color: C.danger ?? "#991B1B" }]}>
                {t("bank.allRetriesExhaustedDetail")}
              </Text>
              {writeError ? (
                <Text style={[styles.errorCode, { color: C.danger ?? "#991B1B", marginTop: 6, fontFamily: "monospace" }]}>
                  {writeError}
                </Text>
              ) : null}
            </View>
            <Button
              title={t("bank.tryAgainWrite")}
              onPress={handleRetryFromFailed}
              variant="primary"
              size="lg"
              fullWidth
            />
            <Pressable onPress={handleSkipWrite} style={[styles.cancelBtn, { borderColor: C.border }]}>
              <Text style={[styles.cancelText, { color: C.textSecondary }]}>{t("bank.skipWriteLater")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── Skip confirmation dialog ── */}
      <Modal
        visible={showSkipConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSkipConfirm(false)}
      >
        <View style={[styles.overlay, { backgroundColor: "rgba(0,0,0,0.75)" }]}>
          <View style={[styles.modalBox, { backgroundColor: C.card }]}>
            <View style={[styles.failedIconBox, { backgroundColor: C.warningLight ?? "#FFF3CD" }]}>
              <Feather name="alert-triangle" size={36} color={C.warning ?? "#F59E0B"} />
            </View>
            <Text style={[styles.modalTitle, { color: C.text, textAlign: "center" }]}>
              {t("bank.skipWriteConfirmTitle")}
            </Text>
            <View style={[styles.failedDetailBox, { backgroundColor: C.warningLight ?? "#FFF3CD", borderColor: C.warning ?? "#F59E0B" }]}>
              <Text style={[styles.failedDetailText, { color: C.text }]}>
                {t("bank.skipWriteConfirmDetail")}
              </Text>
            </View>
            <Button
              title={t("bank.skipWriteConfirm")}
              onPress={handleConfirmSkip}
              variant="secondary"
              size="lg"
              fullWidth
            />
            <Pressable onPress={() => setShowSkipConfirm(false)} style={[styles.cancelBtn, { borderColor: C.border }]}>
              <Text style={[styles.cancelText, { color: C.primary }]}>{t("bank.tryAgainWrite")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 20, paddingHorizontal: 28 },
  iconBox: { width: 100, height: 100, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  stepTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  successIcon: { width: 100, height: 100, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  successTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  successAmounts: { width: "100%", borderWidth: 1, borderRadius: 16, padding: 20, gap: 16 },
  amountRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  amountLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  divider: { height: 1 },
  writeWarnBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginTop: -4, width: "100%" },
  writeWarnText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  pageTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  braceletSummary: { flexDirection: "row", alignItems: "center", gap: 12 },
  nfcIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  uidLabel: { fontSize: 11, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.5 },
  uid: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginTop: 2 },
  newBalanceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  newBalLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  sectionTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },
  methodGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  methodBtn: { borderWidth: 1.5, borderRadius: 12, padding: 14, alignItems: "center", gap: 6, width: "47%" },
  methodLabel: { fontSize: 12, fontFamily: "Inter_500Medium", textAlign: "center" },
  contactHint: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: -8, marginBottom: 4 },
  contactInput: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 15, fontFamily: "Inter_400Regular" },
  // Modal
  overlay: { flex: 1, justifyContent: "center", paddingHorizontal: 28 },
  modalBox: { padding: 32, borderRadius: 24, gap: 16, alignItems: "center" },
  nfcPulse: { width: 100, height: 100, borderRadius: 50, alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  modalSubtitle: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: -8 },
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, width: "100%" },
  errorText: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
  errorCode: { fontSize: 10, fontFamily: "Inter_400Regular", opacity: 0.75, fontVariant: ["tabular-nums"] },
  cancelBtn: { borderWidth: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 32 },
  cancelText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  failedIconBox: { width: 80, height: 80, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  failedDetailBox: { borderWidth: 1, borderRadius: 12, padding: 14, width: "100%" },
  failedDetailText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
});
