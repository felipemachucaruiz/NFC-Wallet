import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { FlatList, Platform, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useListStockMovements } from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { Badge } from "@/components/ui/Badge";
import { Empty } from "@/components/ui/Empty";
import { Loading } from "@/components/ui/Loading";
import { formatDateTime } from "@/utils/format";

const MOVEMENT_ICONS: Record<string, { icon: React.ComponentProps<typeof Feather>["name"]; variant: "success" | "warning" | "info" | "danger" | "muted" }> = {
  dispatch: { icon: "arrow-down-circle", variant: "success" },
  transfer_in: { icon: "arrow-left-circle", variant: "info" },
  transfer_out: { icon: "arrow-right-circle", variant: "warning" },
  load: { icon: "upload-cloud", variant: "success" },
  sale: { icon: "shopping-bag", variant: "muted" },
  restock: { icon: "plus-circle", variant: "info" },
};

export default function MovementsScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const { data, isLoading, refetch } = useListStockMovements({});
  const movements = (data as {
    movements?: Array<{
      id: string;
      movementType: string;
      quantity: number;
      product: { name: string };
      toLocation?: { name: string } | null;
      fromLocation?: { name: string } | null;
      createdAt: string;
      note: string | null;
    }>
  } | undefined)?.movements ?? [];

  if (isLoading) return <Loading label={t("common.loading")} />;

  return (
    <FlatList
      data={movements}
      keyExtractor={(item) => item.id}
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
        <Text style={[styles.title, { color: C.text }]}>{t("warehouse.movements")}</Text>
      )}
      ListEmptyComponent={() => <Empty icon="list" title={t("warehouse.noMovements")} />}
      scrollEnabled={!!movements.length}
      renderItem={({ item }) => {
        const meta = MOVEMENT_ICONS[item.movementType] ?? { icon: "circle" as const, variant: "muted" as const };
        const locationText = item.toLocation?.name ?? item.fromLocation?.name ?? "";
        return (
          <View style={[styles.movCard, { backgroundColor: C.card, borderColor: C.border }]}>
            <View style={[styles.movIcon, { backgroundColor: C.inputBg }]}>
              <Feather name={meta.icon} size={18} color={C.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.productName, { color: C.text }]}>{item.product?.name ?? "—"}</Text>
              {locationText ? (
                <Text style={[styles.locationText, { color: C.textSecondary }]}>{locationText}</Text>
              ) : null}
              <Text style={[styles.movDate, { color: C.textMuted }]}>{formatDateTime(item.createdAt)}</Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 4 }}>
              <Text style={[styles.qty, { color: C.text }]}>{item.quantity} u.</Text>
              <Badge label={item.movementType.replace("_", " ")} variant={meta.variant} size="sm" />
            </View>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontFamily: "Inter_700Bold", marginBottom: 4 },
  movCard: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 12, padding: 14 },
  movIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  productName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  locationText: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  movDate: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  qty: { fontSize: 17, fontFamily: "Inter_700Bold" },
});
