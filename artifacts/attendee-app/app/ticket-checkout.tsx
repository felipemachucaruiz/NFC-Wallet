import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
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
import { useAlert } from "@/components/CustomAlert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatCurrency } from "@/utils/format";
import { PhoneInput, COUNTRY_CODES, type CountryCode } from "@/components/PhoneInput";
import { useAuth } from "@/contexts/AuthContext";
import { usePurchaseTickets, useTokenizeCard } from "@/hooks/useEventsApi";
import { usePseBanks } from "@/hooks/useAttendeeApi";
import type { OrderTicket, PaymentMethod } from "@/types/events";

function safeParseJson<T>(json: string | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

type LegalIdType = "CC" | "CE" | "NIT" | "PP" | "TI";

const LEGAL_ID_TYPES: { code: LegalIdType; label: string }[] = [
  { code: "CC", label: "Cédula de Ciudadanía" },
  { code: "CE", label: "Cédula de Extranjería" },
  { code: "NIT", label: "NIT" },
  { code: "PP", label: "Pasaporte" },
  { code: "TI", label: "Tarjeta de Identidad" },
];

export default function TicketCheckoutScreen() {
  const { t } = useTranslation();
  const { show: showAlert } = useAlert();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const params = useLocalSearchParams<{
    eventId: string;
    eventName: string;
    currencyCode: string;
    tickets: string;
    subtotal: string;
    totalServiceFees: string;
    total: string;
  }>();

  const tickets: OrderTicket[] = safeParseJson<OrderTicket[]>(params.tickets, []);
  const subtotal = parseInt(params.subtotal ?? "0", 10);
  const totalServiceFees = parseInt(params.totalServiceFees ?? "0", 10);
  const total = parseInt(params.total ?? "0", 10);
  const currencyCode = params.currencyCode ?? "COP";

  const [method, setMethod] = useState<PaymentMethod>("nequi");
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>(COUNTRY_CODES[0]);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [selectedBank, setSelectedBank] = useState<{ code: string; name: string } | null>(null);
  const [showBankPicker, setShowBankPicker] = useState(false);
  const [legalIdType, setLegalIdType] = useState<LegalIdType>("CC");
  const [legalId, setLegalId] = useState("");
  const [showLegalIdTypePicker, setShowLegalIdTypePicker] = useState(false);
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [cardHolder, setCardHolder] = useState("");

  const { data: pseBanksRaw, isPending: pseBanksLoading } = usePseBanks();
  const pseBanks = (pseBanksRaw ?? []).map((b) => ({
    code: b.financial_institution_code,
    name: b.financial_institution_name,
  }));

  const { refreshUser } = useAuth();
  const { mutate: purchaseTickets, isPending } = usePurchaseTickets();
  const { mutateAsync: tokenizeCard, isPending: isTokenizing } = useTokenizeCard();

  const canSubmit = () => {
    if (method === "nequi") return phoneNumber.replace(/\D/g, "").length === 10;
    if (method === "pse") return selectedBank !== null && legalId.trim().length >= 5;
    if (method === "card") return cardNumber.replace(/\s/g, "").length >= 15 && cardExpiry.length >= 5 && cardCvc.length >= 3 && cardHolder.trim().length > 0;
    return false;
  };

  const handleConfirm = async () => {
    if (!canSubmit()) return;

    const body: Parameters<typeof purchaseTickets>[0] = {
      eventId: params.eventId ?? "",
      tickets: tickets.map((tk) => ({
        ticketTypeId: tk.ticketTypeId,
        attendee: tk.attendee,
      })),
      paymentMethod: method,
    };

    if (method === "nequi") body.phoneNumber = phoneNumber.replace(/\D/g, "");
    if (method === "pse") {
      body.bankCode = selectedBank!.code;
      body.userLegalIdType = legalIdType;
      body.userLegalId = legalId.trim();
    }
    if (method === "card") {
      try {
        const parts = cardExpiry.split("/");
        const token = await tokenizeCard({
          number: cardNumber.replace(/\s/g, ""),
          cvc: cardCvc,
          expMonth: parts[0] ?? "",
          expYear: `20${parts[1] ?? ""}`,
          cardHolder: cardHolder.trim(),
        });
        body.cardToken = token;
      } catch (err: unknown) {
        const msg = (err as { message?: string }).message ?? t("common.unknownError");
        showAlert(t("common.error"), msg);
        return;
      }
    }

    purchaseTickets(body, {
      onSuccess: (result) => {
        void refreshUser();
        router.push({
          pathname: "/ticket-payment-status/[id]",
          params: {
            id: result.orderId,
            redirectUrl: result.redirectUrl ?? "",
            paymentMethod: method,
            eventName: params.eventName ?? "",
          },
        });
      },
      onError: (err: unknown) => {
        const msg = (err as { message?: string }).message ?? t("common.unknownError");
        showAlert(t("common.error"), msg);
      },
    });
  };

  const inputStyle = [
    styles.input,
    { backgroundColor: C.inputBg, borderColor: C.border, color: C.text },
  ];

  return (
    <View style={[styles.container, { backgroundColor: C.background, paddingTop: isWeb ? 67 : insets.top + 8 }]}>
      <View style={[styles.header, { paddingHorizontal: 20 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={C.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: C.text }]}>{t("tickets.checkout")}</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Card style={{ gap: 8 }}>
          <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>
            {t("tickets.orderSummary").toUpperCase()}
          </Text>
          <Text style={[styles.eventName, { color: C.text }]}>{params.eventName}</Text>
          {tickets.map((tk, i) => (
            <View key={i} style={[styles.orderItem, { borderColor: C.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.orderTicketName, { color: C.text }]}>
                  {tk.ticketTypeName}{tk.sectionName ? ` · ${tk.sectionName}` : ""}
                </Text>
                <Text style={[styles.orderAttendee, { color: C.textSecondary }]}>
                  {tk.attendee.name}
                </Text>
              </View>
              <Text style={[styles.orderPrice, { color: C.text }]}>
                {formatCurrency(tk.price, currencyCode)}
              </Text>
            </View>
          ))}
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: C.textSecondary }]}>{t("tickets.subtotal")}</Text>
            <Text style={[styles.summaryValue, { color: C.text }]}>{formatCurrency(subtotal, currencyCode)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: C.textSecondary }]}>{t("tickets.serviceFees")}</Text>
            <Text style={[styles.summaryValue, { color: C.text }]}>{formatCurrency(totalServiceFees, currencyCode)}</Text>
          </View>
          <View style={[styles.totalRow, { borderTopColor: C.border }]}>
            <Text style={[styles.totalLabel, { color: C.text }]}>{t("tickets.total")}</Text>
            <Text style={[styles.totalValue, { color: C.primary }]}>{formatCurrency(total, currencyCode)}</Text>
          </View>
        </Card>

        <Card style={{ gap: 12 }}>
          <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>
            {t("tickets.paymentMethod").toUpperCase()}
          </Text>
          <View style={styles.methodRow}>
            {(["nequi", "pse", "card"] as PaymentMethod[]).map((m) => (
              <Pressable
                key={m}
                onPress={() => { setMethod(m); setSelectedBank(null); setShowBankPicker(false); }}
                style={[
                  styles.methodBtn,
                  {
                    backgroundColor: method === m ? C.primaryLight : C.inputBg,
                    borderColor: method === m ? C.primary : C.border,
                  },
                ]}
              >
                <Feather
                  name={m === "nequi" ? "smartphone" : m === "pse" ? "globe" : "credit-card"}
                  size={18}
                  color={method === m ? C.primary : C.textSecondary}
                />
                <Text style={[styles.methodLabel, { color: method === m ? C.primary : C.text }]}>
                  {m === "nequi" ? "Nequi" : m === "pse" ? "PSE" : t("tickets.creditCard")}
                </Text>
              </Pressable>
            ))}
          </View>
        </Card>

        {method === "nequi" && (
          <Card style={{ gap: 10 }}>
            <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>
              {t("topUp.nequiNumber").toUpperCase()}
            </Text>
            <PhoneInput
              number={phoneNumber}
              onNumberChange={setPhoneNumber}
              country={phoneCountry}
              onCountryChange={setPhoneCountry}
              placeholder={t("topUp.nequiPlaceholder")}
            />
            <Text style={[styles.hint, { color: C.textSecondary }]}>{t("topUp.nequiInfo")}</Text>
          </Card>
        )}

        {method === "pse" && (
          <Card style={{ gap: 10 }}>
            <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>
              {t("topUp.pseBank").toUpperCase()}
            </Text>
            <Pressable
              onPress={() => { if (!pseBanksLoading) setShowBankPicker(!showBankPicker); }}
              style={[styles.bankSelector, { backgroundColor: C.inputBg, borderColor: C.border }]}
            >
              <Text style={{ color: selectedBank ? C.text : C.textMuted, flex: 1, fontFamily: "Inter_400Regular" }}>
                {pseBanksLoading ? t("topUp.pseBanksLoading") : selectedBank ? selectedBank.name : t("topUp.pseBankPlaceholder")}
              </Text>
              <Feather name={showBankPicker ? "chevron-up" : "chevron-down"} size={18} color={C.textSecondary} />
            </Pressable>
            {showBankPicker && pseBanks.length > 0 && (
              <View style={[styles.bankList, { backgroundColor: C.card, borderColor: C.border }]}>
                <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled>
                  {pseBanks.map((bank) => (
                    <Pressable
                      key={bank.code}
                      onPress={() => { setSelectedBank(bank); setShowBankPicker(false); }}
                      style={[styles.bankItem, { backgroundColor: selectedBank?.code === bank.code ? C.primaryLight : "transparent", borderBottomColor: C.separator }]}
                    >
                      <Text style={{ color: C.text, fontFamily: "Inter_400Regular" }}>{bank.name}</Text>
                      {selectedBank?.code === bank.code && <Feather name="check" size={16} color={C.primary} />}
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}
            <Pressable
              onPress={() => setShowLegalIdTypePicker(!showLegalIdTypePicker)}
              style={[styles.bankSelector, { backgroundColor: C.inputBg, borderColor: C.border, marginTop: 8 }]}
            >
              <Text style={{ color: C.text, flex: 1, fontFamily: "Inter_400Regular" }}>
                {LEGAL_ID_TYPES.find((t) => t.code === legalIdType)?.label ?? "CC"}
              </Text>
              <Feather name={showLegalIdTypePicker ? "chevron-up" : "chevron-down"} size={18} color={C.textSecondary} />
            </Pressable>
            {showLegalIdTypePicker && (
              <View style={[styles.bankList, { backgroundColor: C.card, borderColor: C.border }]}>
                {LEGAL_ID_TYPES.map((idType) => (
                  <Pressable
                    key={idType.code}
                    onPress={() => { setLegalIdType(idType.code); setShowLegalIdTypePicker(false); }}
                    style={[styles.bankItem, { backgroundColor: legalIdType === idType.code ? C.primaryLight : "transparent", borderBottomColor: C.separator }]}
                  >
                    <Text style={{ color: C.text, fontFamily: "Inter_400Regular" }}>{idType.label}</Text>
                    {legalIdType === idType.code && <Feather name="check" size={16} color={C.primary} />}
                  </Pressable>
                ))}
              </View>
            )}
            <TextInput
              style={inputStyle}
              placeholder={t("tickets.docNumber")}
              placeholderTextColor={C.textMuted}
              value={legalId}
              onChangeText={(v) => setLegalId(v.replace(/[^0-9a-zA-Z\-]/g, ""))}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={[styles.hint, { color: C.textSecondary }]}>{t("topUp.pseInfo")}</Text>
          </Card>
        )}

        {method === "card" && (
          <Card style={{ gap: 10 }}>
            <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>
              {t("tickets.cardDetails").toUpperCase()}
            </Text>
            <TextInput
              style={inputStyle}
              placeholder={t("tickets.cardNumber")}
              placeholderTextColor={C.textMuted}
              value={cardNumber}
              onChangeText={setCardNumber}
              keyboardType="numeric"
              maxLength={19}
            />
            <View style={styles.cardRow}>
              <TextInput
                style={[inputStyle, { flex: 1 }]}
                placeholder="MM/AA"
                placeholderTextColor={C.textMuted}
                value={cardExpiry}
                onChangeText={setCardExpiry}
                keyboardType="numeric"
                maxLength={5}
              />
              <TextInput
                style={[inputStyle, { flex: 1 }]}
                placeholder="CVC"
                placeholderTextColor={C.textMuted}
                value={cardCvc}
                onChangeText={setCardCvc}
                keyboardType="numeric"
                maxLength={4}
                secureTextEntry
              />
            </View>
            <TextInput
              style={inputStyle}
              placeholder={t("tickets.cardHolder")}
              placeholderTextColor={C.textMuted}
              value={cardHolder}
              onChangeText={setCardHolder}
              autoCapitalize="characters"
            />
          </Card>
        )}

        <Button
          title={isPending || isTokenizing ? t("common.processing") : `${t("tickets.confirmPayment")} ${formatCurrency(total, currencyCode)}`}
          onPress={handleConfirm}
          disabled={!canSubmit() || isPending || isTokenizing}
          loading={isPending || isTokenizing}
          variant="primary"
          fullWidth
          size="lg"
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 8 },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  scroll: { padding: 20, gap: 16 },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8 },
  eventName: { fontSize: 16, fontFamily: "Inter_700Bold" },
  orderItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 1 },
  orderTicketName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  orderAttendee: { fontSize: 12, fontFamily: "Inter_400Regular" },
  orderPrice: { fontSize: 14, fontFamily: "Inter_700Bold" },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  summaryLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  summaryValue: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 10, borderTopWidth: 1, marginTop: 4 },
  totalLabel: { fontSize: 16, fontFamily: "Inter_700Bold" },
  totalValue: { fontSize: 20, fontFamily: "Inter_700Bold" },
  methodRow: { flexDirection: "row", gap: 10 },
  methodBtn: { borderWidth: 1.5, borderRadius: 14, padding: 14, alignItems: "center", gap: 6, flex: 1 },
  methodLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 15, fontFamily: "Inter_400Regular" },
  hint: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
  bankSelector: { borderWidth: 1, borderRadius: 12, padding: 14, flexDirection: "row", alignItems: "center" },
  bankList: { borderWidth: 1, borderRadius: 12, overflow: "hidden" },
  bankItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderBottomWidth: 1 },
  cardRow: { flexDirection: "row", gap: 12 },
});
