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
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/utils/format";
import { usePurchaseTickets } from "@/hooks/useEventsApi";
import type { AttendeeInfo, OrderTicket } from "@/types/events";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function AttendeeFormScreen() {
  const { t } = useTranslation();
  const { show: showAlert } = useAlert();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();
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
  }>();

  const quantity = parseInt(params.quantity ?? "1", 10);
  const price = parseInt(params.price ?? "0", 10);
  const serviceFee = parseInt(params.serviceFee ?? "0", 10);
  const currencyCode = params.currencyCode ?? "COP";
  const validDays = (() => {
    if (!params.validDays) return [];
    try { return JSON.parse(params.validDays) as number[]; } catch { return []; }
  })();

  const [attendees, setAttendees] = useState<AttendeeInfo[]>(
    Array.from({ length: quantity }, (_, i) => ({
      name: i === 0 ? `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() : "",
      email: i === 0 ? user?.email ?? "" : "",
      phone: "",
    })),
  );

  const [expandedIndex, setExpandedIndex] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});

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
      if (!a.phone.trim()) newErrors[`${i}_phone`] = t("tickets.required");
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
          paymentMethod: "free",
        },
        {
          onSuccess: () => {
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
                  <TextInput
                    style={inputStyle(`${index}_phone`)}
                    placeholder={t("tickets.phonePlaceholder")}
                    placeholderTextColor={C.textMuted}
                    value={attendee.phone}
                    onChangeText={(v) => updateAttendee(index, "phone", v)}
                    keyboardType="phone-pad"
                  />
                  {errors[`${index}_phone`] && (
                    <Text style={[styles.errorText, { color: C.danger }]}>
                      {errors[`${index}_phone`]}
                    </Text>
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
});
