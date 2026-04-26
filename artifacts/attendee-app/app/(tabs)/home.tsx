import { useColorScheme } from "@/hooks/useColorScheme";
import { Image } from 'expo-image';
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, AppStateStatus, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { CopAmount } from "@/components/CopAmount";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/contexts/AuthContext";
import { useMyBracelets, useLinkBracelet, usePendingWalletBalance, useClaimWalletBalance } from "@/hooks/useAttendeeApi";
import { useAlert } from "@/components/CustomAlert";
import { isNfcSupported, scanBraceletUID } from "@/utils/nfc";
import { API_BASE_URL } from "@/constants/domain";

const NFC_TAG_IMAGE = require("@/assets/images/tapee-nfc-tag.png");

type BraceletItem = {
  uid: string;
  balance: number;
  pendingTopUpAmount?: number;
  flagged: boolean;
  flagReason?: string | null;
  pendingRefund?: boolean;
  refundStatus?: string | null;
  attendeeName?: string | null;
  event?: { id: string; name: string; active: boolean; refundDeadline?: string | null } | null;
  updatedAt: string;
};

type RefundStatusConfig = {
  icon: React.ComponentProps<typeof Feather>["name"];
  color: string;
  bgColor: string;
  borderColor: string;
  titleKey: string;
  hintKey: string;
  badgeKey: string;
};

const REFUND_STATUS_MAP: Record<string, RefundStatusConfig> = {
  pending: {
    icon: "clock",
    color: "#eab308",
    bgColor: "rgba(234,179,8,0.10)",
    borderColor: "rgba(234,179,8,0.28)",
    titleKey: "home.refundSent",
    hintKey: "home.refundStatusPendingHint",
    badgeKey: "home.refundStatusPending",
  },
  approved: {
    icon: "check-circle",
    color: "#00f1ff",
    bgColor: "rgba(0,241,255,0.08)",
    borderColor: "rgba(0,241,255,0.22)",
    titleKey: "home.refundSent",
    hintKey: "home.refundStatusApprovedHint",
    badgeKey: "home.refundStatusApproved",
  },
  disbursement_pending: {
    icon: "send",
    color: "#00f1ff",
    bgColor: "rgba(0,241,255,0.08)",
    borderColor: "rgba(0,241,255,0.22)",
    titleKey: "home.refundSent",
    hintKey: "home.refundStatusDisbursementPendingHint",
    badgeKey: "home.refundStatusDisbursementPending",
  },
  disbursement_failed: {
    icon: "alert-circle",
    color: "#f97316",
    bgColor: "rgba(249,115,22,0.10)",
    borderColor: "rgba(249,115,22,0.28)",
    titleKey: "home.refundSent",
    hintKey: "home.refundStatusDisbursementFailedHint",
    badgeKey: "home.refundStatusDisbursementFailed",
  },
  rejected: {
    icon: "x-circle",
    color: "#ef4444",
    bgColor: "rgba(239,68,68,0.10)",
    borderColor: "rgba(239,68,68,0.28)",
    titleKey: "home.refundSent",
    hintKey: "home.refundStatusRejectedHint",
    badgeKey: "home.refundStatusRejected",
  },
};

