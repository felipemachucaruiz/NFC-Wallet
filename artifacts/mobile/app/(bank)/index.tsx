import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Modal,
  Platform,
  Pressable,
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
import { useFocusEffect } from "expo-router";
import { isNfcSupported, scanBracelet, cancelNfc, type TagInfo } from "@/utils/nfc";
import { OfflineBanner } from "@/components/OfflineBanner";
import { SuspiciousReportModal } from "@/components/SuspiciousReportModal";

interface BraceletState {
  uid: string;
  balance: number;
  counter: number;
  hmac: string;
}

function TagBadge({ tagInfo, colors }: { tagInfo: TagInfo; colors: typeof Colors.light }) {
  const label =
    tagInfo.memoryBytes > 0
      ? `${tagInfo.label} · ${tagInfo.memoryBytes} B`
      : tagInfo.label;
  return (
    <View style={[tagBadgeStyles.badge, { backgroundColor: colors.primaryLight }]}>
      <Feather name="cpu" size={11} color={colors.primary} />
      <Text style={[tagBadgeStyles.text, { color: colors.primary }]}>{label}</Text>
    </View>
  );
}

const tagBadgeStyles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  text: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
});

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
  const [tagInfo, setTagInfo] = useState<TagInfo | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const scanningRef = useRef(false);
  const cancelledRef = useRef(false);

  // Auto-start NFC scan when screen comes into focus (e.g. opening or returning from topup/refund)
  useFocusEffect(
    useCallback(() => {
      setBracelet(null);
      setFetchUid(null);
      setTagInfo(null);
      scanningRef.current = false;
      cancelledRef.current = false;

      if (isNfcSupported()) {
        setIsTapping(true);
        scanningRef.current = true;
        scanBracelet()
          .then((result) => {
            if (cancelledRef.current) return;
            setBracelet(result.payload);
            setTagInfo(result.tagInfo);
            setFetchUid(result.payload.uid);
          })
          .catch((e: unknown) => {
            if (cancelledRef.current) return;
            const msg = e instanceof Error ? e.message : "";
            if (!msg.includes("cancelled") && !msg.includes("cancel") && !msg.includes("Cancel")) {
              // Silently fail — user can tap the button manually
            }
          })
          .finally(() => {
            if (!cancelledRef.current) setIsTapping(false);
            scanningRef.current = false;
          });
      }

      return () => {
        cancelledRef.current = true;
        cancelNfc().catch(() => {});
        scanningRef.current = false;
        setIsTapping(false);
      };
    }, [])
  );

  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!isTapping) { pulseAnim.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.25, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isTapping]);

  const { data: apiData, isLoading } = useGetBracelet(fetchUid ?? "", {
    query: { enabled: !!fetchUid },
  });

  const handleTap = async () => {
    if (!isNfcSupported()) {
      setShowManual(true);
      return;
    }
    if (scanningRef.current) return;
    cancelledRef.current = false;
    scanningRef.current = true;
    setIsTapping(true);
    try {
      const result = await scanBracelet();
      if (cancelledRef.current) return;
      setBracelet(result.payload);
      setTagInfo(result.tagInfo);
      setFetchUid(result.payload.uid);
    } catch (e: unknown) {
      if (cancelledRef.current) return;
      const msg = e instanceof Error ? e.message : "";
      if (!msg.includes("cancelled") && !msg.includes("cancel") && !msg.includes("Cancel")) {
        Alert.alert(t("common.error"), t("common.unknownError"));
      }
    } finally {
      scanningRef.current = false;
      if (!cancelledRef.current) setIsTapping(false);
    }
  };

  const handleCancelScan = async () => {
    cancelledRef.current = true;
    await cancelNfc();
    scanningRef.current = false;
    setIsTapping(false);
  };

  const handleManualConfirm = () => {
    if (!manualUid.trim()) return;
    const uid = manualUid.trim();
    setBracelet({ uid, balance: 0, counter: 0, hmac: "" });
    setTagInfo(null);
    setFetchUid(uid);
    setShowManual(false);
    setManualUid("");
  };

  const apiRecord = apiData as {
    balanceCop?: number;
    isFlagged?: boolean;
    attendeeName?: string | null;
    phone?: string | null;
    email?: string | null;
    lastKnownBalanceCop?: number;
  } | undefined;

  const handleTopUp = () => {
    if (!bracelet) return;
    const apiBalance = apiRecord?.lastKnownBalanceCop ?? apiRecord?.balanceCop ?? bracelet.balance;
    router.push({
      pathname: "/(bank)/topup",
      params: {
        uid: bracelet.uid,
        balance: String(apiBalance),
        counter: String(bracelet.counter),
        hmac: bracelet.hmac,
        tagType: tagInfo?.type ?? "",
        tagLabel: tagInfo?.label ?? "",
        tagMemoryBytes: String(tagInfo?.memoryBytes ?? 0),
        attendeeName: apiRecord?.attendeeName ?? "",
        phone: apiRecord?.phone ?? "",
        email: apiRecord?.email ?? "",
      },
    });
  };

  const handleRefund = () => {
    if (!bracelet) return;
    const apiBalance = apiRecord?.lastKnownBalanceCop ?? apiRecord?.balanceCop ?? bracelet.balance;
    router.push({
      pathname: "/(bank)/refund",
      params: {
        uid: bracelet.uid,
        balance: String(apiBalance),
        counter: String(bracelet.counter),
        hmac: bracelet.hmac,
        tagType: tagInfo?.type ?? "",
        tagLabel: tagInfo?.label ?? "",
        tagMemoryBytes: String(tagInfo?.memoryBytes ?? 0),
        attendeeName: apiRecord?.attendeeName ?? "",
        phone: apiRecord?.phone ?? "",
        email: apiRecord?.email ?? "",
      },
    });
  };

  const displayBalance = apiRecord?.lastKnownBalanceCop ?? apiRecord?.balanceCop ?? bracelet?.balance ?? 0;
  const isFlagged = apiRecord?.isFlagged ?? false;

  return (
    <>
    <OfflineBanner syncIssuesRoute={"/(bank)/sync-issues"} />
    <ScrollView
      style={{ flex: 1, backgroundColor: C.background }}
      contentContainerStyle={{
        paddingTop: isWeb ? 16 : insets.top + 16,
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
        <Button
          title={t("fraud.reportSuspicious")}
          onPress={() => setShowReportModal(true)}
          variant="secondary"
          size="md"
          fullWidth
          icon="alert-triangle"
        />
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
                  {tagInfo && <TagBadge tagInfo={tagInfo} colors={C} />}
                </View>
                {isFlagged && <Badge label={t("bank.flagged")} variant="danger" />}
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
                <View style={styles.actionButtons}>
                  <View style={{ flex: 1 }}>
                    <Button
                      title={t("bank.confirmTopUp")}
                      onPress={handleTopUp}
                      variant="success"
                      size="lg"
                      fullWidth
                      testID="bank-topup-btn"
                    />
                  </View>
                  {displayBalance > 0 && (
                    <View style={{ flex: 1 }}>
                      <Button
                        title={t("bank.issueRefund")}
                        onPress={handleRefund}
                        variant="secondary"
                        size="lg"
                        fullWidth
                        testID="bank-refund-btn"
                      />
                    </View>
                  )}
                </View>
              )}
            </View>
          )}
        </Card>
      )}

      <Card>
        <View style={styles.quickLinks}>
          <Pressable
            style={[styles.quickLinkBtn, { backgroundColor: C.primaryLight }]}
            onPress={() => router.push("/(bank)/refund-requests")}
          >
            <Feather name="inbox" size={18} color={C.primary} />
            <Text style={[styles.quickLinkText, { color: C.primary }]}>{t("bankRefundRequests.title")}</Text>
          </Pressable>
          <Pressable
            style={[styles.quickLinkBtn, { backgroundColor: C.primaryLight }]}
            onPress={() => router.push("/(bank)/transfer-balance")}
          >
            <Feather name="shuffle" size={18} color={C.primary} />
            <Text style={[styles.quickLinkText, { color: C.primary }]}>{t("bankTransfer.title")}</Text>
          </Pressable>
        </View>
      </Card>

      {/* NFC Scan Waiting Modal */}
      <Modal visible={isTapping} transparent animationType="fade">
        <View style={[styles.overlay, { backgroundColor: "rgba(0,0,0,0.6)" }]}>
          <View style={[styles.modalBox, { backgroundColor: C.card, alignItems: "center", gap: 24 }]}>
            <Animated.View
              style={[
                styles.nfcPulse,
                { backgroundColor: C.primaryLight, transform: [{ scale: pulseAnim }] },
              ]}
            >
              <Feather name="wifi" size={48} color={C.primary} />
            </Animated.View>
            <View style={{ alignItems: "center", gap: 6 }}>
              <Text style={[styles.modalTitle, { color: C.text, textAlign: "center" }]}>
                {t("bank.acercarManilla")}
              </Text>
              <Text style={[styles.scanHint, { color: C.textSecondary }]}>
                {t("bank.holdSteady")}
              </Text>
            </View>
            <Pressable onPress={handleCancelScan} style={[styles.cancelBtn, { borderColor: C.border }]}>
              <Text style={[styles.cancelText, { color: C.textSecondary }]}>{t("common.cancel")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

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

      <SuspiciousReportModal
        visible={showReportModal}
        onClose={() => setShowReportModal(false)}
        prefillUid={bracelet?.uid}
      />
    </ScrollView>
    </>
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
  actionButtons: { flexDirection: "row", gap: 10 },
  overlay: { flex: 1, justifyContent: "center", paddingHorizontal: 32 },
  modalBox: { padding: 32, borderRadius: 24, gap: 16 },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  uidInput: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16, fontFamily: "Inter_400Regular" },
  modalActions: { flexDirection: "row", gap: 12 },
  nfcPulse: { width: 100, height: 100, borderRadius: 50, alignItems: "center", justifyContent: "center" },
  scanHint: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  cancelBtn: { borderWidth: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 32 },
  cancelText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  quickLinks: { flexDirection: "row", gap: 12 },
  quickLinkBtn: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 12, justifyContent: "center" },
  quickLinkText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
