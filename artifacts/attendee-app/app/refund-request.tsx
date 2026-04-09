import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { useAlert } from "@/components/CustomAlert";
import { CopAmount } from "@/components/CopAmount";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useSubmitRefundRequest, useMyBracelets } from "@/hooks/useAttendeeApi";
import { PhoneInput, COUNTRY_CODES, type CountryCode } from "@/components/PhoneInput";
import { extractErrorMessage } from "@/utils/errorMessage";

type RefundMethod = "nequi" | "bank_transfer";

const REFUND_METHODS: {
  value: RefundMethod;
  icon: React.ComponentProps<typeof Feather>["name"];
  labelKey: string;
  needsAccount: boolean;
}[] = [
  { value: "nequi", icon: "smartphone", labelKey: "refund.methodNequi", needsAccount: true },
  { value: "bank_transfer", icon: "credit-card", labelKey: "refund.methodBankTransfer", needsAccount: true },
];

const COLOMBIAN_BANKS = [
  "BANCO DE BOGOTÁ",
  "BANCO POPULAR",
  "BANCO ITAÚ",
  "BANCOLOMBIA",
  "CITIBANK",
  "BANCO GNB SUDAMERIS",
  "BANCO BBVA COLOMBIA S.A.",
  "SCOTIABANK COLPATRIA",
  "BANCO DE OCCIDENTE",
  "BANCO CAJA SOCIAL",
  "BANCO AGRARIO",
  "BANCO MUNDO MUJER S.A.",
  "BANCO DAVIVIENDA",
  "BANCO AV VILLAS",
  "BANCO PROCREDIT",
  "BANCAMIA S.A.",
  "BANCO PICHINCHA S.A.",
  "BANCOOMEVA S.A.",
  "BANCO FALABELLA",
  "BANCO FINANDINA S.A. BIC",
  "BANCO SANTANDER COLOMBIA",
  "BANCO COOPERATIVO COOPCENTRAL",
  "BANCO SERFINANZA",
  "LULO BANK",
  "JP MORGAN",
  "DALE",
  "RAPPIPAY DAVIPLATA",
  "CFA COOPERATIVA FINANCIERA",
  "JFK COOPERATIVA FINANCIERA",
  "COTRAFA",
  "COOFINEP COOPERATIVA FINANCIERA",
  "CONFIAR COOPERATIVA FINANCIERA",
  "BANCO UNIÓN",
  "COLTEFINANCIERA",
  "NEQUI",
  "DAVIPLATA",
  "BANCO CREDIFINANCIERA",
  "IRIS",
  "MOVII S.A.",
  "UALÁ",
  "NU COLOMBIA COMPAÑÍA DE FINANCIAMIENTO S.A.",
  "RAPPIPAY",
  "ALIANZA FIDUCIARIA",
  "CREZCAMOS S.A. COMPAÑÍA DE FINANCIAMIENTO",
];

const DOCUMENT_TYPES = [
  "Cédula de ciudadanía",
  "NIT",
  "Pasaporte",
  "Cédula de extranjería",
  "Tarjeta de identidad",
  "Registro civil",
  "Documento venezolano",
  "Carnet diplomático",
];

interface PickerModalProps {
  visible: boolean;
  title: string;
  options: string[];
  selected: string;
  onSelect: (value: string) => void;
  onClose: () => void;
  C: typeof Colors.dark;
}