export default function HomeScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user, token } = useAuth();

  const { data, isPending, refetch } = useMyBracelets();
  const { data: walletData, refetch: refetchWallet } = usePendingWalletBalance();
  const pendingWalletBalance = (walletData as { pendingWalletBalance?: number } | undefined)?.pendingWalletBalance ?? 0;
  const bracelets = ((data as { bracelets?: BraceletItem[] } | undefined)?.bracelets ?? []);
  const isArchived = (b: BraceletItem) =>
    b.pendingRefund || b.refundStatus === "disbursement_completed" || (b.event && !b.event.active);
  const activeBracelets = bracelets.filter((b) => !isArchived(b));
  const archivedBracelets = bracelets.filter((b) => isArchived(b));
  const totalBalance = activeBracelets.reduce((sum, b) => sum + b.balance + (b.pendingTopUpAmount ?? 0), 0);
  const activeBracelet = activeBracelets.find((b) => b.event?.active) ?? activeBracelets[0] ?? null;

  const [manualRefreshing, setManualRefreshing] = useState(false);

  const handleManualRefresh = useCallback(async () => {
    setManualRefreshing(true);
    try {
      await Promise.all([refetch(), refetchWallet()]);
    } finally {
      setManualRefreshing(false);
    }
  }, [refetch, refetchWallet]);

  const appState = useRef(AppState.currentState);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextState === "active") {
        refetch();
        refetchWallet();
      }
      appState.current = nextState;
    });
    return () => subscription.remove();
  }, [refetch]);

  const [verifyBannerDismissed, setVerifyBannerDismissed] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [verificationResent, setVerificationResent] = useState(false);

  const handleResendVerification = async () => {
    if (resendingVerification || !token) return;
    setResendingVerification(true);
    try {
      await fetch(`${API_BASE_URL}/api/auth/resend-verification`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setVerificationResent(true);
      setTimeout(() => setVerificationResent(false), 5000);
    } catch {
      // silent
    } finally {
      setResendingVerification(false);
    }
  };

  const [nfcAvailable, setNfcAvailable] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [nfcFeedback, setNfcFeedback] = useState<"success" | "already" | "event_limit" | "error" | null>(null);

  const { show: showAlert } = useAlert();
  const { mutate: linkBracelet } = useLinkBracelet();
  const { mutateAsync: claimWalletBalance } = useClaimWalletBalance();

  useEffect(() => {
    setNfcAvailable(isNfcSupported());
  }, []);

  const handleNfcScan = async () => {
    if (scanning) return;
    setNfcFeedback(null);
    setScanning(true);
    try {
      const uid = await scanBraceletUID();
      if (uid) {
        setSelectedUid(uid);
        const matched = bracelets.find((b) => b.uid === uid);
        if (matched) {
          setNfcFeedback("already");
          setTimeout(() => setNfcFeedback(null), 3000);
        } else {
          linkBracelet(
            { uid },
            {
              onSuccess: (res) => {
                setNfcFeedback("success");
                setTimeout(() => setNfcFeedback(null), 3000);
                if (pendingWalletBalance > 0) {
                  showAlert(
                    t("addBracelet.transferPendingTitle"),
                    t("addBracelet.transferPendingMsg", {
                      amount: new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(pendingWalletBalance),
                    }),
                    [
                      { text: t("addBracelet.transferLater"), variant: "cancel" },
                      {
                        text: t("addBracelet.transferNow"),
                        variant: "primary",
                        onPress: async () => {
                          try {
                            await claimWalletBalance(res.uid);
                            showAlert(t("addBracelet.transferSuccessTitle"), t("addBracelet.transferSuccessMsg"));
                          } catch {
                            // silent
                          }
                        },
                      },
                    ]
                  );
                }
              },
              onError: (err) => {
                if (err.message === "ONE_BRACELET_PER_EVENT") {
                  setNfcFeedback("event_limit");
                } else {
                  setNfcFeedback("error");
                }
                setTimeout(() => setNfcFeedback(null), 3000);
              },
            }
          );
        }
      }
    } catch {
    } finally {
      setScanning(false);
    }
  };

  if (isPending) return <Loading label={t("common.loading")} />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.background }}
      contentContainerStyle={{ paddingBottom: isWeb ? 34 : insets.bottom + 100 }}
      refreshControl={
        <RefreshControl refreshing={manualRefreshing} onRefresh={handleManualRefresh} tintColor={C.primary} />
      }
    >
      <LinearGradient
        colors={["#050505", "#0d1117", "#111827"]}
        style={styles.heroGradient}
      >
        <View style={[styles.topBar, { paddingTop: isWeb ? 67 : insets.top + 8 }]}>
          <View>
            <Text style={[styles.greeting, { color: C.textSecondary }]}>
              {t("home.greeting")}
            </Text>
            {user?.firstName && (
              <Text style={[styles.userName, { color: C.text }]}>{user.firstName}</Text>
            )}
          </View>
          {nfcAvailable && (
            <Pressable
              onPress={handleNfcScan}
              disabled={scanning}
              style={[
                styles.nfcFab,
                nfcFeedback === "success"
                  ? { backgroundColor: "rgba(34,197,94,0.15)", borderColor: "#22c55e" }
                  : nfcFeedback === "already"
                  ? { backgroundColor: "rgba(0,241,255,0.15)", borderColor: C.primary }
                  : nfcFeedback === "event_limit" || nfcFeedback === "error"
                  ? { backgroundColor: "rgba(239,68,68,0.15)", borderColor: "#ef4444" }
                  : { backgroundColor: scanning ? C.primaryLight : "rgba(0,241,255,0.15)", borderColor: C.primary },
              ]}
            >
              <Feather
                name={
                  nfcFeedback === "success" ? "check-circle" :
                  nfcFeedback === "event_limit" || nfcFeedback === "error" ? "alert-circle" :
                  scanning ? "loader" : "wifi"
                }
                size={18}
                color={
                  nfcFeedback === "success" ? "#22c55e" :
                  nfcFeedback === "event_limit" || nfcFeedback === "error" ? "#ef4444" :
                  C.primary
                }
              />
              <Text style={[
                styles.nfcFabText,
                {
                  color: nfcFeedback === "success" ? "#22c55e" :
                         nfcFeedback === "event_limit" || nfcFeedback === "error" ? "#ef4444" :
                         C.primary,
                },
              ]}>
                {nfcFeedback === "success" ? t("home.braceletLinked") :
                 nfcFeedback === "already" ? t("home.braceletSelected") :
                 nfcFeedback === "event_limit" ? t("addBracelet.eventLimitTitle") :
                 nfcFeedback === "error" ? t("common.error") :
                 scanning ? t("home.scanning") : t("home.scanBracelet")}
              </Text>
            </Pressable>
          )}
        </View>

        <View style={styles.balanceHero}>
          {activeBracelet ? (
            <>
              <Text style={[styles.balanceLabel, { color: C.textSecondary }]}>
                {bracelets.length > 1 ? t("home.totalBalance") : t("home.currentBalance")}
              </Text>
              <View style={styles.balanceGlassCard}>
                <CopAmount amount={totalBalance} size={52} color="#fff" />
                {activeBracelet.event?.active && (
                  <View style={[styles.eventBadge, { backgroundColor: "rgba(0,241,255,0.15)" }]}>
                    <Feather name="calendar" size={11} color={C.primary} />
                    <Text style={[styles.eventBadgeText, { color: C.primary }]}>
                      {activeBracelet.event.name}
                    </Text>
                  </View>
                )}
              </View>
            </>
          ) : (
            <View style={styles.emptyHero}>
              <View style={[styles.emptyIcon, { backgroundColor: "rgba(0,241,255,0.10)" }]}>
                <Feather name="wifi" size={40} color={C.primary} />
              </View>
              <Text style={[styles.emptyTitle, { color: C.text }]}>{t("home.noBracelet")}</Text>
              <Text style={[styles.emptySubtitle, { color: C.textSecondary }]}>
                {t("home.linkBraceletHint")}
              </Text>
              <Button
                title={t("home.addBracelet")}
                onPress={() => router.push("/add-bracelet")}
                variant="primary"
                style={styles.addBraceletBtn}
              />
              <Button
                title={t("home.preloadBalance")}
                onPress={() => router.push({ pathname: "/top-up", params: { preload: "true" } })}
                variant="secondary"
                style={styles.addBraceletBtn}
              />
            </View>
          )}
        </View>
      </LinearGradient>

      <View style={[styles.content, { paddingHorizontal: 20 }]}>
        {/* Email verification banner */}
        {user?.email && user.emailVerified === false && !verifyBannerDismissed && (
          <View style={[styles.verifyBanner, { backgroundColor: "rgba(234,179,8,0.10)", borderColor: "rgba(234,179,8,0.35)" }]}>
            <Feather name="mail" size={16} color="#eab308" style={{ marginTop: 1 }} />
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={[styles.verifyBannerTitle, { color: "#eab308" }]}>
                Verifica tu correo electrónico
              </Text>
              <Text style={[styles.verifyBannerText, { color: "rgba(234,179,8,0.8)" }]}>
                Tu cuenta está activa, pero aún no has verificado tu correo. Revisa tu bandeja de entrada.
              </Text>
              <Pressable onPress={handleResendVerification} disabled={resendingVerification}>
                <Text style={[styles.verifyBannerAction, { color: "#eab308" }]}>
                  {verificationResent
                    ? "✓ Correo enviado"
                    : resendingVerification
                    ? "Enviando..."
                    : "Reenviar correo de verificación"}
                </Text>
              </Pressable>
            </View>
            <Pressable onPress={() => setVerifyBannerDismissed(true)} style={{ padding: 4 }}>
              <Feather name="x" size={16} color="rgba(234,179,8,0.6)" />
            </Pressable>
          </View>
        )}

        {pendingWalletBalance > 0 && (
          <Pressable
            onPress={() => router.push("/pending-balance")}
            style={[styles.pendingBalanceBanner, { backgroundColor: "rgba(0,241,255,0.08)", borderColor: "rgba(0,241,255,0.28)" }]}
          >
            <View style={[styles.pendingBalanceIconWrap, { backgroundColor: "rgba(0,241,255,0.12)" }]}>
              <Feather name="clock" size={18} color={C.primary} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.pendingBalanceTitle, { color: C.primary }]}>
                {t("home.pendingBalanceTitle")}
              </Text>
              <Text style={[styles.pendingBalanceAmount, { color: C.text }]}>
                {new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(pendingWalletBalance)}
              </Text>
              <Text style={[styles.pendingBalanceHint, { color: C.textSecondary }]}>
                {activeBracelets.length > 0 ? t("home.pendingBalanceWithBracelet") : t("home.pendingBalanceNoBracelet")}
              </Text>
            </View>
            <Feather name="chevron-right" size={16} color={C.primary} />
          </Pressable>
        )}

        {activeBracelets.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>
              {t("home.myBracelets")}
            </Text>
            {activeBracelets.map((b) => {
              const refundCfg = b.refundStatus ? REFUND_STATUS_MAP[b.refundStatus] : null;
              const hasActiveRefund = refundCfg !== null && refundCfg !== undefined;
              return (
                <Card key={b.uid} style={{ marginBottom: 10, padding: 0, overflow: "hidden" }}>
                  <View style={styles.braceletCardInner}>
                    <View style={styles.nfcTagContainer}>
                      <Image
                        source={NFC_TAG_IMAGE}
                        style={styles.nfcTagImage}
                        contentFit="contain"
                      />
                      <View style={styles.nfcTagOverlay}>
                        <Text style={styles.nfcTagUid}>{b.uid.replace(/:/g, "")}</Text>
                      </View>
                      {selectedUid === b.uid && (
                        <View style={[styles.nfcTagSelected, { borderColor: C.primary }]} />
                      )}
                    </View>

                    <View style={styles.braceletInfo}>
                      <View style={{ flex: 1 }}>
                        {b.event && (
                          <Text style={[styles.braceletEvent, { color: C.textMuted }]}>
                            {b.event.name}
                          </Text>
                        )}
                        <View style={{ marginTop: 4 }}>
                          <CopAmount amount={b.balance + (b.pendingTopUpAmount ?? 0)} size={18} />
                        </View>
                        {(b.pendingTopUpAmount ?? 0) > 0 && (
                          <View style={[styles.pendingTopUpRow, { backgroundColor: C.primaryLight }]}>
                            <Feather name="clock" size={11} color={C.primary} />
                            <Text style={[styles.pendingTopUpText, { color: C.primary }]}>
                              {t("home.pendingTopUp", {
                                amount: new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(b.pendingTopUpAmount ?? 0),
                              })}
                            </Text>
                          </View>
                        )}
                        {b.flagged && !hasActiveRefund && (
                          <View style={{ marginTop: 6 }}>
                            <Badge label={t("home.blocked")} variant="danger" />
                          </View>
                        )}
                      </View>
                    </View>
                  </View>

                  {hasActiveRefund && refundCfg && (
                    <View style={[
                      styles.refundStatusCard,
                      { backgroundColor: refundCfg.bgColor, borderColor: refundCfg.borderColor },
                    ]}>
                      <View style={[styles.refundStatusIconWrap, { backgroundColor: refundCfg.bgColor }]}>
                        <Feather name={refundCfg.icon} size={22} color={refundCfg.color} />
                      </View>
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text style={[styles.refundStatusTitle, { color: refundCfg.color }]}>
                          {t(refundCfg.titleKey)}
                        </Text>
                        <View style={styles.refundStatusBadgeRow}>
                          <View style={[styles.refundStatusBadge, { backgroundColor: refundCfg.borderColor }]}>
                            <Text style={[styles.refundStatusBadgeText, { color: refundCfg.color }]}>
                              {t("home.refundStatusLabel")}: {t(refundCfg.badgeKey)}
                            </Text>
                          </View>
                        </View>
                        <Text style={[styles.refundStatusHint, { color: C.textSecondary }]}>
                          {t(refundCfg.hintKey)}
                        </Text>
                      </View>
                    </View>
                  )}

                  {!hasActiveRefund && !b.flagged && (
                    <View style={[styles.braceletActions, { borderTopColor: C.separator }]}>
                      <Pressable
                        style={styles.actionBtn}
                        onPress={() => router.push({ pathname: "/top-up", params: { braceletUid: b.uid } })}
                      >
                        <View style={[styles.actionIcon, { backgroundColor: C.primaryLight }]}>
                          <Feather name="plus-circle" size={14} color={C.primary} />
                        </View>
                        <Text style={[styles.actionText, { color: C.primary }]}>{t("home.topUp")}</Text>
                      </Pressable>
                      <Pressable
                        style={styles.actionBtn}
                        onPress={() => router.push({
                          pathname: "/unlink-bracelet",
                          params: { uid: b.uid, balance: String(b.balance) },
                        })}
                      >
                        <View style={[styles.actionIcon, { backgroundColor: "#4C1D9520" }]}>
                          <Feather name="user-x" size={14} color="#7C3AED" />
                        </View>
                        <Text style={[styles.actionText, { color: "#7C3AED" }]}>{t("home.transfer")}</Text>
                      </Pressable>
                      <Pressable
                        style={styles.actionBtn}
                        onPress={() => router.push({ pathname: "/block-bracelet", params: { uid: b.uid } })}
                      >
                        <View style={[styles.actionIcon, { backgroundColor: C.dangerLight }]}>
                          <Feather name="lock" size={14} color={C.danger} />
                        </View>
                        <Text style={[styles.actionText, { color: C.danger }]}>{t("home.blockBracelet")}</Text>
                      </Pressable>
                      {b.balance > 0 && !(b.event?.refundDeadline && new Date() > new Date(b.event.refundDeadline)) && (
                        <Pressable
                          style={styles.actionBtn}
                          onPress={() => router.push({
                            pathname: "/refund-request",
                            params: { uid: b.uid, balance: String(b.balance) },
                          })}
                        >
                          <View style={[styles.actionIcon, { backgroundColor: C.warningLight }]}>
                            <Feather name="arrow-left-circle" size={14} color={C.warning} />
                          </View>
                          <Text style={[styles.actionText, { color: C.warning }]}>{t("home.requestRefund")}</Text>
                        </Pressable>
                      )}
                    </View>
                  )}

                  {!hasActiveRefund && b.flagged && (
                    <View style={[styles.flaggedInfo, { backgroundColor: C.dangerLight }]}>
                      <Feather name="alert-triangle" size={13} color={C.danger} />
                      <Text style={[styles.flaggedText, { color: C.danger }]}>
                        {t("home.blockedHint")}
                      </Text>
                    </View>
                  )}
                </Card>
              );
            })}
          </View>
        )}

        {activeBracelets.length === 0 && archivedBracelets.length > 0 && (
          <View style={[styles.emptyActiveCard, { backgroundColor: C.card, borderColor: C.border }]}>
            <Feather name="inbox" size={28} color={C.textMuted} />
            <Text style={[styles.emptyActiveTitle, { color: C.text }]}>
              {t("home.noActiveBracelets")}
            </Text>
            <Text style={[styles.emptyActiveHint, { color: C.textSecondary }]}>
              {t("home.checkArchivedForRefunds")}
            </Text>
          </View>
        )}

        {archivedBracelets.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>
              {t("home.archivedBracelets")}
            </Text>
            {archivedBracelets.map((b) => {
              const isRefundDone = b.refundStatus === "disbursement_completed";
              const hasActiveRefund = b.refundStatus && b.refundStatus !== "disbursement_completed" && b.refundStatus !== "rejected";
              const refundCfg = b.refundStatus ? REFUND_STATUS_MAP[b.refundStatus] : null;
              return (
                <View
                  key={b.uid}
                  style={[styles.archivedCard, { backgroundColor: C.card, borderColor: C.border }]}
                >
                  <View style={styles.archivedCardInner}>
                    <View style={[styles.archivedIconWrap, {
                      backgroundColor: isRefundDone ? "rgba(34,197,94,0.10)" : "rgba(107,114,128,0.10)"
                    }]}>
                      <Feather
                        name={isRefundDone ? "check-circle" : "calendar"}
                        size={20}
                        color={isRefundDone ? "#22c55e" : "#6b7280"}
                      />
                    </View>
                    <View style={{ flex: 1, gap: 3 }}>
                      {b.event && (
                        <Text style={[styles.archivedEvent, { color: C.textSecondary }]}>
                          {b.event.name}
                        </Text>
                      )}
                      <Text style={[styles.archivedUid, { color: C.textMuted }]}>
                        UID: {b.uid.replace(/:/g, "")}
                      </Text>
                      {b.balance > 0 && !isRefundDone && (
                        <View style={{ marginTop: 2 }}>
                          <CopAmount amount={b.balance} size={14} />
                        </View>
                      )}
                    </View>
                    {isRefundDone && (
                      <View style={[styles.archivedBadge, { backgroundColor: "rgba(34,197,94,0.12)", borderColor: "rgba(34,197,94,0.3)" }]}>
                        <Feather name="check" size={11} color="#22c55e" />
                        <Text style={[styles.archivedBadgeText, { color: "#22c55e" }]}>
                          {t("home.archivedRefundCompleted")}
                        </Text>
                      </View>
                    )}
                    {!isRefundDone && !hasActiveRefund && (
                      <View style={[styles.archivedBadge, { backgroundColor: "rgba(107,114,128,0.12)", borderColor: "rgba(107,114,128,0.3)" }]}>
                        <Feather name="calendar" size={11} color="#6b7280" />
                        <Text style={[styles.archivedBadgeText, { color: "#6b7280" }]}>
                          {t("home.eventEnded")}
                        </Text>
                      </View>
                    )}
                  </View>
                  {hasActiveRefund && refundCfg && (
                    <View style={[
                      styles.refundStatusCard,
                      { backgroundColor: refundCfg.bgColor, borderColor: refundCfg.borderColor },
                    ]}>
                      <View style={[styles.refundStatusIconWrap, { backgroundColor: refundCfg.bgColor }]}>
                        <Feather name={refundCfg.icon} size={22} color={refundCfg.color} />
                      </View>
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text style={[styles.refundStatusTitle, { color: refundCfg.color }]}>
                          {t(refundCfg.titleKey)}
                        </Text>
                        <View style={styles.refundStatusBadgeRow}>
                          <View style={[styles.refundStatusBadge, { backgroundColor: refundCfg.borderColor }]}>
                            <Text style={[styles.refundStatusBadgeText, { color: refundCfg.color }]}>
                              {t("home.refundStatusLabel")}: {t(refundCfg.badgeKey)}
                            </Text>
                          </View>
                        </View>
                        <Text style={[styles.refundStatusHint, { color: C.textSecondary }]}>
                          {t(refundCfg.hintKey)}
                        </Text>
                      </View>
                    </View>
                  )}
                  {!isRefundDone && !hasActiveRefund && b.balance > 0 && (() => {
                    const deadline = b.event?.refundDeadline ? new Date(b.event.refundDeadline) : null;
                    const now = new Date();
                    const deadlinePassed = deadline ? now > deadline : false;
                    const daysLeft = deadline ? Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;

                    if (deadlinePassed) {
                      return (
                        <View style={[styles.archivedRefundHint, { borderTopColor: C.separator }]}>
                          <Feather name="x-circle" size={14} color={C.danger} />
                          <Text style={[styles.archivedRefundHintText, { color: C.danger }]}>
                            {t("home.refundDeadlinePassed")}
                          </Text>
                        </View>
                      );
                    }

                    return (
                      <View style={[styles.archivedRefundHint, { borderTopColor: C.separator }]}>
                        <Feather name="info" size={14} color={C.primary} />
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={[styles.archivedRefundHintText, { color: C.textSecondary }]}>
                            {t("home.archivedRefundAvailable")}
                          </Text>
                          {deadline && daysLeft !== null && daysLeft > 0 && (
                            <Text style={[styles.archivedRefundHintText, { color: daysLeft <= 3 ? C.danger : C.warning, fontSize: 11 }]}>
                              {t("home.refundDeadlineCountdown", { days: daysLeft, date: deadline.toLocaleDateString() })}
                            </Text>
                          )}
                        </View>
                        <Pressable
                          onPress={() => router.push({
                            pathname: "/refund-request",
                            params: { braceletUid: b.uid, eventName: b.event?.name ?? "" },
                          })}
                        >
                          <Text style={[styles.archivedRefundLink, { color: C.primary }]}>
                            {t("home.requestRefund")}
                          </Text>
                        </Pressable>
                      </View>
                    );
                  })()}
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>
            {t("home.quickActions")}
          </Text>
          <View style={styles.quickGrid}>
            <Pressable
              style={[styles.quickCard, { backgroundColor: C.card, borderColor: C.border }]}
              onPress={() => router.push("/(tabs)/history")}
            >
              <View style={[styles.quickIcon, { backgroundColor: C.primaryLight }]}>
                <Feather name="list" size={22} color={C.primary} />
              </View>
              <Text style={[styles.quickLabel, { color: C.text }]}>{t("home.history")}</Text>
            </Pressable>
            <Pressable
              style={[styles.quickCard, { backgroundColor: C.card, borderColor: C.border }]}
              onPress={() => router.push("/add-bracelet")}
            >
              <View style={[styles.quickIcon, { backgroundColor: C.primaryLight }]}>
                <Feather name="wifi" size={22} color={C.primary} />
              </View>
              <Text style={[styles.quickLabel, { color: C.text }]}>{t("home.addBracelet")}</Text>
            </Pressable>
            {activeBracelets.length > 0 && !activeBracelet?.pendingRefund && !activeBracelet?.flagged && (
              <Pressable
                style={[styles.quickCard, { backgroundColor: C.card, borderColor: C.border }]}
                onPress={() => router.push({
                  pathname: "/top-up",
                  params: { braceletUid: activeBracelet?.uid ?? "" },
                })}
              >
                <View style={[styles.quickIcon, { backgroundColor: C.primaryLight }]}>
                  <Feather name="plus-circle" size={22} color={C.primary} />
                </View>
                <Text style={[styles.quickLabel, { color: C.text }]}>{t("home.topUp")}</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  heroGradient: { paddingBottom: 32 },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 8,
    flexWrap: "wrap",
    gap: 8,
  },
  greeting: { fontSize: 13, fontFamily: "Inter_400Regular" },
  userName: { fontSize: 22, fontFamily: "Inter_700Bold" },
  nfcFab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  nfcFabText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  balanceHero: { alignItems: "center", paddingHorizontal: 24, paddingTop: 16, gap: 12 },
  balanceLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  balanceGlassCard: {
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 32,
    paddingVertical: 20,
    width: "100%",
  },
  eventBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
  },
  eventBadgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  emptyHero: { alignItems: "center", gap: 12 },
  emptyIcon: { width: 80, height: 80, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  addBraceletBtn: { marginTop: 4, minWidth: 200 },
  content: { paddingTop: 24, gap: 8 },
  verifyBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  verifyBannerTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  verifyBannerText: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
  verifyBannerAction: { fontSize: 12, fontFamily: "Inter_600SemiBold", textDecorationLine: "underline" },
  section: { gap: 10, marginBottom: 16 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  braceletCardInner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 14,
  },
  nfcTagContainer: {
    width: 160,
    height: 102,
    position: "relative",
  },
  nfcTagImage: {
    width: 160,
    height: 102,
    borderRadius: 10,
  },
  nfcTagOverlay: {
    position: "absolute",
    bottom: 18,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  nfcTagUid: {
    fontSize: 9.5,
    fontFamily: "Inter_600SemiBold",
    color: "rgba(255,255,255,0.75)",
    letterSpacing: 0.5,
  },
  nfcTagSelected: {
    position: "absolute",
    inset: 0,
    borderRadius: 10,
    borderWidth: 2,
  },
  braceletInfo: {
    flex: 1,
    gap: 4,
  },
  braceletEvent: { fontSize: 12, fontFamily: "Inter_400Regular" },
  pendingTopUpRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 6,
    alignSelf: "flex-start",
  },
  pendingTopUpText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  braceletActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    borderTopWidth: 1,
    marginHorizontal: 12,
    marginBottom: 12,
    paddingTop: 12,
  },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  actionIcon: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  actionText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  flaggedInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 10,
    borderRadius: 8,
    margin: 12,
    marginTop: 0,
  },
  flaggedText: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  quickGrid: { flexDirection: "row", gap: 12 },
  quickCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    gap: 10,
  },
  quickIcon: { width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  quickLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  refundStatusCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    margin: 12,
    marginTop: 0,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  refundStatusIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  refundStatusTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  refundStatusBadgeRow: { flexDirection: "row" },
  refundStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 100,
  },
  refundStatusBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  refundStatusHint: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  archivedCard: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 10,
  },
  archivedCardInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  archivedIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  archivedEvent: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  archivedUid: { fontSize: 11, fontFamily: "Inter_400Regular", letterSpacing: 0.5 },
  archivedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 100,
    borderWidth: 1,
    flexShrink: 0,
  },
  archivedBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  archivedRefundHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderTopWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  archivedRefundHintText: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  archivedRefundLink: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  emptyActiveCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  emptyActiveTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  emptyActiveHint: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 19 },
  pendingBalanceBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  pendingBalanceIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  pendingBalanceTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  pendingBalanceAmount: { fontSize: 18, fontFamily: "Inter_700Bold" },
  pendingBalanceHint: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
});
