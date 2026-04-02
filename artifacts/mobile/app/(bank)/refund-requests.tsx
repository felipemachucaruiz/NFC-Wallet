import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useGetSigningKey } from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { CopAmount } from "@/components/CopAmount";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Loading } from "@/components/ui/Loading";
import { Badge } from "@/components/ui/Badge";
import { formatDateTime } from "@/utils/format";
import {
  useBankRefundRequests,
  useProcessRefundRequest,
  useConfirmChipZero,
} from "@/hooks/useAttendeeApi";
import { isNfcSupported, scanAndWriteBracelet } from "@/utils/nfc";
import { zeroDesfireBracelet } from "@/utils/desfire";
import { computeHmac } from "@/utils/hmac";
import type { BraceletPayload } from "@/utils/hmac";

type RefundRequest = {
  id: string;
  attendeeUserId: string;
  braceletUid: string;
  eventId: string;
  amountCop: number;
  liveAmountCop?: number | null;
  refundMethod: "cash" | "nequi" | "bancolombia" | "other";
  accountDetails?: string | null;
  notes?: string | null;
  status: "pending" | "approved" | "rejected";
  chipZeroed: boolean;
  createdAt: string;
};

type NfcStep = "idle" | "tap" | "writing" | "error" | "done";

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  nequi: "Nequi",
  bancolombia: "Bancolombia",
  other: "Other",
};

const METHOD_ICONS: Record<string, React.ComponentProps<typeof Feather>["name"]> = {
  cash: "dollar-sign",
  nequi: "smartphone",
  bancolombia: "home",
  other: "more-horizontal",
};

