import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { ATTENDEE_API_BASE_URL } from "@/constants/domain";
import { useAuth } from "@/contexts/AuthContext";
import Colors from "@/constants/colors";
import { useAlert } from "@/components/CustomAlert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatCOP } from "@/utils/format";

type DigitalMethod = "nequi" | "pse";

const AMOUNTS = [10000, 20000, 50000, 100000, 200000];

const PSE_BANKS = [
  { code: "1040", name: "Banco Agrario" },
  { code: "1052", name: "Banco AV Villas" },
  { code: "1032", name: "Banco Caja Social" },
  { code: "1066", name: "Banco Cooperativo Coopcentral" },
  { code: "1558", name: "Banco COOMEVA" },
  { code: "1051", name: "Banco Davivienda" },
  { code: "1001", name: "Banco De Bogotá" },
  { code: "1023", name: "Banco De Occidente" },
  { code: "1062", name: "Banco Falabella" },
  { code: "1069", name: "Banco Finandina" },
  { code: "1012", name: "Banco GNB Sudameris" },
  { code: "1006", name: "Banco Itaú" },
  { code: "1060", name: "Banco Pichincha" },
  { code: "1002", name: "Banco Popular" },
  { code: "1007", name: "Bancolombia" },
  { code: "1061", name: "Bancoomeva" },
  { code: "1013", name: "BBVA Colombia" },
  { code: "1009", name: "Citibank" },
  { code: "1370", name: "Colpatria" },
  { code: "1292", name: "Confiar Cooperativa Financiera" },
  { code: "1067", name: "Compartir" },
  { code: "1059", name: "Bancamía" },
  { code: "1558", name: "Coofinep" },
  { code: "1303", name: "Cootrafa" },
  { code: "1289", name: "DECEVAL" },
  { code: "1097", name: "Iris" },
  { code: "1637", name: "Scotiabank Colpatria" },
];

