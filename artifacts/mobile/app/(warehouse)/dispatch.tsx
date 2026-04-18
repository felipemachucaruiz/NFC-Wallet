import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import React, { useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
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
import { useAlert } from "@/components/CustomAlert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Loading } from "@/components/ui/Loading";
import { Badge } from "@/components/ui/Badge";
import { useEventContext } from "@/contexts/EventContext";

type Mode = "dispatch" | "transfer";

type OrderLine = {
  productId: string;
  productName: string;
  stockOnHand: number;
  quantity: number;
};

export default function DispatchScreen() {
  const { t } = useTranslation();
  const { show: showAlert } = useAlert();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { inventoryMode } = useEventContext();

  const [mode, setMode] = useState<Mode>("dispatch");

  // Dispatch state
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [orderLines, setOrderLines] = useState<OrderLine[]>([]);
  const [addingProductId, setAddingProductId] = useState("");
  const [addingQty, setAddingQty] = useState("");
  const [dispatchNote, setDispatchNote] = useState("");

  // Transfer state — batch list model (parallel to dispatch orderLines)
  // Transfer has its own warehouse selection as product source for barcode scan
  const [transferWarehouseId, setTransferWarehouseId] = useState("");
  const [fromLocationId, setFromLocationId] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const [transferLines, setTransferLines] = useState<OrderLine[]>([]);
  const [transferProductId, setTransferProductId] = useState("");
  const [transferAddQty, setTransferAddQty] = useState("");
  const [transferNote, setTransferNote] = useState("");

  // Barcode scan state — unused refs kept for layout compatibility
  const transferBarcodeInputRef = useRef<TextInput>(null);
  const dispatchBarcodeInputRef = useRef<TextInput>(null);

  const isCentralized = inventoryMode === "centralized_warehouse";

  const { data: warehousesData } = useListWarehouses(undefined, { query: { enabled: isCentralized, queryKey: ["warehouses-dispatch", isCentralized] } });
  const warehouses = (warehousesData as { warehouses?: Array<{ id: string; name: string }> } | undefined)?.warehouses ?? [];

  const { data: locationsData } = useListLocations({}, { query: { enabled: isCentralized } });
  const { data: merchantsData } = useListMerchants({});
  const eventManagedMerchantIds = new Set(
    ((merchantsData as { merchants?: Array<{ id: string; merchantType?: string }> } | undefined)?.merchants ?? [])
      .filter((m) => m.merchantType === "event_managed" || !m.merchantType)
      .map((m) => m.id),
  );
  const allLocations = (locationsData as { locations?: Array<{ id: string; name: string; merchantId?: string }> } | undefined)?.locations ?? [];
  const locations = allLocations.filter((l) => !l.merchantId || eventManagedMerchantIds.has(l.merchantId));

  // Dispatch warehouse inventory
  const { data: dispatchInventoryData, isLoading: dispatchInventoryLoading } = useGetWarehouseInventory(selectedWarehouseId, {
    query: { enabled: !!selectedWarehouseId },
  });
  const dispatchProducts: WarehouseInventoryItem[] = (dispatchInventoryData as GetWarehouseInventory200 | undefined)?.inventory ?? [];

  // Transfer warehouse inventory (separate selection in transfer mode)
  const { data: transferInventoryData, isLoading: transferInventoryLoading } = useGetWarehouseInventory(transferWarehouseId, {
    query: { enabled: !!transferWarehouseId, queryKey: ["warehouse-inventory-transfer", transferWarehouseId] as const },
  });
  const transferProducts: WarehouseInventoryItem[] = (transferInventoryData as GetWarehouseInventory200 | undefined)?.inventory ?? [];

  const dispatch = useDispatchFromWarehouse();
  const transfer = useTransferBetweenLocations();

  // ── Shared helper: add/increment line in a batch ─────────────────────────

  const addToLines = (
    setLines: React.Dispatch<React.SetStateAction<OrderLine[]>>,
    productId: string,
    productName: string,
    stockOnHand: number,
  ) => {
    setLines((prev) => {
      const existing = prev.findIndex((l) => l.productId === productId);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { ...updated[existing], quantity: updated[existing].quantity + 1 };
        return updated;
      }
      return [...prev, { productId, productName, stockOnHand, quantity: 1 }];
    });
  };

  // ── Barcode scan handlers ─────────────────────────────────────────────────

  const handleDispatchBarcodeScan = (barcode: string) => {
    const found = dispatchProducts.find((p) => p.product?.barcode === barcode);
    if (!found) {
      showAlert(t("common.error"), t("warehouse.barcodeNotFound"));
    } else {
      addToLines(setOrderLines, found.productId, found.product?.name ?? found.productId, found.quantityOnHand);
    }
  };

  const handleTransferBarcodeScan = (barcode: string) => {
    const found = transferProducts.find((p) => p.product?.barcode === barcode);
    if (!found) {
      showAlert(t("common.error"), t("warehouse.barcodeNotFound"));
    } else {
      addToLines(setTransferLines, found.productId, found.product?.name ?? found.productId, found.quantityOnHand);
    }
  };

  // Each scanner is enabled only for the active mode — prevents both firing on a single broadcast.
  const { inputProps: dispatchBarcodeInputProps } = useBarcodeScanner({
    onScan: handleDispatchBarcodeScan,
    enabled: mode === "dispatch",
  });
  const { inputProps: transferBarcodeInputProps } = useBarcodeScanner({
    onScan: handleTransferBarcodeScan,
    enabled: mode === "transfer",
  });

  // ── Manual add-line handlers ─────────────────────────────────────────────

  const handleAddDispatchLine = () => {
    if (!addingProductId) return;
    const qty = parseInt(addingQty, 10);
    if (isNaN(qty) || qty <= 0) {
      showAlert(t("common.error"), t("warehouse.invalidQuantity"));
      return;
    }
    const product = dispatchProducts.find((p) => p.productId === addingProductId);
    if (!product) return;

    setOrderLines((prev) => {
      const existing = prev.findIndex((l) => l.productId === addingProductId);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { ...updated[existing], quantity: updated[existing].quantity + qty };
        return updated;
      }
      return [...prev, {
        productId: product.productId,
        productName: product.product?.name ?? product.productId,
        stockOnHand: product.quantityOnHand,
        quantity: qty,
      }];
    });
    setAddingProductId("");
    setAddingQty("");
  };

  const handleAddTransferLine = () => {
    if (!transferProductId) return;
    const qty = parseInt(transferAddQty, 10);
    if (isNaN(qty) || qty <= 0) {
      showAlert(t("common.error"), t("warehouse.invalidQuantity"));
      return;
    }
    const product = transferProducts.find((p) => p.productId === transferProductId);
    if (!product) return;
    setTransferLines((prev) => {
      const existing = prev.findIndex((l) => l.productId === transferProductId);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { ...updated[existing], quantity: updated[existing].quantity + qty };
        return updated;
      }
      return [...prev, {
        productId: product.productId,
        productName: product.product?.name ?? product.productId,
        stockOnHand: product.quantityOnHand,
        quantity: qty,
      }];
    });
    setTransferProductId("");
    setTransferAddQty("");
  };

  const handleRemoveLine = (setLines: React.Dispatch<React.SetStateAction<OrderLine[]>>, productId: string) => {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  };

  // ── Submit handlers ──────────────────────────────────────────────────────

  const handleDispatchOrder = async () => {
    if (!selectedWarehouseId || !selectedLocationId) {
      showAlert(t("common.error"), t("common.fillRequired"));
      return;
    }
    if (orderLines.length === 0) {
      showAlert(t("common.error"), t("warehouse.emptyOrder"));
      return;
    }

    const overStocked = orderLines.filter((l) => l.quantity > l.stockOnHand);
    if (overStocked.length > 0) {
      showAlert(t("common.error"), `${t("warehouse.insufficientStock")}: ${overStocked.map((l) => l.productName).join(", ")}`);
      return;
    }

    showAlert(
      t("warehouse.confirmDispatch"),
      `${orderLines.length} ${t("warehouse.products")}, ${t("warehouse.to")}: ${locations.find((l) => l.id === selectedLocationId)?.name ?? ""}`,
      [
        { text: t("common.cancel"), variant: "cancel" },
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
              showAlert(t("common.success"), t("warehouse.dispatchSuccess"));
            } catch {
              showAlert(t("common.error"), t("common.unknownError"));
            }
          },
        },
      ]
    );
  };

  const handleTransferOrder = async () => {
    if (!fromLocationId || !toLocationId) {
      showAlert(t("common.error"), t("common.fillRequired"));
      return;
    }
    if (transferLines.length === 0) {
      showAlert(t("common.error"), t("warehouse.emptyOrder"));
      return;
    }

    showAlert(
      t("warehouse.confirmTransfer") ?? t("warehouse.transfer"),
      `${transferLines.length} ${t("warehouse.products")}`,
      [
        { text: t("common.cancel"), variant: "cancel" },
        {
          text: t("common.confirm"),
          onPress: async () => {
            try {
              for (const line of transferLines) {
                await transfer.mutateAsync({
                  data: {
                    fromLocationId,
                    toLocationId,
                    productId: line.productId,
                    quantity: line.quantity,
                    notes: transferNote || undefined,
                  },
                });
              }
              setTransferLines([]);
              setTransferNote("");
              showAlert(t("common.success"), t("warehouse.transferSuccess"));
            } catch {
              showAlert(t("common.error"), t("common.unknownError"));
            }
          },
        },
      ]
    );
  };

  const dispatchTotal = orderLines.reduce((s, l) => s + l.quantity, 0);
  const transferTotal = transferLines.reduce((s, l) => s + l.quantity, 0);

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
    <ScrollView
      style={{ flex: 1, backgroundColor: C.background }}
      contentContainerStyle={{
        paddingTop: isWeb ? 67 : insets.top + 16,
        paddingBottom: isWeb ? 34 : insets.bottom + 80,
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

              {dispatchInventoryLoading ? (
                <Loading label={t("common.loading")} />
              ) : (
                <>
                  {/* Barcode scan-to-add */}
                  <View style={[styles.barcodeScanRow, { backgroundColor: C.inputBg, borderColor: C.border }]}>
                    <Feather name="maximize" size={15} color={C.textMuted} />
                    <TextInput
                      {...dispatchBarcodeInputProps}
                      style={[styles.barcodeScanInput, { color: C.text }]}
                      placeholder={t("warehouse.barcodeScanToAdd")}
                      placeholderTextColor={C.textMuted}
                      returnKeyType="done"
                      testID="dispatch-barcode-input"
                    />
                  </View>

                  <Text style={[styles.stepLabel, { color: C.textSecondary }]}>{t("warehouse.selectProduct")}</Text>
                  <ChipPicker
                    options={dispatchProducts.map((p) => ({
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
                      onPress={handleAddDispatchLine}
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
                    <Badge label={`${dispatchTotal} u.`} variant="info" size="sm" />
                  </View>
                  {orderLines.map((line) => {
                    const overStock = line.quantity > line.stockOnHand;
                    return (
                      <OrderLineRow
                        key={line.productId}
                        line={line}
                        overStock={overStock}
                        onRemove={() => handleRemoveLine(setOrderLines, line.productId)}
                        C={C}
                      />
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
        /* Transfer mode — batch list model with dedicated warehouse selection */
        <>
          {/* Step 1: Warehouse (product source for barcode scan) */}
          <View style={{ gap: 8 }}>
            <Text style={[styles.stepLabel, { color: C.textSecondary }]}>
              1. {t("warehouse.selectWarehouse")}
            </Text>
            <ChipPicker
              options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
              value={transferWarehouseId}
              onChange={(v) => { setTransferWarehouseId(v); setTransferLines([]); setTransferProductId(""); }}
              C={C}
              t={t}
            />
          </View>

          {/* Step 2: From location */}
          <View style={{ gap: 8 }}>
            <Text style={[styles.stepLabel, { color: C.textSecondary }]}>2. {t("warehouse.from")}</Text>
            <ChipPicker
              options={locations.map((l) => ({ value: l.id, label: l.name }))}
              value={fromLocationId}
              onChange={setFromLocationId}
              C={C}
              t={t}
            />
          </View>

          {/* Step 3: To location */}
          <View style={{ gap: 8 }}>
            <Text style={[styles.stepLabel, { color: C.textSecondary }]}>3. {t("warehouse.to")}</Text>
            <ChipPicker
              options={locations.filter((l) => l.id !== fromLocationId).map((l) => ({ value: l.id, label: l.name }))}
              value={toLocationId}
              onChange={setToLocationId}
              C={C}
              t={t}
            />
          </View>

          {/* Step 4: Build transfer order (only shown when a warehouse is selected) */}
          {!!transferWarehouseId && (
            <View style={[styles.orderSection, { backgroundColor: C.card, borderColor: C.border }]}>
              <Text style={[styles.orderSectionTitle, { color: C.text }]}>
                4. {t("warehouse.buildOrder")}
              </Text>

              {transferInventoryLoading ? (
                <Loading label={t("common.loading")} />
              ) : (
                <>
                  {/* Barcode scan-to-add — accumulates batch, qty increments on repeat scan */}
                  <View style={[styles.barcodeScanRow, { backgroundColor: C.inputBg, borderColor: C.border }]}>
                    <Feather name="maximize" size={15} color={C.textMuted} />
                    <TextInput
                      {...transferBarcodeInputProps}
                      style={[styles.barcodeScanInput, { color: C.text }]}
                      placeholder={t("warehouse.barcodeScanToAdd")}
                      placeholderTextColor={C.textMuted}
                      returnKeyType="done"
                      testID="transfer-barcode-input"
                    />
                  </View>

                  <Text style={[styles.stepLabel, { color: C.textSecondary }]}>{t("warehouse.selectProduct")}</Text>
                  <ChipPicker
                    options={transferProducts.map((p) => ({ value: p.productId, label: p.product?.name ?? p.productId }))}
                    value={transferProductId}
                    onChange={setTransferProductId}
                    C={C}
                    t={t}
                  />
                  <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-end" }}>
                    <View style={{ flex: 1 }}>
                      <Input
                        label={t("warehouse.quantityToTransfer")}
                        keyboardType="numeric"
                        value={transferAddQty}
                        onChangeText={setTransferAddQty}
                        placeholder="0"
                      />
                    </View>
                    <Button
                      title={t("warehouse.addToOrder")}
                      onPress={handleAddTransferLine}
                      variant="secondary"
                      size="md"
                    />
                  </View>
                </>
              )}

              {/* Transfer order summary */}
              {transferLines.length > 0 && (
                <View style={{ gap: 8, marginTop: 4 }}>
                  <View style={styles.orderSummaryHeader}>
                    <Text style={[styles.orderSummaryTitle, { color: C.text }]}>
                      {t("warehouse.orderSummary")}
                    </Text>
                    <Badge label={`${transferTotal} u.`} variant="info" size="sm" />
                  </View>
                  {transferLines.map((line) => (
                    <OrderLineRow
                      key={line.productId}
                      line={line}
                      overStock={false}
                      onRemove={() => handleRemoveLine(setTransferLines, line.productId)}
                      C={C}
                    />
                  ))}
                </View>
              )}
            </View>
          )}

          <Input
            label={`${t("warehouse.note")} (${t("common.optional")})`}
            value={transferNote}
            onChangeText={setTransferNote}
            placeholder={t("warehouse.additionalNote")}
          />
          <Button
            title={transferLines.length > 0
              ? `${t("warehouse.transfer")} ${transferLines.length} ${t("warehouse.products")}`
              : t("warehouse.transfer")}
            onPress={handleTransferOrder}
            variant="primary"
            size="lg"
            fullWidth
            loading={transfer.isPending}
            disabled={transferLines.length === 0 || !fromLocationId || !toLocationId}
          />
        </>
      )}
    </ScrollView>
  );
}

function OrderLineRow({
  line,
  overStock,
  onRemove,
  C,
}: {
  line: OrderLine;
  overStock: boolean;
  onRemove: () => void;
  C: typeof Colors.light;
}) {
  return (
    <View style={[lineStyles.row, {
      backgroundColor: overStock ? C.dangerLight : C.inputBg,
      borderColor: overStock ? C.danger + "66" : C.border,
    }]}>
      <View style={{ flex: 1 }}>
        <Text style={[lineStyles.name, { color: overStock ? C.danger : C.text }]}>
          {line.productName}
        </Text>
        <Text style={[lineStyles.meta, { color: C.textSecondary }]}>
          Stock: {line.stockOnHand}
        </Text>
      </View>
      <Text style={[lineStyles.qty, { color: overStock ? C.danger : C.text }]}>
        {line.quantity} u.
      </Text>
      <TouchableOpacity onPress={onRemove} style={lineStyles.removeBtn}>
        <Feather name="x" size={16} color={C.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}

const lineStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  name: { fontSize: 14, fontFamily: "Inter_500Medium" },
  meta: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  qty: { fontSize: 15, fontFamily: "Inter_700Bold" },
  removeBtn: { padding: 4 },
});

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
          <Text style={[styles.chipText, { color: value === opt.value ? "#0a0a0a" : C.textSecondary }]}>
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
  infoIconBox: { width: 72, height: 72, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  infoTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  infoDesc: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 21 },
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  modeToggle: { flexDirection: "row", borderRadius: 12, padding: 4 },
  modeBtn: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 10 },
  modeBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  stepLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  barcodeScanRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 12, borderWidth: 1 },
  barcodeScanInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100, borderWidth: 1 },
  chipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  noOptions: { fontSize: 13, fontFamily: "Inter_400Regular", paddingVertical: 8 },
  orderSection: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 14 },
  orderSectionTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  orderSummaryHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  orderSummaryTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
