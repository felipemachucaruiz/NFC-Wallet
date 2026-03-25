import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
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
import { Empty } from "@/components/ui/Empty";
import { Input } from "@/components/ui/Input";
import { Loading } from "@/components/ui/Loading";
import { useAuth } from "@/contexts/AuthContext";

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

  const { data, isLoading, refetch } = useListMerchants({});
  const merchants = (data as {
    merchants?: Array<{
      id: string;
      name: string;
      commissionRatePercent: number;
      locationCount?: number;
    }>
  } | undefined)?.merchants ?? [];

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
        },
      });
      setShowCreate(false);
      setMerchantName("");
      setCommissionRate("15");
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
              <View style={[styles.merchantIcon, { backgroundColor: C.primaryLight }]}>
                <Feather name="shopping-bag" size={20} color={C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.merchantName, { color: C.text }]}>{item.name}</Text>
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
            <Input label={t("common.name")} value={merchantName} onChangeText={setMerchantName} placeholder={t("admin.merchantNamePlaceholder")} />
            <Input label={t("admin.commissionRate")} value={commissionRate} onChangeText={setCommissionRate} keyboardType="decimal-pad" placeholder="15" />
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
  sheet: { maxHeight: "80%", borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  sheetTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  sheetActions: { flexDirection: "row", gap: 12 },
});
