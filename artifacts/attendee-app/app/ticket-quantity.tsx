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
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatCurrency } from "@/utils/format";

export default function TicketQuantityScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const params = useLocalSearchParams<{
    eventId: string;
    ticketTypeId: string;
    ticketTypeName: string;
    price: string;
    serviceFee: string;
    maxPerOrder: string;
    currencyCode: string;
    eventName: string;
    sectionName: string;
    validDays: string;
  }>();

  const price = parseInt(params.price ?? "0", 10);
  const serviceFee = parseInt(params.serviceFee ?? "0", 10);
  const maxPerOrder = parseInt(params.maxPerOrder ?? "10", 10);
  const currencyCode = params.currencyCode ?? "COP";
  const validDays = (() => {
    if (!params.validDays) return [];
    try { return JSON.parse(params.validDays) as number[]; } catch { return []; }
  })();

  const [quantity, setQuantity] = useState(1);

  const subtotal = price * quantity;
  const totalFees = serviceFee * quantity;
  const total = subtotal + totalFees;

  const handleContinue = () => {
    router.push({
      pathname: "/attendee-form",
      params: {
        eventId: params.eventId ?? "",
        ticketTypeId: params.ticketTypeId ?? "",
        ticketTypeName: params.ticketTypeName ?? "",
        price: String(price),
        serviceFee: String(serviceFee),
        quantity: String(quantity),
        currencyCode,
        eventName: params.eventName ?? "",
        sectionName: params.sectionName ?? "",
        validDays: params.validDays ?? "",
      },
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: C.background, paddingTop: isWeb ? 67 : insets.top + 8 }]}>
      <View style={[styles.header, { paddingHorizontal: 20 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={C.text} />
        </Pressable>
        <Text style={[styles.title, { color: C.text }]}>{t("tickets.quantity")}</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}>
        <Card style={{ gap: 12 }}>
          <Text style={[styles.eventName, { color: C.text }]}>{params.eventName}</Text>
          <Text style={[styles.ticketName, { color: C.primary }]}>{params.ticketTypeName}</Text>
          {params.sectionName ? (
            <Text style={[styles.sectionName, { color: C.textSecondary }]}>{params.sectionName}</Text>
          ) : null}
          {validDays.length > 0 && (
            <Text style={[styles.validDaysText, { color: C.textSecondary }]}>
              {t("events.validDays")}: {validDays.map((d: number) => t("events.dayLabel", { n: d })).join(", ")}
            </Text>
          )}
        </Card>

        <Card style={{ gap: 16 }}>
          <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>
            {t("tickets.howMany").toUpperCase()}
          </Text>
          <View style={styles.quantityRow}>
            <Pressable
              onPress={() => setQuantity(Math.max(1, quantity - 1))}
              style={[styles.qtyBtn, { backgroundColor: C.inputBg, borderColor: C.border }]}
              disabled={quantity <= 1}
            >
              <Feather name="minus" size={20} color={quantity <= 1 ? C.textMuted : C.text} />
            </Pressable>
            <View style={[styles.qtyDisplay, { backgroundColor: C.primaryLight, borderColor: C.primary }]}>
              <Text style={[styles.qtyText, { color: C.primary }]}>{quantity}</Text>
            </View>
            <Pressable
              onPress={() => setQuantity(Math.min(maxPerOrder, quantity + 1))}
              style={[styles.qtyBtn, { backgroundColor: C.inputBg, borderColor: C.border }]}
              disabled={quantity >= maxPerOrder}
            >
              <Feather name="plus" size={20} color={quantity >= maxPerOrder ? C.textMuted : C.text} />
            </Pressable>
          </View>
          <Text style={[styles.maxHint, { color: C.textMuted }]}>
            {t("tickets.maxPerOrder", { max: maxPerOrder })}
          </Text>
        </Card>

        <Card style={{ gap: 10 }}>
          <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>
            {t("tickets.summary").toUpperCase()}
          </Text>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: C.textSecondary }]}>
              {params.ticketTypeName} × {quantity}
            </Text>
            <Text style={[styles.summaryValue, { color: C.text }]}>
              {formatCurrency(subtotal, currencyCode)}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: C.textSecondary }]}>
              {t("tickets.serviceFee")} × {quantity}
            </Text>
            <Text style={[styles.summaryValue, { color: C.text }]}>
              {formatCurrency(totalFees, currencyCode)}
            </Text>
          </View>
          <View style={[styles.totalRow, { borderTopColor: C.border }]}>
            <Text style={[styles.totalLabel, { color: C.text }]}>{t("tickets.total")}</Text>
            <Text style={[styles.totalValue, { color: C.primary }]}>
              {formatCurrency(total, currencyCode)}
            </Text>
          </View>
        </Card>

        <Button
          title={t("tickets.continue")}
          onPress={handleContinue}
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
  eventName: { fontSize: 16, fontFamily: "Inter_700Bold" },
  ticketName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  sectionName: { fontSize: 13, fontFamily: "Inter_400Regular" },
  validDaysText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  quantityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
  },
  qtyBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyDisplay: {
    width: 64,
    height: 64,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyText: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
  },
  maxHint: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryLabel: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  summaryValue: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 10,
    borderTopWidth: 1,
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  totalValue: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
});
