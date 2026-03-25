import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
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
import { useCreateTopUp, useGetSigningKey } from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { CopAmount } from "@/components/CopAmount";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { isNfcSupported, writeBracelet } from "@/utils/nfc";
import { computeHmac } from "@/utils/hmac";
import { formatCOP, parseCOPInput } from "@/utils/format";

type PaymentMethod = "cash" | "card_external" | "nequi" | "bancolombia" | "other";

const PAYMENT_METHODS: { value: PaymentMethod; icon: React.ComponentProps<typeof Feather>["name"] }[] = [
  { value: "cash", icon: "dollar-sign" },
  { value: "card_external", icon: "credit-card" },
  { value: "nequi", icon: "smartphone" },
  { value: "bancolombia", icon: "home" },
  { value: "other", icon: "more-horizontal" },
];

export default function TopUpScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const params = useLocalSearchParams<{ uid: string; balance: string; counter: string; hmac: string }>();
  const uid = params.uid ?? "";
  const currentBalance = parseInt(params.balance ?? "0", 10);
  const currentCounter = parseInt(params.counter ?? "0", 10);

  const [amountText, setAmountText] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [step, setStep] = useState<"form" | "writing" | "success">("form");

  const { data: keyData } = useGetSigningKey();
  const hmacSecret = keyData?.key ?? "";

  const createTopUp = useCreateTopUp();

  const amount = parseCOPInput(amountText);
  const newBalance = currentBalance + amount;

  const handleConfirm = async () => {
    if (amount < 1000) {
      Alert.alert(t("common.error"), t("bank.minimumAmount"));
      return;
    }

    setStep("writing");
    try {
      const newCounter = currentCounter + 1;
      const newHmac = await computeHmac(newBalance, newCounter, hmacSecret);

      if (isNfcSupported()) {
        await writeBracelet({ uid, balance: newBalance, counter: newCounter, hmac: newHmac });
      }

      await createTopUp.mutateAsync({
        braceletUid: uid,
        amountCop: amount,
        newBalance,
        newCounter,
        newHmac,
        paymentMethod,
      });

      setStep("success");
    } catch (e: unknown) {
      setStep("form");
      Alert.alert(t("common.error"), t("bank.topUpError"));
    }
  };

  if (step === "writing") {
    return (
      <View style={[styles.center, { backgroundColor: C.background }]}>
        <View style={[styles.writingIcon, { backgroundColor: C.primaryLight }]}>
          <Feather name="wifi" size={40} color={C.primary} />
        </View>
        <Text style={[styles.writingTitle, { color: C.text }]}>
          {isNfcSupported() ? t("bank.writingBracelet") : "Procesando..."}
        </Text>
      </View>
    );
  }

  if (step === "success") {
    return (
      <View style={[styles.center, { backgroundColor: C.background }]}>
        <View style={[styles.successIcon, { backgroundColor: C.successLight }]}>
          <Feather name="check-circle" size={52} color={C.success} />
        </View>
        <Text style={[styles.successTitle, { color: C.text }]}>{t("bank.topUpSuccess")}</Text>
        <View style={[styles.successAmounts, { backgroundColor: C.card, borderColor: C.border }]}>
          <View style={styles.amountRow}>
            <Text style={[styles.amountLabel, { color: C.textSecondary }]}>Recarga</Text>
            <CopAmount amount={amount} positive />
          </View>
          <View style={[styles.divider, { backgroundColor: C.separator }]} />
          <View style={styles.amountRow}>
            <Text style={[styles.amountLabel, { color: C.textSecondary }]}>{t("bank.newBalance")}</Text>
            <CopAmount amount={newBalance} />
          </View>
        </View>
        <Button title={t("bank.lookup")} onPress={() => router.back()} variant="primary" size="lg" fullWidth />
      </View>
    );
  }

  return (
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
            <Text style={[styles.uidLabel, { color: C.textMuted }]}>Pulsera</Text>
            <Text style={[styles.uid, { color: C.text }]}>{uid}</Text>
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
            const label = t(`bank.${m.value === "card_external" ? "cardExternal" : m.value}`);
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
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

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
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 20, paddingHorizontal: 28 },
  writingIcon: { width: 100, height: 100, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  writingTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  successIcon: { width: 100, height: 100, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  successTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  successAmounts: { width: "100%", borderWidth: 1, borderRadius: 16, padding: 20, gap: 16 },
  amountRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  amountLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  divider: { height: 1 },
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
});
