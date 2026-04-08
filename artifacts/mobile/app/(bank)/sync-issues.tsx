import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { useAlert } from "@/components/CustomAlert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { CopAmount } from "@/components/CopAmount";
import { useOfflineQueue, type QueuedItem } from "@/contexts/OfflineQueueContext";
import { useAuth } from "@/contexts/AuthContext";

interface EditState {
  item: QueuedItem;
  rawAmount: string;
}

export default function SyncIssuesScreen() {
  const { t } = useTranslation();
  const { show: showAlert } = useAlert();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const { allFailedItems, dismissFailedItem, retryFailedItem, syncNow, isSyncing } = useOfflineQueue();
  const { user } = useAuth();
  const [dismissing, setDismissing] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);

  const canDismiss = user?.role === "admin" || user?.role === "event_admin";
  const canEditRetry = user?.role === "bank" || user?.role === "merchant_staff" ||
    user?.role === "admin" || user?.role === "event_admin";

  const handleDismiss = (item: QueuedItem) => {
    if (!canDismiss) {
      showAlert(t("common.error"), t("syncIssues.supervisorRequired"));
      return;
    }
    const itemType = item.type === "charge" ? "charge" : "topup";
    showAlert(
      t("syncIssues.dismissTitle"),
      t("syncIssues.dismissConfirm"),
      [
        { text: t("common.cancel"), variant: "cancel" },
        {
          text: t("syncIssues.dismissAction"),
          variant: "danger",
          onPress: async () => {
            setDismissing(item.id);
            await dismissFailedItem(item.id, itemType);
            setDismissing(null);
          },
        },
      ]
    );
  };

  const handleOpenEdit = (item: QueuedItem) => {
    const currentAmount = item.type === "charge" ? item.grossAmount : item.amount;
    setEditState({ item, rawAmount: String(currentAmount) });
  };

  const handleRetryConfirm = async () => {
    if (!editState) return;
    const { item, rawAmount } = editState;
    const parsed = parseInt(rawAmount.replace(/\D/g, ""), 10);
    if (isNaN(parsed) || parsed <= 0) {
      showAlert(t("common.error"), t("syncIssues.invalidAmount"));
      return;
    }

    const itemType = item.type === "charge" ? "charge" : "topup";
    setRetrying(item.id);
    setEditState(null);

    const edits =
      item.type === "charge"
        ? { grossAmount: parsed }
        : { amount: parsed };

    await retryFailedItem(item.id, itemType, edits);
    setRetrying(null);
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
      return item.grossAmount;
    }
    return item.amount;
  };

  const getItemAmountLabel = (item: QueuedItem): string => {
    if (item.type === "charge") {
      return t("syncIssues.chargeAmount");
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

              <View style={styles.actionRow}>
                {canEditRetry && (
                  <Pressable
                    onPress={() => handleOpenEdit(item)}
                    disabled={retrying === item.id}
                    style={[styles.editRetryBtn, { borderColor: C.primary, flex: 1 }]}
                  >
                    <Feather name="edit-2" size={14} color={C.primary} />
                    <Text style={[styles.editRetryText, { color: C.primary }]}>
                      {retrying === item.id ? t("common.loading") : t("syncIssues.editRetry")}
                    </Text>
                  </Pressable>
                )}

                <Pressable
                  onPress={() => handleDismiss(item)}
                  disabled={dismissing === item.id}
                  style={[styles.dismissBtn, {
                    borderColor: canDismiss ? C.danger : C.border,
                    opacity: canDismiss ? 1 : 0.5,
                    flex: canEditRetry ? 0 : 1,
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
              </View>
            </Card>
          ))
        )}
      </ScrollView>

      {/* Edit & Retry Modal */}
      <Modal
        visible={editState !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setEditState(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setEditState(null)} />
          {editState && (
            <View style={[styles.modalSheet, { backgroundColor: C.card, borderColor: C.border }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: C.text }]}>{t("syncIssues.editRetryTitle")}</Text>
                <Pressable onPress={() => setEditState(null)} hitSlop={8}>
                  <Feather name="x" size={20} color={C.textSecondary} />
                </Pressable>
              </View>

              <View style={[styles.modalUidRow, { backgroundColor: C.inputBg, borderColor: C.border }]}>
                <Feather name="wifi" size={14} color={C.textSecondary} />
                <Text style={[styles.modalUidText, { color: C.textSecondary }]}>
                  {editState.item.nfcUid}
                </Text>
              </View>

              <Text style={[styles.modalLabel, { color: C.textSecondary }]}>
                {editState.item.type === "charge"
                  ? t("syncIssues.editChargeAmountLabel")
                  : t("syncIssues.editTopUpAmountLabel")}
              </Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: C.inputBg, color: C.text, borderColor: C.primary }]}
                value={editState.rawAmount}
                onChangeText={(v) => setEditState((s) => s ? { ...s, rawAmount: v.replace(/\D/g, "") } : null)}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor={C.textMuted}
                autoFocus
              />
              <Text style={[styles.modalHint, { color: C.textMuted }]}>
                {t("syncIssues.editAmountHint")}
              </Text>

              <View style={styles.modalActions}>
                <Button
                  title={t("common.cancel")}
                  onPress={() => setEditState(null)}
                  variant="secondary"
                  style={{ flex: 1 }}
                />
                <Button
                  title={t("syncIssues.retryNow")}
                  onPress={handleRetryConfirm}
                  variant="primary"
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          )}
        </KeyboardAvoidingView>
      </Modal>
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
  actionRow: { flexDirection: "row", gap: 8 },
  editRetryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 10,
  },
  editRetryText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  dismissBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 10,
  },
  dismissText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    padding: 24,
    gap: 16,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  modalUidRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  modalUidText: { fontSize: 13, fontFamily: "Inter_500Medium", letterSpacing: 0.5 },
  modalLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  modalInput: {
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  modalHint: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 4 },
});
