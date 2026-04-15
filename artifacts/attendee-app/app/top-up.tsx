import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { SvgXml } from "react-native-svg";

const nequiXml = (bodyColor: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 38.15 30"><path fill="#ca0080" d="M8.38,3.86h-3.93c-.46,0-.83.37-.83.83v3.34c0,.46.37.83.83.83h3.93c.46,0,.83-.37.83-.83v-3.34c0-.46-.37-.83-.83-.83Z"/><path fill="${bodyColor}" d="M32.4,3.86h-3.39c-.46,0-.83.38-.83.83v13.55c0,.28-.36.38-.49.13l-7.88-14.15c-.13-.23-.36-.36-.64-.36h-5.64c-.46,0-.83.38-.83.83v21.65c0,.46.38.83.83.83h3.39c.46,0,.83-.38.83-.83v-13.96c0-.28.36-.38.49-.13l8.1,14.57c.13.23.36.36.64.36h5.39c.46,0,.83-.38.83-.83V4.68c0-.46-.38-.83-.83-.83h.03Z"/></svg>`;

const bancolombiaXml = (color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 110.54 110.83"><path fill="${color}" d="M82.66.03c-21.47,2.65-42.21,6.56-63,12.59-2.71.85-4.37,3.88-3.69,6.57,1.52,5.99,2.29,8.99,3.83,15,.65,2.54,3.21,3.84,5.8,2.98,21.24-6.54,42.53-11.01,64.51-14.27,2.52-.34,3.89-2.94,2.97-5.55-1.95-5.51-2.93-8.25-4.92-13.73-.86-2.32-3.15-3.85-5.5-3.59ZM100.62,33.37c-33.61,4.29-66.35,12.6-97.39,26.34-2.26,1.07-3.62,3.92-3.14,6.43,1.22,6.42,1.83,9.64,3.07,16.07.53,2.75,3.1,4.02,5.63,2.78,31.53-14.45,64.84-23.64,99.01-29.12,2.17-.36,3.28-2.85,2.45-5.41-1.72-5.32-2.59-7.98-4.37-13.27-.81-2.46-3.04-4.11-5.26-3.82ZM100.22,69.19c-20.99,4.56-41.51,10.05-61.83,17.03-2.58.95-4.03,3.66-3.35,6.17,1.62,5.96,2.42,8.95,4.06,14.93.77,2.81,3.93,4.25,6.83,3.14,20.31-7.28,40.83-13.63,61.79-18.73,2.01-.49,3-2.85,2.26-5.28-1.65-5.37-2.48-8.05-4.18-13.39-.83-2.63-3.27-4.35-5.58-3.87Z"/></svg>`;
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { useAlert } from "@/components/CustomAlert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatCOP } from "@/utils/format";
import { isNfcSupported, scanBraceletUID } from "@/utils/nfc";
import { PhoneInput, COUNTRY_CODES, type CountryCode } from "@/components/PhoneInput";
import { useInitiateTopUp, useMyBracelets, usePseBanks, useSavedCards, useSaveCard, type SavedCard } from "@/hooks/useAttendeeApi";
import { useTokenizeCard } from "@/hooks/useEventsApi";

type DigitalMethod = "nequi" | "pse" | "card" | "bancolombia_transfer";
type LegalIdType = "CC" | "CE" | "NIT" | "PP" | "TI";

type CardBrand = "visa" | "mastercard" | "amex" | null;

function detectCardBrand(raw: string): CardBrand {
  const n = raw.replace(/\D/g, "");
  if (/^4/.test(n)) return "visa";
  if (/^(5[1-5]|2[2-7]\d{2})/.test(n)) return "mastercard";
  if (/^3[47]/.test(n)) return "amex";
  return null;
}

function formatCardNumber(raw: string, brand: CardBrand): string {
  const digits = raw.replace(/\D/g, "");
  if (brand === "amex") {
    const p1 = digits.slice(0, 4);
    const p2 = digits.slice(4, 10);
    const p3 = digits.slice(10, 15);
    return [p1, p2, p3].filter(Boolean).join(" ");
  }
  return (digits.match(/.{1,4}/g) ?? []).join(" ").slice(0, 19);
}

function handleExpiryChange(value: string, prev: string): string {
  let v = value.replace(/[^\d/]/g, "");
  if (v.length === 2 && !v.includes("/") && prev.length === 1) v = v + "/";
  const parts = v.split("/");
  if (parts[1] && parts[1].length === 4) v = parts[0] + "/" + parts[1].slice(2);
  return v.slice(0, 5);
}

const CARD_LOGOS: Record<NonNullable<CardBrand>, ReturnType<typeof require>> = {
  visa: require("@/assets/images/card-visa.png"),
  mastercard: require("@/assets/images/card-mastercard.png"),
  amex: require("@/assets/images/card-amex.png"),
};

function CardBrandLogo({ brand }: { brand: CardBrand }) {
  if (!brand) return null;
  return (
    <Image
      source={CARD_LOGOS[brand]}
      style={{ width: 44, height: 28 }}
      resizeMode="contain"
    />
  );
}

const LEGAL_ID_TYPES: { code: LegalIdType; label: string }[] = [
  { code: "CC", label: "Cédula de Ciudadanía" },
  { code: "CE", label: "Cédula de Extranjería" },
  { code: "NIT", label: "NIT" },
  { code: "PP", label: "Pasaporte" },
  { code: "TI", label: "Tarjeta de Identidad" },
];

const AMOUNTS = [10000, 20000, 50000, 100000, 200000];

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
  type Bracelet = { uid: string; balance: number; flagged: boolean; pendingRefund?: boolean; refundStatus?: string | null; event?: { name: string } | null };
  const allBracelets = ((data as { bracelets?: Bracelet[] } | undefined)?.bracelets ?? []);
  const bracelets = allBracelets; // show all, but disable ones with pending refund
  const isSelectedFromList = braceletUid.length > 0 && allBracelets.some((b) => b.uid === braceletUid && !b.pendingRefund);

  const [nfcAvailable, setNfcAvailable] = useState(false);
  const [scanning, setScanning] = useState(false);

  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [method, setMethod] = useState<DigitalMethod>("nequi");
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>(COUNTRY_CODES[0]);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [selectedBank, setSelectedBank] = useState<{ code: string; name: string } | null>(null);
  const [showBankPicker, setShowBankPicker] = useState(false);
  const [legalIdType, setLegalIdType] = useState<LegalIdType>("CC");
  const [legalId, setLegalId] = useState("");
  const [showLegalIdTypePicker, setShowLegalIdTypePicker] = useState(false);

  const { data: pseBanksRaw, isPending: pseBanksLoading, isError: pseBanksError, refetch: refetchPseBanks } = usePseBanks();
  const pseBanks = (pseBanksRaw ?? []).map((b) => ({
    code: b.financial_institution_code,
    name: b.financial_institution_name,
  }));

  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [cardHolder, setCardHolder] = useState("");

  const { mutate: initiatePayment, isPending } = useInitiateTopUp();
  const { mutateAsync: tokenizeCard, isPending: isTokenizing } = useTokenizeCard();

  const { data: savedCardsData } = useSavedCards();
  const savedCards = savedCardsData?.cards ?? [];
  const { mutateAsync: saveCardMutation } = useSaveCard();

  const [selectedSavedCardId, setSelectedSavedCardId] = useState<string | null>(null);
  const [showNewCardForm, setShowNewCardForm] = useState(false);
  const [pendingCardSave, setPendingCardSave] = useState<{
    wompiToken: string; brand: string; lastFour: string; cardHolderName: string; expiryMonth: string; expiryYear: string;
  } | null>(null);
  const [saveAlias, setSaveAlias] = useState("");
  const [savingCard, setSavingCard] = useState(false);
  const [pendingRoute, setPendingRoute] = useState<{ pathname: string; params: Record<string, string> } | null>(null);

  useEffect(() => {
    setNfcAvailable(isNfcSupported());
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

  const usingNewCard = method === "card" && (savedCards.length === 0 || showNewCardForm || selectedSavedCardId === null);

  const canSubmit =
    effectiveAmount >= 1000 &&
    braceletUid.length > 0 &&
    (method === "nequi"
      ? phoneNumber.replace(/\D/g, "").length === 10
      : method === "pse"
      ? selectedBank !== null && legalId.trim().length >= 5
      : method === "card"
      ? (selectedSavedCardId !== null && !showNewCardForm) || (cardNumber.replace(/\s/g, "").length >= 15 && cardExpiry.length >= 5 && cardCvc.length >= (detectCardBrand(cardNumber) === "amex" ? 4 : 3) && cardHolder.trim().length > 0)
      : true);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const body: Parameters<typeof initiatePayment>[0] = {
      braceletUid,
      amount: effectiveAmount,
      paymentMethod: method,
    };

    let newCardData: typeof pendingCardSave = null;

    if (method === "nequi") {
      body.phoneNumber = phoneNumber.replace(/\D/g, "");
    } else if (method === "pse") {
      body.bankCode = selectedBank!.code;
      body.userLegalIdType = legalIdType;
      body.userLegalId = legalId.trim();
    } else if (method === "card") {
      if (selectedSavedCardId && !showNewCardForm) {
        body.savedCardId = selectedSavedCardId;
        body.installments = 1;
      } else {
        try {
          const [expMonth, expYear] = cardExpiry.split("/");
          const tokenResult = await tokenizeCard({
            number: cardNumber.replace(/\s/g, ""),
            cvc: cardCvc,
            expMonth: expMonth?.trim() ?? "",
            expYear: expYear?.trim() ?? "",
            cardHolder: cardHolder.trim(),
          });
          body.cardToken = tokenResult;
          body.installments = 1;
          const brand = detectCardBrand(cardNumber) ?? "card";
          newCardData = {
            wompiToken: tokenResult,
            brand: brand ?? "card",
            lastFour: cardNumber.replace(/\s/g, "").slice(-4),
            cardHolderName: cardHolder.trim(),
            expiryMonth: expMonth?.trim() ?? "",
            expiryYear: expYear?.trim() ?? "",
          };
        } catch (err) {
          const msg = (err as { message?: string }).message ?? t("common.unknownError");
          showAlert(t("common.error"), msg);
          return;
        }
      }
    }

    initiatePayment(body, {
      onSuccess: (result) => {
        const targetRoute = {
          pathname: "/payment-status/[id]" as const,
          params: {
            id: result.intentId,
            redirectUrl: result.redirectUrl ?? "",
            paymentMethod: method,
          },
        };
        if (newCardData) {
          setPendingCardSave(newCardData);
          setSaveAlias("");
          setPendingRoute(targetRoute);
        } else {
          router.push(targetRoute);
        }
      },
      onError: (err: unknown) => {
        const msg = (err as { message?: string }).message ?? t("common.unknownError");
        showAlert(t("common.error"), msg);
      },
    });
  };

  const handleSaveCard = async () => {
    if (pendingCardSave) {
      setSavingCard(true);
      try {
        await saveCardMutation({ ...pendingCardSave, alias: saveAlias.trim() || undefined });
      } catch {
      }
      setSavingCard(false);
    }
    setPendingCardSave(null);
    if (pendingRoute) {
      router.push(pendingRoute);
    }
  };

  const handleSkipSave = () => {
    setPendingCardSave(null);
    if (pendingRoute) {
      router.push(pendingRoute);
    }
  };

  if (pendingCardSave) {
    return (
      <View style={[{ flex: 1, backgroundColor: C.background, alignItems: "center", justifyContent: "center", padding: 24 }]}>
        <View style={[{ width: "100%", maxWidth: 360, backgroundColor: C.card, borderRadius: 20, padding: 24, gap: 16 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.primaryLight, alignItems: "center", justifyContent: "center" }}>
              <Feather name="star" size={20} color={C.primary} />
            </View>
            <View>
              <Text style={{ color: C.text, fontSize: 16, fontFamily: "Inter_700Bold" }}>Guardar tarjeta</Text>
              <Text style={{ color: C.textSecondary, fontSize: 12, fontFamily: "Inter_400Regular" }}>Para futuros pagos</Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.inputBg, borderRadius: 12, padding: 14 }}>
            <Feather name="credit-card" size={20} color={C.primary} />
            <Text style={{ color: C.text, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>
              {pendingCardSave.brand.toUpperCase()} •••• {pendingCardSave.lastFour}
            </Text>
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ color: C.textSecondary, fontSize: 13, fontFamily: "Inter_500Medium" }}>Alias (opcional)</Text>
            <TextInput
              value={saveAlias}
              onChangeText={setSaveAlias}
              placeholder="Ej: Mi Visa personal"
              placeholderTextColor={C.textMuted}
              maxLength={100}
              style={{ borderWidth: 1.5, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: "Inter_400Regular", color: C.text, backgroundColor: C.inputBg }}
            />
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={handleSkipSave}
              disabled={savingCard}
              style={{ flex: 1, backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border, paddingVertical: 14, borderRadius: 12, alignItems: "center" }}
            >
              <Text style={{ color: C.textSecondary, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>Omitir</Text>
            </Pressable>
            <Pressable
              onPress={handleSaveCard}
              disabled={savingCard}
              style={{ flex: 1, backgroundColor: C.primary, paddingVertical: 14, borderRadius: 12, alignItems: "center", opacity: savingCard ? 0.7 : 1 }}
            >
              {savingCard ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 }}>Guardar</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

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
            bracelets.map((b) => {
              const isRefunded = !!b.pendingRefund;
              const isSelected = braceletUid === b.uid && !isRefunded;
              return (
                <Pressable
                  key={b.uid}
                  onPress={() => { if (!isRefunded) setBraceletUid(b.uid); }}
                  disabled={isRefunded}
                  style={[
                    styles.braceletOption,
                    {
                      backgroundColor: isSelected ? C.primaryLight : isRefunded ? (C.inputBg + "80") : C.inputBg,
                      borderColor: isSelected ? C.primary : C.border,
                      opacity: isRefunded ? 0.55 : 1,
                    },
                  ]}
                >
                  <Feather name="wifi" size={16} color={isSelected ? C.primary : C.textSecondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.braceletOptionText, { color: isSelected ? C.primary : C.text }]}>
                      {b.event?.name ?? b.uid}
                    </Text>
                    {b.event && (
                      <Text style={[styles.braceletEventText, { color: C.textMuted }]}>
                        {b.uid}
                      </Text>
                    )}
                  </View>
                  {isRefunded && (
                    <View style={[styles.refundBadge, { backgroundColor: C.dangerLight ?? "#FEE2E2" }]}>
                      <Text style={[styles.refundBadgeText, { color: C.danger }]}>
                        {t("topUp.refundPending")}
                      </Text>
                    </View>
                  )}
                </Pressable>
              );
            })
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
          {!isSelectedFromList && (
            <>
              <View style={styles.manualRow}>
                <View style={[styles.manualInputWrap, { backgroundColor: C.inputBg, borderColor: braceletUid ? C.primary : C.border }]}>
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
            </>
          )}
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
                <Text style={[styles.amountChipText, { color: selectedAmount === amt ? "#0a0a0a" : C.text }]}>
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
          <View style={styles.methodGrid}>
            {([
              { id: "nequi", icon: "smartphone", label: "Nequi" },
              { id: "pse", icon: "globe", label: "PSE" },
              { id: "card", icon: "credit-card", label: t("tickets.creditCard") },
              { id: "bancolombia_transfer", icon: "repeat", label: "Bancolombia" },
            ] as { id: DigitalMethod; icon: string; label: string }[]).map((m) => (
              <Pressable
                key={m.id}
                onPress={() => { setMethod(m.id); setSelectedBank(null); setShowBankPicker(false); }}
                style={[
                  styles.methodBtn,
                  {
                    backgroundColor: method === m.id ? C.primaryLight : C.inputBg,
                    borderColor: method === m.id ? C.primary : C.border,
                  },
                ]}
              >
                {m.id === "nequi" ? (
                  <SvgXml
                    xml={nequiXml(method === m.id ? C.primary : C.textSecondary)}
                    width={20}
                    height={20}
                  />
                ) : m.id === "bancolombia_transfer" ? (
                  <SvgXml
                    xml={bancolombiaXml(method === m.id ? C.primary : C.textSecondary)}
                    width={20}
                    height={20}
                  />
                ) : (
                  <Feather
                    name={m.icon as never}
                    size={20}
                    color={method === m.id ? C.primary : C.textSecondary}
                  />
                )}
                <Text style={[styles.methodLabel, { color: method === m.id ? C.primary : C.text }]}>
                  {m.label}
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
            <PhoneInput
              number={phoneNumber}
              onNumberChange={setPhoneNumber}
              country={phoneCountry}
              onCountryChange={setPhoneCountry}
              placeholder={t("topUp.nequiPlaceholder")}
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
            {pseBanksError ? (
              <View style={[styles.bankErrorBox, { backgroundColor: C.dangerLight, borderColor: C.danger }]}>
                <Feather name="alert-circle" size={14} color={C.danger} />
                <Text style={[styles.bankErrorText, { color: C.danger }]}>{t("topUp.pseBanksError")}</Text>
                <Pressable onPress={() => refetchPseBanks()}>
                  <Text style={[styles.bankRetryText, { color: C.danger }]}>{t("common.retry")}</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <Pressable
                  onPress={() => { if (!pseBanksLoading) setShowBankPicker(!showBankPicker); }}
                  style={[styles.bankSelector, { backgroundColor: C.inputBg, borderColor: C.border }]}
                >
                  {pseBanksLoading ? (
                    <Text style={{ color: C.textMuted, flex: 1, fontFamily: "Inter_400Regular" }}>
                      {t("topUp.pseBanksLoading")}
                    </Text>
                  ) : (
                    <Text style={{ color: selectedBank ? C.text : C.textMuted, flex: 1, fontFamily: "Inter_400Regular" }}>
                      {selectedBank ? selectedBank.name : t("topUp.pseBankPlaceholder")}
                    </Text>
                  )}
                  <Feather
                    name={pseBanksLoading ? "loader" : showBankPicker ? "chevron-up" : "chevron-down"}
                    size={18}
                    color={C.textSecondary}
                  />
                </Pressable>
                {showBankPicker && pseBanks.length > 0 && (
                  <View style={[styles.bankList, { backgroundColor: C.card, borderColor: C.border }]}>
                    <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled>
                      {pseBanks.map((bank) => (
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
              </>
            )}

            <Text style={[styles.sectionLabel, { color: C.textSecondary, marginTop: 8 }]}>
              DOCUMENTO DE IDENTIDAD
            </Text>
            <Pressable
              onPress={() => setShowLegalIdTypePicker(!showLegalIdTypePicker)}
              style={[styles.bankSelector, { backgroundColor: C.inputBg, borderColor: C.border }]}
            >
              <Text style={{ color: C.text, flex: 1, fontFamily: "Inter_400Regular" }}>
                {LEGAL_ID_TYPES.find(t => t.code === legalIdType)?.label ?? "Cédula de Ciudadanía"}
              </Text>
              <Feather name={showLegalIdTypePicker ? "chevron-up" : "chevron-down"} size={18} color={C.textSecondary} />
            </Pressable>
            {showLegalIdTypePicker && (
              <View style={[styles.bankList, { backgroundColor: C.card, borderColor: C.border }]}>
                {LEGAL_ID_TYPES.map((idType) => (
                  <Pressable
                    key={idType.code}
                    onPress={() => { setLegalIdType(idType.code); setShowLegalIdTypePicker(false); }}
                    style={[
                      styles.bankItem,
                      {
                        backgroundColor: legalIdType === idType.code ? C.primaryLight : "transparent",
                        borderBottomColor: C.separator,
                      },
                    ]}
                  >
                    <Text style={{ color: C.text, fontFamily: "Inter_400Regular" }}>{idType.label}</Text>
                    {legalIdType === idType.code && <Feather name="check" size={16} color={C.primary} />}
                  </Pressable>
                ))}
              </View>
            )}
            <TextInput
              style={[styles.input, { backgroundColor: C.inputBg, borderColor: C.border, color: C.text }]}
              placeholder="Número de documento"
              placeholderTextColor={C.textMuted}
              value={legalId}
              onChangeText={(v) => setLegalId(v.replace(/[^0-9a-zA-Z\-]/g, ""))}
              keyboardType="default"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
            />
          </Card>
        )}

        {method === "card" && savedCards.length > 0 && (
          <Card style={{ gap: 10 }}>
            <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>
              TARJETAS GUARDADAS
            </Text>
            {savedCards.map((card: SavedCard) => (
              <Pressable
                key={card.id}
                onPress={() => { setSelectedSavedCardId(card.id); setShowNewCardForm(false); }}
                style={[
                  styles.savedCardBtn,
                  {
                    backgroundColor: selectedSavedCardId === card.id && !showNewCardForm ? C.primaryLight : C.inputBg,
                    borderColor: selectedSavedCardId === card.id && !showNewCardForm ? C.primary : C.border,
                  },
                ]}
              >
                <Feather name="credit-card" size={18} color={selectedSavedCardId === card.id && !showNewCardForm ? C.primary : C.textSecondary} />
                <Text style={[styles.savedCardText, { color: selectedSavedCardId === card.id && !showNewCardForm ? C.primary : C.text }]}>
                  {card.alias ? `${card.alias} · ` : ""}{card.brand.toUpperCase()} •••• {card.lastFour}
                </Text>
                {selectedSavedCardId === card.id && !showNewCardForm && (
                  <Feather name="check" size={16} color={C.primary} />
                )}
              </Pressable>
            ))}
            <Pressable
              onPress={() => { setShowNewCardForm(true); setSelectedSavedCardId(null); }}
              style={[
                styles.savedCardBtn,
                {
                  backgroundColor: showNewCardForm ? C.primaryLight : "transparent",
                  borderColor: showNewCardForm ? C.primary : C.border,
                  borderStyle: showNewCardForm ? "solid" : "dashed",
                },
              ]}
            >
              <Feather name="plus" size={16} color={showNewCardForm ? C.primary : C.textSecondary} />
              <Text style={[styles.savedCardText, { color: showNewCardForm ? C.primary : C.textSecondary }]}>
                Usar nueva tarjeta
              </Text>
              {showNewCardForm && <Feather name="check" size={16} color={C.primary} />}
            </Pressable>
          </Card>
        )}

        {method === "card" && usingNewCard && (
          <Card style={{ gap: 10 }}>
            <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>
              {t("tickets.cardDetails").toUpperCase()}
            </Text>
            <View style={{ position: "relative" }}>
              <TextInput
                style={[inputStyle, { paddingRight: 56, fontVariant: ["tabular-nums"] }]}
                placeholder="1234 5678 9012 3456"
                placeholderTextColor={C.textMuted}
                value={cardNumber}
                onChangeText={(raw) => {
                  const brand = detectCardBrand(raw);
                  setCardNumber(formatCardNumber(raw, brand));
                }}
                keyboardType="numeric"
                maxLength={detectCardBrand(cardNumber) === "amex" ? 17 : 19}
              />
              <View style={{ position: "absolute", right: 10, top: 0, bottom: 0, justifyContent: "center", pointerEvents: "none" }}>
                <CardBrandLogo brand={detectCardBrand(cardNumber)} />
              </View>
            </View>
            <View style={styles.cardRow}>
              <TextInput
                style={[inputStyle, { flex: 1 }]}
                placeholder="MM/AA"
                placeholderTextColor={C.textMuted}
                value={cardExpiry}
                onChangeText={(v) => setCardExpiry(handleExpiryChange(v, cardExpiry))}
                keyboardType="numeric"
                maxLength={5}
              />
              <TextInput
                style={[inputStyle, { flex: 1 }]}
                placeholder="CVC"
                placeholderTextColor={C.textMuted}
                value={cardCvc}
                onChangeText={(v) => setCardCvc(v.replace(/\D/g, "").slice(0, detectCardBrand(cardNumber) === "amex" ? 4 : 3))}
                keyboardType="numeric"
                maxLength={detectCardBrand(cardNumber) === "amex" ? 4 : 3}
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

        {method === "bancolombia_transfer" && (
          <Card style={{ gap: 8 }}>
            <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>
              {"BANCOLOMBIA TRANSFER"}
            </Text>
            <Text style={[styles.hintText, { color: C.textSecondary }]}>
              {t("topUp.bancolombiaTransferInfo")}
            </Text>
          </Card>
        )}

        <View style={[styles.infoBox, { backgroundColor: C.cardSecondary, borderColor: C.border }]}>
          <Feather name="info" size={14} color={C.textSecondary} />
          <Text style={[styles.infoText, { color: C.textSecondary }]}>
            {method === "nequi"
              ? t("topUp.nequiInfo")
              : method === "pse"
              ? t("topUp.pseInfo")
              : method === "bancolombia_transfer"
              ? t("topUp.bancolombiaTransferInfo")
              : t("topUp.cardInfo")}
          </Text>
        </View>

        <Button
          title={(isPending || isTokenizing) ? t("topUp.submitting") : `${t("topUp.submit")}${effectiveAmount > 0 ? ` ${formatCOP(effectiveAmount)}` : ""}`}
          onPress={handleSubmit}
          disabled={!canSubmit || isPending || isTokenizing}
          loading={isPending || isTokenizing}
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
  braceletOptionText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  braceletEventText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  refundBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  refundBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
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
  methodGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  methodBtn: {
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    gap: 8,
    width: "48%",
  },
  methodLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  savedCardBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
  },
  savedCardText: { flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  cardRow: { flexDirection: "row", gap: 10 },
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
  bankErrorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  bankErrorText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  bankRetryText: { fontSize: 13, fontFamily: "Inter_600SemiBold", textDecorationLine: "underline" },
});
