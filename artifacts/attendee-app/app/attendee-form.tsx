import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState, useMemo } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
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
import { PhoneInput, COUNTRY_CODES, type CountryCode } from "@/components/PhoneInput";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/utils/format";
import { usePurchaseTickets } from "@/hooks/useEventsApi";
import type { AttendeeInfo, OrderTicket } from "@/types/events";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parseStoredPhone(full: string): { country: CountryCode; local: string } {
  const sorted = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);
  for (const c of sorted) {
    if (full.startsWith(c.code)) {
      return { country: c, local: full.slice(c.code.length) };
    }
  }
  return { country: COUNTRY_CODES[0], local: full };
}

function parseDDMMYYYY(s: string): Date | null {
  if (!s || s.length < 8) return null;
  const parts = s.split("/");
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts.map(Number);
  const d = new Date(yyyy, mm - 1, dd);
  return isNaN(d.getTime()) ? null : d;
}

function toDDMMYYYY(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

const EPS_LIST = [
  "ALIANSALUD EPS",
  "ANAS WAYUU EPSI",
  "ASMET SALUD",
  "ASOCIACION INDIGENA DEL CAUCA EPSI",
  "CAJACOPI ATLANTICO",
  "CAPITAL SALUD EPS-S",
  "CAPRESOCA",
  "COMFACHOCO",
  "COMFAORIENTE",
  "COMFENALCO VALLE",
  "COMPENSAR EPS",
  "COOSALUD EPS-S",
  "DUSAKAWI EPSI",
  "EMSSANAR E.S.S.",
  "EPM - EMPRESAS PUBLICAS DE MEDELLIN",
  "EPS FAMILIAR DE COLOMBIA",
  "EPS SANITAS",
  "EPS SURA",
  "FAMISANAR",
  "FONDO DE PASIVO SOCIAL DE FERROCARRILES NACIONALES DE COLOMBIA",
  "MALLAMAS EPSI",
  "MUTUAL SER",
  "NUEVA EPS",
  "PIJAOS SALUD EPSI",
  "SALUD BÓLIVAR EPS SAS",
  "SALUD MIA",
  "SALUD TOTAL EPS S.A.",
  "SANIDAD FUERZAS MILITARES",
  "SAVIA SALUD EPS",
  "SERVICIO OCCIDENTAL DE SALUD EPS SOS",
  "OTRA",
];

export default function AttendeeFormScreen() {
  const { t } = useTranslation();
  const { show: showAlert } = useAlert();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user, refreshUser } = useAuth();
  const { mutate: purchaseTickets, isPending: isPurchasing } = usePurchaseTickets();

  const params = useLocalSearchParams<{
    eventId: string;
    ticketTypeId: string;
    ticketTypeName: string;
    price: string;
    serviceFee: string;
    quantity: string;
    currencyCode: string;
    eventName: string;
    sectionName: string;
    validDays: string;
    unitSelections: string;
    category: string;
    raceConfig: string;
  }>();

  const quantity = parseInt(params.quantity ?? "1", 10);
  const price = parseInt(params.price ?? "0", 10);
  const serviceFee = parseInt(params.serviceFee ?? "0", 10);
  const currencyCode = params.currencyCode ?? "COP";
  const validDays = (() => {
    if (!params.validDays) return [];
    try { return JSON.parse(params.validDays) as number[]; } catch { return []; }
  })();

  const isRace = params.category === "race";
  const raceSizes: string[] = (() => {
    if (!params.raceConfig) return ["XS", "S", "M", "L", "XL", "XXL"];
    try {
      const cfg = JSON.parse(params.raceConfig) as { sizes: string[] };
      return cfg.sizes.length > 0 ? cfg.sizes : ["XS", "S", "M", "L", "XL", "XXL"];
    } catch { return ["XS", "S", "M", "L", "XL", "XXL"]; }
  })();

  const firstPhone = user?.phone ? parseStoredPhone(user.phone) : null;

  const [attendees, setAttendees] = useState<AttendeeInfo[]>(
    Array.from({ length: quantity }, (_, i) => ({
      name: i === 0 ? `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() : "",
      email: i === 0 ? user?.email ?? "" : "",
      phone: i === 0 && user?.phone ? user.phone : "",
      dateOfBirth: i === 0 ? user?.dateOfBirth ?? "" : "",
      sex: i === 0 ? user?.sex ?? "" : "",
      idDocument: i === 0 ? user?.idDocument ?? "" : "",
      shirtSize: "",
    })),
  );

  const [phoneCountries, setPhoneCountries] = useState<CountryCode[]>(
    Array.from({ length: quantity }, (_, i) =>
      i === 0 && firstPhone ? firstPhone.country : COUNTRY_CODES[0]
    ),
  );

  const [phoneLocals, setPhoneLocals] = useState<string[]>(
    Array.from({ length: quantity }, (_, i) =>
      i === 0 && firstPhone ? firstPhone.local : ""
    ),
  );

  const [emergencyPhoneCountries, setEmergencyPhoneCountries] = useState<CountryCode[]>(
    Array.from({ length: quantity }, () => COUNTRY_CODES[0]),
  );
  const [emergencyPhoneLocals, setEmergencyPhoneLocals] = useState<string[]>(
    Array.from({ length: quantity }, () => ""),
  );

  const [expandedIndex, setExpandedIndex] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [epsModalIndex, setEpsModalIndex] = useState<number | null>(null);
  const [epsSearch, setEpsSearch] = useState("");

  const updatePhone = (index: number, country: CountryCode, local: string) => {
    setPhoneCountries((prev) => { const n = [...prev]; n[index] = country; return n; });
    setPhoneLocals((prev) => { const n = [...prev]; n[index] = local; return n; });
    updateAttendee(index, "phone", country.code + local);
    setErrors((prev) => { const n = { ...prev }; delete n[`${index}_phone`]; return n; });
  };

  const updateEmergencyPhone = (index: number, country: CountryCode, local: string) => {
    setEmergencyPhoneCountries((prev) => { const n = [...prev]; n[index] = country; return n; });
    setEmergencyPhoneLocals((prev) => { const n = [...prev]; n[index] = local; return n; });
    updateAttendee(index, "emergencyContactPhone", country.code + local);
    setErrors((prev) => { const n = { ...prev }; delete n[`${index}_emergencyContactPhone`]; return n; });
  };

  const filteredEps = useMemo(
    () => EPS_LIST.filter((e) => e.toLowerCase().includes(epsSearch.toLowerCase())),
    [epsSearch],
  );

  const updateAttendee = (index: number, field: keyof AttendeeInfo, value: string) => {
    setAttendees((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
    setErrors((prev) => {
      const next = { ...prev };
      delete next[`${index}_${field}`];
      return next;
    });
  };

  const validateAll = (): boolean => {
    const newErrors: Record<string, string> = {};
    attendees.forEach((a, i) => {
      if (!a.name.trim()) newErrors[`${i}_name`] = t("tickets.required");
      if (!a.email.trim()) newErrors[`${i}_email`] = t("tickets.required");
      else if (!isValidEmail(a.email)) newErrors[`${i}_email`] = t("tickets.invalidEmail");
      if (!phoneLocals[i]?.trim()) newErrors[`${i}_phone`] = t("tickets.required");
      if (!a.dateOfBirth.trim()) newErrors[`${i}_dateOfBirth`] = t("tickets.required");
      if (!a.sex) newErrors[`${i}_sex`] = t("tickets.required");
      if (!a.idDocument.trim()) newErrors[`${i}_idDocument`] = t("tickets.required");
      if (isRace && !a.shirtSize) newErrors[`${i}_shirtSize`] = t("tickets.required");
      if (isRace && !a.bloodType) newErrors[`${i}_bloodType`] = t("tickets.required");
      if (isRace && !emergencyPhoneLocals[i]?.trim()) newErrors[`${i}_emergencyContactPhone`] = t("tickets.required");
      if (isRace && !a.emergencyContactName?.trim()) newErrors[`${i}_emergencyContactName`] = t("tickets.required");
      if (isRace && !a.eps) newErrors[`${i}_eps`] = t("tickets.required");
    });
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) {
      const firstErrorIdx = parseInt(Object.keys(newErrors)[0].split("_")[0], 10);
      setExpandedIndex(firstErrorIdx);
      return false;
    }
    return true;
  };

  const subtotal = price * quantity;
  const totalFees = serviceFee * quantity;
  const total = subtotal + totalFees;
  const isFree = total === 0;

  const unitSelections: Array<{ ticketTypeId: string; unitId: string }> = (() => {
    if (!params.unitSelections) return [];
    try { return JSON.parse(params.unitSelections) as Array<{ ticketTypeId: string; unitId: string }>; } catch { return []; }
  })();

  const handleContinue = () => {
    if (!validateAll()) return;

    const tickets: OrderTicket[] = attendees.map((a) => ({
      ticketTypeId: params.ticketTypeId ?? "",
      ticketTypeName: params.ticketTypeName ?? "",
      sectionName: params.sectionName,
      price,
      serviceFee,
      validDays,
      attendee: a,
    }));

    if (isFree) {
      purchaseTickets(
        {
          eventId: params.eventId ?? "",
          tickets: tickets.map((tk) => ({
            ticketTypeId: tk.ticketTypeId,
            attendee: tk.attendee,
          })),
          unitSelections: unitSelections.length > 0 ? unitSelections : undefined,
          paymentMethod: "free",
        },
        {
          onSuccess: () => {
            void refreshUser();
            router.replace("/(tabs)/my-tickets");
          },
          onError: (err: unknown) => {
            const msg = (err as { message?: string }).message ?? t("common.unknownError");
            showAlert(t("common.error"), msg);
          },
        },
      );
      return;
    }

    router.push({
      pathname: "/ticket-checkout",
      params: {
        eventId: params.eventId ?? "",
        eventName: params.eventName ?? "",
        currencyCode,
        tickets: JSON.stringify(tickets),
        subtotal: String(subtotal),
        totalServiceFees: String(totalFees),
        total: String(total),
        unitSelections: params.unitSelections ?? "",
      },
    });
  };

  const inputStyle = (key: string) => [
    styles.input,
    {
      backgroundColor: C.inputBg,
      borderColor: errors[key] ? C.danger : C.border,
      color: C.text,
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor: C.background, paddingTop: isWeb ? 67 : insets.top + 8 }]}>
      <View style={[styles.header, { paddingHorizontal: 20 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={C.text} />
        </Pressable>
        <Text style={[styles.title, { color: C.text }]}>{t("tickets.attendeeData")}</Text>
        <View style={{ width: 30 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        {attendees.map((attendee, index) => {
          const isExpanded = expandedIndex === index;
          return (
            <Card key={index} style={{ gap: 0 }}>
              <Pressable
                onPress={() => setExpandedIndex(isExpanded ? -1 : index)}
                style={styles.accordionHeader}
              >
                <View style={[styles.ticketBadge, { backgroundColor: C.primaryLight }]}>
                  <Text style={[styles.ticketBadgeText, { color: C.primary }]}>
                    {t("tickets.ticketN", { n: index + 1 })}
                  </Text>
                </View>
                {attendee.name.trim() ? (
                  <Text style={[styles.attendeeSummary, { color: C.textSecondary }]} numberOfLines={1}>
                    {attendee.name}
                  </Text>
                ) : null}
                <Feather
                  name={isExpanded ? "chevron-up" : "chevron-down"}
                  size={18}
                  color={C.textSecondary}
                />
              </Pressable>

              {isExpanded && (
                <View style={styles.accordionBody}>
                  <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>
                    {t("tickets.attendeeName")}
                  </Text>
                  <TextInput
                    style={inputStyle(`${index}_name`)}
                    placeholder={t("tickets.namePlaceholder")}
                    placeholderTextColor={C.textMuted}
                    value={attendee.name}
                    onChangeText={(v) => updateAttendee(index, "name", v)}
                    autoCapitalize="words"
                  />
                  {errors[`${index}_name`] && (
                    <Text style={[styles.errorText, { color: C.danger }]}>
                      {errors[`${index}_name`]}
                    </Text>
                  )}

                  <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>
                    {t("tickets.attendeeEmail")}
                  </Text>
                  <TextInput
                    style={inputStyle(`${index}_email`)}
                    placeholder={t("tickets.emailPlaceholder")}
                    placeholderTextColor={C.textMuted}
                    value={attendee.email}
                    onChangeText={(v) => updateAttendee(index, "email", v)}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {errors[`${index}_email`] && (
                    <Text style={[styles.errorText, { color: C.danger }]}>
                      {errors[`${index}_email`]}
                    </Text>
                  )}

                  <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>
                    {t("tickets.attendeePhone")}
                  </Text>
                  <PhoneInput
                    number={phoneLocals[index] ?? ""}
                    country={phoneCountries[index] ?? COUNTRY_CODES[0]}
                    onNumberChange={(v) => updatePhone(index, phoneCountries[index] ?? COUNTRY_CODES[0], v)}
                    onCountryChange={(c) => updatePhone(index, c, phoneLocals[index] ?? "")}
                    inputStyle={{
                      borderColor: errors[`${index}_phone`] ? C.danger : C.border,
                    }}
                  />
                  {errors[`${index}_phone`] && (
                    <Text style={[styles.errorText, { color: C.danger }]}>
                      {errors[`${index}_phone`]}
                    </Text>
                  )}

                  <DatePickerInput
                    label={`${t("tickets.dateOfBirth", "Fecha de nacimiento")} *`}
                    value={parseDDMMYYYY(attendees[index]?.dateOfBirth ?? "")}
                    onChange={(d) => updateAttendee(index, "dateOfBirth", toDDMMYYYY(d))}
                    maximumDate={new Date()}
                    error={!!errors[`${index}_dateOfBirth`]}
                  />
                  {errors[`${index}_dateOfBirth`] && (
                    <Text style={[styles.errorText, { color: C.danger }]}>
                      {errors[`${index}_dateOfBirth`]}
                    </Text>
                  )}

                  <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>
                    {t("tickets.sex", "Género")} *
                  </Text>
                  <View style={styles.sexRow}>
                    {(["male", "female", "non_binary"] as const).map((s) => (
                      <Pressable
                        key={s}
                        style={[
                          styles.sexBtn,
                          {
                            borderColor: attendees[index]?.sex === s ? C.primary : C.border,
                            backgroundColor: attendees[index]?.sex === s ? C.primaryLight : C.inputBg,
                          },
                        ]}
                        onPress={() => updateAttendee(index, "sex", attendees[index]?.sex === s ? "" : s)}
                      >
                        <Feather name="user" size={14} color={attendees[index]?.sex === s ? C.primary : C.textSecondary} />
                        <Text style={[styles.sexBtnText, { color: attendees[index]?.sex === s ? C.primary : C.textSecondary }]}>
                          {s === "male" ? t("tickets.male", "Masculino") : s === "female" ? t("tickets.female", "Femenino") : t("tickets.non_binary", "No binario")}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  {errors[`${index}_sex`] && (
                    <Text style={[styles.errorText, { color: C.danger }]}>
                      {errors[`${index}_sex`]}
                    </Text>
                  )}

                  <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>
                    {t("tickets.idDocument", "Núm. de identificación")} *
                  </Text>
                  <TextInput
                    style={inputStyle(`${index}_idDocument`)}
                    placeholder="1234567890"
                    placeholderTextColor={C.textMuted}
                    value={attendees[index]?.idDocument ?? ""}
                    onChangeText={(v) => updateAttendee(index, "idDocument", v.replace(/\D/g, ""))}
                    keyboardType="numeric"
                  />
                  {errors[`${index}_idDocument`] && (
                    <Text style={[styles.errorText, { color: C.danger }]}>
                      {errors[`${index}_idDocument`]}
                    </Text>
                  )}

                  {isRace && (
                    <>
                      <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>
                        {t("tickets.shirtSize", "Talla de camiseta")} *
                      </Text>
                      <View style={styles.sexRow}>
                        {raceSizes.map((size) => (
                          <Pressable
                            key={size}
                            style={[
                              styles.sexBtn,
                              {
                                borderColor: attendees[index]?.shirtSize === size ? C.primary : C.border,
                                backgroundColor: attendees[index]?.shirtSize === size ? C.primaryLight : C.inputBg,
                              },
                            ]}
                            onPress={() => updateAttendee(index, "shirtSize", size)}
                          >
                            <Text style={[styles.sexBtnText, { color: attendees[index]?.shirtSize === size ? C.primary : C.textSecondary }]}>
                              {size}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                      {errors[`${index}_shirtSize`] && (
                        <Text style={[styles.errorText, { color: C.danger }]}>
                          {errors[`${index}_shirtSize`]}
                        </Text>
                      )}

                      <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>
                        {t("tickets.bloodType", "Tipo de sangre (RH)")} *
                      </Text>
                      <View style={styles.sexRow}>
                        {BLOOD_TYPES.map((bt) => (
                          <Pressable
                            key={bt}
                            style={[
                              styles.sexBtn,
                              {
                                borderColor: attendees[index]?.bloodType === bt ? C.primary : C.border,
                                backgroundColor: attendees[index]?.bloodType === bt ? C.primaryLight : C.inputBg,
                                minWidth: 52,
                                flex: 0,
                              },
                            ]}
                            onPress={() => updateAttendee(index, "bloodType", bt)}
                          >
                            <Text style={[styles.sexBtnText, { color: attendees[index]?.bloodType === bt ? C.primary : C.textSecondary }]}>
                              {bt}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                      {errors[`${index}_bloodType`] && (
                        <Text style={[styles.errorText, { color: C.danger }]}>
                          {errors[`${index}_bloodType`]}
                        </Text>
                      )}

                      <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>
                        {t("tickets.emergencyContactName", "Contacto de emergencia")} *
                      </Text>
                      <TextInput
                        style={inputStyle(`${index}_emergencyContactName`)}
                        placeholder={t("tickets.namePlaceholder")}
                        placeholderTextColor={C.textMuted}
                        value={attendees[index]?.emergencyContactName ?? ""}
                        onChangeText={(v) => updateAttendee(index, "emergencyContactName", v)}
                        autoCapitalize="words"
                      />
                      {errors[`${index}_emergencyContactName`] && (
                        <Text style={[styles.errorText, { color: C.danger }]}>
                          {errors[`${index}_emergencyContactName`]}
                        </Text>
                      )}

                      <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>
                        {t("tickets.emergencyContactPhone", "Teléfono de emergencia")} *
                      </Text>
                      <PhoneInput
                        number={emergencyPhoneLocals[index] ?? ""}
                        country={emergencyPhoneCountries[index] ?? COUNTRY_CODES[0]}
                        onNumberChange={(v) => updateEmergencyPhone(index, emergencyPhoneCountries[index] ?? COUNTRY_CODES[0], v)}
                        onCountryChange={(c) => updateEmergencyPhone(index, c, emergencyPhoneLocals[index] ?? "")}
                        inputStyle={{
                          borderColor: errors[`${index}_emergencyContactPhone`] ? C.danger : C.border,
                        }}
                      />
                      {errors[`${index}_emergencyContactPhone`] && (
                        <Text style={[styles.errorText, { color: C.danger }]}>
                          {errors[`${index}_emergencyContactPhone`]}
                        </Text>
                      )}

                      <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>
                        {t("tickets.eps", "EPS")} *
                      </Text>
                      <Pressable
                        style={[
                          inputStyle(`${index}_eps`),
                          styles.epsBtn,
                        ]}
                        onPress={() => { setEpsModalIndex(index); setEpsSearch(""); }}
                      >
                        <Text style={{ color: attendees[index]?.eps ? C.text : C.textMuted, fontSize: 15, fontFamily: "Inter_400Regular", flex: 1 }} numberOfLines={1}>
                          {attendees[index]?.eps || t("tickets.selectEps", "Selecciona tu EPS")}
                        </Text>
                        <Feather name="chevron-down" size={16} color={C.textSecondary} />
                      </Pressable>
                      {errors[`${index}_eps`] && (
                        <Text style={[styles.errorText, { color: C.danger }]}>
                          {errors[`${index}_eps`]}
                        </Text>
                      )}
                    </>
                  )}
                </View>
              )}
            </Card>
          );
        })}

        <Card style={{ gap: 8 }}>
          <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>
            {t("tickets.orderSummary").toUpperCase()}
          </Text>
          {attendees.map((a, i) => (
            <View key={i} style={[styles.orderItem, { borderColor: C.border }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.orderTicketName, { color: C.text }]}>
                  {params.ticketTypeName}
                  {params.sectionName ? ` · ${params.sectionName}` : ""}
                </Text>
                <Text style={[styles.orderAttendeeName, { color: C.textSecondary }]}>
                  {a.name.trim() || t("tickets.ticketN", { n: i + 1 })}
                </Text>
                {validDays.length > 0 && (
                  <Text style={[styles.orderDays, { color: C.textMuted }]}>
                    {validDays.map((d: number) => t("events.dayLabel", { n: d })).join(", ")}
                  </Text>
                )}
              </View>
              <Text style={[styles.orderPrice, { color: C.text }]}>
                {isFree ? t("tickets.free") : formatCurrency(price + serviceFee, currencyCode)}
              </Text>
            </View>
          ))}
        </Card>

        <Button
          title={isPurchasing ? t("common.processing") : isFree ? t("tickets.confirmFree") : t("tickets.proceedToPayment")}
          onPress={handleContinue}
          disabled={isPurchasing}
          loading={isPurchasing}
          variant="primary"
          fullWidth
          size="lg"
        />
      </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={epsModalIndex !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setEpsModalIndex(null)}
      >
        <View style={styles.epsModalOverlay}>
          <View style={[styles.epsModalSheet, { backgroundColor: C.background, borderColor: C.border }]}>
            <View style={[styles.epsModalHeader, { borderBottomColor: C.border }]}>
              <Text style={[styles.epsModalTitle, { color: C.text }]}>{t("tickets.eps", "EPS")}</Text>
              <Pressable onPress={() => setEpsModalIndex(null)}>
                <Feather name="x" size={22} color={C.text} />
              </Pressable>
            </View>
            <View style={[styles.epsSearchWrap, { borderBottomColor: C.border }]}>
              <Feather name="search" size={16} color={C.textMuted} />
              <TextInput
                style={[styles.epsSearchInput, { color: C.text }]}
                placeholder={t("common.search", "Buscar...")}
                placeholderTextColor={C.textMuted}
                value={epsSearch}
                onChangeText={setEpsSearch}
                autoFocus
              />
            </View>
            <FlatList
              data={filteredEps}
              keyExtractor={(item) => item}
              renderItem={({ item }) => {
                const selected = epsModalIndex !== null && attendees[epsModalIndex]?.eps === item;
                return (
                  <Pressable
                    style={[styles.epsOption, { borderBottomColor: C.border, backgroundColor: selected ? C.primaryLight : "transparent" }]}
                    onPress={() => {
                      if (epsModalIndex !== null) {
                        updateAttendee(epsModalIndex, "eps", item);
                        setErrors((prev) => { const n = { ...prev }; delete n[`${epsModalIndex}_eps`]; return n; });
                      }
                      setEpsModalIndex(null);
                    }}
                  >
                    <Text style={[styles.epsOptionText, { color: selected ? C.primary : C.text }]} numberOfLines={2}>{item}</Text>
                    {selected && <Feather name="check" size={16} color={C.primary} />}
                  </Pressable>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 8,
  },
  backBtn: { padding: 4 },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  scroll: { padding: 20, gap: 16 },
  accordionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
  },
  ticketBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  ticketBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  attendeeSummary: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  accordionBody: {
    gap: 8,
    paddingTop: 12,
  },
  fieldLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  errorText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: -4,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  orderItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  orderTicketName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  orderAttendeeName: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  orderDays: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  orderPrice: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  sexRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  sexBtn: {
    flex: 1,
    minWidth: 90,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
  },
  sexBtnText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  epsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  epsModalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  epsModalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    maxHeight: "75%",
  },
  epsModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
  },
  epsModalTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  epsSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  epsSearchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    paddingVertical: 4,
  },
  epsOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  epsOptionText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    flex: 1,
    paddingRight: 8,
  },
});
