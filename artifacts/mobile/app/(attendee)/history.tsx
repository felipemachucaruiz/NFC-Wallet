import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useGetBracelet } from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { CopAmount } from "@/components/CopAmount";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Empty } from "@/components/ui/Empty";
import { Loading } from "@/components/ui/Loading";
import { formatDateTime } from "@/utils/format";
import { isNfcSupported, readBracelet } from "@/utils/nfc";

export default function AttendeeHistoryScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const [braceletUid, setBraceletUid] = useState<string | null>(null);
  const [showUidInput, setShowUidInput] = useState(false);
  const [manualUid, setManualUid] = useState("");
  const [isTapping, setIsTapping] = useState(false);

  const { data, isLoading, refetch } = useGetBracelet(braceletUid ?? "", {
    query: { enabled: !!braceletUid },
  });

  const handleTap = async () => {
    if (!isNfcSupported()) {
      setShowUidInput(true);
      return;
    }
    setIsTapping(true);
    try {
      const payload = await readBracelet();
      setBraceletUid(payload.uid);
    } catch {}
    finally { setIsTapping(false); }
  };

  const handleManualConfirm = () => {
    if (manualUid.trim()) {
      setBraceletUid(manualUid.trim());
      setShowUidInput(false);
      setManualUid("");
    }
  };

  const braceletData = data as {
    uid?: string;
    balanceCop?: number;
    transactions?: Array<{
      id: string;
      type: string;
      amountCop: number;
      createdAt: string;
      location?: { name: string };
      lineItems?: Array<{ product: { name: string }; quantity: number; unitPriceCop: number }>;
    }>;
  } | undefined;

  if (!braceletUid) {
    return (
      <View style={[styles.container, { backgroundColor: C.background, paddingTop: isWeb ? 67 : insets.top }]}>
        <View style={styles.emptyState}>
          <View style={[styles.tapIcon, { backgroundColor: C.primaryLight }]}>
            <Feather name="wifi" size={36} color={C.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: C.text }]}>
            {t("attendee.historyTitle")}
          </Text>
          <Text style={[styles.emptySubtitle, { color: C.textSecondary }]}>
            Toca tu pulsera para ver el historial
          </Text>
          <Button
            title={isTapping ? t("attendee.tapping") : isNfcSupported() ? "Toca pulsera" : "Ingresar UID"}
            onPress={handleTap}
            loading={isTapping}
            variant="primary"
          />
        </View>

        <Modal visible={showUidInput} transparent animationType="slide">
          <View style={[styles.modalOverlay, { backgroundColor: C.overlay }]}>
            <View style={[styles.modalBox, { backgroundColor: C.card }]}>
              <Text style={[styles.modalTitle, { color: C.text }]}>Ingresar UID de pulsera</Text>
              <TextInput
                style={[styles.uidInput, { backgroundColor: C.inputBg, color: C.text, borderColor: C.border }]}
                placeholder="UID"
                placeholderTextColor={C.textMuted}
                value={manualUid}
                onChangeText={setManualUid}
              />
              <View style={styles.row}>
                <Button title={t("common.cancel")} onPress={() => setShowUidInput(false)} variant="secondary" />
                <Button title={t("common.confirm")} onPress={handleManualConfirm} variant="primary" />
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  if (isLoading) return <Loading label={t("common.loading")} />;

  const transactions = braceletData?.transactions ?? [];

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: 16, paddingTop: isWeb ? 67 : insets.top + 8, paddingBottom: isWeb ? 34 : insets.bottom + 16, gap: 10 }}
        ListHeaderComponent={() => (
          <View style={styles.header}>
            <Text style={[styles.pageTitle, { color: C.text }]}>{t("attendee.historyTitle")}</Text>
            <View style={[styles.balancePill, { backgroundColor: C.primaryLight }]}>
              <Text style={[styles.balancePillText, { color: C.primary }]}>
                Saldo: <Text style={{ fontFamily: "Inter_700Bold" }}>{braceletData?.balanceCop != null ? `$${braceletData.balanceCop.toLocaleString("es-CO")}` : "?"}</Text>
              </Text>
            </View>
          </View>
        )}
        ListEmptyComponent={() => (
          <Empty icon="clock" title={t("attendee.noTransactions")} />
        )}
        renderItem={({ item }) => (
          <TxCard tx={item} C={C} t={t} />
        )}
        onRefresh={refetch}
        refreshing={isLoading}
        scrollEnabled={!!transactions.length}
      />
    </View>
  );
}

function TxCard({
  tx,
  C,
  t,
}: {
  tx: {
    id: string;
    type: string;
    amountCop: number;
    createdAt: string;
    location?: { name: string };
    lineItems?: Array<{ product: { name: string }; quantity: number; unitPriceCop: number }>;
  };
  C: typeof Colors.light;
  t: (k: string) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const isTopUp = tx.type === "top_up";

  return (
    <TouchableOpacity
      onPress={() => setExpanded((v) => !v)}
      activeOpacity={0.85}
    >
      <View style={[styles.txCard, { backgroundColor: C.card, borderColor: C.border }]}>
        <View style={styles.txRow}>
          <View style={[styles.txIcon, { backgroundColor: isTopUp ? C.successLight : C.primaryLight }]}>
            <Feather name={isTopUp ? "plus-circle" : "shopping-bag"} size={18} color={isTopUp ? C.success : C.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.txType, { color: C.text }]}>
              {isTopUp ? t("attendee.topUp") : t("attendee.purchase")}
              {tx.location ? ` ${t("attendee.at")} ${tx.location.name}` : ""}
            </Text>
            <Text style={[styles.txDate, { color: C.textMuted }]}>{formatDateTime(tx.createdAt)}</Text>
          </View>
          <CopAmount amount={tx.amountCop} positive={isTopUp} />
        </View>
        {expanded && tx.lineItems && tx.lineItems.length > 0 && (
          <View style={[styles.lineItems, { borderTopColor: C.separator }]}>
            {tx.lineItems.map((li, idx) => (
              <View key={idx} style={styles.lineItemRow}>
                <Text style={[styles.lineItemName, { color: C.textSecondary }]}>
                  {li.quantity}× {li.product.name}
                </Text>
                <Text style={[styles.lineItemPrice, { color: C.textSecondary }]}>
                  ${(li.unitPriceCop * li.quantity).toLocaleString("es-CO")}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 32 },
  tapIcon: { width: 80, height: 80, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 20, fontFamily: "Inter_600SemiBold" },
  emptySubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  header: { gap: 10, marginBottom: 8 },
  pageTitle: { fontSize: 24, fontFamily: "Inter_700Bold" },
  balancePill: { alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100 },
  balancePillText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  txCard: { borderRadius: 14, borderWidth: 1, padding: 14 },
  txRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  txIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  txType: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  txDate: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  lineItems: { borderTopWidth: 1, marginTop: 12, paddingTop: 10, gap: 6 },
  lineItemRow: { flexDirection: "row", justifyContent: "space-between" },
  lineItemName: { fontSize: 13, fontFamily: "Inter_400Regular" },
  lineItemPrice: { fontSize: 13, fontFamily: "Inter_500Medium" },
  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalBox: { padding: 24, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 16 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  uidInput: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16, fontFamily: "Inter_400Regular" },
  row: { flexDirection: "row", gap: 12 },
});
