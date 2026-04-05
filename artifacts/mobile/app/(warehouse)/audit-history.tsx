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
  useListInventoryAudits,
  useListDamagedGoods,
} from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { Badge } from "@/components/ui/Badge";
import { Empty } from "@/components/ui/Empty";
import { Loading } from "@/components/ui/Loading";
import { formatDateTime } from "@/utils/format";
import { useEventContext } from "@/contexts/EventContext";

type TabType = "audits" | "damaged";

export default function AuditHistoryScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { inventoryMode } = useEventContext();
  const isCentralized = inventoryMode === "centralized_warehouse";

  const [activeTab, setActiveTab] = useState<TabType>("audits");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");

  const { data: warehousesData } = useListWarehouses(undefined, {
    query: { enabled: isCentralized },
  });
  const warehouses = (
    warehousesData as { warehouses?: Array<{ id: string; name: string }> } | undefined
  )?.warehouses ?? [];
  const activeWarehouseId = selectedWarehouseId || warehouses[0]?.id || "";

  const { data: auditsData, isLoading: auditsLoading, refetch: refetchAudits } = useListInventoryAudits(
    activeWarehouseId ? { warehouseId: activeWarehouseId } : {},
    { query: { enabled: activeTab === "audits" } }
  );
  const audits = (
    auditsData as {
      audits?: Array<{
        id: string;
        warehouseId?: string | null;
        locationId?: string | null;
        performedByUserId?: string | null;
        notes?: string | null;
        createdAt: string;
        items: Array<{
          productId: string;
          productName?: string | null;
          systemCount: number;
          physicalCount: number;
          delta: number;
        }>;
      }>;
    } | undefined
  )?.audits ?? [];

  const { data: damagedData, isLoading: damagedLoading, refetch: refetchDamaged } = useListDamagedGoods(
    activeWarehouseId ? { warehouseId: activeWarehouseId } : {},
    { query: { enabled: activeTab === "damaged" } }
  );
  const damagedEntries = (
    damagedData as {
      entries?: Array<{
        id: string;
        productId: string;
        productName?: string | null;
        quantity: number;
        reason: string;
        notes?: string | null;
        performedByUserId?: string | null;
        createdAt: string;
      }>;
    } | undefined
  )?.entries ?? [];

  const isLoading = activeTab === "audits" ? auditsLoading : damagedLoading;
  const onRefresh = activeTab === "audits" ? refetchAudits : refetchDamaged;

  const reasonVariant: Record<string, "danger" | "warning" | "muted"> = {
    damaged: "danger",
    lost: "warning",
    expired: "muted",
  };

  if (inventoryMode === "location_based") {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: C.background,
          paddingTop: isWeb ? 67 : insets.top + 32,
          paddingBottom: isWeb ? 34 : insets.bottom + 100,
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

  const renderAuditItem = ({ item }: { item: (typeof audits)[number] }) => (
    <View style={[styles.auditCard, { backgroundColor: C.card, borderColor: C.border }]}>
      <View style={styles.auditCardHeader}>
        <View style={[styles.auditIcon, { backgroundColor: C.primaryLight }]}>
          <Feather name="clipboard" size={18} color={C.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.auditCardTitle, { color: C.text }]}>{t("warehouse.inventoryAudit")}</Text>
          <Text style={[styles.auditCardDate, { color: C.textMuted }]}>{formatDateTime(item.createdAt)}</Text>
        </View>
        <Badge label={`${item.items.length} ${t("warehouse.products")}`} variant="info" size="sm" />
      </View>
      {item.notes ? (
        <Text style={[styles.auditNotes, { color: C.textSecondary }]}>{item.notes}</Text>
      ) : null}
      <View style={{ gap: 6, marginTop: 8 }}>
        {item.items.map((ai) => (
          <View key={ai.productId} style={[styles.auditItemRow, { borderColor: C.border }]}>
            <Text style={[styles.auditItemName, { color: C.text }]}>{ai.productName ?? ai.productId}</Text>
            <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
              <Text style={[styles.auditItemCount, { color: C.textSecondary }]}>
                {ai.systemCount} → {ai.physicalCount}
              </Text>
              {ai.delta !== 0 && (
                <Badge
                  label={`${ai.delta > 0 ? "+" : ""}${ai.delta}`}
                  variant={ai.delta > 0 ? "success" : "danger"}
                  size="sm"
                />
              )}
            </View>
          </View>
        ))}
      </View>
    </View>
  );

  const renderDamagedItem = ({ item }: { item: (typeof damagedEntries)[number] }) => (
    <View style={[styles.auditCard, { backgroundColor: C.card, borderColor: C.border }]}>
      <View style={styles.auditCardHeader}>
        <View style={[styles.auditIcon, { backgroundColor: C.dangerLight }]}>
          <Feather name="alert-triangle" size={18} color={C.danger} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.auditCardTitle, { color: C.text }]}>{item.productName ?? item.productId}</Text>
          <Text style={[styles.auditCardDate, { color: C.textMuted }]}>{formatDateTime(item.createdAt)}</Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <Text style={[styles.damagedQty, { color: C.danger }]}>-{item.quantity}</Text>
          <Badge label={t(`warehouse.reason_${item.reason}`)} variant={reasonVariant[item.reason] ?? "muted"} size="sm" />
        </View>
      </View>
      {item.notes ? (
        <Text style={[styles.auditNotes, { color: C.textSecondary }]}>{item.notes}</Text>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <ScrollView
        style={{ flex: 1 }}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={C.primary} />}
      >
        <View style={{ paddingTop: isWeb ? 67 : insets.top + 16, paddingBottom: isWeb ? 34 : insets.bottom + 100, paddingHorizontal: 20, gap: 12 }}>
          <Text style={[styles.title, { color: C.text }]}>{t("warehouse.auditHistory")}</Text>

          {warehouses.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
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

          <View style={[styles.tabBar, { backgroundColor: C.inputBg, borderColor: C.border }]}>
            <Pressable
              style={[styles.tab, activeTab === "audits" && { backgroundColor: C.card }]}
              onPress={() => setActiveTab("audits")}
            >
              <Feather name="clipboard" size={14} color={activeTab === "audits" ? C.primary : C.textSecondary} />
              <Text style={[styles.tabText, { color: activeTab === "audits" ? C.primary : C.textSecondary }]}>
                {t("warehouse.audit")}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.tab, activeTab === "damaged" && { backgroundColor: C.card }]}
              onPress={() => setActiveTab("damaged")}
            >
              <Feather name="alert-triangle" size={14} color={activeTab === "damaged" ? C.danger : C.textSecondary} />
              <Text style={[styles.tabText, { color: activeTab === "damaged" ? C.danger : C.textSecondary }]}>
                {t("warehouse.damagedGoods")}
              </Text>
            </Pressable>
          </View>

          {isLoading ? (
            <Loading label={t("common.loading")} />
          ) : activeTab === "audits" ? (
            audits.length === 0 ? (
              <Empty icon="clipboard" title={t("warehouse.noAudits")} />
            ) : (
              <FlatList
                data={audits}
                keyExtractor={(item) => item.id}
                renderItem={renderAuditItem}
                scrollEnabled={false}
                contentContainerStyle={{ gap: 10 }}
              />
            )
          ) : damagedEntries.length === 0 ? (
            <Empty icon="alert-triangle" title={t("warehouse.noDamagedGoods")} />
          ) : (
            <FlatList
              data={damagedEntries}
              keyExtractor={(item) => item.id}
              renderItem={renderDamagedItem}
              scrollEnabled={false}
              contentContainerStyle={{ gap: 10 }}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  infoIconBox: { width: 72, height: 72, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  infoTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  infoDesc: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 21 },
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  whChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100, borderWidth: 1 },
  whChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  tabBar: { flexDirection: "row", borderRadius: 12, borderWidth: 1, padding: 4, gap: 4 },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, borderRadius: 10 },
  tabText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  auditCard: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 4 },
  auditCardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  auditIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  auditCardTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  auditCardDate: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  auditNotes: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4 },
  auditItemRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4, borderTopWidth: StyleSheet.hairlineWidth },
  auditItemName: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  auditItemCount: { fontSize: 12, fontFamily: "Inter_400Regular" },
  damagedQty: { fontSize: 18, fontFamily: "Inter_700Bold" },
});
