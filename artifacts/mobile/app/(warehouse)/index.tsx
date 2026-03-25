import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
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
import { useGetWarehouseInventory, useListWarehouses } from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Loading } from "@/components/ui/Loading";

export default function WarehouseStockScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const { data: warehousesData } = useListWarehouses();
  const warehouses = (warehousesData as { warehouses?: Array<{ id: string; name: string }> } | undefined)?.warehouses ?? [];
  const firstWarehouseId = warehouses[0]?.id;

  const { data, isLoading, refetch } = useGetWarehouseInventory(firstWarehouseId ?? "", {
    query: { enabled: !!firstWarehouseId },
  });
  const items = (data as {
    items?: Array<{
      product: { id: string; name: string };
      quantityOnHand: number;
      minQuantity: number;
    }>
  } | undefined)?.items ?? [];

  if (isLoading) return <Loading label={t("common.loading")} />;

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.product.id}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        paddingTop: isWeb ? 67 : insets.top + 16,
        paddingBottom: isWeb ? 34 : insets.bottom + 100,
        paddingHorizontal: 20,
        gap: 10,
      }}
      style={{ backgroundColor: C.background }}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={C.primary} />}
      ListHeaderComponent={() => (
        <Text style={[styles.title, { color: C.text }]}>{t("warehouse.warehouseStock")}</Text>
      )}
      ListEmptyComponent={() => (
        <Empty icon="package" title="Sin stock en almacén" />
      )}
      scrollEnabled={!!items.length}
      renderItem={({ item }) => {
        const isLow = item.quantityOnHand <= item.minQuantity;
        const isOut = item.quantityOnHand === 0;
        return (
          <View style={[styles.itemCard, { backgroundColor: C.card, borderColor: isOut ? C.danger + "44" : isLow ? C.warning + "44" : C.border }]}>
            <View style={[styles.itemIcon, { backgroundColor: isOut ? C.dangerLight : isLow ? C.warningLight : C.primaryLight }]}>
              <Feather name="package" size={20} color={isOut ? C.danger : isLow ? C.warning : C.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemName, { color: C.text }]}>{item.product.name}</Text>
              <Text style={[styles.itemMeta, { color: C.textMuted }]}>
                {t("warehouse.minQty")}: {item.minQuantity}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 4 }}>
              <Text style={[styles.qty, { color: C.text }]}>{item.quantityOnHand}</Text>
              {isOut ? (
                <Badge label="Agotado" variant="danger" size="sm" />
              ) : isLow ? (
                <Badge label={t("warehouse.lowStockAlert")} variant="warning" size="sm" />
              ) : null}
            </View>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontFamily: "Inter_700Bold", marginBottom: 4 },
  itemCard: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 14, padding: 14 },
  itemIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  itemName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  itemMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  qty: { fontSize: 20, fontFamily: "Inter_700Bold" },
});
