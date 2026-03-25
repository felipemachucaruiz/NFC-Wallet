import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
import { Card } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { isNfcSupported, readBracelet } from "@/utils/nfc";
import { formatDateTime } from "@/utils/format";

interface BraceletState {
  uid: string;
  balance: number;
  counter: number;
  hmac: string;
}

export default function BankLookupScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const [bracelet, setBracelet] = useState<BraceletState | null>(null);
  const [isTapping, setIsTapping] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualUid, setManualUid] = useState("");
  const [fetchUid, setFetchUid] = useState<string | null>(null);

  const { data: apiData, isLoading } = useGetBracelet(fetchUid ?? "", {
    query: { enabled: !!fetchUid },
  });

  const handleTap = async () => {
    if (!isNfcSupported()) {
      setShowManual(true);
      return;
    }
    setIsTapping(true);
    try {
      const payload = await readBracelet();
      setBracelet(payload);
      setFetchUid(payload.uid);
    } catch (e: unknown) {
      Alert.alert(t("common.error"), t("common.unknownError"));
    } finally {
      setIsTapping(false);
    }
  };

  const handleManualConfirm = () => {
    if (!manualUid.trim()) return;
    const uid = manualUid.trim();
    setBracelet({ uid, balance: 0, counter: 0, hmac: "" });
    setFetchUid(uid);
    setShowManual(false);
    setManualUid("");
  };

  const handleTopUp = () => {
    if (!bracelet) return;
    const apiBalance = (apiData as { balanceCop?: number } | undefined)?.balanceCop ?? bracelet.balance;
    router.push({
      pathname: "/(bank)/topup",
      params: {
        uid: bracelet.uid,
        balance: String(apiBalance),
        counter: String(bracelet.counter),
        hmac: bracelet.hmac,
      },
    });
  };

  const displayBalance = (apiData as { balanceCop?: number } | undefined)?.balanceCop ?? bracelet?.balance ?? 0;
  const isFlagged = (apiData as { isFlagged?: boolean } | undefined)?.isFlagged ?? false;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.background }}
      contentContainerStyle={{
        paddingTop: isWeb ? 67 : insets.top + 16,
        paddingBottom: isWeb ? 34 : insets.bottom + 100,
        paddingHorizontal: 20,
        gap: 20,
      }}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: C.text }]}>{t("bank.title")}</Text>
        <Text style={[styles.subtitle, { color: C.textSecondary }]}>
          {t("bank.lookupSubtitle")}
        </Text>
      </View>

      <View style={styles.tapSection}>
        <Button
          title={isTapping ? t("attendee.tapping") : isNfcSupported() ? t("bank.tapBracelet") : t("bank.manualUid")}
          onPress={handleTap}
          loading={isTapping}
          variant="primary"
          size="lg"
          fullWidth
          testID="bank-tap-btn"
        />
        {!isNfcSupported() && (
          <Button title={t("bank.enterUidManual")} onPress={() => setShowManual(true)} variant="ghost" size="md" fullWidth />
        )}
      </View>

      {bracelet && (
        <Card>
          {isLoading ? (
            <Loading full={false} label={t("common.loading")} />
          ) : (
            <View style={styles.braceletInfo}>
              <View style={styles.braceletRow}>
                <View style={[styles.nfcIcon, { backgroundColor: C.primaryLight }]}>
                  <Feather name="wifi" size={20} color={C.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.uidLabel, { color: C.textMuted }]}>UID</Text>
                  <Text style={[styles.uid, { color: C.text }]}>{bracelet.uid}</Text>
                </View>
                {isFlagged && <Badge label="Flagged" variant="danger" />}
              </View>

              <View style={[styles.divider, { backgroundColor: C.separator }]} />

              <View style={styles.balanceSection}>
                <Text style={[styles.balanceLabel, { color: C.textSecondary }]}>
                  {t("bank.currentBalance")}
                </Text>
                <CopAmount amount={displayBalance} size={36} />
              </View>

              {isFlagged ? (
                <View style={[styles.alertBox, { backgroundColor: C.dangerLight }]}>
                  <Feather name="alert-triangle" size={16} color={C.danger} />
                  <Text style={[styles.alertText, { color: C.danger }]}>
                    {t("bank.braceletFlagged")}
                  </Text>
                </View>
              ) : (
                <Button
                  title={t("bank.confirmTopUp")}
                  onPress={handleTopUp}
                  variant="success"
                  size="lg"
                  fullWidth
                  testID="bank-topup-btn"
                />
              )}
            </View>
          )}
        </Card>
      )}

      <Modal visible={showManual} transparent animationType="slide">
        <View style={[styles.overlay, { backgroundColor: C.overlay }]}>
          <View style={[styles.modalBox, { backgroundColor: C.card }]}>
            <Text style={[styles.modalTitle, { color: C.text }]}>{t("common.enterUidTitle")}</Text>
            <TextInput
              style={[styles.uidInput, { backgroundColor: C.inputBg, color: C.text, borderColor: C.border }]}
              placeholder={t("attendee.uidPlaceholder")}
              placeholderTextColor={C.textMuted}
              value={manualUid}
              onChangeText={setManualUid}
              autoCapitalize="characters"
            />
            <View style={styles.modalActions}>
              <Button title={t("common.cancel")} onPress={() => setShowManual(false)} variant="secondary" />
              <Button title={t("common.confirm")} onPress={handleManualConfirm} variant="primary" />
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { gap: 4 },
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular" },
  tapSection: { gap: 8 },
  braceletInfo: { gap: 16 },
  braceletRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  nfcIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  uidLabel: { fontSize: 11, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.5 },
  uid: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginTop: 2 },
  divider: { height: 1 },
  balanceSection: { alignItems: "center", gap: 4, paddingVertical: 8 },
  balanceLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  alertBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 10 },
  alertText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  overlay: { flex: 1, justifyContent: "flex-end" },
  modalBox: { padding: 24, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 16 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  uidInput: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16, fontFamily: "Inter_400Regular" },
  modalActions: { flexDirection: "row", gap: 12 },
});
