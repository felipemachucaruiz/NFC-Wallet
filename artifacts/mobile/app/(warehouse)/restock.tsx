import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { FlatList, Platform, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useListRestockOrders, useUpdateRestockOrder } from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { useAlert } from "@/components/CustomAlert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Empty } from "@/components/ui/Empty";
import { Loading } from "@/components/ui/Loading";
import { formatDate } from "@/utils/format";
import { useEventContext } from "@/contexts/EventContext";

export default function RestockOrdersScreen() {
  const { t } = useTranslation();
  const { show: showAlert } = useAlert();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { inventoryMode } = useEventContext();

  const isCentralized = inventoryMode === "centralized_warehouse";

  const { data, isLoading, refetch } = useListRestockOrders({ status: "pending" }, { query: { enabled: isCentralized } });
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
    showAlert(
      status === "approved" ? t("warehouse.approveRestock") : t("warehouse.rejectRestock"),
      t("warehouse.confirmAction"),
      [
        { text: t("common.cancel"), variant: "cancel" },
        {
          text: t("common.confirm"),
          variant: status === "rejected" ? "danger" : "primary",
          onPress: async () => {
            try {
              await updateOrder.mutateAsync({ orderId, data: { status } });
              refetch();
            } catch {
              showAlert(t("common.error"), t("common.unknownError"));
            }
          },
        },
      ]
    );
  };

  if (isLoading) return <Loading label={t("common.loading")} />;

  if (inventoryMode === "location_based") {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: C.background,
          paddingTop: isWeb ? 67 : insets.top + 32,
          paddingBottom: isWeb ? 34 : insets.bottom + 80,
          paddingHorizontal: 28,
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
        }}
      >
        <View style={[styles.infoIconBox, { backgroundColor: C.warningLight }]}>
          <Feather name="info" size={32} color={C.warning} />
        </View>
        <Text style={[styles.infoTitle, { color: C.text }]}>{t("eventAdmin.locationBasedModeActive")}</Text>
        <Text style={[styles.infoDesc, { color: C.textSecondary }]}>{t("eventAdmin.locationBasedModeInfo")}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={orders}
      keyExtractor={(item) => item.id}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        paddingTop: isWeb ? 67 : insets.top + 16,
        paddingBottom: isWeb ? 34 : insets.bottom + 80,
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
  infoIconBox: { width: 72, height: 72, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  infoTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  infoDesc: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 21 },
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
