import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useGetBracelet, useGetEvent } from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { useAlert } from "@/components/CustomAlert";
import { CopAmount } from "@/components/CopAmount";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { useFocusEffect } from "expo-router";
import { isNfcSupported, scanBracelet, cancelNfc, type TagInfo, type TagType, type NfcChipTypeHint } from "@/utils/nfc";
import { readDesfireBracelet } from "@/utils/desfire";
import { useGetSigningKey } from "@workspace/api-client-react";
import { OfflineBanner } from "@/components/OfflineBanner";
import { extractErrorMessage } from "@/utils/errorMessage";
import { SuspiciousReportModal } from "@/components/SuspiciousReportModal";
import { useAuth } from "@/contexts/AuthContext";
import { useEventContext, type NfcChipType } from "@/contexts/EventContext";
import { useZoneCache } from "@/contexts/ZoneCacheContext";
import { getPendingNfcWrites, removePendingNfcWrite, type PendingNfcWrite } from "./topup";
import { formatCurrency } from "@/utils/format";

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

function isChipAllowed(tagType: TagType, allowedNfcTypes: NfcChipType[]): boolean {
  if (tagType === "DESFIRE_EV3") {
    return allowedNfcTypes.includes("desfire_ev3");
  }
  if (tagType === "MIFARE_CLASSIC") {
    return allowedNfcTypes.includes("mifare_classic");
  }
  return allowedNfcTypes.includes("ntag_21x");
}

