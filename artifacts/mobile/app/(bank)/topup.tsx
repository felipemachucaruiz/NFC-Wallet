import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useCreateTopUp, useGetSigningKey, useUpdateBraceletContact } from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { CopAmount } from "@/components/CopAmount";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { isNfcSupported, writeBracelet, cancelNfc, type TagInfo, type TagType } from "@/utils/nfc";
import { computeHmac } from "@/utils/hmac";
import { formatCOP, parseCOPInput } from "@/utils/format";

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
//  "form"      — user fills in amount / payment method
//  "saving"    — API call in progress
//  "tap_write" — saved OK, now waiting for user to tap card (modal)
//  "writing"   — NFC write in progress (modal, tag detected)
//  "success"   — done (with optional write warning)

type Step = "form" | "saving" | "tap_write" | "writing" | "success";

export default function TopUpScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

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
  const submittingRef = useRef(false);
  const writingRef = useRef(false);

  const [attendeeName, setAttendeeName] = useState(params.attendeeName ?? "");
  const [phone, setPhone] = useState(params.phone ?? "");
  const [email, setEmail] = useState(params.email ?? "");

  const { data: keyData } = useGetSigningKey();
  const hmacSecret = (keyData as unknown as { hmacSecret: string } | undefined)?.hmacSecret ?? "";

  const createTopUp = useCreateTopUp();
  const updateContact = useUpdateBraceletContact();

  // Reset all form state whenever this screen comes into focus (handles Expo Router
  // reusing the cached screen instance when navigating back then forward again)
  useFocusEffect(
    useCallback(() => {
      setAmountText("");
      setPaymentMethod("cash");
      setStep("form");
      setWriteWarning(false);
      setWriteError(null);
      submittingRef.current = false;
      writingRef.current = false;
      // Re-sync contact fields from current params (params object is live from Expo Router
      // but local state initializers don't re-run when screen is reused)
      setAttendeeName(params.attendeeName ?? "");
      setPhone(params.phone ?? "");
      setEmail(params.email ?? "");
    }, [params.attendeeName, params.phone, params.email])
  );

  const amount = parseCOPInput(amountText);
  const newBalance = currentBalance + amount;

  // Pulse animation for the NFC write waiting modals
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

  // ─── Step 1: Save top-up to server ───────────────────────────────────────────
  const handleConfirm = async () => {
    if (submittingRef.current) return;
    if (amount < 1000) {
      Alert.alert(t("common.error"), t("bank.minimumAmount"));
      return;
    }

    submittingRef.current = true;
    setStep("saving");

    try {
      await createTopUp.mutateAsync({
        data: { nfcUid: uid, amountCop: amount, paymentMethod },
      });

      const contactUpdates: { attendeeName?: string; phone?: string; email?: string } = {};
      if (attendeeName.trim()) contactUpdates.attendeeName = attendeeName.trim();
      if (phone.trim()) contactUpdates.phone = phone.trim();
      if (email.trim()) contactUpdates.email = email.trim();
      if (Object.keys(contactUpdates).length > 0) {
        await updateContact.mutateAsync({ nfcUid: uid, data: contactUpdates });
      }
    } catch {
      submittingRef.current = false;
      setStep("form");
      Alert.alert(t("common.error"), t("bank.topUpError"));
      return;
    }

    submittingRef.current = false;

    // API saved — now ask user to tap the card
    if (isNfcSupported()) {
      setStep("tap_write");
    } else {
      setStep("success");
    }
  };

  // ─── Step 2: User taps "Acercar pulsera" button → start NFC write ────────────
  const handleStartWrite = async () => {
    if (writingRef.current) return;
    writingRef.current = true;
    setWriteError(null);
    setStep("writing");

    try {
      const newCounter = currentCounter + 1;
      const newHmac = await computeHmac(newBalance, newCounter, hmacSecret);
      await writeBracelet(
        { uid, balance: newBalance, counter: newCounter, hmac: newHmac },
        tagInfoFromParams ?? undefined
      );
      // Write succeeded — go to clean success
      writingRef.current = false;
      setStep("success");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[TopUp] NFC write failed:", msg);
      writingRef.current = false;
      setWriteError(msg);
      // Show error in the modal so user can retry or skip
      setStep("tap_write");
    }
  };

  const handleSkipWrite = async () => {
    await cancelNfc().catch(() => {});
    writingRef.current = false;
    setWriteWarning(true);
    setStep("success");
  };

  const handleCancelWriting = async () => {
    await cancelNfc().catch(() => {});
    writingRef.current = false;
    setWriteWarning(true);
    setStep("success");
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
      <ScrollView
        style={{ flex: 1, backgroundColor: C.background }}
        contentContainerStyle={{
          paddingTop: isWeb ? 67 : insets.top + 16,
          paddingBottom: isWeb ? 34 : insets.bottom + 24,
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
        <TextInput
          style={[styles.contactInput, { backgroundColor: C.inputBg, color: C.text, borderColor: C.border }]}
          placeholder={t("bank.phone")}
          placeholderTextColor={C.textMuted}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
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
          title={`${t("bank.confirmTopUp")} ${amount > 0 ? formatCOP(amount) : ""}`}
          onPress={handleConfirm}
          variant="success"
          size="lg"
          fullWidth
          disabled={amount < 1000}
          loading={createTopUp.isPending}
          testID="confirm-topup-btn"
        />
      </ScrollView>

      {/* ── NFC Write Modal (tap_write + writing steps) ── */}
      <Modal
        visible={step === "tap_write" || step === "writing"}
        transparent
        animationType="fade"
        onRequestClose={handleSkipWrite}
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
                  {t("bank.writingBracelet")}
                </Text>
                <Text style={[styles.modalSubtitle, { color: C.textSecondary }]}>
                  {t("bank.holdSteady")}
                </Text>
                <Pressable onPress={handleCancelWriting} style={[styles.cancelBtn, { borderColor: C.border }]}>
                  <Text style={[styles.cancelText, { color: C.textSecondary }]}>{t("common.cancel")}</Text>
                </Pressable>
              </>
            ) : (
              // ── tap_write: ask user to tap card ──
              <>
                <Animated.View
                  style={[styles.nfcPulse, { backgroundColor: C.primaryLight, transform: [{ scale: pulseAnim }] }]}
                >
                  <Feather name="wifi" size={48} color={C.primary} />
                </Animated.View>

                <View style={[styles.savedBadge, { backgroundColor: C.successLight }]}>
                  <Feather name="check" size={14} color={C.success} />
                  <Text style={[styles.savedBadgeText, { color: C.success }]}>{t("bank.savedOk")}</Text>
                </View>

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

                <Button
                  title={t("bank.tapNow")}
                  onPress={handleStartWrite}
                  variant="primary"
                  size="lg"
                  fullWidth
                />
                <Pressable onPress={handleSkipWrite} style={[styles.cancelBtn, { borderColor: C.border }]}>
                  <Text style={[styles.cancelText, { color: C.textSecondary }]}>{t("bank.skipWrite")}</Text>
                </Pressable>
              </>
            )}

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
  writeWarnBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginTop: -4 },
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
  savedBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  savedBadgeText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, width: "100%" },
  errorText: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
  errorCode: { fontSize: 10, fontFamily: "Inter_400Regular", opacity: 0.75, fontVariant: ["tabular-nums"] },
  cancelBtn: { borderWidth: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 32 },
  cancelText: { fontSize: 14, fontFamily: "Inter_500Medium" },
});
