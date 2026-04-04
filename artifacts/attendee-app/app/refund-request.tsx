import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { useAlert } from "@/components/CustomAlert";
import { CopAmount } from "@/components/CopAmount";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useSubmitRefundRequest } from "@/hooks/useAttendeeApi";

type RefundMethod = "cash" | "nequi" | "bancolombia" | "other";

const REFUND_METHODS: {
  value: RefundMethod;
  icon: React.ComponentProps<typeof Feather>["name"];
  labelKey: string;
  needsAccount: boolean;
}[] = [
  { value: "cash", icon: "dollar-sign", labelKey: "refund.methodCash", needsAccount: false },
  { value: "nequi", icon: "smartphone", labelKey: "refund.methodNequi", needsAccount: true },
  { value: "bancolombia", icon: "home", labelKey: "refund.methodBancolombia", needsAccount: true },
  { value: "other", icon: "more-horizontal", labelKey: "refund.methodOther", needsAccount: false },
];

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

  const [refundMethod, setRefundMethod] = useState<RefundMethod>("cash");
  const [accountDetails, setAccountDetails] = useState("");
  const [notes, setNotes] = useState("");
  const [step, setStep] = useState<"form" | "success">("form");

  const submitRequest = useSubmitRefundRequest();
  const selectedMethod = REFUND_METHODS.find((m) => m.value === refundMethod);

  const handleSubmit = () => {
    showAlert(
      t("refund.confirmTitle"),
      t("refund.confirmMessage"),
      [
        { text: t("common.cancel"), variant: "cancel" },
        {
          text: t("common.confirm"),
          onPress: async () => {
            try {
              await submitRequest.mutateAsync({
                braceletUid: uid,
                refundMethod,
                accountDetails: accountDetails.trim() || undefined,
                notes: notes.trim() || undefined,
              });
              setStep("success");
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : "";
              if (msg === "REFUND_REQUEST_ALREADY_PENDING") {
                showAlert(t("refund.alreadyPendingTitle"), t("refund.alreadyPendingMessage"));
              } else {
                showAlert(t("common.error"), msg || t("common.unknownError"));
              }
            }
          },
        },
      ]
    );
  };

  if (step === "success") {
    return (
      <View style={[styles.center, { backgroundColor: C.background }]}>
        <View style={[styles.iconBox, { backgroundColor: C.successLight }]}>
          <Feather name="check-circle" size={52} color={C.success} />
        </View>
        <Text style={[styles.successTitle, { color: C.text }]}>{t("refund.successTitle")}</Text>
        <Text style={[styles.successSubtitle, { color: C.textSecondary }]}>
          {t("refund.successMessage")}
        </Text>
        <Button title={t("common.back")} onPress={() => router.back()} variant="primary" size="lg" fullWidth />
      </View>
    );
  }

  const inputStyle = [
    styles.textInput,
    { backgroundColor: C.inputBg, color: C.text, borderColor: C.border },
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

      {selectedMethod?.needsAccount && (
        <TextInput
          style={inputStyle}
          placeholder={t("refund.accountPlaceholder")}
          placeholderTextColor={C.textMuted}
          value={accountDetails}
          onChangeText={setAccountDetails}
          keyboardType="phone-pad"
        />
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
});
