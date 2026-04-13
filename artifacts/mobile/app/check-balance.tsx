import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import React, { useState, useEffect, useCallback } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import Colors from "@/constants/colors";
import { useAlert } from "@/components/CustomAlert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { CopAmount } from "@/components/CopAmount";
import { isNfcSupported, scanBracelet, scanAndWriteBracelet, cancelNfc } from "@/utils/nfc";
import { computeHmac } from "@/utils/hmac";
import { customFetch } from "@workspace/api-client-react";
import { useGetSigningKey } from "@workspace/api-client-react";
import { useOfflineQueue } from "@/contexts/OfflineQueueContext";
import { extractErrorMessage } from "@/utils/errorMessage";

type BraceletInfo = {
  nfcUid: string;
  attendeeName?: string | null;
  eventId?: string | null;
  flagged?: boolean;
};

type TxEntry = {
  id: string;
  type?: "charge" | "topup";
  grossAmount: number;
  newBalance: number;
  createdAt: string;
  offlineCreatedAt?: string | null;
  merchantName?: string | null;
  locationName?: string | null;
};

type ScanResult = {
  uid: string;
  balance: number;
  counter: number;
};

export default function CheckBalanceScreen() {
  const { t } = useTranslation();
  const { show: showAlert } = useAlert();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [scanning, setScanning] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [bracelet, setBracelet] = useState<BraceletInfo | null>(null);
  const [transactions, setTransactions] = useState<TxEntry[]>([]);
  const [txError, setTxError] = useState(false);
  const [serverLoading, setServerLoading] = useState(false);

  const { data: keyData } = useGetSigningKey();
  const networkHmacSecret = (keyData as unknown as { hmacSecret?: string } | undefined)?.hmacSecret ?? "";
  const ultralightCDesKey = (keyData as unknown as { ultralightCDesKey?: string } | undefined)?.ultralightCDesKey ?? "";
  const { cachedHmacSecret } = useOfflineQueue();
  const hmacSecret = networkHmacSecret || cachedHmacSecret;

  const loadServerData = useCallback(async (uid: string) => {
    setServerLoading(true);
    setTxError(false);
    try {
      const [infoResult, txResult] = await Promise.allSettled([
        customFetch<BraceletInfo>(`/api/bracelets/${uid}`),
        customFetch<{ transactions: TxEntry[] }>(`/api/bracelets/${uid}/transactions?limit=5`),
      ]);
      if (infoResult.status === "fulfilled") {
        setBracelet(infoResult.value ?? null);
      } else {
        setBracelet(null);
      }
      if (txResult.status === "fulfilled") {
        setTransactions(txResult.value?.transactions ?? []);
      } else {
        setTransactions([]);
        setTxError(true);
      }
    } finally {
      setServerLoading(false);
    }
  }, []);

  const handleScan = async () => {
    if (!isNfcSupported()) {
      showAlert(t("common.error"), t("checkBalance.nfcNotSupported"));
      return;
    }
    setScanning(true);
    setResult(null);
    setBracelet(null);
    setTransactions([]);
    try {
      const scan = await scanBracelet();
      if (scan?.payload?.uid) {
        const { uid, balance, counter } = scan.payload;
        setResult({ uid, balance, counter });
        loadServerData(uid);
      }
    } catch (e: unknown) {
      const msg = extractErrorMessage(e, "");
      if (!msg.includes("cancelled") && !msg.includes("UserCancel")) {
        showAlert(t("common.error"), t("pos.scanError"));
      }
    } finally {
      setScanning(false);
    }
  };

  const handleResetBalance = () => {
    if (!result) return;
    showAlert(
      t("checkBalance.resetBalance"),
      t("checkBalance.resetBalanceConfirm"),
      [
        { text: t("common.cancel"), variant: "cancel" },
        {
          text: t("checkBalance.resetBalance"),
          variant: "danger",
          onPress: async () => {
            if (!isNfcSupported()) {
              showAlert(t("common.error"), t("checkBalance.nfcNotSupported"));
              return;
            }
            if (!hmacSecret) {
              showAlert(t("common.error"), t("common.unknownError"));
              return;
            }
            setResetting(true);
            try {
              await scanAndWriteBracelet(async (payload, tagInfo) => {
                if (payload.uid !== result.uid) {
                  showAlert(t("common.error"), t("checkBalance.wrongBracelet"));
                  return null;
                }
                const newCounter = tagInfo?.type === "MIFARE_CLASSIC"
                  ? (payload.counter ?? 0)
                  : (payload.counter ?? 0) + 1;
                const newHmac = await computeHmac(0, newCounter, hmacSecret);
                return { uid: payload.uid, balance: 0, counter: newCounter, hmac: newHmac };
              }, ultralightCDesKey ? { ultralightCKeyHex: ultralightCDesKey } : undefined);

              // Sync the DB reset
              await customFetch(`/api/admin/bracelets/${result.uid}/reset-balance`, { method: "POST" });

              setResult((prev) => prev ? { ...prev, balance: 0 } : prev);
              setBracelet((prev) => prev);
              showAlert(t("common.success"), t("checkBalance.resetBalanceSuccess"));
            } catch (e: unknown) {
              const msg = extractErrorMessage(e, "");
              if (!msg.includes("cancelled") && !msg.includes("UserCancel")) {
                showAlert(t("common.error"), t("checkBalance.resetBalanceError"));
              }
            } finally {
              setResetting(false);
            }
          },
        },
      ],
    );
  };

  useEffect(() => {
    return () => {
      cancelNfc().catch(() => {});
    };
  }, []);

  const formatDate = (iso: string | null | undefined) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Bogota" }) + " " + d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" });
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.background }}
      contentContainerStyle={{
        paddingTop: isWeb ? 24 : insets.top + 16,
        paddingBottom: isWeb ? 40 : insets.bottom + 40,
        paddingHorizontal: 20,
        gap: 16,
      }}
    >
      <Pressable onPress={() => router.back()} style={styles.backRow}>
        <Feather name="arrow-left" size={20} color={C.primary} />
        <Text style={[styles.backText, { color: C.primary }]}>{t("common.back")}</Text>
      </Pressable>

      <Text style={[styles.title, { color: C.text }]}>{t("checkBalance.title")}</Text>
      <Text style={[styles.subtitle, { color: C.textSecondary }]}>{t("checkBalance.subtitle")}</Text>

      {isNfcSupported() ? (
        <Button
          title={scanning ? t("checkBalance.scanning") : t("checkBalance.scanBtn")}
          onPress={handleScan}
          disabled={scanning || resetting}
          loading={scanning}
        />
      ) : (
        <Card style={styles.noNfcCard}>
          <Feather name="wifi-off" size={20} color={C.textMuted} />
          <Text style={[styles.noNfcText, { color: C.textSecondary }]}>{t("checkBalance.nfcNotSupported")}</Text>
        </Card>
      )}

      {result && (
        <>
          <Card style={styles.balanceCard}>
            <View style={styles.balanceRow}>
              <View>
                <Text style={[styles.balanceLabel, { color: C.textSecondary }]}>{t("checkBalance.balance")}</Text>
                <CopAmount
                  amount={result.balance}
                  style={[styles.balanceAmount, { color: result.balance > 0 ? C.primary : C.text }]}
                />
              </View>
              {bracelet?.flagged && (
                <View style={[styles.flagBadge, { backgroundColor: C.dangerLight }]}>
                  <Feather name="alert-triangle" size={14} color={C.danger} />
                  <Text style={[styles.flagText, { color: C.danger }]}>{t("checkBalance.flagged")}</Text>
                </View>
              )}
            </View>

            <View style={[styles.divider, { backgroundColor: C.border }]} />

            <InfoRow label={t("checkBalance.braceletId")} value={result.uid} C={C} />
            {serverLoading ? (
              <Loading />
            ) : (
              <>
                {bracelet?.attendeeName && (
                  <InfoRow label={t("checkBalance.owner")} value={bracelet.attendeeName} C={C} />
                )}
                {bracelet?.eventId && (
                  <InfoRow label={t("checkBalance.event")} value={bracelet.eventId} C={C} />
                )}
              </>
            )}

            {isAdmin && (
              <>
                <View style={[styles.divider, { backgroundColor: C.border }]} />
                <Button
                  title={t("checkBalance.resetBalance")}
                  onPress={handleResetBalance}
                  variant="secondary"
                  loading={resetting}
                  disabled={scanning}
                />
              </>
            )}
          </Card>

          <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>{t("checkBalance.recentTx")}</Text>

          {serverLoading ? (
            <Loading />
          ) : txError ? (
            <Card>
              <Text style={[styles.noTxText, { color: C.danger }]}>{t("checkBalance.fetchError")}</Text>
            </Card>
          ) : transactions.length === 0 ? (
            <Card>
              <Text style={[styles.noTxText, { color: C.textMuted }]}>{t("checkBalance.noTx")}</Text>
            </Card>
          ) : (
            transactions.map((tx) => {
              const isTopup = tx.type === "topup";
              const amountColor = isTopup ? C.success ?? "#16a34a" : C.danger;
              const amountValue = isTopup ? tx.grossAmount : -tx.grossAmount;
              const label = isTopup
                ? (tx.merchantName ?? t("bank.topUpLabel"))
                : (tx.merchantName ?? "—");
              return (
                <Card key={tx.id} style={styles.txCard}>
                  <View style={styles.txRow}>
                    <View style={[styles.txTypeIcon, { backgroundColor: isTopup ? "#dcfce7" : "#fee2e2" }]}>
                      <Feather name={isTopup ? "arrow-down-circle" : "arrow-up-circle"} size={16} color={amountColor} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.txMerchant, { color: C.text }]} numberOfLines={1}>
                        {label}
                      </Text>
                      {tx.locationName && (
                        <Text style={[styles.txLocation, { color: C.textMuted }]} numberOfLines={1}>
                          {tx.locationName}
                        </Text>
                      )}
                      <Text style={[styles.txDate, { color: C.textMuted }]}>
                        {formatDate(tx.offlineCreatedAt ?? tx.createdAt)}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 2 }}>
                      <CopAmount
                        amount={amountValue}
                        style={[styles.txAmount, { color: amountColor }]}
                      />
                      <Text style={[styles.txBalance, { color: C.textMuted }]}>
                        → {new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 }).format(tx.newBalance)}
                      </Text>
                    </View>
                  </View>
                </Card>
              );
            })
          )}
        </>
      )}
    </ScrollView>
  );
}

function InfoRow({ label, value, C }: { label: string; value: string; C: typeof Colors.light }) {
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: C.textSecondary }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: C.text }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: -4 },
  backText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: -8 },
  noNfcCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 16 },
  noNfcText: { fontSize: 14, fontFamily: "Inter_400Regular", flex: 1 },
  balanceCard: { gap: 12 },
  balanceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  balanceLabel: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 2 },
  balanceAmount: { fontSize: 28, fontFamily: "Inter_700Bold" },
  flagBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  flagText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  divider: { height: 1 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  infoLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  infoValue: { fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1, textAlign: "right", marginLeft: 12 },
  sectionTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  noTxText: { textAlign: "center", fontFamily: "Inter_400Regular", fontSize: 14, paddingVertical: 8 },
  txCard: { padding: 12 },
  txRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  txTypeIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  txMerchant: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  txLocation: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  txDate: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4 },
  txAmount: { fontSize: 15, fontFamily: "Inter_700Bold" },
  txBalance: { fontSize: 12, fontFamily: "Inter_400Regular" },
});
