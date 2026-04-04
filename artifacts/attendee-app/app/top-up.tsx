import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
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
import { formatCOP } from "@/utils/format";
import { isNfcSupported, scanBraceletUID } from "@/utils/nfc";
import { useInitiateTopUp, useMyBracelets } from "@/hooks/useAttendeeApi";

type DigitalMethod = "nequi" | "pse";

const AMOUNTS = [10000, 20000, 50000, 100000, 200000];

const PSE_BANKS = [
  { code: "1040", name: "Banco Agrario" },
  { code: "1052", name: "Banco AV Villas" },
  { code: "1051", name: "Banco Davivienda" },
  { code: "1001", name: "Banco De Bogotá" },
  { code: "1007", name: "Bancolombia" },
  { code: "1013", name: "BBVA Colombia" },
  { code: "1009", name: "Citibank" },
  { code: "1006", name: "Banco Itaú" },
  { code: "1002", name: "Banco Popular" },
  { code: "1032", name: "Banco Caja Social" },
  { code: "1023", name: "Banco De Occidente" },
  { code: "1062", name: "Banco Falabella" },
  { code: "1012", name: "Banco GNB Sudameris" },
  { code: "1060", name: "Banco Pichincha" },
  { code: "1637", name: "Scotiabank Colpatria" },
];

function normalizeUid(raw: string): string {
  const clean = raw.replace(/[:\s\-]/g, "").toUpperCase();
  if (clean.length === 0) return "";
  return clean.match(/.{1,2}/g)?.join(":") ?? clean;
}

