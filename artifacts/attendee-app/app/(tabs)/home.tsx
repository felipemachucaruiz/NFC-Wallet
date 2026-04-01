import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { CopAmount } from "@/components/CopAmount";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/contexts/AuthContext";
import { useMyBracelets } from "@/hooks/useAttendeeApi";
import { isNfcSupported, scanBraceletUID } from "@/utils/nfc";

type BraceletItem = {
  uid: string;
  balanceCop: number;
  flagged: boolean;
  flagReason?: string | null;
  attendeeName?: string | null;
  event?: { id: string; name: string; active: boolean } | null;
  updatedAt: string;
};

export default function HomeScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();

  const { data, isLoading, refetch, isRefetching } = useMyBracelets();
  const bracelets = ((data as { bracelets?: BraceletItem[] } | undefined)?.bracelets ?? []);
  const totalBalance = bracelets.reduce((sum, b) => sum + b.balanceCop, 0);
  const activeBracelet = bracelets.find((b) => b.event?.active) ?? bracelets[0] ?? null;

  const [nfcAvailable, setNfcAvailable] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);

  useEffect(() => {
    isNfcSupported().then(setNfcAvailable);
  }, []);

  const handleNfcScan = async () => {
    if (scanning) return;
    setScanning(true);
    try {
      const uid = await scanBraceletUID();
      if (uid) {
        setSelectedUid(uid);
        const matched = bracelets.find((b) => b.uid === uid);
        if (matched) {
          Alert.alert(t("home.braceletSelected"), uid);
        }
      }
    } catch {
    } finally {
      setScanning(false);
    }
  };

  if (isLoading) return <Loading label={t("common.loading")} />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.background }}
      contentContainerStyle={{ paddingBottom: isWeb ? 34 : insets.bottom + 100 }}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={C.primary} />
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
                { backgroundColor: scanning ? C.primaryLight : "rgba(0,241,255,0.15)", borderColor: C.primary },
              ]}
            >
              <Feather
                name={scanning ? "loader" : "wifi"}
                size={18}
                color={C.primary}
              />
              <Text style={[styles.nfcFabText, { color: C.primary }]}>
                {scanning ? t("home.scanning") : t("home.scanBracelet")}
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
            </View>
          )}
        </View>
      </LinearGradient>

      <View style={[styles.content, { paddingHorizontal: 20 }]}>
        {bracelets.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>
              {t("home.myBracelets")}
            </Text>
            {bracelets.map((b) => (
              <Card key={b.uid} style={{ marginBottom: 10 }}>
                <View style={styles.braceletRow}>
                  <View style={[
                    styles.nfcIcon,
                    {
                      backgroundColor: b.flagged ? C.dangerLight : C.primaryLight,
                      borderWidth: selectedUid === b.uid ? 2 : 0,
                      borderColor: C.primary,
                    },
                  ]}>
                    <Feather
                      name="wifi"
                      size={20}
                      color={b.flagged ? C.danger : C.primary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.braceletUid, { color: C.text }]}>{b.uid}</Text>
                    {b.event && (
                      <Text style={[styles.braceletEvent, { color: C.textMuted }]}>
                        {b.event.name}
                      </Text>
                    )}
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <CopAmount amount={b.balanceCop} size={16} />
                    {b.flagged && <Badge label={t("home.blocked")} variant="danger" />}
                  </View>
                </View>

                {!b.flagged && (
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
                      onPress={() => router.push({ pathname: "/block-bracelet", params: { uid: b.uid } })}
                    >
                      <View style={[styles.actionIcon, { backgroundColor: C.dangerLight }]}>
                        <Feather name="lock" size={14} color={C.danger} />
                      </View>
                      <Text style={[styles.actionText, { color: C.danger }]}>{t("home.blockBracelet")}</Text>
                    </Pressable>
                    {b.balanceCop > 0 && (
                      <Pressable
                        style={styles.actionBtn}
                        onPress={() => router.push({
                          pathname: "/refund-request",
                          params: { uid: b.uid, balance: String(b.balanceCop) },
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

                {b.flagged && (
                  <View style={[styles.flaggedInfo, { backgroundColor: C.dangerLight }]}>
                    <Feather name="alert-triangle" size={13} color={C.danger} />
                    <Text style={[styles.flaggedText, { color: C.danger }]}>
                      {t("home.blockedHint")}
                    </Text>
                  </View>
                )}
              </Card>
            ))}
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
            {bracelets.length > 0 && (
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
  content: { paddingTop: 24, gap: 8 },
  section: { gap: 10, marginBottom: 16 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  braceletRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  nfcIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  braceletUid: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  braceletEvent: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  braceletActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    borderTopWidth: 1,
    marginTop: 12,
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
    marginTop: 10,
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
});
