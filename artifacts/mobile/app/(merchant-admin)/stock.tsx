import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import React, { useState, useMemo } from "react";
import { Alert, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import {
  useListLocations,
  useGetLocationInventory,
  useUpdateLocationInventoryItem,
  useListProducts,
  useTransferBetweenLocations,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import Colors from "@/constants/colors";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Loading } from "@/components/ui/Loading";
import { Empty } from "@/components/ui/Empty";
import { useInventoryMode } from "@/hooks/useInventoryMode";
import { useMerchantType } from "@/hooks/useMerchantType";

type Location = { id: string; name: string; merchantId: string; active: boolean };

type Product = {
  id: string;
  name: string;
  category?: string | null;
  priceCop: number;
  active: boolean;
};

type InventoryItem = {
  id?: string;
  locationId: string;
  productId: string;
  product?: Product;
  quantityOnHand: number;
  restockTrigger: number;
  restockTargetQty: number;
  hasRecord: boolean;
};

function LocationInventory({
  location,
  merchantId,
  allLocations,
  C,
}: {
  location: Location;
  merchantId: string;
  allLocations: Location[];
  C: typeof Colors.light;
}) {
  const { t } = useTranslation();
  const [editTarget, setEditTarget] = useState<InventoryItem | null>(null);
  const [newQty, setNewQty] = useState("");
  const [threshold, setThreshold] = useState("");

  const [transferTarget, setTransferTarget] = useState<InventoryItem | null>(null);
  const [transferToId, setTransferToId] = useState<string>("");
  const [transferQty, setTransferQty] = useState("");

  const { data: invData, isLoading: invLoading, refetch } = useGetLocationInventory(location.id, {
    query: { enabled: !!location.id, queryKey: ["location-inventory", location.id] },
  });
  const invItems: InventoryItem[] =
    ((invData as { inventory?: InventoryItem[] } | undefined)?.inventory ?? []).map((i) => ({
      ...i,
      hasRecord: true,
    }));

  const { data: prodData, isLoading: prodLoading } = useListProducts(
    { merchantId },
    { query: { enabled: !!merchantId, queryKey: ["products-for-stock", merchantId] } },
  );
  const products: Product[] =
    ((prodData as { products?: Product[] } | undefined)?.products ?? []).filter((p) => p.active);

  const updateInventory = useUpdateLocationInventoryItem();
  const transferBetweenLocations = useTransferBetweenLocations();

  const mergedItems: InventoryItem[] = useMemo(() => {
    const invMap = new Map(invItems.map((i) => [i.productId, i]));
    return products.map((p) => {
      const existing = invMap.get(p.id);
      if (existing) return { ...existing, product: p };
      return {
        locationId: location.id,
        productId: p.id,
        product: p,
        quantityOnHand: 0,
        restockTrigger: 10,
        restockTargetQty: 50,
        hasRecord: false,
      };
    });
  }, [products, invItems, location.id]);

  const otherLocations = useMemo(
    () => allLocations.filter((l) => l.id !== location.id),
    [allLocations, location.id],
  );

  const openEdit = (item: InventoryItem) => {
    setEditTarget(item);
    setNewQty(String(item.quantityOnHand));
    setThreshold(String(item.restockTrigger));
  };

  const openTransfer = (item: InventoryItem) => {
    setTransferTarget(item);
    setTransferToId(otherLocations[0]?.id ?? "");
    setTransferQty("");
  };

  const handleSave = async () => {
    if (!editTarget) return;
    const targetQty = parseInt(newQty, 10);
    const thresh = parseInt(threshold, 10);
    if (isNaN(targetQty) || targetQty < 0) {
      Alert.alert(t("common.error"), t("merchant_admin.invalidQty"));
      return;
    }
    const delta = targetQty - editTarget.quantityOnHand;
    try {
      await updateInventory.mutateAsync({
        locationId: location.id,
        data: {
          productId: editTarget.productId,
          quantityAdjustment: delta,
          restockTrigger: !isNaN(thresh) ? thresh : undefined,
        },
      });
      Alert.alert(t("common.success"), t("merchant_admin.stockUpdated"));
      setEditTarget(null);
      refetch();
    } catch {
      Alert.alert(t("common.error"), t("common.unknownError"));
    }
  };

  const handleTransfer = async () => {
    if (!transferTarget) return;
    const qty = parseInt(transferQty, 10);
    if (isNaN(qty) || qty < 1) {
      Alert.alert(t("common.error"), t("merchant_admin.transferInvalidQty"));
      return;
    }
    if (!transferToId || transferToId === location.id) {
      Alert.alert(t("common.error"), t("merchant_admin.transferSameLocation"));
      return;
    }
    try {
      await transferBetweenLocations.mutateAsync({
        data: {
          fromLocationId: location.id,
          toLocationId: transferToId,
          productId: transferTarget.productId,
          quantity: qty,
        },
      });
      Alert.alert(t("common.success"), t("merchant_admin.transferSuccess"));
      setTransferTarget(null);
      refetch();
    } catch {
      Alert.alert(t("common.error"), t("common.unknownError"));
    }
  };

  if (invLoading || prodLoading) return <Loading />;

  if (mergedItems.length === 0) {
    return (
      <View style={{ paddingVertical: 8 }}>
        <Text style={{ color: C.textMuted, fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" }}>
          {t("merchant_admin.noProductsYet")}
        </Text>
      </View>
    );
  }

  return (
    <>
      {mergedItems.map((item) => {
        const isLow = item.restockTrigger > 0 && item.quantityOnHand <= item.restockTrigger && item.hasRecord;
        const isAlmostLow = !isLow && item.restockTrigger > 0 && item.quantityOnHand <= item.restockTrigger * 2 && item.hasRecord;
        const isNew = !item.hasRecord;
        const qtyColor = isLow ? C.danger : isAlmostLow ? C.warning : isNew ? C.primary : C.success;
        const borderColor = isLow ? C.danger + "66" : isAlmostLow ? C.warning + "66" : isNew ? C.primaryLight : C.border;
        return (
          <View key={item.productId}>
            <Pressable
              onPress={() => openEdit(item)}
              style={[styles.itemCard, { backgroundColor: C.card, borderColor }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemName, { color: C.text }]} numberOfLines={1}>
                  {item.product?.name ?? item.productId}
                </Text>
                {item.product?.category ? (
                  <Text style={[styles.itemCat, { color: C.textMuted }]}>
                    {item.product.category}
                  </Text>
                ) : null}
                {isNew && (
                  <Text style={[styles.itemCat, { color: C.primary }]}>
                    {t("merchant_admin.tapToSetStock")}
                  </Text>
                )}
              </View>
              <View style={styles.itemRight}>
                {isLow && <Feather name="alert-triangle" size={14} color={C.danger} />}
                {isAlmostLow && <Feather name="alert-triangle" size={14} color={C.warning} />}
                {isNew && <Feather name="plus-circle" size={16} color={C.primary} />}
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[styles.itemQty, { color: qtyColor }]}>
                    {item.quantityOnHand}
                  </Text>
                  {!isNew && (
                    <Text style={[styles.itemUnits, { color: C.textMuted }]}>
                      {t("merchant_admin.units")}
                    </Text>
                  )}
                </View>
                <Feather name="chevron-right" size={16} color={C.textMuted} />
              </View>
            </Pressable>
            {item.hasRecord && item.quantityOnHand > 0 && otherLocations.length > 0 && (
              <Pressable
                onPress={() => openTransfer(item)}
                style={[styles.transferBtn, { borderColor: C.primary + "55", backgroundColor: C.primaryLight }]}
              >
                <Feather name="repeat" size={12} color={C.primary} />
                <Text style={[styles.transferBtnText, { color: C.primary }]}>
                  {t("merchant_admin.transferBtn")}
                </Text>
              </Pressable>
            )}
          </View>
        );
      })}

      <Modal
        visible={!!editTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setEditTarget(null)}
      >
        <View style={styles.overlay}>
          <View style={[styles.modalCard, { backgroundColor: C.card }]}>
            <Text style={[styles.modalTitle, { color: C.text }]}>
              {editTarget?.product?.name ?? ""}
            </Text>
            <Text style={[styles.modalSub, { color: C.textSecondary }]}>
              {t("merchant_admin.currentStock")}: {editTarget?.quantityOnHand ?? 0} {t("merchant_admin.units")}
            </Text>
            <View style={{ gap: 12, marginBottom: 16 }}>
              <Input
                label={t("merchant_admin.setQtyAbsolute")}
                placeholder="0"
                value={newQty}
                onChangeText={setNewQty}
                keyboardType="number-pad"
              />
              <Input
                label={t("merchant_admin.restockTrigger")}
                placeholder="10"
                value={threshold}
                onChangeText={setThreshold}
                keyboardType="number-pad"
              />
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button
                title={t("common.cancel")}
                variant="secondary"
                onPress={() => setEditTarget(null)}
              />
              <Button
                title={t("common.save")}
                onPress={handleSave}
                loading={updateInventory.isPending}
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!transferTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setTransferTarget(null)}
      >
        <View style={styles.overlay}>
          <View style={[styles.modalCard, { backgroundColor: C.card }]}>
            <Text style={[styles.modalTitle, { color: C.text }]}>
              {t("merchant_admin.transferModalTitle")}
            </Text>
            <Text style={[styles.modalSub, { color: C.textSecondary }]}>
              {transferTarget?.product?.name ?? ""}
            </Text>
            <Text style={[styles.transferAvailable, { color: C.textMuted }]}>
              {t("merchant_admin.transferAvailable", { qty: transferTarget?.quantityOnHand ?? 0 })}
            </Text>

            <View style={{ gap: 12, marginBottom: 16 }}>
              <View>
                <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>
                  {t("merchant_admin.transferTo")}
                </Text>
                <View style={[styles.pickerContainer, { borderColor: C.border, backgroundColor: C.background }]}>
                  {otherLocations.map((loc) => (
                    <Pressable
                      key={loc.id}
                      onPress={() => setTransferToId(loc.id)}
                      style={[
                        styles.pickerOption,
                        transferToId === loc.id && { backgroundColor: C.primaryLight },
                      ]}
                    >
                      <Feather
                        name={transferToId === loc.id ? "check-circle" : "circle"}
                        size={14}
                        color={transferToId === loc.id ? C.primary : C.textMuted}
                      />
                      <Text
                        style={[
                          styles.pickerOptionText,
                          { color: transferToId === loc.id ? C.primary : C.text },
                        ]}
                        numberOfLines={1}
                      >
                        {loc.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <Input
                label={t("merchant_admin.transferQty")}
                placeholder={t("merchant_admin.transferQtyPlaceholder")}
                value={transferQty}
                onChangeText={setTransferQty}
                keyboardType="number-pad"
              />
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button
                title={t("common.cancel")}
                variant="secondary"
                onPress={() => setTransferTarget(null)}
              />
              <Button
                title={t("merchant_admin.transferStock")}
                onPress={handleTransfer}
                loading={transferBetweenLocations.isPending}
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

export default function MerchantStockScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();
  const { inventoryMode } = useInventoryMode();
  const { isExternal } = useMerchantType();

  const merchantId = user?.merchantId ?? "";

  const { data, isLoading, refetch } = useListLocations(
    { merchantId: merchantId || undefined },
    { query: { enabled: !!merchantId, queryKey: ["locations-stock", merchantId] } },
  );
  const locations: Location[] =
    (data as { locations?: Location[] } | undefined)?.locations?.filter((l) => l.active) ?? [];

  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!merchantId) return null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.background }}
      contentContainerStyle={{
        paddingTop: isWeb ? 67 : insets.top + 16,
        paddingBottom: isWeb ? 34 : insets.bottom + 100,
        paddingHorizontal: 20,
        gap: 16,
      }}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={C.primary} />}
    >
      <Text style={[styles.title, { color: C.text }]}>{t("merchant_admin.stockTitle")}</Text>
      <Text style={[styles.subtitle, { color: C.textSecondary }]}>{t("merchant_admin.stockSubtitle")}</Text>

      {isExternal ? (
        <View style={[styles.selfManagedBanner, { backgroundColor: C.primaryLight, borderColor: C.primary + "44" }]}>
          <Feather name="briefcase" size={16} color={C.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.selfManagedTitle, { color: C.primary }]}>{t("merchant_admin.externalMerchantStock")}</Text>
            <Text style={[styles.selfManagedDesc, { color: C.textSecondary }]}>{t("merchant_admin.externalMerchantStockDesc")}</Text>
          </View>
        </View>
      ) : inventoryMode === "location_based" ? (
        <View style={[styles.selfManagedBanner, { backgroundColor: C.primaryLight, borderColor: C.primary + "44" }]}>
          <Feather name="check-circle" size={16} color={C.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.selfManagedTitle, { color: C.primary }]}>{t("eventAdmin.selfManagedStock")}</Text>
            <Text style={[styles.selfManagedDesc, { color: C.textSecondary }]}>{t("eventAdmin.selfManagedStockDesc")}</Text>
          </View>
        </View>
      ) : null}

      {isLoading ? (
        <Loading />
      ) : locations.length === 0 ? (
        <Empty title={t("merchant_admin.noLocations")} />
      ) : (
        locations.map((loc) => (
          <View key={loc.id}>
            <Pressable
              onPress={() => setExpandedId(expandedId === loc.id ? null : loc.id)}
              style={[styles.locationHeader, { backgroundColor: C.card, borderColor: C.border }]}
            >
              <Feather name="map-pin" size={16} color={C.primary} />
              <Text style={[styles.locationName, { color: C.text }]} numberOfLines={1}>
                {loc.name}
              </Text>
              <Feather
                name={expandedId === loc.id ? "chevron-up" : "chevron-down"}
                size={16}
                color={C.textMuted}
              />
            </Pressable>
            {expandedId === loc.id && (
              <View style={[styles.locationBody, { borderColor: C.border }]}>
                <LocationInventory location={loc} merchantId={merchantId} allLocations={locations} C={C} />
              </View>
            )}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: -8 },
  locationHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  locationName: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  locationBody: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    padding: 12,
    gap: 8,
  },
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
  },
  itemName: { fontSize: 14, fontFamily: "Inter_500Medium" },
  itemCat: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  itemRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  itemQty: { fontSize: 18, fontFamily: "Inter_700Bold", minWidth: 32, textAlign: "right" },
  itemUnits: { fontSize: 10, fontFamily: "Inter_400Regular", textAlign: "right", marginTop: -2 },
  transferBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: "flex-end",
    marginTop: -4,
    marginBottom: 4,
  },
  transferBtnText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  transferAvailable: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_500Medium", marginBottom: 6 },
  pickerContainer: {
    borderWidth: 1,
    borderRadius: 10,
    overflow: "hidden",
  },
  pickerOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pickerOptionText: { fontSize: 14, fontFamily: "Inter_400Regular", flex: 1 },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: { borderRadius: 20, padding: 24, width: "100%", maxWidth: 400 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 4 },
  modalSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 16 },
  selfManagedBanner: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderWidth: 1, borderRadius: 12, padding: 12 },
  selfManagedTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  selfManagedDesc: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2, lineHeight: 17 },
});
