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
import { useListPayouts } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import Colors from "@/constants/colors";
import { CopAmount } from "@/components/CopAmount";
import { Badge } from "@/components/ui/Badge";
import { Empty } from "@/components/ui/Empty";
import { Loading } from "@/components/ui/Loading";
import { formatDate } from "@/utils/format";

export default function MerchantPayoutsScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();

  const { data, isLoading, refetch } = useListPayouts(
    { merchantId: user?.merchantId ?? "" },
    { query: { enabled: !!user?.merchantId } }
  );
  const payouts = (data as { payouts?: Array<{
    id: string;
    amountCop: number;
    paymentMethod: string;
    referenceNote: string | null;
    createdAt: string;
    status: string;
  }> } | undefined)?.payouts ?? [];

  if (isLoading) return <Loading label={t("common.loading")} />;

  const totalPaid = payouts.filter(p => p.status === "paid").reduce((s, p) => s + p.amountCop, 0);

  return (
    <FlatList
      data={payouts}
      keyExtractor={(item) => item.id}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        paddingTop: isWeb ? 67 : insets.top + 16,
        paddingBottom: isWeb ? 34 : insets.bottom + 100,
        paddingHorizontal: 20,
        gap: 12,
      }}
      style={{ backgroundColor: C.background }}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={C.primary} />}
      ListHeaderComponent={() => (
        <>
          <Text style={[styles.title, { color: C.text }]}>{t("merchant_admin.payouts")}</Text>
          {totalPaid > 0 && (
            <View style={[styles.totalCard, { backgroundColor: C.successLight, borderColor: C.success + "44" }]}>
              <Text style={[styles.totalLabel, { color: C.success }]}>{t("merchant_admin.totalPaid")}</Text>
              <CopAmount amount={totalPaid} size={28} color={C.success} />
            </View>
          )}
        </>
      )}
      ListEmptyComponent={() => (
        <Empty icon="credit-card" title={t("merchant_admin.noPayout")} />
      )}
      scrollEnabled={!!payouts.length}
      renderItem={({ item }) => (
        <View style={[styles.payoutCard, { backgroundColor: C.card, borderColor: C.border }]}>
          <View style={styles.payoutRow}>
            <View style={[styles.payIcon, { backgroundColor: C.successLight }]}>
              <Feather name="check-circle" size={18} color={C.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.payMethod, { color: C.text }]}>{item.paymentMethod}</Text>
              <Text style={[styles.payDate, { color: C.textMuted }]}>{formatDate(item.createdAt)}</Text>
              {item.referenceNote ? (
                <Text style={[styles.payRef, { color: C.textSecondary }]} numberOfLines={1}>{item.referenceNote}</Text>
              ) : null}
            </View>
            <CopAmount amount={item.amountCop} size={17} positive />
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontFamily: "Inter_700Bold", marginBottom: 4 },
  totalCard: { borderWidth: 1, borderRadius: 16, padding: 20, alignItems: "center", gap: 4, marginBottom: 4 },
  totalLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  payoutCard: { borderWidth: 1, borderRadius: 14, padding: 14 },
  payoutRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  payIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  payMethod: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  payDate: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  payRef: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
});
