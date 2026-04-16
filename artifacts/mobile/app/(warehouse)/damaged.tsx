import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  FlatList,
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
  useLogDamagedGoods,
} from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { useAlert } from "@/components/CustomAlert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Empty } from "@/components/ui/Empty";
import { extractErrorMessage } from "@/utils/errorMessage";
import { Input } from "@/components/ui/Input";
import { Loading } from "@/components/ui/Loading";
import { useEventContext } from "@/contexts/EventContext";

const REASON_CODES = ["damaged", "lost", "expired"] as const;
type ReasonCode = (typeof REASON_CODES)[number];

export default function DamagedGoodsScreen() {
  const { t } = useTranslation();
  const { show: showAlert } = useAlert();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { inventoryMode } = useEventContext();
  const isCentralized = inventoryMode === "centralized_warehouse";

  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState<ReasonCode>("damaged");
  const [notes, setNotes] = useState("");
  const [formVisible, setFormVisible] = useState(false);

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

  const logDamaged = useLogDamagedGoods();

  const handleOpenForm = () => {
    setSelectedProductId("");
    setQuantity("");
    setReason("damaged");
    setNotes("");
    setFormVisible(true);
  };

  const handleSubmit = async () => {
    const qty = parseInt(quantity, 10);
    if (!selectedProductId) {
      showAlert(t("common.error"), t("common.fillRequired"));
      return;
    }
    if (isNaN(qty) || qty <= 0) {
      showAlert(t("common.error"), t("warehouse.invalidQuantity"));
      return;
    }
    try {
      await logDamaged.mutateAsync({
        data: {
          warehouseId: activeWarehouseId,
          productId: selectedProductId,
          quantity: qty,
          reason,
          notes: notes || undefined,
        },
      });
      setFormVisible(false);
      refetch();
      showAlert(t("common.success"), t("warehouse.damagedGoodsSuccess"));
    } catch (err: unknown) {
      showAlert(t("common.error"), extractErrorMessage(err, t("common.unknownError")));
    }
  };

  const reasonLabel: Record<ReasonCode, string> = {
    damaged: t("warehouse.reasonDamaged"),
    lost: t("warehouse.reasonLost"),
    expired: t("warehouse.reasonExpired"),
  };

  const reasonVariant: Record<ReasonCode, "danger" | "warning" | "muted"> = {
    damaged: "danger",
    lost: "warning",
    expired: "muted",
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
            <Text style={[styles.title, { color: C.text }]}>{t("warehouse.damagedGoods")}</Text>
            <Text style={[styles.subtitle, { color: C.textSecondary }]}>{t("warehouse.damagedGoodsSubtitle")}</Text>
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
              title={t("warehouse.logDamagedGoods")}
              onPress={handleOpenForm}
              variant="danger"
              size="sm"
              fullWidth
            />
          </View>
        )}
        ListEmptyComponent={() => <Empty icon="alert-triangle" title={t("warehouse.noStock")} />}
        scrollEnabled={!!inventoryItems.length}
        renderItem={({ item }) => {
          const isOut = item.quantityOnHand === 0;
          return (
            <View style={[styles.itemCard, { backgroundColor: C.card, borderColor: isOut ? C.danger + "44" : C.border }]}>
              <View style={[styles.itemIcon, { backgroundColor: isOut ? C.dangerLight : C.primaryLight }]}>
                <Feather name="package" size={20} color={isOut ? C.danger : C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemName, { color: C.text }]}>{item.product?.name ?? item.productId}</Text>
                <Text style={[styles.itemMeta, { color: C.textMuted }]}>{t("warehouse.inWarehouse")}</Text>
              </View>
              <Text style={[styles.qty, { color: isOut ? C.danger : C.text }]}>{item.quantityOnHand}</Text>
            </View>
          );
        }}
      />

      {formVisible && (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(0,0,0,0.5)" }]}>
          <View style={[styles.sheet, { backgroundColor: C.background }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: C.text }]}>{t("warehouse.logDamagedGoods")}</Text>
              <Pressable onPress={() => setFormVisible(false)}>
                <Feather name="x" size={22} color={C.textSecondary} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 40 }}>
              <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>{t("warehouse.selectProduct")}</Text>
              <View style={{ gap: 8 }}>
                {inventoryItems.map((p) => (
                  <Pressable
                    key={p.productId}
                    onPress={() => setSelectedProductId(p.productId)}
                    style={[styles.productChip, {
                      backgroundColor: selectedProductId === p.productId ? C.dangerLight : C.card,
                      borderColor: selectedProductId === p.productId ? C.danger : C.border,
                    }]}
                  >
                    <Text style={[styles.productChipText, { color: selectedProductId === p.productId ? C.danger : C.text }]}>
                      {p.product?.name ?? p.productId}
                    </Text>
                    <Text style={[{ fontSize: 12, fontFamily: "Inter_400Regular", color: C.textSecondary }]}>
                      {p.quantityOnHand} {t("warehouse.inWarehouse").toLowerCase()}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Input
                label={t("common.quantity")}
                keyboardType="numeric"
                value={quantity}
                onChangeText={setQuantity}
                placeholder="0"
              />

              <View style={{ gap: 8 }}>
                <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>{t("warehouse.reasonCode")}</Text>
                <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                  {REASON_CODES.map((rc) => (
                    <Pressable
                      key={rc}
                      onPress={() => setReason(rc)}
                      style={[styles.reasonChip, {
                        backgroundColor: reason === rc ? C.dangerLight : C.card,
                        borderColor: reason === rc ? C.danger : C.border,
                      }]}
                    >
                      <Text style={[styles.reasonChipText, { color: reason === rc ? C.danger : C.textSecondary }]}>
                        {reasonLabel[rc]}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Badge label={reasonLabel[reason]} variant={reasonVariant[reason]} size="sm" />
              </View>

              <Input
                label={`${t("warehouse.note")} (${t("common.optional")})`}
                value={notes}
                onChangeText={setNotes}
                placeholder={t("warehouse.additionalNote")}
              />

              <Button
                title={t("warehouse.confirmDamagedGoods")}
                onPress={handleSubmit}
                variant="danger"
                size="lg"
                fullWidth
                loading={logDamaged.isPending}
              />
            </ScrollView>
          </View>
        </View>
      )}
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
  sheet: { position: "absolute", bottom: 0, left: 0, right: 0, maxHeight: "85%", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#ccc", alignSelf: "center", marginBottom: 16 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  sectionLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  productChip: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  productChipText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  reasonChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100, borderWidth: 1 },
  reasonChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
});