export default function TopUpDigitalScreen() {
  const { t } = useTranslation();
  const { show: showAlert } = useAlert();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const params = useLocalSearchParams<{ braceletUid?: string }>();
  const braceletUid = params.braceletUid ?? "";

  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [method, setMethod] = useState<DigitalMethod>("nequi");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [selectedBank, setSelectedBank] = useState<{ code: string; name: string } | null>(null);
  const [showBankPicker, setShowBankPicker] = useState(false);

  const { token } = useAuth();
  const { mutate: initiatePayment, isPending } = useMutation({
    mutationFn: async (body: { braceletUid: string; amountCop: number; paymentMethod: "nequi" | "pse"; phoneNumber?: string; bankCode?: string }) => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${ATTENDEE_API_BASE_URL}/api/payments/initiate`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? res.statusText);
      }
      return res.json() as Promise<{ intentId: string; status: string; redirectUrl?: string | null }>;
    },
  });

  const effectiveAmount = selectedAmount ?? (customAmount ? parseInt(customAmount.replace(/\D/g, ""), 10) : 0);

  const canSubmit =
    effectiveAmount >= 1000 &&
    braceletUid.length > 0 &&
    (method === "nequi"
      ? phoneNumber.replace(/\D/g, "").length === 10
      : selectedBank !== null);

  const handleSubmit = () => {
    if (!canSubmit) return;

    const body: { braceletUid: string; amountCop: number; paymentMethod: "nequi" | "pse"; phoneNumber?: string; bankCode?: string } = {
      braceletUid,
      amountCop: effectiveAmount,
      paymentMethod: method,
    };

    if (method === "nequi") {
      body.phoneNumber = phoneNumber.replace(/\D/g, "");
    } else {
      body.bankCode = selectedBank!.code;
    }

    initiatePayment(body, {
      onSuccess: (result) => {
        router.push({
          pathname: "/(attendee)/payment-status/[id]" as never,
          params: {
            id: result.intentId,
            redirectUrl: result.redirectUrl ?? "",
            paymentMethod: method,
          },
        });
      },
      onError: (err: unknown) => {
        const msg = (err as { message?: string }).message ?? t("common.unknownError");
        showAlert(t("common.error"), msg);
      },
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: C.background, paddingTop: isWeb ? 67 : insets.top + 8 }]}>
      <View style={[styles.header, { paddingHorizontal: 20 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={C.text} />
        </Pressable>
        <Text style={[styles.title, { color: C.text }]}>Recarga Digital</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        {!braceletUid && (
          <View style={[styles.warnBox, { backgroundColor: C.warningLight, borderColor: C.warning }]}>
            <Feather name="alert-triangle" size={16} color={C.warning} />
            <Text style={[styles.warnText, { color: C.warning }]}>
              No se seleccionó una pulsera. Regresa y escanea tu pulsera primero.
            </Text>
          </View>
        )}

        <Card style={{ gap: 12 }}>
          <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>MONTO A RECARGAR</Text>
          <View style={styles.amountGrid}>
            {AMOUNTS.map((amt) => (
              <Pressable
                key={amt}
                onPress={() => { setSelectedAmount(amt); setCustomAmount(""); }}
                style={[
                  styles.amountChip,
                  {
                    backgroundColor: selectedAmount === amt ? C.primary : C.inputBg,
                    borderColor: selectedAmount === amt ? C.primary : C.border,
                  },
                ]}
              >
                <Text style={[styles.amountChipText, { color: selectedAmount === amt ? "#fff" : C.text }]}>
                  {formatCOP(amt)}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.orLabel, { color: C.textMuted }]}>O ingresa un monto</Text>
          <TextInput
            style={[styles.input, { backgroundColor: C.inputBg, borderColor: C.border, color: C.text }]}
            placeholder="Ej: 75000"
            placeholderTextColor={C.textMuted}
            keyboardType="numeric"
            value={customAmount}
            onChangeText={(v) => { setCustomAmount(v); setSelectedAmount(null); }}
          />
          {effectiveAmount > 0 && (
            <Text style={[styles.amountPreview, { color: C.primary }]}>
              Total: {formatCOP(effectiveAmount)}
            </Text>
          )}
        </Card>

        <Card style={{ gap: 12 }}>
          <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>MÉTODO DE PAGO</Text>
          <View style={styles.methodRow}>
            {(["nequi", "pse"] as DigitalMethod[]).map((m) => (
              <Pressable
                key={m}
                onPress={() => setMethod(m)}
                style={[
                  styles.methodBtn,
                  {
                    backgroundColor: method === m ? C.primaryLight : C.inputBg,
                    borderColor: method === m ? C.primary : C.border,
                    flex: 1,
                  },
                ]}
              >
                <Feather
                  name={m === "nequi" ? "smartphone" : "globe"}
                  size={22}
                  color={method === m ? C.primary : C.textSecondary}
                />
                <Text style={[styles.methodLabel, { color: method === m ? C.primary : C.text }]}>
                  {m === "nequi" ? "Nequi" : "PSE"}
                </Text>
                <Text style={[styles.methodSub, { color: C.textMuted }]}>
                  {m === "nequi" ? "Confirmación por app" : "Redirección al banco"}
                </Text>
              </Pressable>
            ))}
          </View>
        </Card>

        {method === "nequi" && (
          <Card style={{ gap: 12 }}>
            <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>NÚMERO NEQUI</Text>
            <Text style={[styles.hintText, { color: C.textSecondary }]}>
              Ingresa el número de celular vinculado a tu cuenta Nequi.
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: C.inputBg, borderColor: C.border, color: C.text }]}
              placeholder="300 123 4567"
              placeholderTextColor={C.textMuted}
              keyboardType="phone-pad"
              maxLength={13}
              value={phoneNumber}
              onChangeText={setPhoneNumber}
            />
          </Card>
        )}

        {method === "pse" && (
          <Card style={{ gap: 12 }}>
            <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>BANCO</Text>
            <Text style={[styles.hintText, { color: C.textSecondary }]}>
              Selecciona tu banco. Serás redirigido al portal del banco para confirmar el pago.
            </Text>
            <Pressable
              onPress={() => setShowBankPicker(!showBankPicker)}
              style={[styles.bankSelector, { backgroundColor: C.inputBg, borderColor: C.border }]}
            >
              <Text style={{ color: selectedBank ? C.text : C.textMuted, flex: 1, fontFamily: "Inter_400Regular" }}>
                {selectedBank ? selectedBank.name : "Selecciona tu banco"}
              </Text>
              <Feather name={showBankPicker ? "chevron-up" : "chevron-down"} size={18} color={C.textSecondary} />
            </Pressable>
            {showBankPicker && (
              <View style={[styles.bankList, { backgroundColor: C.card, borderColor: C.border }]}>
                <ScrollView style={{ maxHeight: 250 }} nestedScrollEnabled>
                  {PSE_BANKS.map((bank) => (
                    <Pressable
                      key={bank.code + bank.name}
                      onPress={() => { setSelectedBank(bank); setShowBankPicker(false); }}
                      style={[
                        styles.bankItem,
                        {
                          backgroundColor: selectedBank?.code === bank.code ? C.primaryLight : "transparent",
                          borderBottomColor: C.separator,
                        },
                      ]}
                    >
                      <Text style={{ color: C.text, fontFamily: "Inter_400Regular" }}>{bank.name}</Text>
                      {selectedBank?.code === bank.code && (
                        <Feather name="check" size={16} color={C.primary} />
                      )}
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}
          </Card>
        )}

        <View style={[styles.infoBox, { backgroundColor: C.cardSecondary, borderColor: C.border }]}>
          <Feather name="info" size={14} color={C.textSecondary} />
          <Text style={[styles.infoText, { color: C.textSecondary }]}>
            {method === "nequi"
              ? "Recibirás una notificación push en tu app Nequi para confirmar el pago. El saldo se acreditará automáticamente al confirmar."
              : "Serás redirigido al portal seguro de tu banco. El saldo se acreditará al completar el pago."}
          </Text>
        </View>

        <Button
          title={isPending ? "Iniciando pago..." : `Pagar ${effectiveAmount > 0 ? formatCOP(effectiveAmount) : ""}`}
          onPress={handleSubmit}
          disabled={!canSubmit || isPending}
          loading={isPending}
          variant="primary"
          fullWidth
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingBottom: 8 },
  backBtn: { padding: 4 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold" },
  scroll: { padding: 20, gap: 16 },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8 },
  amountGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  amountChip: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: "30%",
    alignItems: "center",
  },
  amountChipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  orLabel: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
  },
  amountPreview: { fontSize: 16, fontFamily: "Inter_700Bold", textAlign: "center" },
  methodRow: { flexDirection: "row", gap: 12 },
  methodBtn: {
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    gap: 6,
  },
  methodLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  methodSub: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center" },
  hintText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  bankSelector: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  bankList: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  bankItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderBottomWidth: 1,
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  infoText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
  warnBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  warnText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
});
