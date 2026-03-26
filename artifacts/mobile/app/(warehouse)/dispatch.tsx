import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import {
  useListWarehouses,
  useListLocations,
  useListMerchants,
  useGetWarehouseInventory,
  useDispatchFromWarehouse,
  useTransferBetweenLocations,
} from "@workspace/api-client-react";
import type { GetWarehouseInventory200, WarehouseInventoryItem } from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Loading } from "@/components/ui/Loading";
import { Badge } from "@/components/ui/Badge";

type Mode = "dispatch" | "transfer";

type OrderLine = {
  productId: string;
  productName: string;
  stockOnHand: number;
  quantity: number;
};

export default function DispatchScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const [mode, setMode] = useState<Mode>("dispatch");

  // Dispatch state
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [orderLines, setOrderLines] = useState<OrderLine[]>([]);
  const [addingProductId, setAddingProductId] = useState("");
  const [addingQty, setAddingQty] = useState("");
  const [dispatchNote, setDispatchNote] = useState("");

  // Transfer state
  const [fromLocationId, setFromLocationId] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const [transferProductId, setTransferProductId] = useState("");
  const [transferQty, setTransferQty] = useState("");
  const [transferNote, setTransferNote] = useState("");

  const { data: warehousesData } = useListWarehouses();
  const warehouses = (warehousesData as { warehouses?: Array<{ id: string; name: string }> } | undefined)?.warehouses ?? [];

  const { data: locationsData } = useListLocations();
  const { data: merchantsData } = useListMerchants({});
  const eventManagedMerchantIds = new Set(
    ((merchantsData as { merchants?: Array<{ id: string; merchantType?: string }> } | undefined)?.merchants ?? [])
      .filter((m) => m.merchantType === "event_managed" || !m.merchantType)
      .map((m) => m.id),
  );
  const allLocations = (locationsData as { locations?: Array<{ id: string; name: string; merchantId?: string }> } | undefined)?.locations ?? [];
  const locations = allLocations.filter((l) => !l.merchantId || eventManagedMerchantIds.has(l.merchantId));

  const { data: inventoryData, isLoading: inventoryLoading } = useGetWarehouseInventory(selectedWarehouseId, {
    query: { enabled: !!selectedWarehouseId },
  });
  const warehouseProducts: WarehouseInventoryItem[] = (inventoryData as GetWarehouseInventory200 | undefined)?.inventory ?? [];

  const dispatch = useDispatchFromWarehouse();
  const transfer = useTransferBetweenLocations();

  // ── Batch dispatch helpers ────────────────────────────────────────────────

  const handleAddLine = () => {
    if (!addingProductId) return;
    const qty = parseInt(addingQty, 10);
    if (isNaN(qty) || qty <= 0) {
      Alert.alert(t("common.error"), t("warehouse.invalidQuantity"));
      return;
    }
    const product = warehouseProducts.find((p) => p.productId === addingProductId);
    if (!product) return;

    const existing = orderLines.findIndex((l) => l.productId === addingProductId);
    if (existing >= 0) {
      const updated = [...orderLines];
      updated[existing] = { ...updated[existing], quantity: updated[existing].quantity + qty };
      setOrderLines(updated);
    } else {
      setOrderLines([...orderLines, {
        productId: product.productId,
        productName: product.product?.name ?? product.productId,
        stockOnHand: product.quantityOnHand,
        quantity: qty,
      }]);
    }
    setAddingProductId("");
    setAddingQty("");
  };

  const handleRemoveLine = (productId: string) => {
    setOrderLines(orderLines.filter((l) => l.productId !== productId));
  };

  const handleDispatchOrder = async () => {
    if (!selectedWarehouseId || !selectedLocationId) {
      Alert.alert(t("common.error"), t("common.fillRequired"));
      return;
    }
    if (orderLines.length === 0) {
      Alert.alert(t("common.error"), t("warehouse.emptyOrder"));
      return;
    }

    const overStocked = orderLines.filter((l) => l.quantity > l.stockOnHand);
    if (overStocked.length > 0) {
      Alert.alert(t("common.error"), `${t("warehouse.insufficientStock")}: ${overStocked.map((l) => l.productName).join(", ")}`);
      return;
    }

    Alert.alert(
      t("warehouse.confirmDispatch"),
      `${orderLines.length} ${t("warehouse.products")}, ${t("warehouse.to")}: ${locations.find((l) => l.id === selectedLocationId)?.name ?? ""}`,
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.confirm"),
          onPress: async () => {
            try {
              for (const line of orderLines) {
                await dispatch.mutateAsync({
                  data: {
                    warehouseId: selectedWarehouseId,
                    productId: line.productId,
                    locationId: selectedLocationId,
                    quantity: line.quantity,
                    notes: dispatchNote || undefined,
                  },
                });
              }
              setOrderLines([]);
              setDispatchNote("");
              Alert.alert(t("common.success"), t("warehouse.dispatchSuccess"));
            } catch {
              Alert.alert(t("common.error"), t("common.unknownError"));
            }
          },
        },
      ]
    );
  };

  const handleTransfer = async () => {
    const qty = parseInt(transferQty, 10);
    if (!qty || qty <= 0) { Alert.alert(t("common.error"), t("warehouse.invalidQuantity")); return; }
    if (!fromLocationId || !toLocationId || !transferProductId) {
      Alert.alert(t("common.error"), t("common.fillRequired")); return;
    }
    try {
      await transfer.mutateAsync({
        data: {
          fromLocationId,
          toLocationId,
          productId: transferProductId,
          quantity: qty,
          notes: transferNote || undefined,
        },
      });
      setTransferQty("");
      setTransferNote("");
      Alert.alert(t("common.success"), t("warehouse.transferSuccess"));
    } catch {
      Alert.alert(t("common.error"), t("common.unknownError"));
    }
  };

  const orderTotal = orderLines.reduce((s, l) => s + l.quantity, 0);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.background }}
      contentContainerStyle={{
        paddingTop: isWeb ? 67 : insets.top + 16,
        paddingBottom: isWeb ? 34 : insets.bottom + 100,
        paddingHorizontal: 20,
        gap: 20,
      }}
    >
      <Text style={[styles.title, { color: C.text }]}>
        {mode === "dispatch" ? t("warehouse.dispatch") : t("warehouse.transfer")}
      </Text>

      {/* Mode toggle */}
      <View style={[styles.modeToggle, { backgroundColor: C.inputBg }]}>
        {(["dispatch", "transfer"] as Mode[]).map((m) => (
          <Pressable
            key={m}
            onPress={() => setMode(m)}
            style={[styles.modeBtn, mode === m && { backgroundColor: C.card, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 }]}
          >
            <Text style={[styles.modeBtnText, { color: mode === m ? C.primary : C.textSecondary }]}>
              {m === "dispatch" ? t("warehouse.dispatch") : t("warehouse.transfer")}
            </Text>
          </Pressable>
        ))}
      </View>

      {mode === "dispatch" ? (
        <>
          {/* Step 1: Warehouse */}
          <View style={{ gap: 8 }}>
            <Text style={[styles.stepLabel, { color: C.textSecondary }]}>
              1. {t("warehouse.selectWarehouse")}
            </Text>
            <ChipPicker
              options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
              value={selectedWarehouseId}
              onChange={(v) => { setSelectedWarehouseId(v); setOrderLines([]); setAddingProductId(""); }}
              C={C}
              t={t}
            />
          </View>

          {/* Step 2: Destination location */}
          <View style={{ gap: 8 }}>
            <Text style={[styles.stepLabel, { color: C.textSecondary }]}>
              2. {t("warehouse.selectLocation")}
            </Text>
            <ChipPicker
              options={locations.map((l) => ({ value: l.id, label: l.name }))}
              value={selectedLocationId}
              onChange={setSelectedLocationId}
              C={C}
              t={t}
            />
          </View>

          {/* Step 3: Add products to order */}
          {!!selectedWarehouseId && (
            <View style={[styles.orderSection, { backgroundColor: C.card, borderColor: C.border }]}>
              <Text style={[styles.orderSectionTitle, { color: C.text }]}>
                3. {t("warehouse.buildOrder")}
              </Text>

              {inventoryLoading ? (
                <Loading label={t("common.loading")} />
              ) : (
                <>
                  <Text style={[styles.stepLabel, { color: C.textSecondary }]}>{t("warehouse.selectProduct")}</Text>
                  <ChipPicker
                    options={warehouseProducts.map((p) => ({
                      value: p.productId,
                      label: `${p.product?.name ?? p.productId} (${p.quantityOnHand} u.)`,
                    }))}
                    value={addingProductId}
                    onChange={setAddingProductId}
                    C={C}
                    t={t}
                  />
                  <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-end" }}>
                    <View style={{ flex: 1 }}>
                      <Input
                        label={t("warehouse.quantityToDispatch")}
                        keyboardType="numeric"
                        value={addingQty}
                        onChangeText={setAddingQty}
                        placeholder="0"
                      />
                    </View>
                    <Button
                      title={t("warehouse.addToOrder")}
                      onPress={handleAddLine}
                      variant="secondary"
                      size="md"
                    />
                  </View>
                </>
              )}

              {/* Order summary */}
              {orderLines.length > 0 && (
                <View style={{ gap: 8, marginTop: 4 }}>
                  <View style={styles.orderSummaryHeader}>
                    <Text style={[styles.orderSummaryTitle, { color: C.text }]}>
                      {t("warehouse.orderSummary")}
                    </Text>
                    <Badge label={`${orderTotal} u.`} variant="info" size="sm" />
                  </View>
                  {orderLines.map((line) => {
                    const overStock = line.quantity > line.stockOnHand;
                    return (
                      <View key={line.productId} style={[styles.orderLine, {
                        backgroundColor: overStock ? C.dangerLight : C.inputBg,
                        borderColor: overStock ? C.danger + "66" : C.border,
                      }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.orderLineName, { color: overStock ? C.danger : C.text }]}>
                            {line.productName}
                          </Text>
                          <Text style={[styles.orderLineMeta, { color: C.textSecondary }]}>
                            {t("warehouse.inWarehouse")}: {line.stockOnHand}
                          </Text>
                        </View>
                        <Text style={[styles.orderLineQty, { color: overStock ? C.danger : C.text }]}>
                          {line.quantity} u.
                        </Text>
                        <Pressable onPress={() => handleRemoveLine(line.productId)} style={styles.removeLine}>
                          <Feather name="x" size={16} color={C.textSecondary} />
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {/* Note */}
          <Input
            label={`${t("warehouse.note")} (${t("common.optional")})`}
            value={dispatchNote}
            onChangeText={setDispatchNote}
            placeholder={t("warehouse.additionalNote")}
          />

          <Button
            title={orderLines.length > 0 ? `${t("warehouse.dispatch")} ${orderLines.length} ${t("warehouse.products")}` : t("warehouse.dispatch")}
            onPress={handleDispatchOrder}
            variant="primary"
            size="lg"
            fullWidth
            loading={dispatch.isPending}
            disabled={orderLines.length === 0 || !selectedWarehouseId || !selectedLocationId}
          />
        </>
      ) : (
        /* Transfer mode — single product */
        <>
          <View style={{ gap: 8 }}>
            <Text style={[styles.stepLabel, { color: C.textSecondary }]}>{t("warehouse.from")}</Text>
            <ChipPicker
              options={locations.map((l) => ({ value: l.id, label: l.name }))}
              value={fromLocationId}
              onChange={setFromLocationId}
              C={C}
              t={t}
            />
          </View>
          <View style={{ gap: 8 }}>
            <Text style={[styles.stepLabel, { color: C.textSecondary }]}>{t("warehouse.to")}</Text>
            <ChipPicker
              options={locations.filter((l) => l.id !== fromLocationId).map((l) => ({ value: l.id, label: l.name }))}
              value={toLocationId}
              onChange={setToLocationId}
              C={C}
              t={t}
            />
          </View>
          <View style={{ gap: 8 }}>
            <Text style={[styles.stepLabel, { color: C.textSecondary }]}>{t("warehouse.selectProduct")}</Text>
            <ChipPicker
              options={warehouseProducts.map((p) => ({ value: p.productId, label: p.product?.name ?? p.productId }))}
              value={transferProductId}
              onChange={setTransferProductId}
              C={C}
              t={t}
            />
          </View>
          <Input
            label={t("warehouse.quantityToTransfer")}
            keyboardType="numeric"
            value={transferQty}
            onChangeText={setTransferQty}
            placeholder="0"
          />
          <Input
            label={`${t("warehouse.note")} (${t("common.optional")})`}
            value={transferNote}
            onChangeText={setTransferNote}
            placeholder={t("warehouse.additionalNote")}
          />
          <Button
            title={t("warehouse.transfer")}
            onPress={handleTransfer}
            variant="primary"
            size="lg"
            fullWidth
            loading={transfer.isPending}
          />
        </>
      )}
    </ScrollView>
  );
}

function ChipPicker({
  options,
  value,
  onChange,
  C,
  t,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (v: string) => void;
  C: typeof Colors.light;
  t: (key: string) => string;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -4 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 4 }}>
      {options.map((opt) => (
        <Pressable
          key={opt.value}
          onPress={() => onChange(opt.value)}
          style={[
            styles.chip,
            {
              backgroundColor: value === opt.value ? C.primary : C.inputBg,
              borderColor: value === opt.value ? C.primary : C.border,
            },
          ]}
        >
          <Text style={[styles.chipText, { color: value === opt.value ? "#fff" : C.textSecondary }]}>
            {opt.label}
          </Text>
        </Pressable>
      ))}
      {options.length === 0 && (
        <Text style={[styles.noOptions, { color: C.textMuted }]}>{t("common.noOptions")}</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  modeToggle: { flexDirection: "row", borderRadius: 12, padding: 4 },
  modeBtn: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 10 },
  modeBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  stepLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100, borderWidth: 1 },
  chipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  noOptions: { fontSize: 13, fontFamily: "Inter_400Regular", paddingVertical: 8 },
  orderSection: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 14 },
  orderSectionTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  orderSummaryHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  orderSummaryTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  orderLine: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  orderLineName: { fontSize: 14, fontFamily: "Inter_500Medium" },
  orderLineMeta: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  orderLineQty: { fontSize: 15, fontFamily: "Inter_700Bold" },
  removeLine: { padding: 4 },
});
