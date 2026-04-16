import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import { FlatList, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useListMerchants, useCreateMerchant, useUpdateMerchant, customFetch } from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { useAlert } from "@/components/CustomAlert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Empty } from "@/components/ui/Empty";
import { Input } from "@/components/ui/Input";
import { Loading } from "@/components/ui/Loading";
import { useAuth } from "@/contexts/AuthContext";

type MerchantType = "event_managed" | "external";

type Merchant = {
  id: string;
  name: string;
  commissionRatePercent: string;
  merchantType?: MerchantType;
  locationCount?: number;
  retencionFuenteRate?: string;
  retencionICARate?: string;
};

export default function EventAdminMerchantsScreen() {
  const { t } = useTranslation();
  const { show: showAlert } = useAlert();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();

  const [showCreate, setShowCreate] = useState(false);
  const [merchantName, setMerchantName] = useState("");
  const [commissionRate, setCommissionRate] = useState("15");
  const [merchantType, setMerchantType] = useState<MerchantType>("event_managed");

  const [editingMerchant, setEditingMerchant] = useState<Merchant | null>(null);
  const [fiscalFuente, setFiscalFuente] = useState("0");
  const [fiscalICA, setFiscalICA] = useState("0");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useListMerchants({});
  const merchants: Merchant[] = (data as { merchants?: Merchant[] } | undefined)?.merchants ?? [];

  const createMerchant = useCreateMerchant();
  const updateMerchant = useUpdateMerchant();

  const openFiscalEdit = (merchant: Merchant) => {
    setEditingMerchant(merchant);
    setFiscalFuente(merchant.retencionFuenteRate ?? "0");
    setFiscalICA(merchant.retencionICARate ?? "0");
  };

  const handleSaveFiscal = async () => {
    if (!editingMerchant) return;
    try {
      await updateMerchant.mutateAsync({
        merchantId: editingMerchant.id,
        data: {
          retencionFuenteRate: parseFloat(fiscalFuente || "0").toFixed(2),
          retencionICARate: parseFloat(fiscalICA || "0").toFixed(4),
        },
      });
      showAlert(t("common.success"), t("merchant_admin.fiscalSettings") + " guardado");
      setEditingMerchant(null);
      refetch();
    } catch {
      showAlert(t("common.error"), t("common.unknownError"));
    }
  };

  const handleDeleteMerchant = (merchant: Merchant) => {
    showAlert(
      t("admin.deleteMerchant"),
      t("admin.deleteMerchantConfirm", { name: merchant.name }),
      [
        { text: t("common.cancel"), variant: "cancel" },
        {
          text: t("admin.deleteMerchant"),
          variant: "danger",
          onPress: async () => {
            setDeletingId(merchant.id);
            try {
              await customFetch(`/api/merchants/${merchant.id}`, { method: "DELETE" });
              refetch();
            } catch (e: unknown) {
              const msg = (e as { data?: { error?: string } })?.data?.error ?? "";
              if (msg.includes("transaction history")) {
                showAlert(t("admin.cannotDelete"), t("admin.merchantHasTransactions"));
              } else {
                showAlert(t("common.error"), t("common.unknownError"));
              }
            } finally {
              setDeletingId(null);
            }
          },
        },
      ],
    );
  };

  const handleCreate = async () => {
    if (!merchantName.trim()) { showAlert(t("common.error"), t("common.nameRequired")); return; }
    if (!user?.eventId) { showAlert(t("common.error"), t("eventAdmin.noEvent")); return; }
    try {
      await createMerchant.mutateAsync({
        data: {
          name: merchantName.trim(),
          eventId: user.eventId!,
          commissionRatePercent: String(Number.isNaN(parseFloat(commissionRate)) ? 15 : parseFloat(commissionRate)),
          merchantType,
        },
      });
      setShowCreate(false);
      setMerchantName("");
      setCommissionRate("15");
      setMerchantType("event_managed");
      refetch();
    } catch {
      showAlert(t("common.error"), t("common.unknownError"));
    }
  };

  if (isLoading) return <Loading label={t("common.loading")} />;

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <FlatList
        data={merchants}
        keyExtractor={(item) => item.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingTop: isWeb ? 67 : insets.top + 16,
          paddingBottom: isWeb ? 34 : insets.bottom + 80,
          paddingHorizontal: 20,
          gap: 12,
        }}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={C.primary} />}
        ListHeaderComponent={() => (
          <View style={styles.header}>
            <Text style={[styles.title, { color: C.text }]}>{t("eventAdmin.merchants")}</Text>
            <Button title={`+ ${t("admin.createMerchant")}`} onPress={() => setShowCreate(true)} variant="primary" size="sm" />
          </View>
        )}
        ListEmptyComponent={() => (
          <Empty icon="shopping-bag" title={t("admin.noMerchants")} actionLabel={t("admin.createMerchant")} onAction={() => setShowCreate(true)} />
        )}
        scrollEnabled={!!merchants.length}
        renderItem={({ item }) => (
          <Card>
            <View style={styles.merchantRow}>
              <View style={[styles.merchantIcon, { backgroundColor: item.merchantType === "external" ? C.warningLight ?? C.inputBg : C.primaryLight }]}>
                <Feather name="shopping-bag" size={20} color={item.merchantType === "external" ? C.warning ?? C.textSecondary : C.primary} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[styles.merchantName, { color: C.text }]}>{item.name}</Text>
                <Badge
                  label={item.merchantType === "external" ? t("merchant_admin.typeExternal") : t("merchant_admin.typeEventManaged")}
                  variant={item.merchantType === "external" ? "warning" : "success"}
                  size="sm"
                />
                {(parseFloat(item.retencionFuenteRate ?? "0") > 0 || parseFloat(item.retencionICARate ?? "0") > 0) && (
                  <Text style={[styles.fiscalInfo, { color: C.textMuted }]}>
                    Ret. Fuente: {item.retencionFuenteRate ?? "0"}% · ICA: {item.retencionICARate ?? "0"}%
                  </Text>
                )}
              </View>
              <View style={{ alignItems: "flex-end", gap: 6 }}>
                <Text style={[styles.commRate, { color: C.primary }]}>{item.commissionRatePercent}%</Text>
                <Text style={[styles.locCount, { color: C.textMuted }]}>{t("admin.locationCount", { count: item.locationCount ?? 0 })}</Text>
                <Pressable
                  onPress={() => openFiscalEdit(item)}
                  style={[styles.fiscalBtn, { backgroundColor: C.inputBg }]}
                >
                  <Feather name="percent" size={12} color={C.textSecondary} />
                  <Text style={[styles.fiscalBtnText, { color: C.textSecondary }]}>{t("merchant_admin.fiscalSettings")}</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleDeleteMerchant(item)}
                  disabled={deletingId === item.id}
                  style={[styles.fiscalBtn, { backgroundColor: "#fee2e2" }]}
                >
                  <Feather name="trash-2" size={12} color="#dc2626" />
                  <Text style={[styles.fiscalBtnText, { color: "#dc2626" }]}>{t("admin.deleteMerchant")}</Text>
                </Pressable>
              </View>
            </View>
          </Card>
        )}
      />

      <Modal visible={!!editingMerchant} transparent animationType="slide">
        <View style={[styles.overlay, { backgroundColor: C.overlay }]}>
          <ScrollView style={[styles.sheet, { backgroundColor: C.card }]} contentContainerStyle={{ gap: 16, padding: 24 }}>
            <Text style={[styles.sheetTitle, { color: C.text }]}>{t("merchant_admin.fiscalSettings")}</Text>
            {editingMerchant && (
              <Text style={[styles.typeHint, { color: C.textMuted }]}>
                {editingMerchant.name} · {t("merchant_admin.fiscalSettingsHint")}
              </Text>
            )}
            <Input
              label={t("merchant_admin.retencionFuenteRate")}
              value={fiscalFuente}
              onChangeText={setFiscalFuente}
              keyboardType="decimal-pad"
              placeholder="3.50"
            />
            <Input
              label={t("merchant_admin.retencionICARate")}
              value={fiscalICA}
              onChangeText={setFiscalICA}
              keyboardType="decimal-pad"
              placeholder="0.9660"
            />
            <View style={styles.sheetActions}>
              <Button title={t("common.cancel")} onPress={() => setEditingMerchant(null)} variant="secondary" />
              <Button title={t("common.save")} onPress={handleSaveFiscal} variant="primary" loading={updateMerchant.isPending} />
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={showCreate} transparent animationType="slide">
        <View style={[styles.overlay, { backgroundColor: C.overlay }]}>
          <ScrollView style={[styles.sheet, { backgroundColor: C.card }]} contentContainerStyle={{ gap: 16, padding: 24 }}>
            <Text style={[styles.sheetTitle, { color: C.text }]}>{t("admin.createMerchant")}</Text>

            <Input
              label={t("common.name")}
              value={merchantName}
              onChangeText={setMerchantName}
              placeholder={t("admin.merchantNamePlaceholder")}
            />

            <Input
              label={t("admin.commissionRate")}
              value={commissionRate}
              onChangeText={setCommissionRate}
              keyboardType="decimal-pad"
              placeholder="15"
            />

            <View style={{ gap: 8 }}>
              <Text style={[styles.typeLabel, { color: C.textSecondary }]}>{t("merchant_admin.typeLabel")}</Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                {(["event_managed", "external"] as MerchantType[]).map((type) => (
                  <Pressable
                    key={type}
                    onPress={() => setMerchantType(type)}
                    style={[
                      styles.typeOption,
                      {
                        borderColor: merchantType === type ? C.primary : C.border,
                        backgroundColor: merchantType === type ? C.primaryLight : C.card,
                        flex: 1,
                      },
                    ]}
                  >
                    <Feather
                      name={type === "event_managed" ? "layers" : "briefcase"}
                      size={16}
                      color={merchantType === type ? C.primary : C.textMuted}
                    />
                    <Text style={[styles.typeOptionText, { color: merchantType === type ? C.primary : C.textSecondary }]}>
                      {type === "event_managed" ? t("merchant_admin.typeEventManaged") : t("merchant_admin.typeExternal")}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={[styles.typeHint, { color: C.textMuted }]}>
                {merchantType === "event_managed"
                  ? t("merchant_admin.typeEventManagedHint")
                  : t("merchant_admin.typeExternalHint")}
              </Text>
            </View>

            <View style={styles.sheetActions}>
              <Button title={t("common.cancel")} onPress={() => setShowCreate(false)} variant="secondary" />
              <Button title={t("admin.createMerchant")} onPress={handleCreate} variant="primary" loading={createMerchant.isPending} />
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  merchantRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  merchantIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  merchantName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  commRate: { fontSize: 16, fontFamily: "Inter_700Bold" },
  locCount: { fontSize: 12, fontFamily: "Inter_400Regular" },
  overlay: { flex: 1, justifyContent: "flex-end" },
  sheet: { maxHeight: "85%", borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  sheetTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  sheetActions: { flexDirection: "row", gap: 12 },
  typeLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  typeOption: { padding: 12, borderRadius: 10, borderWidth: 1.5, alignItems: "center", gap: 6 },
  typeOptionText: { fontSize: 12, fontFamily: "Inter_500Medium", textAlign: "center" },
  typeHint: { fontSize: 11, fontFamily: "Inter_400Regular" },
  fiscalInfo: { fontSize: 11, fontFamily: "Inter_400Regular" },
  fiscalBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  fiscalBtnText: { fontSize: 11, fontFamily: "Inter_500Medium" },
});
