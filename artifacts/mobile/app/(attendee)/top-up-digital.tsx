import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { SvgXml } from "react-native-svg";

const pseXml = (color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 38 38"><path fill="${color}" d="M12.17,15.02h0s.54.01.54.01l.07-.4h-.73l-.05.2s0,.09.03.12.07.06.12.06Z"/><path fill="${color}" d="M28.26,16.97h.01s-2.23.01-2.23.01c-.42,0-.77.29-.85.7l-.27,1.46h3.97l.23-1.14c.05-.25-.01-.51-.18-.71-.17-.2-.41-.32-.67-.32Z"/><path fill="${color}" d="M15.11,16.98h-1.93c-.5,0-.92.35-1.01.84l-.15.79-.46,2.53c-.06.29.02.6.22.84.19.24.48.36.78.36h1.94c.5,0,.92-.35,1.01-.84l.6-3.32c.06-.29-.02-.6-.22-.84-.19-.24-.48-.36-.78-.36Z"/><path fill="${color}" d="M18.99,3.85c-6.1,0-11.39,3.46-14.03,8.51.37.02.68.33.68.71s-.32.73-.73.73c-.22,0-.4-.1-.53-.25-.15.33-.26.68-.38,1.03l-.03.09c.18.14.29.33.29.57,0,.37-.29.68-.66.7-.1.41-.18.83-.25,1.25h2.02l1.67,2.04h3.28v.57h-1.69l-1.29,2.32h-1.76c-.11.26-.36.44-.66.44-.4,0-.73-.32-.73-.73s.32-.73.73-.73c.29,0,.56.18.66.44h1.43l.97-1.76H3.17c0,1.2.16,2.37.43,3.5.26.1.45.36.45.67,0,.17-.07.32-.16.44.14.45.31.9.49,1.33.14-.17.33-.28.56-.28.4,0,.73.32.73.73s-.32.73-.73.73h-.01c2.63,5.11,7.93,8.61,14.08,8.61,8.74,0,15.83-7.08,15.83-15.83S27.74,3.85,18.99,3.85ZM6.27,15.97c-.4,0-.73-.32-.73-.73s.32-.73.73-.73.73.32.73.73-.32.73-.73.73ZM6.36,24.7c-.4,0-.73-.32-.73-.73s.32-.73.73-.73.73.32.73.73-.32.73-.73.73ZM14.64,13.31c.01-.06.07-.1.14-.09.06.01.1.07.09.14l-.09.49s.06-.03.09-.03h.36c.11,0,.23.05.29.14s.1.2.08.32l-.17.91s-.06.09-.11.09h-.02c-.06-.01-.1-.07-.09-.14l.17-.91s0-.09-.03-.12-.07-.06-.12-.06h-.36c-.08,0-.14.06-.15.12l-.19,1.01c-.01.06-.07.1-.14.09-.06-.01-.1-.07-.09-.14l.16-.8.19-1.01ZM13.22,14.11h.01c.03-.17.19-.31.37-.31h.62c.07,0,.11.05.11.11s-.05.11-.11.11h-.62c-.08,0-.14.06-.15.12l-.14.68s0,.09.03.12.07.06.11.06h.6c.07,0,.11.05.11.11s-.05.11-.11.11h-.6c-.11,0-.23-.05-.29-.14-.07-.09-.1-.2-.08-.32l.12-.68ZM11.84,14.58c.02-.09.1-.16.19-.16h.79l.03-.19s0-.09-.03-.12-.07-.06-.11-.06h-.6c-.07,0-.11-.05-.11-.11s.05-.11.11-.11h.6c.11,0,.23.05.29.14.07.09.1.2.08.32l-.05.23-.14.75h-.74c-.11.01-.23-.03-.29-.12s-.1-.2-.08-.32l.05-.23ZM14.53,23.5h-.01s-1.94-.01-1.94-.01c-.5,0-.96-.17-1.34-.48l-.57,3.09c-.05.27-.28.46-.56.46h-.1c-.31-.06-.51-.35-.45-.66l.91-4.95.6-3.32c.18-1.02,1.08-1.77,2.12-1.77h1.94c.65,0,1.25.28,1.65.77.41.49.58,1.13.46,1.77l-.6,3.32c-.18,1.02-1.08,1.77-2.12,1.77ZM19.15,19.01h2.31c.6,0,1.73.45,1.73,2.15,0,1.37-1.48,2.37-2.12,2.37h-3.85c-.32,0-.57-.25-.57-.57s.25-.57.57-.57h3.85c.17-.05.99-.61.99-1.24,0-.96-.5-1.02-.6-1.02h-2.31c-.68,0-1.69-.54-1.69-2.06,0-1.43,1.36-2.22,2.3-2.22h3.07c.32,0,.57.25.57.57s-.25.57-.57.57h-3.07c-.33,0-1.17.33-1.17,1.09,0,.92.56.93.56.93ZM29.98,19.46h0c-.09.5-.52.84-1.01.84h-4.27l-.22,1.07c-.05.25.01.51.18.71s.41.32.67.32h3.21c.32,0,.57.25.57.57s-.25.57-.57.57h-3.21c-.6,0-1.16-.26-1.54-.73-.39-.46-.53-1.07-.42-1.65l.24-1.22.02-.05.43-2.38c.17-.95,1-1.64,1.96-1.64h2.23c.6,0,1.16.26,1.54.73.39.46.53,1.07.42,1.65l-.24,1.22Z"/><path fill="${color}" d="M5.12,17.77h-1.82c-.06.49-.09.97-.1,1.47h3.13l-1.2-1.47Z"/></svg>`;
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { ATTENDEE_API_BASE_URL } from "@/constants/domain";
import { useAuth } from "@/contexts/AuthContext";
import Colors from "@/constants/colors";
import { useAlert } from "@/components/CustomAlert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatCurrency } from "@/utils/format";
import { PhoneInput, COUNTRY_CODES, type CountryCode } from "@/components/ui/PhoneInput";

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
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>(COUNTRY_CODES[0]);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [selectedBank, setSelectedBank] = useState<{ code: string; name: string } | null>(null);
  const [showBankPicker, setShowBankPicker] = useState(false);

  const { token } = useAuth();
  const { mutate: initiatePayment, isPending } = useMutation({
    mutationFn: async (body: { braceletUid: string; amount: number; paymentMethod: "nequi" | "pse"; phoneNumber?: string; bankCode?: string }) => {
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

    const body: { braceletUid: string; amount: number; paymentMethod: "nequi" | "pse"; phoneNumber?: string; bankCode?: string } = {
      braceletUid,
      amount: effectiveAmount,
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

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
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
                <Text style={[styles.amountChipText, { color: selectedAmount === amt ? "#0a0a0a" : C.text }]}>
                  {formatCurrency(amt, "COP")}
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
              Total: {formatCurrency(effectiveAmount, "COP")}
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
                {m === "pse" ? (
                  <SvgXml
                    xml={pseXml(method === m ? C.primary : C.textSecondary)}
                    width={22}
                    height={22}
                  />
                ) : (
                  <Feather
                    name="smartphone"
                    size={22}
                    color={method === m ? C.primary : C.textSecondary}
                  />
                )}
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
            <PhoneInput
              number={phoneNumber}
              onNumberChange={setPhoneNumber}
              country={phoneCountry}
              onCountryChange={setPhoneCountry}
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
          title={isPending ? "Iniciando pago..." : `Pagar ${effectiveAmount > 0 ? formatCurrency(effectiveAmount, "COP") : ""}`}
          onPress={handleSubmit}
          disabled={!canSubmit || isPending}
          loading={isPending}
          variant="primary"
          fullWidth
        />
      </ScrollView>
      </KeyboardAvoidingView>
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