export default function BankRefundRequestsScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const [filter, setFilter] = useState<"all" | "pending">("pending");
  const [nfcStep, setNfcStep] = useState<NfcStep>("idle");
  const [activeRequest, setActiveRequest] = useState<RefundRequest | null>(null);

  const writingRef = useRef(false);
  const cancelledRef = useRef(false);

  const { data, isLoading, refetch, isRefetching } = useBankRefundRequests();
  const processRequest = useProcessRefundRequest();
  const confirmChipZero = useConfirmChipZero();

  const { data: keyData } = useGetSigningKey();
  const networkHmacSecret =
    (keyData as unknown as { hmacSecret: string } | undefined)?.hmacSecret ?? "";
  const desfireAesKey =
    (keyData as unknown as { desfireAesKey?: string } | undefined)?.desfireAesKey ?? "";
  const nfcChipType =
    (keyData as unknown as { nfcChipType?: string } | undefined)?.nfcChipType ?? "";

  const requests = (data as { requests?: RefundRequest[] } | undefined)?.requests ?? [];
  const filtered = filter === "pending" ? requests.filter((r) => r.status === "pending") : requests;

  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (nfcStep !== "tap" && nfcStep !== "writing" && nfcStep !== "error") {
      pulseAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [nfcStep, pulseAnim]);

  const handleReject = (id: string) => {
    Alert.alert(t("bankRefundRequests.reject"), `${t("bankRefundRequests.reject")}?`, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("bankRefundRequests.reject"),
        style: "destructive",
        onPress: async () => {
          try {
            await processRequest.mutateAsync({ id, status: "rejected" });
            Alert.alert(t("common.success"), t("bankRefundRequests.processSuccess"));
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : t("common.unknownError");
            Alert.alert(t("common.error"), msg);
          }
        },
      },
    ]);
  };

  const handleApprove = (request: RefundRequest) => {
    Alert.alert(t("bankRefundRequests.approve"), `${t("bankRefundRequests.approve")}?`, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("bankRefundRequests.approve"),
        onPress: async () => {
          try {
            await processRequest.mutateAsync({ id: request.id, status: "approved" });
            if (isNfcSupported() && !isWeb) {
              setActiveRequest(request);
              setNfcStep("tap");
            } else {
              Alert.alert(
                t("common.success"),
                `${t("bankRefundRequests.processSuccess")}\n${t("bankRefundRequests.skipChipZeroWarning")}`
              );
            }
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : t("common.unknownError");
            Alert.alert(t("common.error"), msg);
          }
        },
      },
    ]);
  };

  const doNfcWrite = useCallback(async () => {
    if (writingRef.current || !activeRequest) return;
    writingRef.current = true;
    cancelledRef.current = false;
    setNfcStep("writing");

    try {
      if (nfcChipType === "desfire_ev3") {
        if (!desfireAesKey) {
          throw new Error(t("bank.noSigningKey"));
        }
        await zeroDesfireBracelet(activeRequest.braceletUid, desfireAesKey);
      } else {
        if (!networkHmacSecret) {
          throw new Error(t("bank.noSigningKey"));
        }
        await scanAndWriteBracelet(
          async (payload, _tagInfo) => {
            if (payload.uid !== activeRequest.braceletUid) {
              throw new Error(
                t("bankRefundRequests.wrongBracelet").replace("{{uid}}", activeRequest.braceletUid)
              );
            }
            const newCounter = payload.counter + 1;
            const newHmac = await computeHmac(0, newCounter, networkHmacSecret, payload.uid);
            return { uid: payload.uid, balance: 0, counter: newCounter, hmac: newHmac } as BraceletPayload;
          }
        );
      }

      if (cancelledRef.current) { writingRef.current = false; return; }

      await confirmChipZero.mutateAsync(activeRequest.id);
      writingRef.current = false;
      setNfcStep("done");
    } catch (e: unknown) {
      if (cancelledRef.current) { writingRef.current = false; return; }
      writingRef.current = false;
      let msg = e instanceof Error ? e.message : String(e);
      if (msg.startsWith("WRONG_BRACELET:")) {
        msg = t("bankRefundRequests.wrongBracelet").replace(
          "{{uid}}",
          activeRequest?.braceletUid ?? ""
        );
      }
      Alert.alert(t("common.error"), msg, [
        {
          text: t("bankRefundRequests.skipChipZero"),
          onPress: handleSkip,
        },
        {
          text: t("common.retry"),
          onPress: () => {
            setNfcStep("tap");
          },
        },
      ]);
      setNfcStep("error");
    }
  }, [activeRequest, nfcChipType, desfireAesKey, networkHmacSecret, t, confirmChipZero]);

  useEffect(() => {
    if (nfcStep === "tap") {
      doNfcWrite();
    }
  }, [nfcStep, doNfcWrite]);

  const handleSkip = useCallback(() => {
    cancelledRef.current = true;
    writingRef.current = false;
    setNfcStep("idle");
    setActiveRequest(null);
    Alert.alert(t("common.warning") ?? "Warning", t("bankRefundRequests.skipChipZeroWarning"));
  }, [t]);

  const handleDismissSuccess = useCallback(() => {
    setNfcStep("idle");
    setActiveRequest(null);
  }, []);

  if (isLoading) return <Loading label={t("common.loading")} />;

  if (nfcStep === "tap" || nfcStep === "writing" || nfcStep === "error") {
    return (
      <View style={[styles.nfcOverlay, { backgroundColor: C.background }]}>
        <Animated.View
          style={[
            styles.nfcIconWrap,
            { backgroundColor: C.primaryLight, transform: [{ scale: pulseAnim }] },
          ]}
        >
          <Feather name="wifi" size={48} color={C.primary} />
        </Animated.View>
        <Text style={[styles.nfcTitle, { color: C.text }]}>
          {nfcStep === "writing"
            ? t("bankRefundRequests.chipZeroing")
            : t("bankRefundRequests.tapToFinalize")}
        </Text>
        <Text style={[styles.nfcSubtitle, { color: C.textSecondary }]}>
          {t("bankRefundRequests.tapToFinalizeSubtitle")}
        </Text>
        {activeRequest && (
          <View style={[styles.nfcUidPill, { backgroundColor: C.card, borderColor: C.border }]}>
            <Feather name="cpu" size={13} color={C.textMuted} />
            <Text style={[styles.nfcUidText, { color: C.textMuted }]}>{activeRequest.braceletUid}</Text>
          </View>
        )}
        {nfcStep === "tap" && (
          <TouchableOpacity
            onPress={handleSkip}
            style={[styles.skipBtn, { borderColor: C.border }]}
          >
            <Text style={[styles.skipText, { color: C.textSecondary }]}>
              {t("bankRefundRequests.skipChipZero")}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  if (nfcStep === "done") {
    return (
      <View style={[styles.nfcOverlay, { backgroundColor: C.background }]}>
        <View style={[styles.nfcIconWrap, { backgroundColor: C.successLight }]}>
          <Feather name="check-circle" size={48} color={C.success} />
        </View>
        <Text style={[styles.nfcTitle, { color: C.text }]}>
          {t("bankRefundRequests.chipZeroSuccess")}
        </Text>
        {activeRequest && (
          <View style={[styles.nfcUidPill, { backgroundColor: C.card, borderColor: C.border }]}>
            <Feather name="cpu" size={13} color={C.textMuted} />
            <Text style={[styles.nfcUidText, { color: C.textMuted }]}>{activeRequest.braceletUid}</Text>
          </View>
        )}
        <Button
          title={t("common.done") ?? "Done"}
          onPress={handleDismissSuccess}
          variant="primary"
          size="lg"
          fullWidth
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingTop: isWeb ? 67 : insets.top + 8,
          paddingBottom: isWeb ? 34 : insets.bottom + 100,
          paddingHorizontal: 16,
          gap: 12,
        }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={C.primary} />
        }
        ListHeaderComponent={() => (
          <View style={styles.header}>
            <Text style={[styles.pageTitle, { color: C.text }]}>{t("bankRefundRequests.title")}</Text>
            <View style={styles.filterRow}>
              {(["pending", "all"] as const).map((f) => (
                <Button
                  key={f}
                  title={f === "pending" ? t("bankRefundRequests.pending") : t("common.all")}
                  onPress={() => setFilter(f)}
                  variant={filter === f ? "primary" : "secondary"}
                  size="sm"
                />
              ))}
            </View>
          </View>
        )}
        ListEmptyComponent={() => (
          <Empty icon="inbox" title={t("bankRefundRequests.noRequests")} />
        )}
        renderItem={({ item }) => (
          <Card>
            <View style={styles.requestHeader}>
              <View style={[styles.methodIcon, { backgroundColor: C.primaryLight }]}>
                <Feather name={METHOD_ICONS[item.refundMethod] ?? "circle"} size={18} color={C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.braceletUid, { color: C.text }]}>{item.braceletUid}</Text>
                <Text style={[styles.meta, { color: C.textMuted }]}>{formatDateTime(item.createdAt)}</Text>
              </View>
              <View style={{ gap: 4, alignItems: "flex-end" }}>
                <Badge
                  label={
                    item.status === "pending"
                      ? t("bankRefundRequests.pending")
                      : item.status === "approved"
                      ? t("bankRefundRequests.approved")
                      : t("bankRefundRequests.rejected")
                  }
                  variant={
                    item.status === "pending"
                      ? "warning"
                      : item.status === "approved"
                      ? "success"
                      : "danger"
                  }
                />
                {item.status === "approved" && (
                  <Badge
                    label={
                      item.chipZeroed
                        ? t("bankRefundRequests.chipZeroed")
                        : t("common.processing")
                    }
                    variant={item.chipZeroed ? "success" : "muted"}
                  />
                )}
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: C.separator }]} />

            <View style={styles.details}>
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: C.textSecondary }]}>
                  {item.status === "pending" ? t("bankRefundRequests.currentBalance") : t("bankRefundRequests.amount")}
                </Text>
                <CopAmount
                  amount={item.status === "pending" && item.liveAmountCop != null ? item.liveAmountCop : item.amountCop}
                  positive
                />
              </View>
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: C.textSecondary }]}>{t("bankRefundRequests.method")}</Text>
                <Text style={[styles.detailValue, { color: C.text }]}>{METHOD_LABELS[item.refundMethod] ?? item.refundMethod}</Text>
              </View>
              {item.accountDetails ? (
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: C.textSecondary }]}>{t("bankRefundRequests.accountDetails")}</Text>
                  <Text style={[styles.detailValue, { color: C.text }]}>{item.accountDetails}</Text>
                </View>
              ) : null}
              {item.notes ? (
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: C.textSecondary }]}>{t("common.notes")}</Text>
                  <Text style={[styles.detailValue, { color: C.text }]}>{item.notes}</Text>
                </View>
              ) : null}
            </View>

            {item.status === "pending" && (
              <View style={styles.actionRow}>
                <View style={{ flex: 1 }}>
                  <Button
                    title={t("bankRefundRequests.reject")}
                    onPress={() => handleReject(item.id)}
                    variant="danger"
                    size="sm"
                    fullWidth
                    loading={processRequest.isPending}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    title={t("bankRefundRequests.approve")}
                    onPress={() => handleApprove(item)}
                    variant="success"
                    size="sm"
                    fullWidth
                    loading={processRequest.isPending}
                  />
                </View>
              </View>
            )}

            {item.status === "approved" && !item.chipZeroed && isNfcSupported() && !isWeb && (
              <View style={{ marginTop: 12 }}>
                <Button
                  title={t("bankRefundRequests.tapToFinalize")}
                  onPress={() => {
                    setActiveRequest(item);
                    setNfcStep("tap");
                  }}
                  variant="primary"
                  size="sm"
                  fullWidth
                />
              </View>
            )}
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { gap: 12, marginBottom: 4 },
  pageTitle: { fontSize: 24, fontFamily: "Inter_700Bold" },
  filterRow: { flexDirection: "row", gap: 8 },
  requestHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  methodIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  braceletUid: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  meta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  divider: { height: 1, marginVertical: 12 },
  details: { gap: 8 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  detailLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  detailValue: { fontSize: 13, fontFamily: "Inter_400Regular" },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  nfcOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    paddingHorizontal: 32,
  },
  nfcIconWrap: {
    width: 100,
    height: 100,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  nfcTitle: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  nfcSubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  nfcUidPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 100,
    borderWidth: 1,
  },
  nfcUidText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  skipBtn: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
  },
  skipText: { fontSize: 14, fontFamily: "Inter_500Medium" },
});
