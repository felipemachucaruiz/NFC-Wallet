import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { CopAmount } from "@/components/CopAmount";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { isNfcSupported, scanBracelet } from "@/utils/nfc";
import { useGetBracelet } from "@workspace/api-client-react";
import { useLinkAndTransfer } from "@/hooks/useAttendeeApi";

export default function TransferBalanceScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const [oldUid, setOldUid] = useState<string | null>(null);
  const [newUid, setNewUid] = useState<string | null>(null);
  const [tappingFor, setTappingFor] = useState<"old" | "new" | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [manualFor, setManualFor] = useState<"old" | "new" | null>(null);
  const [manualUid, setManualUid] = useState("");
  const [step, setStep] = useState<"form" | "success">("form");
  const [transferredAmount, setTransferredAmount] = useState(0);

  const linkAndTransfer = useLinkAndTransfer();

  const { data: oldBraceletData } = useGetBracelet(oldUid ?? "", {
    query: { enabled: !!oldUid, queryKey: ["bracelet", oldUid] },
  });
  const { data: newBraceletData } = useGetBracelet(newUid ?? "", {
    query: { enabled: !!newUid, queryKey: ["bracelet", newUid] },
  });

  const oldBracelet = oldBraceletData as { lastKnownBalanceCop?: number; flagged?: boolean } | undefined;
  const newBracelet = newBraceletData as { lastKnownBalanceCop?: number; flagged?: boolean } | undefined;

  const handleTap = async (forBracelet: "old" | "new") => {
    if (!isNfcSupported()) {
      setManualFor(forBracelet);
      setShowManual(true);
      return;
    }
    setTappingFor(forBracelet);
    try {
      const result = await scanBracelet();
      if (forBracelet === "old") setOldUid(result.payload.uid);
      else setNewUid(result.payload.uid);
    } catch {}
    finally { setTappingFor(null); }
  };

  const handleManualConfirm = () => {
    if (!manualUid.trim()) return;
    if (manualFor === "old") setOldUid(manualUid.trim());
    else if (manualFor === "new") setNewUid(manualUid.trim());
    setShowManual(false);
    setManualUid("");
    setManualFor(null);
  };

  const handleTransfer = () => {
    if (!oldUid || !newUid) return;
    const amount = oldBracelet?.lastKnownBalanceCop ?? 0;

    Alert.alert(
      t("bankTransfer.confirmTitle"),
      `Transfer $${amount.toLocaleString("es-CO")} COP from ${oldUid} → ${newUid}?`,
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("bankTransfer.transferBtn"),
          onPress: async () => {
            try {
              const result = await linkAndTransfer.mutateAsync({ oldUid, newUid });
              setTransferredAmount((result as { transferredAmountCop?: number }).transferredAmountCop ?? amount);
              setStep("success");
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : t("common.unknownError");
              Alert.alert(t("common.error"), msg);
            }
          },
        },
      ]
    );
  };

  if (step === "success") {
    return (
      <View style={[styles.center, { backgroundColor: C.background }]}>
        <View style={[styles.iconBox, { backgroundColor: C.successLight }]}>
          <Feather name="check-circle" size={52} color={C.success} />
        </View>
        <Text style={[styles.successTitle, { color: C.text }]}>{t("bankTransfer.successTitle")}</Text>
        <View style={[styles.summaryBox, { backgroundColor: C.card, borderColor: C.border }]}>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: C.textSecondary }]}>{t("common.amount")}</Text>
            <CopAmount amount={transferredAmount} positive />
          </View>
          <View style={[styles.divider, { backgroundColor: C.separator }]} />
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: C.textSecondary }]}>{t("bankTransfer.newBracelet")}</Text>
            <Text style={[styles.uidSmall, { color: C.text }]}>{newUid}</Text>
          </View>
        </View>
        <Button title={t("bank.lookup")} onPress={() => router.back()} variant="primary" size="lg" fullWidth />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.background }}
      contentContainerStyle={{
        paddingTop: isWeb ? 67 : insets.top + 16,
        paddingBottom: isWeb ? 34 : insets.bottom + 24,
        paddingHorizontal: 20,
        gap: 20,
      }}
    >
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color={C.text} />
        </Pressable>
        <Text style={[styles.pageTitle, { color: C.text }]}>{t("bankTransfer.title")}</Text>
        <View style={{ width: 24 }} />
      </View>

      <Card>
        <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>{t("bankTransfer.oldBracelet")}</Text>
        {oldUid ? (
          <View style={styles.braceletRow}>
            <View style={[styles.nfcIcon, { backgroundColor: oldBracelet?.flagged ? C.dangerLight : C.primaryLight }]}>
              <Feather name="wifi" size={18} color={oldBracelet?.flagged ? C.danger : C.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.uid, { color: C.text }]}>{oldUid}</Text>
              {oldBracelet?.lastKnownBalanceCop !== undefined && (
                <CopAmount amount={oldBracelet.lastKnownBalanceCop} size={14} />
              )}
            </View>
            {!oldBracelet?.flagged && (
              <View style={[styles.alertBadge, { backgroundColor: C.warningLight }]}>
                <Feather name="alert-triangle" size={12} color={C.warning} />
                <Text style={[styles.alertBadgeText, { color: C.warning }]}>Not blocked</Text>
              </View>
            )}
          </View>
        ) : (
          <Button
            title={tappingFor === "old" ? t("attendee.tapping") : isNfcSupported() ? t("bankTransfer.tapOldBracelet") : t("bank.enterUid")}
            onPress={() => handleTap("old")}
            loading={tappingFor === "old"}
            variant="secondary"
            size="md"
            fullWidth
          />
        )}
      </Card>

      <Card>
        <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>{t("bankTransfer.newBracelet")}</Text>
        {newUid ? (
          <View style={styles.braceletRow}>
            <View style={[styles.nfcIcon, { backgroundColor: C.successLight }]}>
              <Feather name="wifi" size={18} color={C.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.uid, { color: C.text }]}>{newUid}</Text>
              {newBracelet?.lastKnownBalanceCop !== undefined && (
                <Text style={[styles.uidMeta, { color: C.textMuted }]}>
                  Current: ${newBracelet.lastKnownBalanceCop.toLocaleString("es-CO")}
                </Text>
              )}
            </View>
          </View>
        ) : (
          <Button
            title={tappingFor === "new" ? t("attendee.tapping") : isNfcSupported() ? t("bankTransfer.tapNewBracelet") : t("bank.enterUid")}
            onPress={() => handleTap("new")}
            loading={tappingFor === "new"}
            variant="secondary"
            size="md"
            fullWidth
          />
        )}
      </Card>

      {oldUid && newUid && (
        <Button
          title={t("bankTransfer.transferBtn")}
          onPress={handleTransfer}
          variant="primary"
          size="lg"
          fullWidth
          loading={linkAndTransfer.isPending}
          disabled={!oldBracelet?.flagged}
          testID="transfer-balance-btn"
        />
      )}

      {oldUid && newUid && !oldBracelet?.flagged && (
        <Card>
          <View style={styles.warnRow}>
            <Feather name="alert-triangle" size={14} color={C.warning} />
            <Text style={[styles.warnText, { color: C.warning }]}>
              {t("bankTransfer.oldBraceletMustBeBlocked")}
            </Text>
          </View>
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 20, paddingHorizontal: 28 },
  iconBox: { width: 100, height: 100, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  successTitle: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  summaryBox: { width: "100%", borderWidth: 1, borderRadius: 16, padding: 20, gap: 16 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  summaryLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  uidSmall: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  divider: { height: 1 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pageTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  sectionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 },
  braceletRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  nfcIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  uid: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  uidMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  alertBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  alertBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  warnRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  warnText: { fontSize: 13, fontFamily: "Inter_500Medium", flex: 1 },
  overlay: { flex: 1, justifyContent: "flex-end" },
  modalBox: { padding: 24, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 16 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  uidInput: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16, fontFamily: "Inter_400Regular" },
  modalActions: { flexDirection: "row", gap: 12 },
});
