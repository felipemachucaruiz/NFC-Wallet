import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, Animated } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import {
  useOpenSplitSession,
  useChargeSplitSession,
  useCancelSplitSession,
  useGetSigningKey,
  useGetEvent,
  customFetch,
} from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { CopAmount } from "@/components/CopAmount";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { useAlert } from "@/components/CustomAlert";
import { isNfcSupported, scanAndWriteBracelet, cancelNfc } from "@/utils/nfc";
import { verifyHmac, computeHmac } from "@/utils/hmac";
import { formatCurrency } from "@/utils/format";
import { useEventContext } from "@/contexts/EventContext";
import { extractErrorMessage } from "@/utils/errorMessage";

type SessionPayment = {
  id: string;
  braceletUid: string;
  grossAmount: number;
  newBalance: number;
  createdAt: string;
};

type Session = {
  id: string;
  totalAmount: number;
  paidAmount: number;
  status: "open" | "completed" | "cancelled";
  payments?: SessionPayment[];
};

export default function SplitChargeScreen() {
  const { t } = useTranslation();
  const { show: showAlert } = useAlert();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();

  const { user } = useAuth();
  const { currencyCode } = useEventContext();
  const fmt = (n: number) => formatCurrency(n, currencyCode);

  const params = useLocalSearchParams<{ locationId: string }>();
  const locationId = params.locationId ?? "";

  const { items: cartItems, clearCart } = useCart();
  const { data: eventData } = useGetEvent(user?.eventId ?? "", { query: { enabled: !!user?.eventId } });
  const eventTyped = eventData as { useKdf?: boolean } | undefined;

  const { data: keyData } = useGetSigningKey();
  const keyDataTyped = keyData as unknown as { hmacSecret?: string; legacyHmacSecret?: string | null } | undefined;
  const hmacSecret = keyDataTyped?.hmacSecret ?? "";
  const legacyKeys = keyDataTyped?.legacyHmacSecret ? [keyDataTyped.legacyHmacSecret] : [];

  const openMutation = useOpenSplitSession();
  const chargeMutation = useChargeSplitSession();
  const cancelMutation = useCancelSplitSession();

  const [session, setSession] = useState<Session | null>(null);
  const [amountInput, setAmountInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [nfcModalVisible, setNfcModalVisible] = useState(false);
  const cancelledRef = useRef(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!nfcModalVisible) { pulseAnim.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [nfcModalVisible]);

  // Open session on mount
  useEffect(() => {
    if (session || cartItems.length === 0) return;
    (async () => {
      try {
        const res = await openMutation.mutateAsync({
          data: {
            locationId,
            tipAmount: 0,
            lineItems: cartItems.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          },
        });
        setSession(res as Session);
      } catch (err) {
        const msg = extractErrorMessage(err, "Error opening session");
        showAlert(t("common.error"), msg);
        router.back();
      }
    })();
  }, []);

  const remaining = session ? session.totalAmount - session.paidAmount : 0;
  const parsedAmount = parseInt(amountInput.replace(/[^0-9]/g, ""), 10);
  const validAmount = !isNaN(parsedAmount) && parsedAmount > 0 && parsedAmount <= remaining;

  const fillRemaining = () => setAmountInput(String(remaining));

  const startScan = async () => {
    if (!session || !validAmount || busy) return;
    if (!isNfcSupported()) {
      showAlert(t("common.error"), t("pos.nfcNotSupported", "NFC no soportado"));
      return;
    }
    cancelledRef.current = false;
    setNfcModalVisible(true);
    setBusy(true);

    let aborted = false;
    try {
      await scanAndWriteBracelet(async (payload) => {
        if (cancelledRef.current) { aborted = true; return null; }
        // Verify HMAC against chip
        if (hmacSecret && payload.hmac) {
          const ok = await verifyHmac(payload.balance, payload.counter, payload.hmac, hmacSecret, payload.uid, legacyKeys);
          if (!ok) {
            aborted = true;
            showAlert(t("common.error"), t("pos.hmacFailed"));
            return null;
          }
        }

        // Fetch server pending top-up to get true effective balance
        let pendingTopUp = 0;
        try {
          const data = await customFetch(`/api/bracelets/${encodeURIComponent(payload.uid)}`) as { pendingTopUpAmount?: number | null } | null;
          if (data?.pendingTopUpAmount && data.pendingTopUpAmount > 0) pendingTopUp = data.pendingTopUpAmount;
        } catch {}
        const effectiveBalance = payload.balance + pendingTopUp;

        let chargeAmount = parsedAmount;
        if (effectiveBalance < chargeAmount) {
          // Offer to charge what's available
          if (effectiveBalance <= 0) {
            aborted = true;
            showAlert(t("common.error"), t("splitPos.zeroBalance", "Pulsera sin saldo"));
            return null;
          }
          chargeAmount = effectiveBalance;
        }

        const newBalance = effectiveBalance - chargeAmount;
        const newCounter = payload.counter + 1;
        const newHmac = hmacSecret ? await computeHmac(newBalance, newCounter, hmacSecret, payload.uid, payload.zoneMask || undefined) : "";

        // Server call: charge the split session
        try {
          const result = await chargeMutation.mutateAsync({
            sessionId: session.id,
            data: {
              idempotencyKey: `${payload.uid}-${newCounter}-${Date.now()}`,
              nfcUid: payload.uid,
              amount: chargeAmount,
              newBalance,
              counter: newCounter,
              ...(newHmac ? { hmac: newHmac } : {}),
            },
          });
          const updated = (result as { session: Session }).session;
          setSession(updated);
          setAmountInput("");
        } catch (err) {
          aborted = true;
          showAlert(t("common.error"), extractErrorMessage(err, "Error en cobro"));
          return null;
        }

        return { uid: payload.uid, balance: newBalance, counter: newCounter, hmac: newHmac, zoneMask: payload.zoneMask };
      });
    } catch (err) {
      if (!cancelledRef.current && !aborted) {
        showAlert(t("common.error"), extractErrorMessage(err, "Error al leer pulsera"));
      }
    } finally {
      setBusy(false);
      setNfcModalVisible(false);
    }
  };

  const cancelScan = () => {
    cancelledRef.current = true;
    try { cancelNfc(); } catch {}
    setNfcModalVisible(false);
    setBusy(false);
  };

  const handleCancelSession = async () => {
    if (!session) { router.back(); return; }
    if (session.paidAmount > 0) {
      showAlert(t("common.error"), t("splitPos.cancelWithPayments", "No se puede cancelar: ya hay pagos. Salir sin completar."));
      router.back();
      return;
    }
    try {
      await cancelMutation.mutateAsync({ sessionId: session.id });
    } catch {}
    clearCart();
    router.back();
  };

  const handleFinish = () => {
    clearCart();
    router.replace("/(merchant-pos)/");
  };

  if (session?.status === "completed") {
    return (
      <View style={[styles.container, { backgroundColor: C.background, paddingTop: insets.top + 20 }]}>
        <View style={styles.successIconWrap}>
          <View style={[styles.successIcon, { backgroundColor: C.successLight ?? C.primaryLight }]}>
            <Feather name="check" size={48} color={C.success ?? C.primary} />
          </View>
        </View>
        <Text style={[styles.successTitle, { color: C.text }]}>{t("splitPos.completed", "Pago dividido completado")}</Text>
        <Text style={[styles.successSubtitle, { color: C.textSecondary }]}>
          {fmt(session.totalAmount)} · {session.payments?.length ?? 0} {t("splitPos.bracelets", "pulseras")}
        </Text>
        <View style={{ padding: 20 }}>
          <Button title={t("common.done", "Listo")} onPress={handleFinish} variant="primary" size="lg" />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: C.background, paddingTop: insets.top }]}>
      <View style={[styles.topBar, { borderBottomColor: C.border }]}>
        <Pressable onPress={handleCancelSession} hitSlop={8}>
          <Feather name="x" size={24} color={C.text} />
        </Pressable>
        <Text style={[styles.title, { color: C.text }]}>{t("splitPos.title", "Pago dividido")}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 24 }}>
        {!session ? (
          <Text style={{ color: C.textSecondary, textAlign: "center", padding: 40 }}>{t("common.loading")}</Text>
        ) : (
          <>
            <Card>
              <View style={styles.kpiRow}>
                <View style={styles.kpiCol}>
                  <Text style={[styles.kpiLabel, { color: C.textSecondary }]}>{t("common.total")}</Text>
                  <CopAmount amount={session.totalAmount} size={18} />
                </View>
                <View style={styles.kpiCol}>
                  <Text style={[styles.kpiLabel, { color: C.textSecondary }]}>{t("splitPos.paid", "Pagado")}</Text>
                  <CopAmount amount={session.paidAmount} size={18} />
                </View>
                <View style={styles.kpiCol}>
                  <Text style={[styles.kpiLabel, { color: C.textSecondary }]}>{t("splitPos.remaining", "Restante")}</Text>
                  <CopAmount amount={remaining} size={18} />
                </View>
              </View>
            </Card>

            <Card>
              <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>{t("splitPos.amountToCharge", "Monto a cobrar de esta pulsera")}</Text>
              <View style={[styles.amountRow, { backgroundColor: C.inputBg, borderColor: C.border }]}>
                <Text style={[styles.currency, { color: C.text }]}>$</Text>
                <TextInput
                  value={amountInput}
                  onChangeText={(v) => setAmountInput(v.replace(/[^0-9]/g, ""))}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={C.textMuted}
                  style={[styles.amountInput, { color: C.text }]}
                  editable={!busy}
                />
                <Pressable onPress={fillRemaining} style={[styles.fillBtn, { backgroundColor: C.primaryLight }]}>
                  <Text style={[styles.fillBtnText, { color: C.primary }]}>{t("splitPos.rest", "Resto")}</Text>
                </Pressable>
              </View>
              <Button
                title={t("splitPos.scanAndCharge", "Cobrar y escanear pulsera")}
                onPress={startScan}
                variant="primary"
                size="lg"
                disabled={!validAmount || busy}
                testID="split-scan-btn"
              />
            </Card>

            {session.payments && session.payments.length > 0 && (
              <Card>
                <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>{t("splitPos.paymentsList", "Pagos realizados")}</Text>
                {session.payments.map((p, idx) => (
                  <View key={p.id} style={[styles.payRow, { borderBottomColor: C.border, borderBottomWidth: idx < session.payments!.length - 1 ? 1 : 0 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.payAmount, { color: C.text }]}>{fmt(p.grossAmount)}</Text>
                      <Text style={[styles.payMeta, { color: C.textMuted }]}>{p.braceletUid.slice(0, 12)}…</Text>
                    </View>
                    <Feather name="check-circle" size={20} color={C.success ?? C.primary} />
                  </View>
                ))}
              </Card>
            )}
          </>
        )}
      </ScrollView>

      <Modal visible={nfcModalVisible} transparent animationType="fade" onRequestClose={cancelScan}>
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, { backgroundColor: C.card }]}>
            <Animated.View style={[styles.modalIcon, { backgroundColor: C.primaryLight, transform: [{ scale: pulseAnim }] }]}>
              <Feather name="wifi" size={40} color={C.primary} />
            </Animated.View>
            <Text style={[styles.modalTitle, { color: C.text }]}>{t("pos.tapBracelet")}</Text>
            <Text style={[styles.modalSubtitle, { color: C.textSecondary }]}>{fmt(parsedAmount || 0)}</Text>
            <Button title={t("common.cancel")} onPress={cancelScan} variant="ghost" size="md" />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  title: { fontSize: 17, fontFamily: "Inter_700Bold" },
  kpiRow: { flexDirection: "row", gap: 8 },
  kpiCol: { flex: 1, alignItems: "center", gap: 4 },
  kpiLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  amountRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
  currency: { fontSize: 24, fontFamily: "Inter_700Bold" },
  amountInput: { flex: 1, fontSize: 24, fontFamily: "Inter_700Bold", padding: 0 },
  fillBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  fillBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  payRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, gap: 12 },
  payAmount: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  payMeta: { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 2 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", padding: 24 },
  modalCard: { padding: 32, borderRadius: 20, gap: 16, alignItems: "center", maxWidth: 360, width: "100%" },
  modalIcon: { width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  modalSubtitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  successIconWrap: { alignItems: "center", marginTop: 60 },
  successIcon: { width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center" },
  successTitle: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center", marginTop: 24 },
  successSubtitle: { fontSize: 14, fontFamily: "Inter_500Medium", textAlign: "center", marginTop: 8 },
});
