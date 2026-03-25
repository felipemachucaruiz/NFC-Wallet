import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useGetMyShiftTopUps } from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { CopAmount } from "@/components/CopAmount";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Loading } from "@/components/ui/Loading";
import { formatDateTime } from "@/utils/format";

type PaymentMethod = "cash" | "card_external" | "nequi" | "bancolombia" | "other";

const METHOD_ICONS: Record<PaymentMethod, React.ComponentProps<typeof Feather>["name"]> = {
  cash: "dollar-sign",
  card_external: "credit-card",
  nequi: "smartphone",
  bancolombia: "home",
  other: "more-horizontal",
};

export default function ShiftSummaryScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const { data, isLoading, refetch } = useGetMyShiftTopUps();
  const shiftData = data as {
    topUps?: Array<{
      id: string;
      amountCop: number;
      paymentMethod: string;
      braceletUid: string;
      createdAt: string;
    }>;
    totalCop?: number;
    byPaymentMethod?: Record<string, number>;
    count?: number;
  } | undefined;

  const topUps = shiftData?.topUps ?? [];
  const totalCop = shiftData?.totalCop ?? 0;
  const byMethod = shiftData?.byPaymentMethod ?? {};

  if (isLoading) return <Loading label={t("common.loading")} />;

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <FlatList
        data={topUps}
        keyExtractor={(item) => item.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingTop: isWeb ? 67 : insets.top + 16,
          paddingBottom: isWeb ? 34 : insets.bottom + 100,
          paddingHorizontal: 20,
          gap: 16,
        }}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={C.primary} />}
        ListHeaderComponent={() => (
          <>
            <Text style={[styles.pageTitle, { color: C.text }]}>{t("bank.shiftSummary")}</Text>

            <Card style={{ marginTop: 4 }}>
              <View style={styles.totalSection}>
                <Text style={[styles.totalLabel, { color: C.textSecondary }]}>{t("bank.totalCollected")}</Text>
                <CopAmount amount={totalCop} size={40} positive />
                <Text style={[styles.countText, { color: C.textMuted }]}>{topUps.length} {t("bank.topUpCount")}</Text>
              </View>
            </Card>

            {Object.keys(byMethod).length > 0 && (
              <View>
                <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>{t("bank.byPaymentMethod")}</Text>
                <Card style={{ marginTop: 8 }}>
                  {Object.entries(byMethod).map(([method, total], idx) => {
                    const m = method as PaymentMethod;
                    const icon = METHOD_ICONS[m] ?? "circle";
                    const label = t(`bank.${m === "card_external" ? "cardExternal" : m}`);
                    return (
                      <View key={method}>
                        {idx > 0 && <View style={[styles.divider, { backgroundColor: C.separator }]} />}
                        <View style={styles.methodRow}>
                          <View style={[styles.methodIcon, { backgroundColor: C.primaryLight }]}>
                            <Feather name={icon} size={16} color={C.primary} />
                          </View>
                          <Text style={[styles.methodLabel, { color: C.text }]}>{label}</Text>
                          <CopAmount amount={total} size={16} />
                        </View>
                      </View>
                    );
                  })}
                </Card>
              </View>
            )}

            <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>{t("bank.transactions")}</Text>
          </>
        )}
        ListEmptyComponent={() => (
          <Empty icon="inbox" title={t("bank.noTopUps")} />
        )}
        renderItem={({ item }) => {
          const m = item.paymentMethod as PaymentMethod;
          return (
            <View style={[styles.topUpCard, { backgroundColor: C.card, borderColor: C.border }]}>
              <View style={[styles.methodDot, { backgroundColor: C.primaryLight }]}>
                <Feather name={METHOD_ICONS[m] ?? "circle"} size={14} color={C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.braceletUid, { color: C.text }]}>{item.braceletUid}</Text>
                <Text style={[styles.txDate, { color: C.textMuted }]}>{formatDateTime(item.createdAt)}</Text>
              </View>
              <CopAmount amount={item.amountCop} positive size={15} />
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pageTitle: { fontSize: 26, fontFamily: "Inter_700Bold", marginBottom: 4 },
  totalSection: { alignItems: "center", gap: 4, paddingVertical: 12 },
  totalLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  countText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  sectionLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  divider: { height: 1, marginVertical: 2 },
  methodRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  methodIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  methodLabel: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  topUpCard: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 12, padding: 14 },
  methodDot: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  braceletUid: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  txDate: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
});
