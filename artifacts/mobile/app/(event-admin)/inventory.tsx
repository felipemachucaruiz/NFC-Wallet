import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useListLocations, useGetLocationInventory, useListMerchants } from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Loading } from "@/components/ui/Loading";
import { CopAmount } from "@/components/CopAmount";

type Location = {
  id: string;
  name: string;
  merchantId: string;
  eventId: string;
  active?: boolean;
};

type Merchant = {
  id: string;
  name: string;
};

type InventoryItem = {
  id: string;
  productId: string;
  quantityOnHand: number;
  restockTrigger?: number;
  restockTargetQty?: number;
  product?: {
    id: string;
    name: string;
    priceCop: number;
    category?: string;
  } | null;
};

function LocationInventoryPanel({ locationId }: { locationId: string }) {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;

  const { data, isLoading } = useGetLocationInventory(locationId);
  const items = (data as { inventory?: InventoryItem[] } | undefined)?.inventory ?? [];

  if (isLoading) {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator size="small" color={C.primary} />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <Text style={[styles.emptyLabel, { color: C.textMuted }]}>
        {t("inventory.noProductsInLocation")}
      </Text>
    );
  }

  return (
    <View style={styles.inventoryList}>
      {items.map((item) => {
        const isLow = item.restockTrigger !== undefined && item.quantityOnHand <= item.restockTrigger;
        return (
          <View key={item.id} style={[styles.productRow, { borderBottomColor: C.border }]}>
            <View style={styles.productInfo}>
              <Text style={[styles.productName, { color: C.text }]} numberOfLines={1}>
                {item.product?.name ?? t("common.unknown")}
              </Text>
              {item.product?.category ? (
                <Text style={[styles.productCategory, { color: C.textMuted }]}>
                  {item.product.category}
                </Text>
              ) : null}
              {item.product?.priceCop !== undefined ? (
                <CopAmount value={item.product.priceCop} style={[styles.productPrice, { color: C.textSecondary }]} />
              ) : null}
            </View>
            <View style={styles.qtyContainer}>
              <Text
                style={[
                  styles.qtyText,
                  { color: isLow ? C.error : C.success },
                ]}
              >
                {item.quantityOnHand}
              </Text>
              <Text style={[styles.qtyLabel, { color: C.textMuted }]}>
                {t("inventory.units")}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function LocationCard({ location }: { location: Location }) {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={[styles.locationCard, { backgroundColor: C.card, borderColor: C.border }]}>
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        style={styles.locationHeader}
        android_ripple={{ color: C.border }}
      >
        <View style={styles.locationHeaderLeft}>
          <Feather
            name="map-pin"
            size={15}
            color={location.active === false ? C.textMuted : C.primary}
          />
          <Text style={[styles.locationName, { color: C.text }]} numberOfLines={1}>
            {location.name}
          </Text>
          {location.active === false && (
            <View style={[styles.inactiveBadge, { backgroundColor: C.textMuted + "22" }]}>
              <Text style={[styles.inactiveBadgeText, { color: C.textMuted }]}>
                {t("common.inactive")}
              </Text>
            </View>
          )}
        </View>
        <Feather
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={C.textMuted}
        />
      </Pressable>

      {expanded && (
        <View style={[styles.inventoryPanel, { borderTopColor: C.border }]}>
          <LocationInventoryPanel locationId={location.id} />
        </View>
      )}
    </View>
  );
}

export default function EventAdminInventoryScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const { data: locData, isLoading: locLoading, refetch } = useListLocations({});
  const { data: merData, isLoading: merLoading } = useListMerchants({});

  const locations: Location[] = (locData as { locations?: Location[] } | undefined)?.locations ?? [];
  const merchants: Merchant[] = (merData as { merchants?: Merchant[] } | undefined)?.merchants ?? [];

  const merchantMap = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of merchants) map[m.id] = m.name;
    return map;
  }, [merchants]);

  const grouped = React.useMemo(() => {
    const groups: Record<string, Location[]> = {};
    for (const loc of locations) {
      const key = loc.merchantId;
      if (!groups[key]) groups[key] = [];
      groups[key].push(loc);
    }
    return groups;
  }, [locations]);

  const merchantIds = Object.keys(grouped);

  if (locLoading || merLoading) return <Loading label={t("common.loading")} />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.background }}
      contentContainerStyle={{
        paddingTop: isWeb ? 67 : insets.top + 16,
        paddingBottom: isWeb ? 34 : insets.bottom + 100,
        paddingHorizontal: 20,
        gap: 20,
      }}
      refreshControl={
        <RefreshControl
          refreshing={locLoading}
          onRefresh={refetch}
          tintColor={C.primary}
        />
      }
    >
      <Text style={[styles.screenTitle, { color: C.text }]}>{t("inventory.title")}</Text>
      <Text style={[styles.screenSubtitle, { color: C.textMuted }]}>
        {t("inventory.subtitle")}
      </Text>

      {merchantIds.length === 0 ? (
        <Empty label={t("inventory.noLocations")} />
      ) : (
        merchantIds.map((merchantId) => (
          <View key={merchantId} style={styles.merchantGroup}>
            <View style={styles.merchantHeader}>
              <Feather name="shopping-bag" size={14} color={C.primary} />
              <Text style={[styles.merchantName, { color: C.textSecondary }]}>
                {merchantMap[merchantId] ?? merchantId}
              </Text>
            </View>
            <View style={styles.locationsList}>
              {grouped[merchantId].map((loc) => (
                <LocationCard key={loc.id} location={loc} />
              ))}
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screenTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  screenSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: -12,
  },
  merchantGroup: {
    gap: 8,
  },
  merchantHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 2,
  },
  merchantName: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  locationsList: {
    gap: 8,
  },
  locationCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  locationHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  locationHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  locationName: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    flex: 1,
  },
  inactiveBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  inactiveBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
  },
  inventoryPanel: {
    borderTopWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 12,
  },
  loadingRow: {
    paddingVertical: 12,
    alignItems: "center",
  },
  emptyLabel: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    paddingVertical: 10,
  },
  inventoryList: {
    gap: 0,
  },
  productRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  productInfo: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  productName: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  productCategory: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  productPrice: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  qtyContainer: {
    alignItems: "center",
    minWidth: 50,
  },
  qtyText: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  qtyLabel: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
  },
});
