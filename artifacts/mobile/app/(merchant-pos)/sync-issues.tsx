import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { CopAmount } from "@/components/CopAmount";
import { useOfflineQueue, type QueuedItem } from "@/contexts/OfflineQueueContext";
import { useAuth } from "@/contexts/AuthContext";

function translateFailReason(reason: string | undefined, t: (key: string) => string): string {
  if (!reason) return t("syncIssues.errors.unknownError");
  const r = reason.toLowerCase();
  if (r.includes("flagged")) return t("syncIssues.errors.flaggedBracelet");
  if (r.includes("not registered")) return t("syncIssues.errors.notRegistered");
  if (r.includes("counter replay") || r.includes("counter")) return t("syncIssues.errors.counterReplay");
  if (r.includes("insufficient") && r.includes("balance")) return t("syncIssues.errors.insufficientBalance");
  if (r.includes("location not found")) return t("syncIssues.errors.locationNotFound");
  if (r.includes("access denied") || r.includes("not assigned")) return t("syncIssues.errors.locationAccessDenied");
  if (r.includes("merchant not found")) return t("syncIssues.errors.merchantNotFound");
  if (r.includes("product") && r.includes("not found")) return t("syncIssues.errors.productNotFound");
  if (r.includes("network") || r.includes("fetch") || r.includes("connection")) return t("syncIssues.errors.networkError");
  return reason;
}

export default function MerchantSyncIssuesScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const { allFailedItems, dismissFailedItem, syncNow, isSyncing } = useOfflineQueue();
  const { user } = useAuth();
  const [dismissing, setDismissing] = useState<string | null>(null);

  const canDismiss = user?.role === "admin" || user?.role === "event_admin";

  const handleDismiss = (item: QueuedItem) => {
    if (!canDismiss) {
      Alert.alert(t("common.error"), t("syncIssues.supervisorRequired"));
      return;
    }
    const itemType = item.type === "charge" ? "charge" : "topup";
    Alert.alert(
      t("syncIssues.dismissTitle"),
      t("syncIssues.dismissConfirm"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("syncIssues.dismissAction"),
          style: "destructive",
          onPress: async () => {
            setDismissing(item.id);
            await dismissFailedItem(item.id, itemType);
            setDismissing(null);
          },
        },
      ]
    );
  };

  const getItemAmountLabel = (item: QueuedItem): string => {
    if (item.type === "charge") return t("syncIssues.newBalance");
    return t("bank.topUpLabel");
  };

  const getItemAmount = (item: QueuedItem): number => {
    if (item.type === "charge") return item.newBalance;
    return item.amountCop;
  };

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      {allFailedItems.length > 0 && (
        <View style={[styles.retryBar, { backgroundColor: C.card, borderBottomColor: C.border }]}>
          <Text style={[styles.retryHint, { color: C.textSecondary }]}>
            {t("syncIssues.count", { count: allFailedItems.length })}
          </Text>
          <Button
            title={isSyncing ? t("common.syncing") : t("syncIssues.retryAll")}
            onPress={() => void syncNow()}
            variant="primary"
            size="sm"
            loading={isSyncing}
          />
        </View>
      )}

      <ScrollView
        contentContainerStyle={{
          padding: 16,
          gap: 12,
          paddingBottom: isWeb ? 34 : insets.bottom + 24,
        }}
      >
        {allFailedItems.length === 0 ? (
          <Empty icon="check-circle" title={t("syncIssues.noIssues")} />
        ) : (
          allFailedItems.map((item) => (
            <Card key={item.id}>
              <View style={styles.itemHeader}>
                <View
                  style={[
                    styles.typeIcon,
                    {
                      backgroundColor:
                        item.type === "charge" ? C.dangerLight : C.warningLight ?? "#FFF3CD",
                    },
                  ]}
                >
                  <Feather
                    name={item.type === "charge" ? "minus-circle" : "plus-circle"}
                    size={18}
                    color={item.type === "charge" ? C.danger : C.warning ?? "#F59E0B"}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemType, { color: C.text }]}>
                    {item.type === "charge" ? t("syncIssues.chargeType") : t("syncIssues.topUpType")}
                  </Text>
                  <Text style={[styles.itemUid, { color: C.textMuted }]}>{item.nfcUid}</Text>
                </View>
                <View style={styles.itemAmount}>
                  <Text style={[styles.amountLabel, { color: C.textSecondary }]}>
                    {getItemAmountLabel(item)}
                  </Text>
                  <CopAmount amount={getItemAmount(item)} size={15} />
                </View>
              </View>

              {item.failReason && (
                <View
                  style={[
                    styles.errorBox,
                    { backgroundColor: C.dangerLight ?? "#FEE2E2" },
                  ]}
                >
                  <Feather name="alert-triangle" size={12} color={C.danger} />
                  <Text
                    style={[styles.errorText, { color: C.danger }]}
                    numberOfLines={2}
                  >
                    {translateFailReason(item.failReason, t)}
                  </Text>
                </View>
              )}

              <View style={styles.itemFooter}>
                <Text style={[styles.dateText, { color: C.textMuted }]}>
                  {new Date(item.createdAt).toLocaleString()}
                </Text>
                <Text style={[styles.failCount, { color: C.textMuted }]}>
                  {t("syncIssues.attempts", { count: item.failCount })}
                </Text>
              </View>

              <Pressable
                onPress={() => handleDismiss(item)}
                disabled={dismissing === item.id}
                style={[styles.dismissBtn, {
                  borderColor: canDismiss ? C.danger : C.border,
                  opacity: canDismiss ? 1 : 0.5,
                }]}
              >
                <Feather name={canDismiss ? "trash-2" : "lock"} size={14} color={canDismiss ? C.danger : C.textMuted} />
                <Text style={[styles.dismissText, { color: canDismiss ? C.danger : C.textMuted }]}>
                  {dismissing === item.id
                    ? t("common.loading")
                    : canDismiss
                    ? t("syncIssues.dismiss")
                    : t("syncIssues.supervisorOnly")}
                </Text>
              </Pressable>
            </Card>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  retryBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  retryHint: { fontSize: 13, fontFamily: "Inter_500Medium" },
  itemHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 8 },
  typeIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  itemType: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  itemUid: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  itemAmount: { alignItems: "flex-end" },
  amountLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  errorText: { flex: 1, fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16 },
  itemFooter: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  dateText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  failCount: { fontSize: 11, fontFamily: "Inter_400Regular" },
  dismissBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 10,
  },
  dismissText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
