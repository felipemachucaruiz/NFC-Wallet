import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
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
import { useListMerchants, useCreateMerchant } from "@workspace/api-client-react";
import Colors from "@/constants/colors";
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
};

export default function EventAdminMerchantsScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();

  const [showCreate, setShowCreate] = useState(false);
  const [merchantName, setMerchantName] = useState("");
  const [commissionRate, setCommissionRate] = useState("15");
  const [merchantType, setMerchantType] = useState<MerchantType>("event_managed");

  const { data, isLoading, refetch } = useListMerchants({});
  const merchants: Merchant[] = (data as { merchants?: Merchant[] } | undefined)?.merchants ?? [];

  const createMerchant = useCreateMerchant();

  const handleCreate = async () => {
    if (!merchantName.trim()) { Alert.alert(t("common.error"), t("common.nameRequired")); return; }
    if (!user?.eventId) { Alert.alert(t("common.error"), t("eventAdmin.noEvent")); return; }
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
      Alert.alert(t("common.error"), t("common.unknownError"));
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
          paddingBottom: isWeb ? 34 : insets.bottom + 100,
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
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[styles.commRate, { color: C.primary }]}>{item.commissionRatePercent}%</Text>
                <Text style={[styles.locCount, { color: C.textMuted }]}>{t("admin.locationCount", { count: item.locationCount ?? 0 })}</Text>
              </View>
            </View>
          </Card>
        )}
      />

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
});
