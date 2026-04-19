import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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
import { useAuth } from "@/contexts/AuthContext";
import { API_BASE_URL } from "@/constants/domain";
import QRCode from "react-native-qrcode-svg";

type TicketType = {
  id: string;
  name: string;
  price: string;
  quantity: number;
  soldCount: number;
};

type SaleResult = {
  orderId: string;
  ticket: {
    id: string;
    qrCodeToken: string;
    attendeeName: string;
    attendeeEmail: string;
    ticketTypeName: string;
    totalAmount: number;
    paymentMethod: string;
  };
};

type BoxOfficePaymentMethod = "gate_cash" | "gate_transfer" | "gate_card" | "gate_nequi";

const ALL_BOX_OFFICE_METHODS: { value: BoxOfficePaymentMethod; labelKey: string; icon: string }[] = [
  { value: "gate_cash", labelKey: "boxOffice.gate_cash", icon: "dollar-sign" },
  { value: "gate_transfer", labelKey: "boxOffice.gate_transfer", icon: "smartphone" },
  { value: "gate_card", labelKey: "boxOffice.gate_card", icon: "credit-card" },
  { value: "gate_nequi", labelKey: "boxOffice.gate_nequi", icon: "zap" },
];

type PageState = "form" | "loading" | "success" | "error";

