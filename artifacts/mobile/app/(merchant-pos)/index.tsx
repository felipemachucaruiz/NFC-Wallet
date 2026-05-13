import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler, FlatList, Image, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useBarcodeScanner, BROADCAST_MODE } from "@/hooks/useBarcodeScanner";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useListLocations, useGetLocationInventory, getProductByBarcode } from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { API_BASE_URL } from "@/constants/domain";
import { CopAmount } from "@/components/CopAmount";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Loading } from "@/components/ui/Loading";
import { OfflineBanner } from "@/components/OfflineBanner";
import { useAlert } from "@/components/CustomAlert";
import { useCart } from "@/contexts/CartContext";
import { useOfflineQueue } from "@/contexts/OfflineQueueContext";
import { formatCurrency } from "@/utils/format";
import { useEventContext } from "@/contexts/EventContext";

export default function MerchantPosScreen() {
  const { t } = useTranslation();
  const { show: showAlert } = useAlert();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const { currencyCode } = useEventContext();
  const fmt = (n: number) => formatCurrency(n, currencyCode);
  const { items: cartItems, addItem, removeItem, updateQty, clearCart, total, itemCount } = useCart();
  const { pendingCount } = useOfflineQueue();

  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        if (selectedLocationId) {
          setSelectedLocationId(null);
          return true;
        }
        router.replace("/(merchant-admin)/");
        return true;
      });
      return () => subscription.remove();
    }, [selectedLocationId]),
  );

  const [activeTab, setActiveTab] = useState<"catalog" | "cart">("catalog");
  const [search, setSearch] = useState("");
  const [barcodeToast, setBarcodeToast] = useState<string | null>(null);

  // resumeFocusRef breaks the circular dep: handleBarcodeScan → resumeFocus → hook
  const resumeFocusRef = useRef<() => void>(() => {});

  const { data: locationsData, isLoading: locLoading } = useListLocations();
  const locations = (locationsData as { locations?: Array<{ id: string; name: string }> } | undefined)?.locations ?? [];

  const { data: inventoryData, isLoading: invLoading } = useGetLocationInventory(selectedLocationId ?? "", {
    query: { enabled: !!selectedLocationId },
  });
  const inventory = (inventoryData as {
    inventory?: Array<{ product: { id: string; name: string; price: number; cost: number; barcode?: string | null; imageUrl?: string | null }; quantityOnHand: number }>
  } | undefined)?.inventory ?? [];

  const filtered = inventory.filter((item) =>
    item.product.name.toLowerCase().includes(search.toLowerCase())
  );


  const showBarcodeToast = (msg: string) => {
    setBarcodeToast(msg);
    setTimeout(() => setBarcodeToast(null), 2500);
  };

  const handleBarcodeScan = useCallback(async (barcode: string) => {
    const inventoryItem = inventory.find((item) => item.product.barcode === barcode);

    if (!inventoryItem) {
      try {
        const result = await getProductByBarcode(barcode);
        const matched = inventory.find((item) => item.product.id === result.id);
        if (matched) {
          addItem({
            productId: matched.product.id,
            name: matched.product.name,
            price: matched.product.price,
            cost: matched.product.cost,
            stockAvailable: matched.quantityOnHand,
          });
          showBarcodeToast(t("pos.barcodeAdded"));
        } else {
          showAlert(t("common.error"), t("pos.barcodeNotFound"), undefined, resumeFocusRef.current);
        }
      } catch {
        showAlert(t("common.error"), t("pos.barcodeNotFound"), undefined, resumeFocusRef.current);
      }
    } else {
      addItem({
        productId: inventoryItem.product.id,
        name: inventoryItem.product.name,
        price: inventoryItem.product.price,
        cost: inventoryItem.product.cost,
        stockAvailable: inventoryItem.quantityOnHand,
      });
      showBarcodeToast(t("pos.barcodeAdded"));
    }
    resumeFocusRef.current();
  }, [inventory, addItem, t, showAlert]);

  const { inputProps: barcodeInputProps, pauseFocus: pauseBarcodeFocus, resumeFocus: resumeBarcodeFocus } = useBarcodeScanner({
    onScan: handleBarcodeScan,
    enabled: !!selectedLocationId,
    manageFocus: true,
    debounceMs: 120,
  });
  resumeFocusRef.current = resumeBarcodeFocus;

  if (!selectedLocationId) {
    return (
      <View style={[styles.container, { backgroundColor: C.background }]}>
        <OfflineBanner syncIssuesRoute={"/(merchant-pos)/sync-issues"} />
        {locLoading ? (
          <Loading label={t("common.loading")} />
        ) : (
          <ScrollView contentContainerStyle={{ padding: 20, paddingTop: isWeb ? 20 : 8, gap: 16 }}>
            <Text style={[styles.sectionTitle, { color: C.text }]}>{t("pos.selectLocation")}</Text>
            {locations.map((loc) => (
              <Card key={loc.id} onPress={() => setSelectedLocationId(loc.id)}>
                <View style={styles.locationRow}>
                  <View style={[styles.locationIcon, { backgroundColor: C.primaryLight }]}>
                    <Feather name="map-pin" size={20} color={C.primary} />
                  </View>
                  <Text style={[styles.locationName, { color: C.text }]}>{loc.name}</Text>
                  <Feather name="chevron-right" size={18} color={C.textMuted} />
                </View>
              </Card>
            ))}
            {locations.length === 0 && <Empty icon="map-pin" title={t("pos.noLocations")} />}
          </ScrollView>
        )}
      </View>
    );
  }

  const selectedLocation = locations.find((l) => l.id === selectedLocationId);

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <OfflineBanner syncIssuesRoute={"/(merchant-pos)/sync-issues"} />

      <View style={[styles.locationBar, { backgroundColor: C.card, borderBottomColor: C.border }]}>
        <Pressable onPress={() => setSelectedLocationId(null)}>
          <Feather name="chevron-left" size={18} color={C.primary} />
        </Pressable>
        <Text style={[styles.locationBarName, { color: C.text }]}>{selectedLocation?.name}</Text>
        {pendingCount > 0 && (
          <Badge label={t("pos.pendingCount", { count: pendingCount })} variant="warning" size="sm" />
        )}
      </View>

      {BROADCAST_MODE ? (
        <View style={[styles.barcodeRow, { backgroundColor: C.inputBg, borderColor: C.border }]}>
          <Feather name="maximize" size={16} color={C.primary} />
          <Text style={[styles.barcodeInput, { color: C.textSecondary }]}>{t("pos.barcodeScanBar")}</Text>
          {barcodeToast && (
            <View style={[styles.toastChip, { backgroundColor: C.primary + "22" }]}>
              <Text style={[styles.toastText, { color: C.primary }]}>{barcodeToast}</Text>
            </View>
          )}
        </View>
      ) : (
        <View style={[styles.barcodeRow, { backgroundColor: C.inputBg, borderColor: C.border }]}>
          <Feather name="maximize" size={16} color={C.textMuted} />
          <TextInput
            {...barcodeInputProps}
            style={[styles.barcodeInput, { color: C.text }]}
            placeholder={t("pos.barcodeScanBar")}
            placeholderTextColor={C.textMuted}
            returnKeyType="done"
            testID="barcode-scan-input"
          />
          {barcodeToast && (
            <View style={[styles.toastChip, { backgroundColor: C.primary + "22" }]}>
              <Text style={[styles.toastText, { color: C.primary }]}>{barcodeToast}</Text>
            </View>
          )}
        </View>
      )}

      <View style={[styles.tabRow, { borderBottomColor: C.border }]}>
        {(["catalog", "cart"] as const).map((tab) => (
          <Pressable
            key={tab}
            onPress={() => { Keyboard.dismiss(); setActiveTab(tab); }}
            style={[styles.tab, activeTab === tab && { borderBottomColor: C.primary, borderBottomWidth: 2 }]}
          >
            <Text style={[styles.tabText, { color: activeTab === tab ? C.primary : C.textSecondary }]}>
              {tab === "catalog" ? t("pos.catalog") : `${t("pos.cart")} ${itemCount > 0 ? `(${itemCount})` : ""}`}
            </Text>
          </Pressable>
        ))}
      </View>

      {activeTab === "catalog" ? (
        <View style={{ flex: 1 }}>
          <View style={[styles.searchRow, { backgroundColor: C.inputBg, borderColor: C.border }]}>
            <Feather name="search" size={16} color={C.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: C.text }]}
              placeholder={t("pos.searchProducts")}
              placeholderTextColor={C.textMuted}
              value={search}
              onChangeText={setSearch}
              onFocus={() => pauseBarcodeFocus()}
            />
          </View>
          {invLoading ? (
            <Loading label={t("common.loading")} />
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.product.id}
              numColumns={2}
              contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: isWeb ? 34 : insets.bottom + 80 }}
              columnWrapperStyle={{ gap: 10 }}
              scrollEnabled={!!filtered.length}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
              onScrollBeginDrag={() => Keyboard.dismiss()}
              ListEmptyComponent={() => <Empty icon="package" title={t("pos.noProducts")} />}
              renderItem={({ item }) => {
                const cartItem = cartItems.find((c) => c.productId === item.product.id);
                const qty = cartItem?.quantity ?? 0;
                const outOfStock = item.quantityOnHand === 0;
                const lowStock = item.quantityOnHand > 0 && item.quantityOnHand <= 5;
                return (
                  <View style={[styles.productCard, {
                    backgroundColor: C.card,
                    borderColor: outOfStock ? C.danger + "33" : qty > 0 ? C.primary + "44" : C.border,
                    borderWidth: qty > 0 ? 2 : 1,
                    flex: 1,
                  }]}>
                    {item.product.imageUrl ? (
                      <Image
                        source={{ uri: item.product.imageUrl.startsWith("/api/") ? `${API_BASE_URL}${item.product.imageUrl}` : item.product.imageUrl }}
                        style={[styles.productIconBg, { borderRadius: 12 }]}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={[styles.productIconBg, { backgroundColor: outOfStock ? C.dangerLight : C.primaryLight }]}>
                        <Feather name="package" size={24} color={outOfStock ? C.danger : C.primary} />
                      </View>
                    )}
                    <Text style={[styles.productName, { color: C.text }]} numberOfLines={2}>{item.product.name}</Text>
                    <CopAmount amount={item.product.price} size={16} />
                    <View style={styles.stockRow}>
                      {outOfStock ? (
                        <Badge label={t("pos.outOfStock")} variant="danger" size="sm" />
                      ) : lowStock ? (
                        <Badge label={`${item.quantityOnHand} ${t("pos.stock")}`} variant="warning" size="sm" />
                      ) : (
                        <Text style={[styles.stockText, { color: C.textMuted }]}>{item.quantityOnHand} {t("warehouse.units")}</Text>
                      )}
                    </View>
                    {!outOfStock && (
                      qty === 0 ? (
                        <TouchableOpacity
                          style={[styles.addBtn, { backgroundColor: C.primary }]}
                          onPress={() => {
                            pauseBarcodeFocus();
                            addItem({
                              productId: item.product.id,
                              name: item.product.name,
                              price: item.product.price,
                              cost: item.product.cost,
                              stockAvailable: item.quantityOnHand,
                            });
                          }}
                          testID={`add-product-${item.product.id}`}
                        >
                          <Feather name="plus" size={16} color="#0a0a0a" />
                        </TouchableOpacity>
                      ) : (
                        <View style={styles.qtyRow}>
                          <TouchableOpacity
                            style={[styles.qtyBtn, { backgroundColor: C.inputBg }]}
                            onPress={() => {
                              pauseBarcodeFocus();
                              updateQty(item.product.id, qty - 1);
                            }}
                          >
                            <Feather name="minus" size={14} color={C.text} />
                          </TouchableOpacity>
                          <Text style={[styles.qtyText, { color: C.text }]}>{qty}</Text>
                          <TouchableOpacity
                            style={[styles.qtyBtn, { backgroundColor: C.primary }]}
                            onPress={() => {
                              pauseBarcodeFocus();
                              addItem({
                                productId: item.product.id,
                                name: item.product.name,
                                price: item.product.price,
                                cost: item.product.cost,
                                stockAvailable: item.quantityOnHand,
                              });
                            }}
                          >
                            <Feather name="plus" size={14} color="#0a0a0a" />
                          </TouchableOpacity>
                        </View>
                      )
                    )}
                  </View>
                );
              }}
            />
          )}
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {cartItems.length === 0 ? (
            <Empty icon="shopping-cart" title={t("pos.emptyCart")} />
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: isWeb ? 34 : insets.bottom + 80 }}>
              {cartItems.map((item) => (
                <View key={item.productId} style={[styles.cartItem, { backgroundColor: C.card, borderColor: C.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cartItemName, { color: C.text }]}>{item.name}</Text>
                    <CopAmount amount={item.price} size={13} bold={false} color={C.textSecondary} />
                  </View>
                  <View style={styles.qtyRow}>
                    <TouchableOpacity style={[styles.qtyBtn, { backgroundColor: C.inputBg }]} onPress={() => { pauseBarcodeFocus(); updateQty(item.productId, item.quantity - 1); }}>
                      <Feather name="minus" size={14} color={C.text} />
                    </TouchableOpacity>
                    <Text style={[styles.qtyText, { color: C.text }]}>{item.quantity}</Text>
                    <TouchableOpacity style={[styles.qtyBtn, { backgroundColor: C.primary }]} onPress={() => { pauseBarcodeFocus(); updateQty(item.productId, item.quantity + 1); }}>
                      <Feather name="plus" size={14} color="#0a0a0a" />
                    </TouchableOpacity>
                  </View>
                  <CopAmount amount={item.price * item.quantity} size={15} />
                  <TouchableOpacity onPress={() => { pauseBarcodeFocus(); removeItem(item.productId); }}>
                    <Feather name="trash-2" size={16} color={C.danger} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {itemCount > 0 && (
        <View style={[styles.checkoutBar, {
          backgroundColor: C.card,
          borderTopColor: C.border,
          paddingBottom: isWeb ? 34 : insets.bottom + 8,
        }]}>
          <View>
            <Text style={[styles.checkoutLabel, { color: C.textSecondary }]}>{t("common.total")}</Text>
            <CopAmount amount={total} size={22} />
          </View>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <TouchableOpacity
              onPress={() => router.push({ pathname: "/(merchant-pos)/split-charge", params: { locationId: selectedLocationId } })}
              style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: C.primary }}
              testID="split-checkout-btn"
            >
              <Feather name="users" size={16} color={C.primary} />
              <Text style={{ color: C.primary, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>{t("pos.splitPayment", "Dividir")}</Text>
            </TouchableOpacity>
            <Button
              title={`${t("pos.charge")} ${fmt(total)}`}
              onPress={() => router.push({ pathname: "/(merchant-pos)/charge", params: { locationId: selectedLocationId } })}
              variant="primary"
              size="lg"
              testID="checkout-btn"
            />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  sectionTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  locationIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  locationName: { flex: 1, fontSize: 16, fontFamily: "Inter_600SemiBold" },
  locationBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  locationBarName: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  barcodeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 12, marginTop: 8, marginBottom: 2, padding: 10, borderRadius: 12, borderWidth: 1 },
  barcodeInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  toastChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100 },
  toastText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  tabRow: { flexDirection: "row", borderBottomWidth: 1, marginTop: 4 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 12 },
  tabText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8, margin: 12, marginTop: 8, padding: 10, borderRadius: 12, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  productCard: { borderRadius: 14, padding: 12, gap: 8, alignItems: "flex-start" },
  productIconBg: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  productName: { fontSize: 13, fontFamily: "Inter_600SemiBold", lineHeight: 18 },
  stockRow: { minHeight: 20 },
  stockText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  addBtn: { width: "100%", height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  qtyBtn: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  qtyText: { fontSize: 15, fontFamily: "Inter_600SemiBold", minWidth: 24, textAlign: "center" },
  cartItem: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 12, padding: 14 },
  cartItemName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  checkoutBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1 },
  checkoutLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
});