export default function TopUpScreen() {
  const { t } = useTranslation();
  const { show: showAlert } = useAlert();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const params = useLocalSearchParams<{ braceletUid?: string }>();
  const [braceletUid, setBraceletUid] = useState(params.braceletUid ?? "");

  const { data } = useMyBracelets();
  type Bracelet = { uid: string; balanceCop: number; flagged: boolean; event?: { name: string } | null };
  const bracelets = ((data as { bracelets?: Bracelet[] } | undefined)?.bracelets ?? []);

  const [nfcAvailable, setNfcAvailable] = useState(false);
  const [scanning, setScanning] = useState(false);

  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [method, setMethod] = useState<DigitalMethod>("nequi");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [selectedBank, setSelectedBank] = useState<{ code: string; name: string } | null>(null);
  const [showBankPicker, setShowBankPicker] = useState(false);

  const { mutate: initiatePayment, isPending } = useInitiateTopUp();

  useEffect(() => {
    isNfcSupported().then(setNfcAvailable);
  }, []);

  const handleNfcScan = async () => {
    if (scanning) return;
    setScanning(true);
    try {
      const uid = await scanBraceletUID();
      if (uid) setBraceletUid(uid);
    } finally {
      setScanning(false);
    }
  };

  const effectiveAmount = selectedAmount ?? (customAmount ? parseInt(customAmount.replace(/\D/g, ""), 10) : 0);

  const canSubmit =
    effectiveAmount >= 1000 &&
    braceletUid.length > 0 &&
    (method === "nequi"
      ? phoneNumber.replace(/\D/g, "").length === 10
      : selectedBank !== null);

  const handleSubmit = () => {
    if (!canSubmit) return;
    const body: Parameters<typeof initiatePayment>[0] = {
      braceletUid,
      amountCop: effectiveAmount,
      paymentMethod: method,
    };
    if (method === "nequi") body.phoneNumber = phoneNumber.replace(/\D/g, "");
    else body.bankCode = selectedBank!.code;

    initiatePayment(body, {
      onSuccess: (result) => {
        router.push({
          pathname: "/payment-status/[id]",
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
        <Text style={[styles.title, { color: C.text }]}>{t("topUp.title")}</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Card style={{ gap: 12 }}>
          <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>
            {t("topUp.selectBracelet").toUpperCase()}
          </Text>
          {bracelets.length > 0 ? (
            bracelets.map((b) => (
              <Pressable
                key={b.uid}
                onPress={() => setBraceletUid(b.uid)}
                style={[
                  styles.braceletOption,
                  {
                    backgroundColor: braceletUid === b.uid ? C.primaryLight : C.inputBg,
                    borderColor: braceletUid === b.uid ? C.primary : C.border,
                  },
                ]}
              >
                <Feather name="wifi" size={16} color={braceletUid === b.uid ? C.primary : C.textSecondary} />
                <Text style={[styles.braceletOptionText, { color: braceletUid === b.uid ? C.primary : C.text }]}>
                  {b.uid}
                </Text>
                {b.event && (
                  <Text style={[styles.braceletEventText, { color: C.textMuted }]}>
                    {b.event.name}
                  </Text>
                )}
              </Pressable>
            ))
          ) : (
            <Text style={[styles.hintText, { color: C.textMuted }]}>{t("topUp.noBracelet")}</Text>
          )}
          {nfcAvailable && (
            <Pressable
              onPress={handleNfcScan}
              disabled={scanning}
              style={[styles.nfcBtn, { borderColor: C.primary, backgroundColor: C.primaryLight }]}
            >
              <Feather name="wifi" size={16} color={C.primary} />
              <Text style={[styles.nfcBtnText, { color: C.primary }]}>
                {scanning ? t("home.scanning") : t("topUp.scanToSelect")}
              </Text>
            </Pressable>
          )}
          <View style={styles.manualRow}>
            <View style={[styles.manualInputWrap, { backgroundColor: C.inputBg, borderColor: braceletUid && !bracelets.find(b => b.uid === braceletUid) ? C.primary : C.border }]}>
              <Feather name="hash" size={15} color={C.textMuted} style={{ marginRight: 6 }} />
              <TextInput
                style={[styles.manualInput, { color: C.text }]}
                placeholder={t("topUp.uidPlaceholder")}
                placeholderTextColor={C.textMuted}
                value={braceletUid}
                onChangeText={(v) => setBraceletUid(normalizeUid(v))}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={11}
              />
              {braceletUid.length > 0 && (
                <Pressable onPress={() => setBraceletUid("")}>
                  <Feather name="x" size={16} color={C.textMuted} />
                </Pressable>
              )}
            </View>
          </View>
          <Text style={[styles.uidHint, { color: C.textMuted }]}>
            {t("topUp.uidHint")}
          </Text>
        </Card>

        <Card style={{ gap: 12 }}>
          <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>
            {t("topUp.amount").toUpperCase()}
          </Text>
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
          <Text style={[styles.orLabel, { color: C.textMuted }]}>{t("topUp.orCustom")}</Text>
          <TextInput
            style={inputStyle}
            placeholder={t("topUp.amountPlaceholder")}
            placeholderTextColor={C.textMuted}
            keyboardType="numeric"
            value={customAmount}
            onChangeText={(v) => { setCustomAmount(v); setSelectedAmount(null); }}
          />
          {effectiveAmount > 0 && (
            <Text style={[styles.amountPreview, { color: C.primary }]}>
              {t("topUp.total")}: {formatCOP(effectiveAmount)}
            </Text>
          )}
        </Card>

        <Card style={{ gap: 12 }}>
          <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>
            {t("topUp.method").toUpperCase()}
          </Text>
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
                  size={20}
                  color={method === m ? C.primary : C.textSecondary}
                />
                <Text style={[styles.methodLabel, { color: method === m ? C.primary : C.text }]}>
                  {m === "nequi" ? "Nequi" : "PSE"}
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
            <Text style={[styles.hintText, { color: C.textSecondary }]}>
              {t("topUp.nequiHint")}
            </Text>
            <TextInput
              style={inputStyle}
              placeholder={t("topUp.nequiPlaceholder")}
              placeholderTextColor={C.textMuted}
              keyboardType="phone-pad"
              maxLength={13}
              value={phoneNumber}
              onChangeText={setPhoneNumber}
            />
          </Card>
        )}

        {method === "pse" && (
          <Card style={{ gap: 10 }}>
            <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>
              {t("topUp.pseBank").toUpperCase()}
            </Text>
            <Text style={[styles.hintText, { color: C.textSecondary }]}>
              {t("topUp.pseInfo")}
            </Text>
            <Pressable
              onPress={() => setShowBankPicker(!showBankPicker)}
              style={[styles.bankSelector, { backgroundColor: C.inputBg, borderColor: C.border }]}
            >
              <Text style={{ color: selectedBank ? C.text : C.textMuted, flex: 1, fontFamily: "Inter_400Regular" }}>
                {selectedBank ? selectedBank.name : t("topUp.pseBankPlaceholder")}
              </Text>
              <Feather name={showBankPicker ? "chevron-up" : "chevron-down"} size={18} color={C.textSecondary} />
            </Pressable>
            {showBankPicker && (
              <View style={[styles.bankList, { backgroundColor: C.card, borderColor: C.border }]}>
                <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled>
                  {PSE_BANKS.map((bank) => (
                    <Pressable
                      key={bank.code}
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
            {method === "nequi" ? t("topUp.nequiInfo") : t("topUp.pseInfo")}
          </Text>
        </View>

        <Button
          title={isPending ? t("topUp.submitting") : `${t("topUp.submit")}${effectiveAmount > 0 ? ` ${formatCOP(effectiveAmount)}` : ""}`}
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
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 8 },
  backBtn: { padding: 4 },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  scroll: { padding: 20, gap: 16 },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8 },
  braceletOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
  },
  braceletOptionText: { fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 1 },
  braceletEventText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  nfcBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
  },
  nfcBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  manualRow: { marginTop: 4 },
  manualInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  manualInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
  },
  uidHint: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
    paddingHorizontal: 2,
  },
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
    gap: 8,
  },
  methodLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  hintText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  bankSelector: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  bankList: { borderWidth: 1, borderRadius: 12, overflow: "hidden" },
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
});
