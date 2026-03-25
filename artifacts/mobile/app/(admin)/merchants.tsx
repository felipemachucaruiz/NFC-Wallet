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
import {
  useListMerchants,
  useCreateMerchant,
  useCreateLocation,
  useCreateProduct,
  useCreatePayout,
} from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { CopAmount } from "@/components/CopAmount";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Input } from "@/components/ui/Input";
import { Loading } from "@/components/ui/Loading";

export default function MerchantsScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const [showCreate, setShowCreate] = useState(false);
  const [merchantName, setMerchantName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [commissionRate, setCommissionRate] = useState("15");

  const { data, isLoading, refetch } = useListMerchants({});
  const merchants = (data as {
    merchants?: Array<{
      id: string;
      name: string;
      contactEmail: string | null;
      commissionRatePercent: number;
      locationCount?: number;
    }>
  } | undefined)?.merchants ?? [];

  const createMerchant = useCreateMerchant();

  const handleCreate = async () => {
    if (!merchantName.trim()) { Alert.alert(t("common.error"), t("common.nameRequired")); return; }
    try {
      await createMerchant.mutateAsync({
        name: merchantName.trim(),
        contactEmail: contactEmail.trim() || undefined,
        commissionRatePercent: parseFloat(commissionRate) || 15,
      } as Parameters<typeof createMerchant.mutateAsync>[0]);
      setShowCreate(false);
      setMerchantName("");
      setContactEmail("");
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
            <Text style={[styles.title, { color: C.text }]}>{t("admin.merchants")}</Text>
            <Button title={`+ ${t("admin.createMerchant")}`} onPress={() => setShowCreate(true)} variant="primary" size="sm" />
          </View>
        )}
        ListEmptyComponent={() => (
          <Empty
            icon="shopping-bag"
            title={t("admin.noMerchants")}
            actionLabel={t("admin.createMerchant")}
            onAction={() => setShowCreate(true)}
          />
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
                {item.contactEmail ? (
                  <Text style={[styles.merchantEmail, { color: C.textSecondary }]}>{item.contactEmail}</Text>
                ) : null}
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
            <Input label={t("admin.contactEmail")} value={contactEmail} onChangeText={setContactEmail} placeholder="contacto@email.com" keyboardType="email-address" />
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
  merchantEmail: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  commRate: { fontSize: 16, fontFamily: "Inter_700Bold" },
  locCount: { fontSize: 12, fontFamily: "Inter_400Regular" },
  overlay: { flex: 1, justifyContent: "flex-end" },
  sheet: { maxHeight: "80%", borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  sheetTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  sheetActions: { flexDirection: "row", gap: 12 },
});
