import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import { FlatList, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import {
  useGetWarehouseInventory,
  useListWarehouses,
  useUpdateWarehouseInventory,
} from "@workspace/api-client-react";
import type { GetWarehouseInventory200, WarehouseInventoryItem } from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { useAlert } from "@/components/CustomAlert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Empty } from "@/components/ui/Empty";
import { Input } from "@/components/ui/Input";
import { Loading } from "@/components/ui/Loading";
import { useEventContext } from "@/contexts/EventContext";

export default function WarehouseStockScreen() {
  const { t } = useTranslation();
  const { show: showAlert } = useAlert();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { inventoryMode } = useEventContext();

  const [receiveModalVisible, setReceiveModalVisible] = useState(false);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [receiveQty, setReceiveQty] = useState("");
  const [receiveNote, setReceiveNote] = useState("");

  // Barcode scan-to-fill in receive modal
  const [barcodeScan, setBarcodeScan] = useState("");

  const isCentralized = inventoryMode === "centralized_warehouse";

  const { data: warehousesData } = useListWarehouses(undefined, { query: { enabled: isCentralized, queryKey: ["warehouses-stock", isCentralized] } });
  const warehouses = (warehousesData as { warehouses?: Array<{ id: string; name: string }> } | undefined)?.warehouses ?? [];
  const activeWarehouseId = selectedWarehouseId || warehouses[0]?.id || "";

  const { data, isLoading, refetch } = useGetWarehouseInventory(activeWarehouseId, {
    query: { enabled: !!activeWarehouseId && isCentralized },
  });
  const items: WarehouseInventoryItem[] = (data as GetWarehouseInventory200 | undefined)?.inventory ?? [];

  const updateWarehouse = useUpdateWarehouseInventory();

  const handleOpenReceive = () => {
    setSelectedProductId("");
    setReceiveQty("");
    setReceiveNote("");
    setBarcodeScan("");
    setReceiveModalVisible(true);
  };

  const handleBarcodeScanInModal = (barcode: string) => {
    const trimmed = barcode.trim();
    setBarcodeScan("");
    if (!trimmed) return;
    const found = items.find((p) => p.product?.barcode === trimmed);
    if (found) {
      setSelectedProductId(found.productId);
    } else {
      showAlert(t("common.error"), t("warehouse.barcodeNotFound"));
    }
  };

  const handleReceive = async () => {
    const qty = parseInt(receiveQty, 10);
    if (!selectedProductId) {
      showAlert(t("common.error"), t("common.fillRequired"));
      return;
    }
    if (isNaN(qty) || qty <= 0) {
      showAlert(t("common.error"), t("warehouse.invalidQuantity"));
      return;
    }
    try {
      await updateWarehouse.mutateAsync({
        warehouseId: activeWarehouseId,
        data: { productId: selectedProductId, quantityDelta: qty },
      });
      setReceiveModalVisible(false);
      refetch();
      showAlert(t("common.success"), t("warehouse.receiveSuccess"));
    } catch {
      showAlert(t("common.error"), t("common.unknownError"));
    }
  };

  if (isLoading && !items.length) return <Loading label={t("common.loading")} />;

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
    <>
      <FlatList
        data={items}
        keyExtractor={(item) => item.productId}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingTop: isWeb ? 67 : insets.top + 16,
          paddingBottom: isWeb ? 34 : insets.bottom + 80,
          paddingHorizontal: 20,
          gap: 10,
        }}
        style={{ backgroundColor: C.background }}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={C.primary} />}
        ListHeaderComponent={() => (
          <View style={styles.header}>
            <Text style={[styles.title, { color: C.text }]}>{t("warehouse.warehouseStock")}</Text>
            {warehouses.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }} contentContainerStyle={{ gap: 8 }}>
                {warehouses.map((w) => (
                  <Pressable
                    key={w.id}
                    onPress={() => setSelectedWarehouseId(w.id)}
                    style={[styles.whChip, {
                      backgroundColor: activeWarehouseId === w.id ? C.primary : C.inputBg,
                      borderColor: activeWarehouseId === w.id ? C.primary : C.border,
                    }]}
                  >
                    <Text style={[styles.whChipText, { color: activeWarehouseId === w.id ? "#0a0a0a" : C.textSecondary }]}>
                      {w.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            <Button
              title={t("warehouse.receiveGoods")}
              onPress={handleOpenReceive}
              variant="primary"
              size="sm"
              fullWidth
            />
          </View>
        )}
        ListEmptyComponent={() => (
          <Empty icon="package" title={t("warehouse.noStock")} />
        )}
        scrollEnabled={!!items.length}
        renderItem={({ item }) => {
          const isOut = item.quantityOnHand === 0;
          const isLow = !isOut && item.quantityOnHand <= 10;
          return (
            <View style={[styles.itemCard, { backgroundColor: C.card, borderColor: isOut ? C.danger + "44" : isLow ? C.warning + "44" : C.border }]}>
              <View style={[styles.itemIcon, { backgroundColor: isOut ? C.dangerLight : isLow ? C.warningLight : C.primaryLight }]}>
                <Feather name="package" size={20} color={isOut ? C.danger : isLow ? C.warning : C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemName, { color: C.text }]}>{item.product?.name ?? item.productId}</Text>
                <Text style={[styles.itemMeta, { color: C.textMuted }]}>
                  {t("warehouse.inWarehouse")}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <Text style={[styles.qty, { color: isOut ? C.danger : isLow ? C.warning : C.success }]}>{item.quantityOnHand}</Text>
                {isOut ? (
                  <Badge label={t("warehouse.outOfStock")} variant="danger" size="sm" />
                ) : isLow ? (
                  <Badge label={t("warehouse.lowStockAlert")} variant="warning" size="sm" />
                ) : null}
              </View>
            </View>
          );
        }}
      />

      <Modal
        visible={receiveModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setReceiveModalVisible(false)}
      >
        <View style={[styles.modal, { backgroundColor: C.background }]}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: C.text }]}>{t("warehouse.receiveGoods")}</Text>
            <Pressable onPress={() => setReceiveModalVisible(false)}>
              <Feather name="x" size={22} color={C.textSecondary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 40 }}>
            {/* Barcode scan-to-fill row */}
            <View style={[styles.barcodeScanRow, { backgroundColor: C.inputBg, borderColor: C.border }]}>
              <Feather name="maximize" size={16} color={C.textMuted} />
              <TextInput
                style={[styles.barcodeScanInput, { color: C.text }]}
                placeholder={t("warehouse.barcodeScanToAdd")}
                placeholderTextColor={C.textMuted}
                value={barcodeScan}
                onChangeText={setBarcodeScan}
                onSubmitEditing={() => handleBarcodeScanInModal(barcodeScan)}
                returnKeyType="done"
                blurOnSubmit={false}
                testID="warehouse-receive-barcode-input"
              />
            </View>

            <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>{t("warehouse.selectProduct")}</Text>
            <View style={{ gap: 8 }}>
              {items.map((p) => (
                <Pressable
                  key={p.productId}
                  onPress={() => setSelectedProductId(p.productId)}
                  style={[styles.productChip, {
                    backgroundColor: selectedProductId === p.productId ? C.primaryLight : C.card,
                    borderColor: selectedProductId === p.productId ? C.primary : C.border,
                  }]}
                >
                  <Text style={[styles.productChipText, { color: selectedProductId === p.productId ? C.primary : C.text }]}>
                    {p.product?.name ?? p.productId}
                  </Text>
                  <Text style={[styles.productChipQty, { color: C.textSecondary }]}>
                    {p.quantityOnHand} {t("warehouse.inWarehouse").toLowerCase()}
                  </Text>
                </Pressable>
              ))}
              {items.length === 0 && (
                <Text style={[{ color: C.textMuted, fontSize: 13 }]}>{t("warehouse.noProducts")}</Text>
              )}
            </View>

            <Input
              label={t("warehouse.quantityReceived")}
              keyboardType="numeric"
              value={receiveQty}
              onChangeText={setReceiveQty}
              placeholder="0"
            />
            <Input
              label={`${t("warehouse.note")} (${t("common.optional")})`}
              value={receiveNote}
              onChangeText={setReceiveNote}
              placeholder={t("warehouse.additionalNote")}
            />

            <Button
              title={t("warehouse.confirmReceive")}
              onPress={handleReceive}
              variant="success"
              size="lg"
              fullWidth
              loading={updateWarehouse.isPending}
            />
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  infoIconBox: { width: 72, height: 72, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  infoTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  infoDesc: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 21 },
  header: { gap: 10, marginBottom: 4 },
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  whChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100, borderWidth: 1 },
  whChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  itemCard: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 14, padding: 14 },
  itemIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  itemName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  itemMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  qty: { fontSize: 20, fontFamily: "Inter_700Bold" },
  modal: { flex: 1, padding: 20 },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#ccc", alignSelf: "center", marginBottom: 16 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  barcodeScanRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 12, borderWidth: 1 },
  barcodeScanInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  sectionLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  productChip: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  productChipText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  productChipQty: { fontSize: 12, fontFamily: "Inter_400Regular" },
});
