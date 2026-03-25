import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
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
import {
  useListLocations,
  useGetLocationInventory,
  useGetRevenueReport,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import Colors from "@/constants/colors";
import { CopAmount } from "@/components/CopAmount";
import { Card } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { Empty } from "@/components/ui/Empty";

type Location = {
  id: string;
  name: string;
  merchantId: string;
  eventId: string;
  active: boolean;
};

export default function MerchantLocationsScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();

  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);

  const { data: locData, isLoading: locLoading, refetch } = useListLocations(
    user?.merchantId ? { merchantId: user.merchantId } : {},
    { query: { enabled: !!user?.merchantId } }
  );
  const locations = (locData as { locations?: Location[] } | undefined)?.locations?.filter((l) => l.active) ?? [];

  if (locLoading) return <Loading label={t("common.loading")} />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.background }}
      contentContainerStyle={{
        paddingTop: isWeb ? 67 : insets.top + 16,
        paddingBottom: isWeb ? 34 : insets.bottom + 100,
        paddingHorizontal: 20,
        gap: 20,
      }}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={<RefreshControl refreshing={locLoading} onRefresh={refetch} tintColor={C.primary} />}
    >
      <Text style={[styles.title, { color: C.text }]}>{t("merchant_admin.locations")}</Text>

      {locations.length === 0 ? (
        <Empty icon="map-pin" title={t("merchant_admin.noLocations")} />
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}>
            <LocationChip
              label={t("merchant_admin.allLocations")}
              selected={!selectedLocationId}
              onPress={() => setSelectedLocationId(null)}
              C={C}
            />
            {locations.map((loc) => (
              <LocationChip
                key={loc.id}
                label={loc.name}
                selected={selectedLocationId === loc.id}
                onPress={() => setSelectedLocationId(loc.id)}
                C={C}
              />
            ))}
          </ScrollView>

          {selectedLocationId ? (
            <LocationDetailPanel locationId={selectedLocationId} merchantId={user?.merchantId ?? ""} C={C} />
          ) : (
            <View style={{ gap: 12 }}>
              {locations.map((loc) => (
                <LocationSummaryCard
                  key={loc.id}
                  location={loc}
                  merchantId={user?.merchantId ?? ""}
                  onPress={() => setSelectedLocationId(loc.id)}
                  C={C}
                />
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

function LocationChip({
  label,
  selected,
  onPress,
  C,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  C: typeof Colors.light;
}) {
  return (
    <Text
      onPress={onPress}
      style={[
        styles.filterChip,
        {
          backgroundColor: selected ? C.primary : C.inputBg,
          color: selected ? "#fff" : C.textSecondary,
          borderColor: selected ? C.primary : C.border,
        },
      ]}
    >
      {label}
    </Text>
  );
}

function LocationSummaryCard({
  location,
  merchantId,
  onPress,
  C,
}: {
  location: Location;
  merchantId: string;
  onPress: () => void;
  C: typeof Colors.light;
}) {
  const { t } = useTranslation();
  const { data: revenueData } = useGetRevenueReport({ merchantId, locationId: location.id });
  const totals = (revenueData as { totals?: { grossSalesCop?: number; transactionCount?: number } } | undefined)?.totals;

  return (
    <Pressable onPress={onPress}>
      <Card>
        <View style={styles.locationCardRow}>
          <View style={[styles.locationIcon, { backgroundColor: C.primaryLight }]}>
            <Feather name="map-pin" size={18} color={C.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.locationName, { color: C.text }]}>{location.name}</Text>
            <Text style={[styles.txCount, { color: C.textSecondary }]}>
              {totals?.transactionCount ?? 0} {t("merchant_admin.transactions")}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <CopAmount amount={totals?.grossSalesCop} size={16} color={C.primary} />
          </View>
          <Feather name="chevron-right" size={16} color={C.textMuted} />
        </View>
      </Card>
    </Pressable>
  );
}

function LocationDetailPanel({
  locationId,
  merchantId,
  C,
}: {
  locationId: string;
  merchantId: string;
  C: typeof Colors.light;
}) {
  const { t } = useTranslation();

  const { data: revenueData, isLoading: revLoading } = useGetRevenueReport({ merchantId, locationId });
  const { data: invData, isLoading: invLoading } = useGetLocationInventory(locationId);

  const totals = (revenueData as {
    totals?: {
      grossSalesCop?: number;
      cogsCop?: number;
      grossProfitCop?: number;
      commissionCop?: number;
      netCop?: number;
      transactionCount?: number;
    };
  } | undefined)?.totals;

  const inventoryItems = (invData as {
    inventory?: Array<{
      productId: string;
      product?: { id: string; name: string };
      quantityOnHand: number;
      restockTrigger: number;
    }>;
  } | undefined)?.inventory ?? [];

  const topProducts = [...inventoryItems]
    .sort((a, b) => b.quantityOnHand - a.quantityOnHand)
    .slice(0, 5);

  if (revLoading || invLoading) return <Loading label={t("common.loading")} />;

  return (
    <View style={{ gap: 16 }}>
      <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>{t("merchant_admin.salesSummary")}</Text>
      <View style={styles.metricsGrid}>
        {[
          { label: t("merchant_admin.grossSales"), value: totals?.grossSalesCop, icon: "trending-up" as const, color: C.primary },
          { label: t("merchant_admin.cogs"), value: totals?.cogsCop, icon: "package" as const, color: C.textSecondary },
          { label: t("merchant_admin.grossProfit"), value: totals?.grossProfitCop, icon: "dollar-sign" as const, color: C.success },
          { label: t("merchant_admin.commissionAmount"), value: totals?.commissionCop, icon: "percent" as const, color: C.warning },
        ].map((m) => (
          <Card key={m.label} style={{ flex: 1, minWidth: "47%" }}>
            <View style={[styles.metricIcon, { backgroundColor: m.color + "22" }]}>
              <Feather name={m.icon} size={16} color={m.color} />
            </View>
            <Text style={[styles.metricLabel, { color: C.textSecondary }]}>{m.label}</Text>
            <CopAmount amount={m.value} size={18} color={m.color} />
          </Card>
        ))}
      </View>

      <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>{t("merchant_admin.currentInventory")}</Text>
      {inventoryItems.length === 0 ? (
        <Text style={[styles.emptyText, { color: C.textMuted }]}>{t("merchant_admin.noInventory")}</Text>
      ) : (
        <View style={{ gap: 8 }}>
          {topProducts.map((item, idx) => (
            <Card key={idx} padding={12}>
              <View style={styles.invRow}>
                <Text style={[styles.invProduct, { color: C.text, flex: 1 }]}>{item.product?.name ?? item.productId}</Text>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[styles.invQty, { color: item.quantityOnHand <= item.restockTrigger ? C.danger : C.text }]}>
                    {item.quantityOnHand} u.
                  </Text>
                  {item.quantityOnHand <= item.restockTrigger && (
                    <Text style={[styles.lowStockLabel, { color: C.danger }]}>{t("warehouse.lowStockAlert")}</Text>
                  )}
                </View>
              </View>
            </Card>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 100,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    borderWidth: 1,
  },
  locationCardRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  locationIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  locationName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  txCount: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  sectionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8 },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metricIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  metricLabel: { fontSize: 12, fontFamily: "Inter_500Medium", marginBottom: 4 },
  invRow: { flexDirection: "row", alignItems: "center" },
  invProduct: { fontSize: 13, fontFamily: "Inter_500Medium" },
  invQty: { fontSize: 14, fontFamily: "Inter_700Bold" },
  lowStockLabel: { fontSize: 10, fontFamily: "Inter_500Medium" },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", paddingVertical: 12 },
});
