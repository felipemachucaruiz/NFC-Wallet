import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import {
  useListWarehouses,
  useGetWarehouseInventory,
  useCreateInventoryAudit,
} from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { useAlert } from "@/components/CustomAlert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Empty } from "@/components/ui/Empty";
import { Input } from "@/components/ui/Input";
import { Loading } from "@/components/ui/Loading";
import { useEventContext } from "@/contexts/EventContext";

type AuditItem = {
  productId: string;
  productName: string;
  systemCount: number;
  physicalCount: string;
};

export default function WarehouseAuditScreen() {
  const { t } = useTranslation();
  const { show: showAlert } = useAlert();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { inventoryMode } = useEventContext();
  const isCentralized = inventoryMode === "centralized_warehouse";

  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");
  const [auditItems, setAuditItems] = useState<AuditItem[]>([]);
  const [notes, setNotes] = useState("");
  const [reviewModalVisible, setReviewModalVisible] = useState(false);

  const { data: warehousesData } = useListWarehouses(undefined, {
    query: { enabled: isCentralized },
  });
  const warehouses = (
    warehousesData as { warehouses?: Array<{ id: string; name: string }> } | undefined
  )?.warehouses ?? [];
  const activeWarehouseId = selectedWarehouseId || warehouses[0]?.id || "";

  const { data, isLoading, refetch } = useGetWarehouseInventory(activeWarehouseId, {
    query: { enabled: !!activeWarehouseId && isCentralized },
  });
  const inventoryItems = (
    data as { inventory?: Array<{ productId: string; quantityOnHand: number; product?: { name?: string } | null }> } | undefined
  )?.inventory ?? [];

  const createAudit = useCreateInventoryAudit();

  const initAudit = () => {
    if (!inventoryItems.length) {
      showAlert(t("common.error"), t("warehouse.noProducts"));
      return;
    }
    setAuditItems(
      inventoryItems.map((item) => ({
        productId: item.productId,
        productName: item.product?.name ?? item.productId,
        systemCount: item.quantityOnHand,
        physicalCount: String(item.quantityOnHand),
      }))
    );
    setNotes("");
    setReviewModalVisible(true);
  };

  const updatePhysicalCount = (productId: string, value: string) => {
    setAuditItems((prev) =>
      prev.map((item) =>
        item.productId === productId ? { ...item, physicalCount: value } : item
      )
    );
  };

  const handleSubmitAudit = async () => {
    const parsedItems = auditItems.map((item) => ({
      productId: item.productId,
      physicalCount: parseInt(item.physicalCount, 10),
    }));

    const hasInvalid = parsedItems.some((i) => isNaN(i.physicalCount) || i.physicalCount < 0);
    if (hasInvalid) {
      showAlert(t("common.error"), t("warehouse.invalidQuantity"));
      return;
    }

    try {
      await createAudit.mutateAsync({
        data: {
          warehouseId: activeWarehouseId,
          notes: notes || undefined,
          items: parsedItems,
        },
      });
      setReviewModalVisible(false);
      refetch();
      showAlert(t("common.success"), t("warehouse.auditSuccess"));
    } catch {
      showAlert(t("common.error"), t("common.unknownError"));
    }
  };

  if (isLoading && !inventoryItems.length) return <Loading label={t("common.loading")} />;

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
        data={inventoryItems}
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
            <Text style={[styles.title, { color: C.text }]}>{t("warehouse.audit")}</Text>
            <Text style={[styles.subtitle, { color: C.textSecondary }]}>{t("warehouse.auditSubtitle")}</Text>
            {warehouses.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }} contentContainerStyle={{ gap: 8 }}>
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
              title={t("warehouse.startAudit")}
              onPress={initAudit}
              variant="primary"
              size="sm"
              fullWidth
            />
          </View>
        )}
        ListEmptyComponent={() => <Empty icon="clipboard" title={t("warehouse.noStock")} />}
        scrollEnabled={!!inventoryItems.length}
        renderItem={({ item }) => (
          <View style={[styles.itemCard, { backgroundColor: C.card, borderColor: C.border }]}>
            <View style={[styles.itemIcon, { backgroundColor: C.primaryLight }]}>
              <Feather name="package" size={20} color={C.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemName, { color: C.text }]}>{item.product?.name ?? item.productId}</Text>
              <Text style={[styles.itemMeta, { color: C.textMuted }]}>{t("warehouse.inWarehouse")}</Text>
            </View>
            <Text style={[styles.qty, { color: C.text }]}>{item.quantityOnHand}</Text>
          </View>
        )}
      />

      <Modal
        visible={reviewModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setReviewModalVisible(false)}
      >
        <View style={[styles.modal, { backgroundColor: C.background }]}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: C.text }]}>{t("warehouse.auditEntryTitle")}</Text>
            <Pressable onPress={() => setReviewModalVisible(false)}>
              <Feather name="x" size={22} color={C.textSecondary} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 40 }}>
            <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>{t("warehouse.auditEnterPhysical")}</Text>
            {auditItems.map((item) => {
              const physical = parseInt(item.physicalCount, 10);
              const delta = isNaN(physical) ? 0 : physical - item.systemCount;
              return (
                <View key={item.productId} style={[styles.auditRow, { backgroundColor: C.card, borderColor: C.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.productChipText, { color: C.text }]}>{item.productName}</Text>
                    <Text style={[styles.systemCount, { color: C.textSecondary }]}>
                      {t("warehouse.systemCount")}: {item.systemCount}
                    </Text>
                    {!isNaN(physical) && delta !== 0 && (
                      <Badge
                        label={`${delta > 0 ? "+" : ""}${delta}`}
                        variant={delta > 0 ? "success" : "danger"}
                        size="sm"
                      />
                    )}
                  </View>
                  <Input
                    keyboardType="numeric"
                    value={item.physicalCount}
                    onChangeText={(v) => updatePhysicalCount(item.productId, v)}
                    placeholder="0"
                    style={{ width: 80, textAlign: "center" }}
                  />
                </View>
              );
            })}
            <Input
              label={`${t("warehouse.note")} (${t("common.optional")})`}
              value={notes}
              onChangeText={setNotes}
              placeholder={t("warehouse.additionalNote")}
            />
            <Button
              title={t("warehouse.submitAudit")}
              onPress={handleSubmitAudit}
              variant="primary"
              size="lg"
              fullWidth
              loading={createAudit.isPending}
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
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular" },
  whChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100, borderWidth: 1 },
  whChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  itemCard: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 14, padding: 14 },
  itemIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  itemName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  itemMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  qty: { fontSize: 20, fontFamily: "Inter_700Bold" },
  modal: { flex: 1, padding: 20 },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#ccc", alignSelf: "center", marginBottom: 16 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  sectionLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  auditRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 12, borderWidth: 1 },
  productChipText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  systemCount: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
});
