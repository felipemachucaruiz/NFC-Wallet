import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useCreateRefund, useGetSigningKey } from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { useAlert } from "@/components/CustomAlert";
import { CopAmount } from "@/components/CopAmount";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { isNfcSupported, writeBracelet, type TagInfo, type TagType } from "@/utils/nfc";
import { computeHmac } from "@/utils/hmac";
import { formatCurrency } from "@/utils/format";
import { useEventContext } from "@/contexts/EventContext";

type RefundMethod = "cash" | "nequi" | "bancolombia" | "other";

const REFUND_METHODS: {
  value: RefundMethod;
  icon: React.ComponentProps<typeof Feather>["name"];
  labelKey: string;
}[] = [
  { value: "cash", icon: "dollar-sign", labelKey: "bank.refundMethodCash" },
  { value: "nequi", icon: "smartphone", labelKey: "bank.refundMethodNequi" },
  { value: "bancolombia", icon: "home", labelKey: "bank.refundMethodBancolombia" },
  { value: "other", icon: "more-horizontal", labelKey: "bank.refundMethodOther" },
];

export default function RefundScreen() {
  const { t } = useTranslation();
  const { show: showAlert } = useAlert();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { currencyCode } = useEventContext();
  const fmt = (n: number) => formatCurrency(n, currencyCode);

  const params = useLocalSearchParams<{
    uid: string;
    balance: string;
    counter: string;
    hmac: string;
    tagType?: string;
    tagLabel?: string;
    tagMemoryBytes?: string;
    attendeeName?: string;
    phone?: string;
    email?: string;
  }>();

  const uid = params.uid ?? "";
  const balance = parseInt(params.balance ?? "0", 10);
  const counter = parseInt(params.counter ?? "0", 10);
  const attendeeName = params.attendeeName ?? "";
  const phone = params.phone ?? "";
  const email = params.email ?? "";

  const tagInfoFromParams: TagInfo | null =
    params.tagType
      ? {
          type: params.tagType as TagType,
          label: params.tagLabel ?? params.tagType,
          memoryBytes: parseInt(params.tagMemoryBytes ?? "0", 10),
        }
      : null;

  const [refundMethod, setRefundMethod] = useState<RefundMethod>("cash");
  const [notes, setNotes] = useState("");
  const [step, setStep] = useState<"form" | "writing" | "success">("form");
  const [refundedAmount, setRefundedAmount] = useState(0);

  const { data: keyData } = useGetSigningKey();
  const hmacSecret = (keyData as unknown as { hmacSecret: string } | undefined)?.hmacSecret ?? "";
  const ultralightCDesKey = (keyData as unknown as { ultralightCDesKey?: string } | undefined)?.ultralightCDesKey ?? "";
  const createRefund = useCreateRefund();

  const handleConfirm = async () => {
    showAlert(
      t("bank.confirmRefund"),
      `${t("bank.refundAmount")}: ${fmt(balance)}`,
      [
        { text: t("common.cancel"), variant: "cancel" },
        {
          text: t("common.confirm"),
          variant: "danger",
          onPress: async () => {
            setStep("writing");
            try {
              let nfcCounter: number | undefined;
              const newCounter = counter + 1;

              if (isNfcSupported()) {
                const newHmac = await computeHmac(0, newCounter, hmacSecret);
                await writeBracelet(
                  { uid, balance: 0, counter: newCounter, hmac: newHmac },
                  tagInfoFromParams ?? undefined,
                  ultralightCDesKey ? { ultralightCKeyHex: ultralightCDesKey } : undefined
                );
                nfcCounter = newCounter;
              }

              const result = await createRefund.mutateAsync({
                data: {
                  braceletUid: uid,
                  refundMethod,
                  notes: notes.trim() || undefined,
                  ...(nfcCounter !== undefined ? { newCounter: nfcCounter, newBalance: 0 } : {}),
                },
              });

              setRefundedAmount((result as { amount?: number }).amount ?? balance);
              setStep("success");
            } catch {
              setStep("form");
              showAlert(t("common.error"), t("bank.refundError"));
            }
          },
        },
      ],
    );
  };

  if (step === "writing") {
    return (
      <View style={[styles.center, { backgroundColor: C.background }]}>
        <View style={[styles.iconBox, { backgroundColor: C.primaryLight }]}>
          <Feather name="wifi" size={40} color={C.primary} />
        </View>
        <Text style={[styles.writingTitle, { color: C.text }]}>
          {isNfcSupported() ? t("bank.writingZero") : t("common.processing")}
        </Text>
      </View>
    );
  }

  if (step === "success") {
    return (
      <View style={[styles.center, { backgroundColor: C.background }]}>
        <View style={[styles.iconBox, { backgroundColor: C.successLight }]}>
          <Feather name="check-circle" size={52} color={C.success} />
        </View>
        <Text style={[styles.successTitle, { color: C.text }]}>{t("bank.refundSuccess")}</Text>
        <View style={[styles.summaryBox, { backgroundColor: C.card, borderColor: C.border }]}>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: C.textSecondary }]}>{t("bank.refundedAmount")}</Text>
            <CopAmount amount={refundedAmount} positive />
          </View>
          <View style={[styles.divider, { backgroundColor: C.separator }]} />
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: C.textSecondary }]}>{t("bank.newBalance")}</Text>
            <CopAmount amount={0} />
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
        <Text style={[styles.pageTitle, { color: C.text }]}>{t("bank.refundTitle")}</Text>
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
          </View>
          <CopAmount amount={balance} size={18} color={C.textSecondary} bold={false} />
        </View>
      </Card>

      {(attendeeName || phone || email) ? (
        <Card>
          <View style={styles.contactSection}>
            <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>{t("bank.contactInfo")}</Text>
            {!!attendeeName && (
              <View style={styles.contactRow}>
                <Feather name="user" size={14} color={C.textMuted} />
                <Text style={[styles.contactText, { color: C.text }]}>{attendeeName}</Text>
              </View>
            )}
            {!!phone && (
              <View style={styles.contactRow}>
                <Feather name="phone" size={14} color={C.textMuted} />
                <Text style={[styles.contactText, { color: C.text }]}>{phone}</Text>
              </View>
            )}
            {!!email && (
              <View style={styles.contactRow}>
                <Feather name="mail" size={14} color={C.textMuted} />
                <Text style={[styles.contactText, { color: C.text }]}>{email}</Text>
              </View>
            )}
          </View>
        </Card>
      ) : (
        <Card>
          <View style={styles.contactRow}>
            <Feather name="info" size={14} color={C.textMuted} />
            <Text style={[styles.contactText, { color: C.textMuted }]}>{t("bank.noContactInfo")}</Text>
          </View>
        </Card>
      )}

      <Card>
        <View style={styles.refundAmountRow}>
          <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>{t("bank.refundAmount")}</Text>
          <CopAmount amount={balance} size={24} positive />
        </View>
      </Card>

      <View>
        <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>{t("bank.refundMethod")}</Text>
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

      <TextInput
        style={[styles.notesInput, { backgroundColor: C.inputBg, color: C.text, borderColor: C.border }]}
        placeholder={t("bank.refundNotes")}
        placeholderTextColor={C.textMuted}
        value={notes}
        onChangeText={setNotes}
        multiline
        numberOfLines={2}
      />

      <Button
        title={t("bank.confirmRefund")}
        onPress={handleConfirm}
        variant="danger"
        size="lg"
        fullWidth
        loading={createRefund.isPending}
        testID="confirm-refund-btn"
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 20, paddingHorizontal: 28 },
  iconBox: { width: 100, height: 100, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  writingTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  successTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  summaryBox: { width: "100%", borderWidth: 1, borderRadius: 16, padding: 20, gap: 16 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  summaryLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  divider: { height: 1 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  pageTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  braceletSummary: { flexDirection: "row", alignItems: "center", gap: 12 },
  nfcIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  uidLabel: { fontSize: 11, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.5 },
  uid: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginTop: 2 },
  sectionTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 },
  contactSection: { gap: 8 },
  contactRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  contactText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  refundAmountRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  methodGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  methodBtn: { borderWidth: 1.5, borderRadius: 12, padding: 14, alignItems: "center", gap: 6, width: "47%" },
  methodLabel: { fontSize: 12, fontFamily: "Inter_500Medium", textAlign: "center" },
  notesInput: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 15, fontFamily: "Inter_400Regular", minHeight: 56 },
});