function PickerModal({ visible, title, options, selected, onSelect, onClose, C }: PickerModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <View style={[styles.modalSheet, { backgroundColor: C.card }]} onStartShouldSetResponder={() => true}>
          <View style={[styles.modalHandle, { backgroundColor: C.border }]} />
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: C.text }]}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Feather name="x" size={22} color={C.textSecondary} />
            </Pressable>
          </View>
          <ScrollView
            style={styles.modalList}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            bounces={false}
          >
            {options.map((opt) => {
              const isSelected = opt === selected;
              return (
                <TouchableOpacity
                  key={opt}
                  style={[
                    styles.modalOption,
                    { borderBottomColor: C.border },
                    isSelected && { backgroundColor: C.primaryLight },
                  ]}
                  onPress={() => {
                    onSelect(opt);
                    onClose();
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.modalOptionText, { color: isSelected ? C.primary : C.text }]}>
                    {opt}
                  </Text>
                  {isSelected && <Feather name="check" size={16} color={C.primary} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}

export default function RefundRequestScreen() {
  const { t } = useTranslation();
  const { show: showAlert } = useAlert();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const params = useLocalSearchParams<{ uid: string; balance: string }>();
  const uid = params.uid ?? "";
  const balance = parseInt(params.balance ?? "0", 10);

  const { data: braceletsData } = useMyBracelets();
  const braceletInfo = (braceletsData as { bracelets?: { uid: string; pendingRefund?: boolean }[] } | undefined)
    ?.bracelets?.find((b) => b.uid === uid);
  const hasPendingRefund = braceletInfo?.pendingRefund ?? false;

  const [refundMethod, setRefundMethod] = useState<RefundMethod>("nequi");
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>(COUNTRY_CODES[0]);
  const [accountDetails, setAccountDetails] = useState("");
  const [notes, setNotes] = useState("");
  const [step, setStep] = useState<"form" | "success">("form");

  const [bankName, setBankName] = useState("");
  const [accountType, setAccountType] = useState<"Ahorros" | "Corriente">("Ahorros");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [docType, setDocType] = useState("");
  const [docNumber, setDocNumber] = useState("");
  const [showBankPicker, setShowBankPicker] = useState(false);
  const [showDocTypePicker, setShowDocTypePicker] = useState(false);

  const submitRequest = useSubmitRefundRequest();
  const selectedMethod = REFUND_METHODS.find((m) => m.value === refundMethod);

  const buildBankAccountDetails = () => {
    return [
      `Banco: ${bankName}`,
      `Tipo de cuenta: ${accountType}`,
      `Número de cuenta: ${bankAccountNumber}`,
      `Titular: ${accountHolder}`,
      `Tipo documento: ${docType}`,
      `Número documento: ${docNumber}`,
    ].join(" | ");
  };

  const isBankTransferValid = () => {
    if (refundMethod !== "bank_transfer") return true;
    return (
      bankName.trim() !== "" &&
      bankAccountNumber.trim() !== "" &&
      accountHolder.trim() !== "" &&
      docType.trim() !== "" &&
      docNumber.trim() !== ""
    );
  };

  const handleSubmit = () => {
    if (!isBankTransferValid()) {
      showAlert(t("common.error"), t("refund.bankTransferIncomplete"));
      return;
    }

    showAlert(
      t("refund.confirmTitle"),
      t("refund.confirmMessage"),
      [
        { text: t("common.cancel"), variant: "cancel" },
        {
          text: t("common.confirm"),
          onPress: async () => {
            try {
              const details =
                refundMethod === "nequi" && accountDetails.trim()
                  ? `${phoneCountry.code}${accountDetails.trim()}`
                  : refundMethod === "bank_transfer"
                  ? buildBankAccountDetails()
                  : accountDetails.trim() || undefined;

              await submitRequest.mutateAsync({
                braceletUid: uid,
                refundMethod,
                accountDetails: details,
                notes: notes.trim() || undefined,
              });
              setStep("success");
            } catch (e: unknown) {
              const msg = extractErrorMessage(e, "");
              if (msg === "REFUND_REQUEST_ALREADY_PENDING") {
                showAlert(t("refund.alreadyPendingTitle"), t("refund.alreadyPendingMessage"));
              } else if (msg === "REFUND_DEADLINE_PASSED") {
                showAlert(t("refund.deadlinePassedTitle"), t("refund.deadlinePassedMessage"));
              } else {
                showAlert(t("common.error"), msg || t("common.unknownError"));
              }
            }
          },
        },
      ]
    );
  };

  if (step === "success" || hasPendingRefund) {
    return (
      <View style={[styles.center, { backgroundColor: C.background }]}>
        <View style={[styles.iconBox, { backgroundColor: hasPendingRefund ? "rgba(234,179,8,0.15)" : C.successLight }]}>
          <Feather name={hasPendingRefund ? "clock" : "check-circle"} size={52} color={hasPendingRefund ? "#eab308" : C.success} />
        </View>
        <Text style={[styles.successTitle, { color: C.text }]}>
          {hasPendingRefund ? t("refund.alreadyPendingTitle") : t("refund.successTitle")}
        </Text>
        <Text style={[styles.successSubtitle, { color: C.textSecondary }]}>
          {hasPendingRefund ? t("refund.alreadyPendingMessage") : t("refund.successMessage")}
        </Text>
        <Button title={t("common.back")} onPress={() => router.back()} variant="primary" size="lg" fullWidth />
      </View>
    );
  }

  const inputStyle = [
    styles.textInput,
    { backgroundColor: C.inputBg, color: C.text, borderColor: C.border },
  ];

  const selectorStyle = (hasValue: boolean) => [
    styles.selector,
    {
      backgroundColor: C.inputBg,
      borderColor: hasValue ? C.border : C.border,
    },
  ];

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
        <Text style={[styles.pageTitle, { color: C.text }]}>{t("refund.title")}</Text>
        <View style={{ width: 24 }} />
      </View>

      <Card>
        <View style={styles.braceletRow}>
          <View style={[styles.nfcIcon, { backgroundColor: C.primaryLight }]}>
            <Feather name="wifi" size={18} color={C.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.uidLabel, { color: C.textMuted }]}>{t("common.bracelet")}</Text>
            <Text style={[styles.uid, { color: C.text }]}>{uid}</Text>
          </View>
          <CopAmount amount={balance} size={18} positive />
        </View>
      </Card>

      <Card>
        <View style={styles.amountRow}>
          <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>{t("refund.amount")}</Text>
          <CopAmount amount={balance} size={24} positive />
        </View>
      </Card>

      <View>
        <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>{t("refund.method")}</Text>
        <View style={styles.methodGrid}>
          {REFUND_METHODS.map((m) => {
            const isSelected = refundMethod === m.value;
            return (
              <Pressable
                key={m.value}
                onPress={() => setRefundMethod(m.value)}
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
                  {t(m.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {refundMethod === "nequi" && (
        <PhoneInput
          number={accountDetails}
          onNumberChange={setAccountDetails}
          country={phoneCountry}
          onCountryChange={setPhoneCountry}
          placeholder={t("refund.accountPlaceholder")}
        />
      )}

      {refundMethod === "bank_transfer" && (
        <View style={{ gap: 12 }}>
          <Pressable style={selectorStyle(!!bankName)} onPress={() => setShowBankPicker(true)}>
            <Text style={[styles.selectorText, { color: bankName ? C.text : C.textMuted }]}>
              {bankName || t("refund.bankPlaceholder")}
            </Text>
            <Feather name="chevron-down" size={18} color={C.textMuted} />
          </Pressable>

          <View style={styles.accountTypeRow}>
            {(["Ahorros", "Corriente"] as const).map((type) => (
              <Pressable
                key={type}
                onPress={() => setAccountType(type)}
                style={[
                  styles.accountTypeBtn,
                  {
                    backgroundColor: accountType === type ? C.primaryLight : C.inputBg,
                    borderColor: accountType === type ? C.primary : C.border,
                    flex: 1,
                  },
                ]}
              >
                <Text style={[styles.accountTypeText, { color: accountType === type ? C.primary : C.textSecondary }]}>
                  {type}
                </Text>
              </Pressable>
            ))}
          </View>

          <TextInput
            style={inputStyle}
            placeholder={t("refund.accountNumberPlaceholder")}
            placeholderTextColor={C.textMuted}
            value={bankAccountNumber}
            onChangeText={setBankAccountNumber}
            keyboardType="numeric"
          />

          <TextInput
            style={inputStyle}
            placeholder={t("refund.accountHolderPlaceholder")}
            placeholderTextColor={C.textMuted}
            value={accountHolder}
            onChangeText={setAccountHolder}
            autoCapitalize="words"
          />

          <Pressable style={selectorStyle(!!docType)} onPress={() => setShowDocTypePicker(true)}>
            <Text style={[styles.selectorText, { color: docType ? C.text : C.textMuted }]}>
              {docType || t("refund.docTypePlaceholder")}
            </Text>
            <Feather name="chevron-down" size={18} color={C.textMuted} />
          </Pressable>

          <TextInput
            style={inputStyle}
            placeholder={t("refund.docNumberPlaceholder")}
            placeholderTextColor={C.textMuted}
            value={docNumber}
            onChangeText={setDocNumber}
            keyboardType="numeric"
          />
        </View>
      )}

      <TextInput
        style={[inputStyle, { minHeight: 80 }]}
        placeholder={t("refund.notesPlaceholder")}
        placeholderTextColor={C.textMuted}
        value={notes}
        onChangeText={setNotes}
        multiline
        numberOfLines={3}
      />

      <Card>
        <View style={styles.infoRow}>
          <Feather name="info" size={14} color={C.primary} />
          <Text style={[styles.infoText, { color: C.textSecondary }]}>
            {t("refund.pendingInfo")}
          </Text>
        </View>
      </Card>

      <Button
        title={t("refund.submit")}
        onPress={handleSubmit}
        variant="primary"
        size="lg"
        fullWidth
        loading={submitRequest.isPending}
        testID="submit-refund-request-btn"
      />

      <PickerModal
        visible={showBankPicker}
        title={t("refund.bankPickerTitle")}
        options={COLOMBIAN_BANKS}
        selected={bankName}
        onSelect={setBankName}
        onClose={() => setShowBankPicker(false)}
        C={C}
      />

      <PickerModal
        visible={showDocTypePicker}
        title={t("refund.docTypePickerTitle")}
        options={DOCUMENT_TYPES}
        selected={docType}
        onSelect={setDocType}
        onClose={() => setShowDocTypePicker(false)}
        C={C}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 20, paddingHorizontal: 28 },
  iconBox: { width: 100, height: 100, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  successTitle: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  successSubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pageTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  braceletRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  nfcIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  uidLabel: { fontSize: 11, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.5 },
  uid: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginTop: 2 },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  amountRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  methodGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  methodBtn: { borderWidth: 1.5, borderRadius: 12, padding: 14, alignItems: "center", gap: 6, width: "47%" },
  methodLabel: { fontSize: 12, fontFamily: "Inter_500Medium", textAlign: "center" },
  textInput: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 15, fontFamily: "Inter_400Regular" },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  infoText: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  selector: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectorText: { fontSize: 15, fontFamily: "Inter_400Regular", flex: 1 },
  accountTypeRow: { flexDirection: "row", gap: 10 },
  accountTypeBtn: { borderWidth: 1.5, borderRadius: 12, padding: 12, alignItems: "center" },
  accountTypeText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: "60%",
    paddingBottom: 24,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 8,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  modalTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  modalList: { flex: 1 },
  modalOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalOptionText: { fontSize: 15, fontFamily: "Inter_400Regular", flex: 1 },
});
