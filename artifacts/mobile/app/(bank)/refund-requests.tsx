import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Alert,
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
import Colors from "@/constants/colors";
import { CopAmount } from "@/components/CopAmount";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Loading } from "@/components/ui/Loading";
import { Badge } from "@/components/ui/Badge";
import { formatDateTime } from "@/utils/format";
import { useBankRefundRequests, useProcessRefundRequest } from "@/hooks/useAttendeeApi";

type RefundRequest = {
  id: string;
  attendeeUserId: string;
  braceletUid: string;
  eventId: string;
  amountCop: number;
  refundMethod: "cash" | "nequi" | "bancolombia" | "other";
  accountDetails?: string | null;
  notes?: string | null;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  nequi: "Nequi",
  bancolombia: "Bancolombia",
  other: "Other",
};

const METHOD_ICONS: Record<string, React.ComponentProps<typeof Feather>["name"]> = {
  cash: "dollar-sign",
  nequi: "smartphone",
  bancolombia: "home",
  other: "more-horizontal",
};

export default function BankRefundRequestsScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const [filter, setFilter] = useState<"all" | "pending">("pending");

  const { data, isLoading, refetch, isRefetching } = useBankRefundRequests();
  const processRequest = useProcessRefundRequest();

  const requests = (data as { requests?: RefundRequest[] } | undefined)?.requests ?? [];
  const filtered = filter === "pending" ? requests.filter((r) => r.status === "pending") : requests;

  const handleProcess = (id: string, status: "approved" | "rejected") => {
    const label = status === "approved" ? t("bankRefundRequests.approve") : t("bankRefundRequests.reject");
    Alert.alert(label, `${label}?`, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: label,
        style: status === "rejected" ? "destructive" : "default",
        onPress: async () => {
          try {
            await processRequest.mutateAsync({ id, status });
            Alert.alert(t("common.success"), t("bankRefundRequests.processSuccess"));
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : t("common.unknownError");
            Alert.alert(t("common.error"), msg);
          }
        },
      },
    ]);
  };

  if (isLoading) return <Loading label={t("common.loading")} />;

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingTop: isWeb ? 67 : insets.top + 8,
          paddingBottom: isWeb ? 34 : insets.bottom + 100,
          paddingHorizontal: 16,
          gap: 12,
        }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={C.primary} />
        }
        ListHeaderComponent={() => (
          <View style={styles.header}>
            <Text style={[styles.pageTitle, { color: C.text }]}>{t("bankRefundRequests.title")}</Text>
            <View style={styles.filterRow}>
              {(["pending", "all"] as const).map((f) => (
                <Button
                  key={f}
                  title={f === "pending" ? t("bankRefundRequests.pending") : t("common.all")}
                  onPress={() => setFilter(f)}
                  variant={filter === f ? "primary" : "secondary"}
                  size="sm"
                />
              ))}
            </View>
          </View>
        )}
        ListEmptyComponent={() => (
          <Empty icon="inbox" title={t("bankRefundRequests.noRequests")} />
        )}
        renderItem={({ item }) => (
          <Card>
            <View style={styles.requestHeader}>
              <View style={[styles.methodIcon, { backgroundColor: C.primaryLight }]}>
                <Feather name={METHOD_ICONS[item.refundMethod] ?? "circle"} size={18} color={C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.braceletUid, { color: C.text }]}>{item.braceletUid}</Text>
                <Text style={[styles.meta, { color: C.textMuted }]}>{formatDateTime(item.createdAt)}</Text>
              </View>
              <Badge
                label={item.status === "pending" ? t("bankRefundRequests.pending") : item.status === "approved" ? t("bankRefundRequests.approved") : t("bankRefundRequests.rejected")}
                variant={item.status === "pending" ? "warning" : item.status === "approved" ? "success" : "danger"}
              />
            </View>

            <View style={[styles.divider, { backgroundColor: C.separator }]} />

            <View style={styles.details}>
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: C.textSecondary }]}>{t("bankRefundRequests.amount")}</Text>
                <CopAmount amount={item.amountCop} positive />
              </View>
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: C.textSecondary }]}>{t("bankRefundRequests.method")}</Text>
                <Text style={[styles.detailValue, { color: C.text }]}>{METHOD_LABELS[item.refundMethod] ?? item.refundMethod}</Text>
              </View>
              {item.accountDetails ? (
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: C.textSecondary }]}>{t("bankRefundRequests.accountDetails")}</Text>
                  <Text style={[styles.detailValue, { color: C.text }]}>{item.accountDetails}</Text>
                </View>
              ) : null}
              {item.notes ? (
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: C.textSecondary }]}>{t("common.notes")}</Text>
                  <Text style={[styles.detailValue, { color: C.text }]}>{item.notes}</Text>
                </View>
              ) : null}
            </View>

            {item.status === "pending" && (
              <View style={styles.actionRow}>
                <View style={{ flex: 1 }}>
                  <Button
                    title={t("bankRefundRequests.reject")}
                    onPress={() => handleProcess(item.id, "rejected")}
                    variant="danger"
                    size="sm"
                    fullWidth
                    loading={processRequest.isPending}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    title={t("bankRefundRequests.approve")}
                    onPress={() => handleProcess(item.id, "approved")}
                    variant="success"
                    size="sm"
                    fullWidth
                    loading={processRequest.isPending}
                  />
                </View>
              </View>
            )}
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { gap: 12, marginBottom: 4 },
  pageTitle: { fontSize: 24, fontFamily: "Inter_700Bold" },
  filterRow: { flexDirection: "row", gap: 8 },
  requestHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  methodIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  braceletUid: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  meta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  divider: { height: 1, marginVertical: 12 },
  details: { gap: 8 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  detailLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  detailValue: { fontSize: 13, fontFamily: "Inter_400Regular" },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 12 },
});