export default function BoxOfficeSaleScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user, token } = useAuth();

  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [selectedTypeId, setSelectedTypeId] = useState<string>("");
  const [attendeeName, setAttendeeName] = useState("");
  const [attendeeEmail, setAttendeeEmail] = useState("");
  const [attendeePhone, setAttendeePhone] = useState("");
  const [enabledPaymentMethods, setEnabledPaymentMethods] = useState<BoxOfficePaymentMethod[]>(["gate_cash", "gate_transfer", "gate_card", "gate_nequi"]);
  const [paymentMethod, setPaymentMethod] = useState<BoxOfficePaymentMethod>("gate_cash");
  const [pageState, setPageState] = useState<PageState>("form");
  const [saleResult, setSaleResult] = useState<SaleResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const eventId = user?.eventId ?? "";

  useEffect(() => {
    if (!eventId || !token) return;
    fetch(`${API_BASE_URL}/api/events/${eventId}/payment-config`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        const methods: BoxOfficePaymentMethod[] = data.boxOfficePaymentMethods ?? ["gate_cash", "gate_transfer", "gate_card", "gate_nequi"];
        setEnabledPaymentMethods(methods);
        if (!methods.includes(paymentMethod)) {
          setPaymentMethod(methods[0] ?? "gate_cash");
        }
      })
      .catch(() => {});
  }, [eventId, token]);

  useEffect(() => {
    if (!eventId || !token) return;
    fetch(`${API_BASE_URL}/api/events/${eventId}/box-office/ticket-types`, {
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        const types: TicketType[] = data.ticketTypes ?? [];
        setTicketTypes(types);
        if (types.length > 0) setSelectedTypeId(types[0].id);
      })
      .catch(() => {})
      .finally(() => setLoadingTypes(false));
  }, [eventId, token]);

  const selectedType = ticketTypes.find((t) => t.id === selectedTypeId);
  const available = selectedType ? selectedType.quantity - selectedType.soldCount : 0;

  const isValid = selectedTypeId && attendeeName.trim() && attendeeEmail.trim().includes("@");

  async function handleSell() {
    if (!isValid || !eventId) return;
    setPageState("loading");
    setErrorMsg("");
    try {
      const res = await fetch(`${API_BASE_URL}/api/events/${eventId}/box-office/sale`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ticketTypeId: selectedTypeId,
          attendeeName: attendeeName.trim(),
          attendeeEmail: attendeeEmail.trim().toLowerCase(),
          attendeePhone: attendeePhone.trim() || undefined,
          paymentMethod,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? t("common.unknownError"));
        setPageState("error");
        return;
      }
      setSaleResult(data as SaleResult);
      setPageState("success");
    } catch {
      setErrorMsg(t("common.unknownError"));
      setPageState("error");
    }
  }

  function handleReset() {
    setAttendeeName("");
    setAttendeeEmail("");
    setAttendeePhone("");
    setPaymentMethod(enabledPaymentMethods[0] ?? "gate_cash");
    setSaleResult(null);
    setErrorMsg("");
    setPageState("form");
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.container, { backgroundColor: C.background }]}>
        <View
          style={[
            styles.header,
            {
              paddingTop: isWeb ? 67 : insets.top + 16,
              backgroundColor: C.card,
              borderBottomColor: C.border,
            },
          ]}
        >
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Feather name="arrow-left" size={22} color={C.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: C.text }]}>
            {t("boxOffice.sellTicket")}
          </Text>
          <View style={{ width: 22 }} />
        </View>

        {pageState === "success" && saleResult ? (
          <ScrollView contentContainerStyle={styles.successContainer}>
            <View style={[styles.successCard, { backgroundColor: C.card, borderColor: C.border }]}>
              <View style={[styles.successIcon, { backgroundColor: "#16a34a22" }]}>
                <Feather name="check-circle" size={48} color="#16a34a" />
              </View>
              <Text style={[styles.successTitle, { color: C.text }]}>
                {t("boxOffice.saleSuccess")}
              </Text>
              <Text style={[styles.successSub, { color: C.textSecondary }]}>
                {saleResult.ticket.attendeeName} · {saleResult.ticket.ticketTypeName}
              </Text>
              {Number(saleResult.ticket.totalAmount) > 0 && (
                <Text style={[styles.successAmount, { color: C.text }]}>
                  ${Number(saleResult.ticket.totalAmount).toLocaleString("es-CO")} COP
                </Text>
              )}

              <View style={[styles.qrWrapper, { backgroundColor: "#fff", borderRadius: 16, padding: 16, marginTop: 20 }]}>
                <QRCode value={saleResult.ticket.qrCodeToken} size={200} />
              </View>
              <Text style={[styles.qrHint, { color: C.textSecondary }]}>
                {t("boxOffice.qrHint")}
              </Text>
            </View>

            <Pressable
              style={[styles.newSaleBtn, { backgroundColor: C.primary }]}
              onPress={handleReset}
            >
              <Text style={[styles.newSaleBtnText, { color: C.primaryText }]}>
                {t("boxOffice.newSale")}
              </Text>
            </Pressable>
          </ScrollView>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.formContainer}
            keyboardShouldPersistTaps="handled"
          >
            {loadingTypes ? (
              <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} />
            ) : ticketTypes.length === 0 ? (
              <View style={styles.emptyState}>
                <Feather name="alert-circle" size={40} color={C.textMuted} />
                <Text style={[styles.emptyText, { color: C.textSecondary }]}>
                  {t("boxOffice.noTicketTypes")}
                </Text>
              </View>
            ) : (
              <>
                <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>
                  {t("boxOffice.ticketType")}
                </Text>
                <View style={[styles.typeSelector, { backgroundColor: C.card, borderColor: C.border }]}>
                  {ticketTypes.map((tt) => {
                    const isSelected = tt.id === selectedTypeId;
                    const isSoldOut = tt.quantity - tt.soldCount <= 0;
                    return (
                      <Pressable
                        key={tt.id}
                        style={[
                          styles.typeOption,
                          isSelected && { backgroundColor: C.primaryLight },
                          isSoldOut && { opacity: 0.4 },
                        ]}
                        onPress={() => !isSoldOut && setSelectedTypeId(tt.id)}
                        disabled={isSoldOut}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.typeName, { color: isSelected ? C.primary : C.text }]}>
                            {tt.name}
                          </Text>
                          <Text style={[styles.typeDetail, { color: C.textSecondary }]}>
                            {isSoldOut
                              ? t("boxOffice.soldOut")
                              : `$${Number(tt.price).toLocaleString("es-CO")} · ${tt.quantity - tt.soldCount} ${t("boxOffice.available")}`}
                          </Text>
                        </View>
                        {isSelected && <Feather name="check" size={18} color={C.primary} />}
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>
                  {t("boxOffice.attendeeData")}
                </Text>

                <View style={[styles.inputGroup, { backgroundColor: C.card, borderColor: C.border }]}>
                  <View style={styles.inputRow}>
                    <Feather name="user" size={16} color={C.textMuted} style={styles.inputIcon} />
                    <TextInput
                      style={[styles.input, { color: C.text }]}
                      placeholder={t("boxOffice.attendeeName")}
                      placeholderTextColor={C.textMuted}
                      value={attendeeName}
                      onChangeText={setAttendeeName}
                      autoCapitalize="words"
                      returnKeyType="next"
                    />
                  </View>
                  <View style={[styles.inputDivider, { backgroundColor: C.border }]} />
                  <View style={styles.inputRow}>
                    <Feather name="mail" size={16} color={C.textMuted} style={styles.inputIcon} />
                    <TextInput
                      style={[styles.input, { color: C.text }]}
                      placeholder={t("boxOffice.attendeeEmail")}
                      placeholderTextColor={C.textMuted}
                      value={attendeeEmail}
                      onChangeText={setAttendeeEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      returnKeyType="next"
                    />
                  </View>
                  <View style={[styles.inputDivider, { backgroundColor: C.border }]} />
                  <View style={styles.inputRow}>
                    <Feather name="phone" size={16} color={C.textMuted} style={styles.inputIcon} />
                    <TextInput
                      style={[styles.input, { color: C.text }]}
                      placeholder={t("boxOffice.attendeePhone")}
                      placeholderTextColor={C.textMuted}
                      value={attendeePhone}
                      onChangeText={setAttendeePhone}
                      keyboardType="phone-pad"
                      returnKeyType="done"
                    />
                  </View>
                </View>

                <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>
                  {t("boxOffice.paymentMethod")}
                </Text>
                <View style={[styles.typeSelector, { backgroundColor: C.card, borderColor: C.border }]}>
                  {ALL_BOX_OFFICE_METHODS.filter((m) => enabledPaymentMethods.includes(m.value)).map((m) => (
                    <Pressable
                      key={m.value}
                      style={[
                        styles.typeOption,
                        paymentMethod === m.value && { backgroundColor: C.primaryLight },
                      ]}
                      onPress={() => setPaymentMethod(m.value)}
                    >
                      <Feather
                        name={m.icon as React.ComponentProps<typeof Feather>["name"]}
                        size={18}
                        color={paymentMethod === m.value ? C.primary : C.textMuted}
                        style={{ marginRight: 10 }}
                      />
                      <Text style={[styles.typeName, { color: paymentMethod === m.value ? C.primary : C.text }]}>
                        {t(m.labelKey)}
                      </Text>
                      {paymentMethod === m.value && <Feather name="check" size={18} color={C.primary} style={{ marginLeft: "auto" }} />}
                    </Pressable>
                  ))}
                </View>

                {pageState === "error" && (
                  <View style={[styles.errorBox, { backgroundColor: "#fee2e2", borderColor: "#fca5a5" }]}>
                    <Feather name="alert-circle" size={16} color="#dc2626" />
                    <Text style={[styles.errorText, { color: "#dc2626" }]}>{errorMsg}</Text>
                  </View>
                )}

                <Pressable
                  style={[
                    styles.sellBtn,
                    { backgroundColor: isValid ? "#16a34a" : C.border },
                  ]}
                  onPress={handleSell}
                  disabled={!isValid || pageState === "loading"}
                >
                  {pageState === "loading" ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Feather name="shopping-bag" size={20} color="#fff" />
                      <Text style={styles.sellBtnText}>{t("boxOffice.confirmSale")}</Text>
                    </>
                  )}
                </Pressable>
              </>
            )}
          </ScrollView>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  formContainer: { padding: 20, gap: 12, paddingBottom: 40 },
  sectionLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 8,
    marginBottom: 4,
  },
  typeSelector: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  typeOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 10,
  },
  typeName: { fontSize: 15, fontFamily: "Inter_600SemiBold", flex: 1 },
  typeDetail: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  inputGroup: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    height: 50,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  inputDivider: { height: 1 },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  errorText: { fontSize: 13, fontFamily: "Inter_500Medium", flex: 1 },
  sellBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 14,
    padding: 16,
    marginTop: 8,
  },
  sellBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  successContainer: { padding: 24, alignItems: "center", gap: 16 },
  successCard: {
    width: "100%",
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    gap: 8,
  },
  successIcon: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  successTitle: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  successSub: { fontSize: 14, fontFamily: "Inter_500Medium", textAlign: "center" },
  successAmount: { fontSize: 20, fontFamily: "Inter_700Bold", marginTop: 4 },
  qrWrapper: { alignItems: "center", justifyContent: "center" },
  qrHint: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 8 },
  newSaleBtn: {
    width: "100%",
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
  },
  newSaleBtnText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  emptyState: { alignItems: "center", gap: 12, marginTop: 60 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
});