export default function BankLookupScreen() {
  const { t } = useTranslation();
  const { show: showAlert } = useAlert();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const { user } = useAuth();
  const { currencyCode } = useEventContext();
  const fmt = (n: number) => formatCurrency(n, currencyCode);
  const { data: eventData } = useGetEvent(user?.eventId ?? "", {
    query: { enabled: !!user?.eventId },
  });
  const eventTyped = eventData as { nfcChipType?: NfcChipType; allowedNfcTypes?: NfcChipType[] } | undefined;
  const configuredAllowedTypes: NfcChipType[] = eventTyped?.allowedNfcTypes ?? [eventTyped?.nfcChipType ?? "ntag_21x"];
  const configuredAllowedTypesRef = useRef<NfcChipType[]>(configuredAllowedTypes);
  configuredAllowedTypesRef.current = configuredAllowedTypes;

  const configuredChipType = eventTyped?.nfcChipType ?? "ntag_21x";
  const configuredChipTypeRef = useRef<NfcChipType>(configuredChipType);
  configuredChipTypeRef.current = configuredChipType;

  const { data: keyData } = useGetSigningKey();
  const desfireAesKey = (keyData as unknown as { desfireAesKey?: string } | undefined)?.desfireAesKey ?? "";
  const desfireAesKeyRef = useRef(desfireAesKey);
  desfireAesKeyRef.current = desfireAesKey;

  const [bracelet, setBracelet] = useState<BraceletState | null>(null);
  const [isTapping, setIsTapping] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualUid, setManualUid] = useState("");
  const [fetchUid, setFetchUid] = useState<string | null>(null);
  const [tagInfo, setTagInfo] = useState<TagInfo | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [pendingNfcWrites, setPendingNfcWrites] = useState<PendingNfcWrite[]>([]);
  const scanningRef = useRef(false);
  const cancelledRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      setBracelet(null);
      setFetchUid(null);
      setTagInfo(null);
      scanningRef.current = false;
      cancelledRef.current = false;
      getPendingNfcWrites().then(setPendingNfcWrites).catch(() => {});

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
      let result: { payload: BraceletState; tagInfo: TagInfo };
      if (configuredChipType === "desfire_ev3") {
        const payload = await readDesfireBracelet(desfireAesKey);
        result = { payload, tagInfo: { type: "DESFIRE_EV3" as TagType, label: "MIFARE DESFire EV3", memoryBytes: 0 } };
      } else {
        result = await scanBracelet({ expectedChipType: (configuredAllowedTypes.includes("mifare_classic") && configuredAllowedTypes.length === 1 ? "mifare_classic" : "ntag_21x") as NfcChipTypeHint });
      }
      if (cancelledRef.current) return;
      if (!isChipAllowed(result.tagInfo.type, configuredAllowedTypes)) {
        const allowedLabels = configuredAllowedTypes
          .map((ct) => (ct === "mifare_classic" ? "MIFARE Classic" : ct === "desfire_ev3" ? "DESFire EV3" : "NTAG 21x"))
          .join(", ");
        showAlert(
          t("common.error"),
          t("eventAdmin.nfcChipMismatch", { expected: allowedLabels, detected: result.tagInfo.label }),
        );
        return;
      }
      setBracelet(result.payload);
      setTagInfo(result.tagInfo);
      setFetchUid(result.payload.uid);
    } catch (e: unknown) {
      if (cancelledRef.current) return;
      const msg = extractErrorMessage(e, "");
      if (!msg.includes("cancelled") && !msg.includes("cancel") && !msg.includes("Cancel")) {
        showAlert(t("common.error"), t("common.unknownError"));
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

  const { getZonesByIds } = useZoneCache();

  const apiRecord = apiData as {
    balance?: number;
    isFlagged?: boolean;
    attendeeName?: string | null;
    phone?: string | null;
    email?: string | null;
    lastKnownBalance?: number;
    pendingSync?: boolean;
    pendingBalance?: number;
    eventId?: string | null;
    accessZoneIds?: string[];
  } | undefined;

  // When pendingSync=true a self-service top-up was applied server-side but not yet
  // written to the chip. We must use the server balance as the source of truth —
  // even when NFC was scanned — so the bank operator topups from the correct base.
  const hasPendingSync = apiRecord?.pendingSync === true;
  const serverBalance = apiRecord?.pendingBalance
    ? apiRecord.pendingBalance
    : (apiRecord?.lastKnownBalance ?? apiRecord?.balance);

  const resolveStartBalance = () => {
    if (!bracelet) return 0;
    if (hasPendingSync && serverBalance !== undefined) return serverBalance;
    return tagInfo
      ? bracelet.balance
      : (apiRecord?.lastKnownBalance ?? apiRecord?.balance ?? bracelet.balance);
  };

  // Pending NFC writes for the currently scanned bracelet (local queue on this device).
  const localPendingForUid = bracelet
    ? pendingNfcWrites.filter((pw) => pw.nfcUid === bracelet.uid)
    : [];
  const hasLocalPendingWrites = localPendingForUid.length > 0;

  const handleTopUp = () => {
    if (!bracelet) return;
    const startBalance = resolveStartBalance();
    router.push({
      pathname: "/(bank)/topup",
      params: {
        uid: bracelet.uid,
        balance: String(startBalance),
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

  const handleSyncChip = () => {
    if (!bracelet) return;
    // Pick the pending write with the highest newBalance — that's the cumulative
    // total including all successive top-ups (pendingNfcWrites are top-up-only).
    const latestLocalPending = localPendingForUid.reduce<PendingNfcWrite | null>(
      (best, pw) => (!best || pw.newBalance > best.newBalance ? pw : best),
      null
    );
    const targetBalance =
      latestLocalPending?.newBalance ??
      serverBalance ??
      apiRecord?.lastKnownBalance ??
      apiRecord?.balance ??
      bracelet.balance;
    // Pass the chip's actual current counter so topup.tsx can compute newCounter = chip+1.
    // If the latest pending write already has newCounter N, the chip is still at N-1,
    // so bracelet.counter (read from the physical chip) is the correct starting point.
    router.push({
      pathname: "/(bank)/topup",
      params: {
        uid: bracelet.uid,
        balance: String(targetBalance),
        counter: String(bracelet.counter),
        hmac: bracelet.hmac,
        tagType: tagInfo?.type ?? "",
        tagLabel: tagInfo?.label ?? "",
        tagMemoryBytes: String(tagInfo?.memoryBytes ?? 0),
        syncChip: "true",
      },
    });
  };

  const handleRefund = () => {
    if (!bracelet) return;
    const startBalance = resolveStartBalance();
    router.push({
      pathname: "/(bank)/refund",
      params: {
        uid: bracelet.uid,
        balance: String(startBalance),
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

  // When pendingSync=true use server balance as display so operator sees correct balance.
  // Otherwise trust the NFC chip (scanned) or fall back to server (manual entry).
  const displayBalance =
    (hasPendingSync || hasLocalPendingWrites) && serverBalance !== undefined
      ? serverBalance
      : tagInfo
        ? (bracelet?.balance ?? 0)
        : (apiRecord?.lastKnownBalance ?? apiRecord?.balance ?? bracelet?.balance ?? 0);
  const isFlagged = apiRecord?.isFlagged ?? false;
  const isWrongEvent = !!apiRecord && !!apiRecord.eventId && !!user?.eventId && apiRecord.eventId !== user.eventId;
  const currentZones = getZonesByIds(apiRecord?.accessZoneIds ?? []);

  const handleUpgradeAccess = () => {
    if (!bracelet) return;
    router.push({
      pathname: "/(bank)/upgrade-access",
      params: {
        uid: bracelet.uid,
        tagType: tagInfo?.type ?? "",
        tagLabel: tagInfo?.label ?? "",
        tagMemoryBytes: String(tagInfo?.memoryBytes ?? 0),
        counter: String(bracelet.counter),
        hmac: bracelet.hmac,
        balance: String(bracelet.balance),
      },
    });
  };

  return (
    <>
    <OfflineBanner syncIssuesRoute={"/(bank)/sync-issues"} />
    <ScrollView
      style={{ flex: 1, backgroundColor: C.background }}
      contentContainerStyle={{
        paddingTop: isWeb ? 16 : insets.top + 16,
        paddingBottom: isWeb ? 34 : insets.bottom + 80,
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
                {isWrongEvent && <Badge label={t("bank.wrongEvent")} variant="danger" />}
                {hasPendingSync && <Badge label="Recarga pendiente" variant="warning" />}
              </View>

              <View style={[styles.divider, { backgroundColor: C.separator }]} />

              {hasPendingSync && (
                <View style={[styles.alertBox, { backgroundColor: C.warningLight, borderColor: C.warning }]}>
                  <Feather name="clock" size={15} color={C.warning} />
                  <Text style={[styles.alertText, { color: C.warning }]}>
                    Esta pulsera tiene una recarga self-service pendiente. El saldo mostrado ya incluye esa recarga. Al hacer topup aquí, se tomará este saldo como base.
                  </Text>
                </View>
              )}

              <View style={styles.balanceSection}>
                <Text style={[styles.balanceLabel, { color: C.textSecondary }]}>
                  {t("bank.currentBalance")}
                </Text>
                <CopAmount amount={displayBalance} size={36} />
                {hasPendingSync && (
                  <Text style={[styles.pendingSyncNote, { color: C.warning }]}>
                    Incluye recarga self-service • se sincronizará al tocar
                  </Text>
                )}
              </View>

              {isWrongEvent ? (
                <View style={[styles.alertBox, { backgroundColor: C.dangerLight }]}>
                  <Feather name="alert-triangle" size={16} color={C.danger} />
                  <Text style={[styles.alertText, { color: C.danger }]}>
                    {t("bank.wrongEventDetail")}
                  </Text>
                </View>
              ) : isFlagged ? (
                <View style={[styles.alertBox, { backgroundColor: C.dangerLight }]}>
                  <Feather name="alert-triangle" size={16} color={C.danger} />
                  <Text style={[styles.alertText, { color: C.danger }]}>
                    {t("bank.braceletFlagged")}
                  </Text>
                </View>
              ) : (
                <>
                  {hasLocalPendingWrites && (
                    <View style={[styles.alertBox, { backgroundColor: C.dangerLight ?? "#FEE2E2", borderColor: C.danger ?? "#EF4444" }]}>
                      <Feather name="alert-octagon" size={15} color={C.danger ?? "#EF4444"} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.alertText, { color: C.danger ?? "#EF4444", fontFamily: "Inter_600SemiBold" }]}>
                          Chip desactualizado — {localPendingForUid.length} recarga(s) sin escribir
                        </Text>
                        <Text style={[styles.alertText, { color: C.danger ?? "#EF4444", fontSize: 12, marginTop: 2 }]}>
                          El saldo mostrado es el del servidor. Toca "Sincronizar chip" para actualizarlo.
                        </Text>
                      </View>
                    </View>
                  )}
                  <View style={styles.actionButtons}>
                    {hasLocalPendingWrites ? (
                      <View style={{ flex: 1 }}>
                        <Button
                          title="Sincronizar chip"
                          onPress={handleSyncChip}
                          variant="primary"
                          size="lg"
                          fullWidth
                          icon="refresh-cw"
                        />
                      </View>
                    ) : (
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
                    )}
                    {!hasLocalPendingWrites && displayBalance > 0 && (
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
                  {hasLocalPendingWrites && (
                    <Button
                      title={t("bank.confirmTopUp")}
                      onPress={handleTopUp}
                      variant="ghost"
                      size="md"
                      fullWidth
                      icon="plus-circle"
                    />
                  )}

                  {/* Current Access Zones card */}
                  {apiRecord && (
                    <View style={[styles.accessCard, { backgroundColor: C.inputBg, borderColor: C.border }]}>
                      <Text style={[styles.accessCardLabel, { color: C.textSecondary }]}>{t("zones.currentAccess")}</Text>
                      {currentZones.length === 0 ? (
                        <Text style={[styles.accessCardEmpty, { color: C.textMuted }]}>{t("zones.noAccess")}</Text>
                      ) : (
                        <View style={styles.zoneBadges}>
                          {currentZones.map((z) => (
                            <View key={z.id} style={[styles.zoneBadge, { backgroundColor: z.colorHex + "22", borderColor: z.colorHex }]}>
                              <View style={[styles.zoneDot, { backgroundColor: z.colorHex }]} />
                              <Text style={[styles.zoneBadgeText, { color: z.colorHex }]}>{z.name}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                      <Button
                        title={t("zones.upgradeAccess")}
                        onPress={handleUpgradeAccess}
                        variant="primary"
                        size="sm"
                        fullWidth
                        icon="arrow-up-circle"
                      />
                    </View>
                  )}
                </>
              )}
            </View>
          )}
        </Card>
      )}

      {pendingNfcWrites.length > 0 && (
        <Card>
          <View style={styles.pendingWritesHeader}>
            <View style={[styles.pendingWritesIconBox, { backgroundColor: C.dangerLight ?? "#FEE2E2" }]}>
              <Feather name="alert-octagon" size={18} color={C.danger ?? "#EF4444"} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.pendingWritesTitle, { color: C.text }]}>
                {t("bank.pendingNfcWritesTitle")}
              </Text>
              <Text style={[styles.pendingWritesSubtitle, { color: C.textSecondary }]}>
                {t("bank.pendingNfcWritesSubtitle", { count: pendingNfcWrites.length })}
              </Text>
            </View>
          </View>
          {pendingNfcWrites.map((pw) => (
            <View key={pw.id} style={[styles.pendingWriteItem, { borderColor: C.border }]}>
              <Feather name="wifi-off" size={14} color={C.danger ?? "#EF4444"} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.pendingWriteAmount, { color: C.text }]}>
                  {fmt(pw.amount)} — {pw.nfcUid}
                </Text>
                <Text style={[styles.pendingWriteTime, { color: C.textMuted }]}>
                  {t("bank.pendingNfcWriteAt", { time: new Date(pw.savedAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" }) })}
                </Text>
                <Pressable
                  onPress={() => {
                    removePendingNfcWrite(pw.id).then(() =>
                      setPendingNfcWrites((prev) => prev.filter((e) => e.id !== pw.id))
                    );
                  }}
                  style={[styles.pendingWriteResolveBtn, { borderColor: C.border }]}
                >
                  <Feather name="check" size={11} color={C.textSecondary} />
                  <Text style={[styles.pendingWriteResolveText, { color: C.textSecondary }]}>
                    {t("bank.clearPendingNfcWrite")}
                  </Text>
                </Pressable>
              </View>
            </View>
          ))}
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
  alertBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: "transparent" },
  alertText: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 18 },
  pendingSyncNote: { fontSize: 11, fontFamily: "Inter_500Medium", textAlign: "center", marginTop: 2 },
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
  accessCard: { gap: 12, padding: 16, borderRadius: 16, borderWidth: 1 },
  accessCardLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8 },
  accessCardEmpty: { fontSize: 13, fontFamily: "Inter_400Regular" },
  zoneBadges: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  zoneBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100, borderWidth: 2 },
  zoneDot: { width: 8, height: 8, borderRadius: 4 },
  zoneBadgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  pendingWritesHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 },
  pendingWritesIconBox: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  pendingWritesTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  pendingWritesSubtitle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  pendingWriteItem: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 10, borderTopWidth: 1 },
  pendingWriteAmount: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  pendingWriteTime: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  pendingWriteResolveBtn: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6, borderWidth: 1, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8, alignSelf: "flex-start" },
  pendingWriteResolveText: { fontSize: 11, fontFamily: "Inter_500Medium" },
});
