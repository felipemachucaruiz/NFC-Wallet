import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useLogTransaction, useGetSigningKey } from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { CopAmount } from "@/components/CopAmount";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useCart } from "@/contexts/CartContext";
import { useOfflineQueue } from "@/contexts/OfflineQueueContext";
import { isNfcSupported, readBracelet, writeBracelet } from "@/utils/nfc";
import { verifyHmac, computeHmac } from "@/utils/hmac";
import { formatCOP } from "@/utils/format";

type ChargeStep =
  | "waiting"
  | "reading"
  | "verifying"
  | "insufficient"
  | "hmac_fail"
  | "writing"
  | "logging"
  | "success"
  | "manual_input";

const STEP_LABELS: Record<ChargeStep, string> = {
  waiting: "pos.tapBracelet",
  reading: "pos.reading",
  verifying: "pos.verifying",
  insufficient: "pos.insufficientBalance",
  hmac_fail: "pos.hmacFailed",
  writing: "pos.writing",
  logging: "pos.processing",
  success: "pos.chargeSuccess",
  manual_input: "bank.manualUid",
};

export default function ChargeScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const params = useLocalSearchParams<{ locationId: string }>();
  const locationId = params.locationId ?? "";

  const { items: cartItems, total, clearCart } = useCart();
  const { enqueue } = useOfflineQueue();
  const { data: keyData } = useGetSigningKey();
  const hmacSecret = keyData?.key ?? "";

  const logTransaction = useLogTransaction();

  const [step, setStep] = useState<ChargeStep>("waiting");
  const [braceletBalance, setBraceletBalance] = useState<number | null>(null);
  const [braceletUid, setBraceletUid] = useState<string | null>(null);
  const [manualUid, setManualUid] = useState("");

  const shortfall = braceletBalance != null ? total - braceletBalance : 0;

  const processCharge = async (uid: string, balance: number, counter: number, hmac: string) => {
    setStep("verifying");
    let hmacOk = true;
    if (hmacSecret && hmac) {
      hmacOk = await verifyHmac(balance, counter, hmac, hmacSecret);
    }
    if (!hmacOk) {
      setStep("hmac_fail");
      try {
        await logTransaction.mutateAsync({
          locationId,
          braceletUid: uid,
          totalAmountCop: total,
          tamperDetected: true,
          lineItems: [],
        } as Parameters<typeof logTransaction.mutateAsync>[0]);
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
    setStep("writing");
    const newHmac = await computeHmac(newBalance, newCounter, hmacSecret);
    if (isNfcSupported()) {
      try {
        await writeBracelet({ uid, balance: newBalance, counter: newCounter, hmac: newHmac });
      } catch {
        Alert.alert(t("common.error"), "Error escribiendo pulsera");
        setStep("waiting");
        return;
      }
    }
    setStep("logging");
    const lineItems = cartItems.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
      unitPriceCop: i.priceCop,
      unitCostCop: Math.round(i.priceCop * 0.4),
    }));
    try {
      await logTransaction.mutateAsync({
        locationId,
        braceletUid: uid,
        totalAmountCop: total,
        newBalance,
        newCounter,
        newHmac,
        lineItems,
      } as Parameters<typeof logTransaction.mutateAsync>[0]);
      clearCart();
      setStep("success");
      setBraceletBalance(newBalance);
      setBraceletUid(uid);
    } catch {
      await enqueue({
        locationId,
        braceletUid: uid,
        totalCop: total,
        newBalance,
        newCounter,
        newHmac,
        lineItems,
      });
      clearCart();
      setStep("success");
      setBraceletBalance(newBalance);
      setBraceletUid(uid);
    }
  };

  const handleTap = async () => {
    if (!isNfcSupported()) {
      setStep("manual_input");
      return;
    }
    setStep("reading");
    try {
      const payload = await readBracelet();
      await processCharge(payload.uid, payload.balance, payload.counter, payload.hmac);
    } catch {
      setStep("waiting");
      Alert.alert(t("common.error"), "Error leyendo pulsera");
    }
  };

  const handleManualConfirm = async () => {
    if (!manualUid.trim()) return;
    setStep("reading");
    await processCharge(manualUid.trim(), 0, 0, "");
    setManualUid("");
  };

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
    };
    const s = icons[step];
    if (!s) return null;
    return (
      <View style={[styles.stepIcon, { backgroundColor: s.bg }]}>
        <Feather name={s.icon as React.ComponentProps<typeof Feather>["name"]} size={44} color={s.color} />
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <View style={styles.cartSummary}>
        <Card padding={16} style={{ marginHorizontal: 20, marginTop: 8 }}>
          {cartItems.slice(0, 3).map((item) => (
            <View key={item.productId} style={styles.lineItem}>
              <Text style={[styles.lineItemName, { color: C.textSecondary }]}>
                {item.quantity}× {item.name}
              </Text>
              <CopAmount amount={item.priceCop * item.quantity} size={13} bold={false} color={C.textSecondary} />
            </View>
          ))}
          {cartItems.length > 3 && (
            <Text style={[styles.moreItems, { color: C.textMuted }]}>+{cartItems.length - 3} más</Text>
          )}
          <View style={[styles.totalRow, { borderTopColor: C.separator }]}>
            <Text style={[styles.totalLabel, { color: C.text }]}>{t("common.total")}</Text>
            <CopAmount amount={total} size={22} />
          </View>
        </Card>
      </View>

      <View style={styles.centerSection}>
        <StepIcon />

        {step !== "success" && step !== "hmac_fail" && step !== "insufficient" && step !== "manual_input" && (
          <Text style={[styles.stepTitle, { color: C.text }]}>{t(STEP_LABELS[step] || "pos.tapBracelet")}</Text>
        )}

        {step === "insufficient" && (
          <View style={styles.insufficientBox}>
            <Text style={[styles.stepTitle, { color: C.text }]}>{t("pos.insufficientBalance")}</Text>
            <Text style={[styles.shortfallText, { color: C.danger }]}>
              {t("pos.shortfall", { amount: formatCOP(shortfall) })}
            </Text>
            <Text style={[styles.currentBalText, { color: C.textSecondary }]}>
              Saldo actual: {formatCOP(braceletBalance ?? 0)}
            </Text>
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
              <Text style={[styles.balanceLabel, { color: C.textSecondary }]}>Nuevo saldo</Text>
              <CopAmount amount={braceletBalance} size={24} positive />
            </View>
          </View>
        )}
      </View>

      <View style={[styles.bottom, { paddingBottom: isWeb ? 34 : insets.bottom + 16, paddingHorizontal: 20 }]}>
        {step === "waiting" && (
          <Button
            title={isNfcSupported() ? t("pos.tapBracelet") : "Ingresar UID de pulsera"}
            onPress={handleTap}
            variant="primary"
            size="lg"
            fullWidth
            testID="charge-tap-btn"
          />
        )}
        {(step === "reading" || step === "verifying" || step === "writing" || step === "logging") && (
          <Button title={t("common.loading")} onPress={() => {}} loading variant="primary" size="lg" fullWidth />
        )}
        {step === "insufficient" && (
          <View style={{ gap: 10 }}>
            <Button title={t("pos.goToBank")} onPress={() => {}} variant="secondary" size="lg" fullWidth />
            <Button title="Reintentar" onPress={() => setStep("waiting")} variant="primary" size="lg" fullWidth />
          </View>
        )}
        {step === "hmac_fail" && (
          <Button title="Cancelar" onPress={() => router.back()} variant="danger" size="lg" fullWidth />
        )}
        {step === "success" && (
          <Button
            title="Nueva venta"
            onPress={() => { router.back(); }}
            variant="success"
            size="lg"
            fullWidth
          />
        )}
        {step === "manual_input" && (
          <View style={{ gap: 10 }}>
            <TextInput
              style={[styles.uidInput, { backgroundColor: C.inputBg, color: C.text, borderColor: C.border }]}
              placeholder="UID de pulsera"
              placeholderTextColor={C.textMuted}
              value={manualUid}
              onChangeText={setManualUid}
              autoCapitalize="characters"
            />
            <Button title="Cobrar" onPress={handleManualConfirm} variant="primary" size="lg" fullWidth disabled={!manualUid.trim()} />
            <Button title={t("common.cancel")} onPress={() => setStep("waiting")} variant="ghost" size="md" fullWidth />
          </View>
        )}
      </View>
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
});
