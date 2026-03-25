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
  useGetWarehouseInventory,
  useDispatchFromWarehouse,
  useTransferBetweenLocations,
} from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Loading } from "@/components/ui/Loading";

type Mode = "dispatch" | "transfer";

export default function DispatchScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const [mode, setMode] = useState<Mode>("dispatch");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [selectedToLocationId, setSelectedToLocationId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");

  const { data: warehousesData } = useListWarehouses();
  const warehouses = (warehousesData as { warehouses?: Array<{ id: string; name: string }> } | undefined)?.warehouses ?? [];

  const { data: locationsData } = useListLocations();
  const locations = (locationsData as { locations?: Array<{ id: string; name: string }> } | undefined)?.locations ?? [];

  const { data: inventoryData } = useGetWarehouseInventory(selectedWarehouseId, {
    query: { enabled: !!selectedWarehouseId },
  });
  const products = (inventoryData as {
    items?: Array<{ product: { id: string; name: string }; quantityOnHand: number }>
  } | undefined)?.items ?? [];

  const dispatch = useDispatchFromWarehouse();
  const transfer = useTransferBetweenLocations();

  const handleSubmit = async () => {
    const qty = parseInt(quantity, 10);
    if (!qty || qty <= 0) { Alert.alert(t("common.error"), t("warehouse.invalidQuantity")); return; }

    try {
      if (mode === "dispatch") {
        if (!selectedWarehouseId || !selectedProductId || !selectedLocationId) {
          Alert.alert(t("common.error"), t("common.fillRequired")); return;
        }
        await dispatch.mutateAsync({
          data: {
            warehouseId: selectedWarehouseId,
            productId: selectedProductId,
            locationId: selectedLocationId,
            quantity: qty,
            notes: note || undefined,
          },
        });
        Alert.alert(t("common.success"), t("warehouse.dispatchSuccess"));
      } else {
        if (!selectedLocationId || !selectedToLocationId || !selectedProductId) {
          Alert.alert(t("common.error"), t("common.fillRequired")); return;
        }
        await transfer.mutateAsync({
          data: {
            fromLocationId: selectedLocationId,
            toLocationId: selectedToLocationId,
            productId: selectedProductId,
            quantity: qty,
            notes: note || undefined,
          },
        });
        Alert.alert(t("common.success"), t("warehouse.transferSuccess"));
      }
      setQuantity("");
      setNote("");
    } catch {
      Alert.alert(t("common.error"), t("common.unknownError"));
    }
  };

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
      <Text style={[styles.title, { color: C.text }]}>{mode === "dispatch" ? t("warehouse.dispatch") : t("warehouse.transfer")}</Text>

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
          <SelectPicker
            label={t("warehouse.selectWarehouse")}
            options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
            value={selectedWarehouseId}
            onChange={setSelectedWarehouseId}
            C={C}
          />
          <SelectPicker
            label={t("warehouse.selectProduct")}
            options={products.map((p) => ({ value: p.product.id, label: `${p.product.name} (${p.quantityOnHand} u.)` }))}
            value={selectedProductId}
            onChange={setSelectedProductId}
            C={C}
          />
          <SelectPicker
            label={t("warehouse.selectLocation")}
            options={locations.map((l) => ({ value: l.id, label: l.name }))}
            value={selectedLocationId}
            onChange={setSelectedLocationId}
            C={C}
          />
        </>
      ) : (
        <>
          <SelectPicker
            label={t("warehouse.from")}
            options={locations.map((l) => ({ value: l.id, label: l.name }))}
            value={selectedLocationId}
            onChange={setSelectedLocationId}
            C={C}
          />
          <SelectPicker
            label={t("warehouse.to")}
            options={locations.filter(l => l.id !== selectedLocationId).map((l) => ({ value: l.id, label: l.name }))}
            value={selectedToLocationId}
            onChange={setSelectedToLocationId}
            C={C}
          />
          <SelectPicker
            label={t("warehouse.selectProduct")}
            options={products.map((p) => ({ value: p.product.id, label: p.product.name }))}
            value={selectedProductId}
            onChange={setSelectedProductId}
            C={C}
          />
        </>
      )}

      <Input
        label={mode === "dispatch" ? t("warehouse.quantityToDispatch") : t("warehouse.quantityToTransfer")}
        keyboardType="numeric"
        value={quantity}
        onChangeText={setQuantity}
        placeholder="0"
      />
      <Input
        label={`${t("warehouse.note")} (${t("common.optional")})`}
        value={note}
        onChangeText={setNote}
        placeholder={t("warehouse.additionalNote")}
      />

      <Button
        title={mode === "dispatch" ? t("warehouse.dispatch") : t("warehouse.transfer")}
        onPress={handleSubmit}
        variant="primary"
        size="lg"
        fullWidth
        loading={dispatch.isPending || transfer.isPending}
      />
    </ScrollView>
  );
}

function SelectPicker({
  label,
  options,
  value,
  onChange,
  C,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (v: string) => void;
  C: typeof Colors.light;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.pickerLabel, { color: C.textSecondary }]}>{label}</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  modeToggle: { flexDirection: "row", borderRadius: 12, padding: 4 },
  modeBtn: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 10 },
  modeBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  pickerLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100, borderWidth: 1 },
  chipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  noOptions: { fontSize: 13, fontFamily: "Inter_400Regular", paddingVertical: 8 },
});
