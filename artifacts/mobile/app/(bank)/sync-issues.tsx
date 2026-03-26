import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
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
import Colors from "@/constants/colors";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { CopAmount } from "@/components/CopAmount";
import { useOfflineQueue, type QueuedItem } from "@/contexts/OfflineQueueContext";
import { useAuth } from "@/contexts/AuthContext";

export default function SyncIssuesScreen() {
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

  const handleRetryAll = () => {
    void syncNow();
  };

  const getItemLabel = (item: QueuedItem): string => {
    if (item.type === "charge") {
      return t("syncIssues.chargeItem", { uid: item.nfcUid.slice(0, 11) });
    }
    return t("syncIssues.topUpItem", { uid: item.nfcUid.slice(0, 11) });
  };

  const getItemAmount = (item: QueuedItem): number => {
    if (item.type === "charge") {
      return item.newBalance;
    }
    return item.amountCop;
  };

  const getItemAmountLabel = (item: QueuedItem): string => {
    if (item.type === "charge") {
      return t("syncIssues.newBalance");
    }
    return t("bank.topUpLabel");
  };

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <View style={[styles.header, { paddingTop: isWeb ? 16 : insets.top + 8, borderBottomColor: C.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={C.text} />
        </Pressable>
        <Text style={[styles.title, { color: C.text }]}>{t("syncIssues.title")}</Text>
        <View style={{ width: 22 }} />
      </View>

      {allFailedItems.length > 0 && (
        <View style={[styles.retryBar, { backgroundColor: C.card, borderBottomColor: C.border }]}>
          <Text style={[styles.retryHint, { color: C.textSecondary }]}>
            {t("syncIssues.count", { count: allFailedItems.length })}
          </Text>
          <Button
            title={isSyncing ? t("common.syncing") : t("syncIssues.retryAll")}
            onPress={handleRetryAll}
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
                <View style={[styles.typeIcon, {
                  backgroundColor: item.type === "charge" ? C.dangerLight : C.warningLight ?? "#FFF3CD"
                }]}>
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
                <View style={[styles.errorBox, { backgroundColor: C.dangerLight ?? "#FEE2E2" }]}>
                  <Feather name="alert-triangle" size={12} color={C.danger} />
                  <Text style={[styles.errorText, { color: C.danger }]} numberOfLines={2}>
                    {item.failReason}
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  backBtn: { padding: 4 },
  title: { flex: 1, fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
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
  typeIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
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
