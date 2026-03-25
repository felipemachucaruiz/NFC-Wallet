import { Feather } from "@expo/vector-icons";
import React from "react";
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
import { useListRestockOrders, useUpdateRestockOrder } from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Empty } from "@/components/ui/Empty";
import { Loading } from "@/components/ui/Loading";
import { formatDate } from "@/utils/format";

export default function RestockOrdersScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const { data, isLoading, refetch } = useListRestockOrders({ status: "pending" });
  const orders = (data as {
    orders?: Array<{
      id: string;
      product: { name: string };
      location: { name: string };
      requestedQty: number;
      status: string;
      requestedAt: string;
      note: string | null;
    }>
  } | undefined)?.orders ?? [];

  const updateOrder = useUpdateRestockOrder();

  const handleUpdate = async (orderId: string, status: "approved" | "rejected") => {
    Alert.alert(
      status === "approved" ? t("warehouse.approveRestock") : t("warehouse.rejectRestock"),
      "¿Confirmar?",
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.confirm"),
          style: status === "rejected" ? "destructive" : "default",
          onPress: async () => {
            try {
              await updateOrder.mutateAsync({ id: orderId, status } as Parameters<typeof updateOrder.mutateAsync>[0]);
              refetch();
            } catch {
              Alert.alert(t("common.error"), t("common.unknownError"));
            }
          },
        },
      ]
    );
  };

  if (isLoading) return <Loading label={t("common.loading")} />;

  return (
    <FlatList
      data={orders}
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
        <Text style={[styles.title, { color: C.text }]}>{t("warehouse.restockOrders")}</Text>
      )}
      ListEmptyComponent={() => (
        <Empty icon="check-circle" title={t("warehouse.noRestockOrders")} />
      )}
      scrollEnabled={!!orders.length}
      renderItem={({ item }) => (
        <View style={[styles.orderCard, { backgroundColor: C.card, borderColor: C.border }]}>
          <View style={styles.orderHeader}>
            <View style={[styles.orderIcon, { backgroundColor: C.warningLight }]}>
              <Feather name="alert-circle" size={18} color={C.warning} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.productName, { color: C.text }]}>{item.product.name}</Text>
              <Text style={[styles.locationName, { color: C.textSecondary }]}>{item.location.name}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={[styles.qty, { color: C.text }]}>{item.requestedQty} u.</Text>
              <Text style={[styles.date, { color: C.textMuted }]}>{formatDate(item.requestedAt)}</Text>
            </View>
          </View>
          {item.note ? (
            <Text style={[styles.note, { color: C.textSecondary }]}>{item.note}</Text>
          ) : null}
          <View style={styles.actions}>
            <Button
              title={t("warehouse.rejectRestock")}
              onPress={() => handleUpdate(item.id, "rejected")}
              variant="danger"
              size="sm"
            />
            <Button
              title={t("warehouse.approveRestock")}
              onPress={() => handleUpdate(item.id, "approved")}
              variant="success"
              size="sm"
            />
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontFamily: "Inter_700Bold", marginBottom: 4 },
  orderCard: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 12 },
  orderHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  orderIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  productName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  locationName: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  qty: { fontSize: 18, fontFamily: "Inter_700Bold" },
  date: { fontSize: 11, fontFamily: "Inter_400Regular" },
  note: { fontSize: 13, fontFamily: "Inter_400Regular" },
  actions: { flexDirection: "row", gap: 10, justifyContent: "flex-end" },
});
