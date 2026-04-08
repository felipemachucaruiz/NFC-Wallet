import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import { Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
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

export default function AttendeeHomeScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();

  const { data, isLoading, refetch, isRefetching } = useMyBracelets();

  type BraceletItem = {
    uid: string;
    balance: number;
    flagged: boolean;
    flagReason?: string | null;
    attendeeName?: string | null;
    event?: { id: string; name: string; active: boolean; currencyCode?: string } | null;
    updatedAt: string;
  };
  type BraceletsData = { bracelets?: BraceletItem[] };
  const bracelets = (data as BraceletsData)?.bracelets ?? [];

  const activeBracelet = bracelets.find((b) => b.event?.active) ?? bracelets[0] ?? null;
  const totalBalance = bracelets.reduce((sum, b) => sum + b.balance, 0);
  const eventCurrency = activeBracelet?.event?.currencyCode ?? "COP";

  if (isLoading) return <Loading label={t("common.loading")} />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.background }}
      contentContainerStyle={{
        paddingBottom: isWeb ? 34 : insets.bottom + 100,
      }}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={C.primary} />
      }
    >
      <LinearGradient
        colors={scheme === "dark" ? ["#0a0a0a", "#111111"] : ["#EFF6FF", "#DBEAFE"]}
        style={styles.heroGradient}
      >
        <View style={[styles.topBar, { paddingTop: isWeb ? 67 : insets.top + 8 }]}>
          <View>
            <Text style={[styles.greeting, { color: C.textSecondary }]}>
              {t("attendeeHome.greeting")}
            </Text>
            {user?.firstName ? (
              <Text style={[styles.userName, { color: C.text }]}>{user.firstName}</Text>
            ) : null}
          </View>
          <Pressable onPress={() => router.push("/settings")}>
            <Feather name="settings" size={22} color={C.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.balanceHero}>
          {activeBracelet ? (
            <>
              <Text style={[styles.balanceLabel, { color: C.textSecondary }]}>
                {bracelets.length > 1 ? t("attendeeHome.totalBalance") : t("attendeeHome.currentBalance")}
              </Text>
              <CopAmount amount={totalBalance} size={52} currencyCode={eventCurrency} />
              {activeBracelet.event?.active && (
                <View style={[styles.eventBadge, { backgroundColor: C.primaryLight }]}>
                  <Feather name="calendar" size={12} color={C.primary} />
                  <Text style={[styles.eventBadgeText, { color: C.primary }]}>
                    {activeBracelet.event.name}
                  </Text>
                </View>
              )}
            </>
          ) : (
            <View style={styles.noWristbandHero}>
              <View style={[styles.noWristbandIcon, { backgroundColor: C.primaryLight }]}>
                <Feather name="wifi" size={40} color={C.primary} />
              </View>
              <Text style={[styles.noBraceletTitle, { color: C.text }]}>
                {t("attendeeHome.noBracelet")}
              </Text>
              <Text style={[styles.noBraceletSubtitle, { color: C.textSecondary }]}>
                {t("attendeeHome.linkBraceletHint")}
              </Text>
            </View>
          )}
        </View>
      </LinearGradient>

      <View style={[styles.content, { paddingHorizontal: 20 }]}>
        {bracelets.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>
              {t("attendeeHome.myBracelets")}
            </Text>
            {bracelets.map((b) => (
              <Card key={b.uid} style={{ marginBottom: 10 }}>
                <View style={styles.braceletRow}>
                  <View style={[styles.nfcIcon, { backgroundColor: b.flagged ? C.dangerLight : C.primaryLight }]}>
                    <Feather name="wifi" size={20} color={b.flagged ? C.danger : C.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.braceletUid, { color: C.text }]}>
                      {b.uid}
                    </Text>
                    {b.event && (
                      <Text style={[styles.braceletEvent, { color: C.textMuted }]}>
                        {b.event.name}
                      </Text>
                    )}
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <CopAmount amount={b.balance} size={16} currencyCode={b.event?.currencyCode ?? "COP"} />
                    {b.flagged && <Badge label={t("attendeeHome.blocked")} variant="danger" />}
                  </View>
                </View>
                {!b.flagged && (
                  <View style={[styles.braceletActions, { borderTopColor: C.separator }]}>
                    <Pressable
                      style={styles.braceletActionBtn}
                      onPress={() => router.push({
                        pathname: "/(attendee)/block-bracelet",
                        params: { uid: b.uid }
                      })}
                    >
                      <Feather name="lock" size={14} color={C.danger} />
                      <Text style={[styles.braceletActionText, { color: C.danger }]}>
                        {t("attendeeHome.blockBracelet")}
                      </Text>
                    </Pressable>
                    {b.balance > 0 && (
                      <Pressable
                        style={styles.braceletActionBtn}
                        onPress={() => router.push({
                          pathname: "/(attendee)/refund-request",
                          params: { uid: b.uid, balance: String(b.balance) }
                        })}
                      >
                        <Feather name="arrow-left-circle" size={14} color={C.primary} />
                        <Text style={[styles.braceletActionText, { color: C.primary }]}>
                          {t("attendeeHome.requestRefund")}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                )}
                {b.flagged && (
                  <View style={[styles.flaggedInfo, { backgroundColor: C.dangerLight }]}>
                    <Feather name="alert-triangle" size={13} color={C.danger} />
                    <Text style={[styles.flaggedText, { color: C.danger }]}>
                      {t("attendeeHome.blockedHint")}
                    </Text>
                  </View>
                )}
              </Card>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>
            {t("attendeeHome.quickActions")}
          </Text>
          <View style={styles.quickGrid}>
            <Pressable
              style={[styles.quickCard, { backgroundColor: C.card, borderColor: C.border }]}
              onPress={() => router.push("/(attendee)/history")}
            >
              <View style={[styles.quickIcon, { backgroundColor: C.primaryLight }]}>
                <Feather name="list" size={22} color={C.primary} />
              </View>
              <Text style={[styles.quickLabel, { color: C.text }]}>{t("attendeeHome.history")}</Text>
            </Pressable>
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
  },
  greeting: { fontSize: 13, fontFamily: "Inter_400Regular" },
  userName: { fontSize: 22, fontFamily: "Inter_700Bold" },
  balanceHero: { alignItems: "center", paddingHorizontal: 24, paddingTop: 16, gap: 12 },
  balanceLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  eventBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 100,
  },
  eventBadgeText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  noWristbandHero: { alignItems: "center", gap: 12 },
  noWristbandIcon: { width: 80, height: 80, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  noBraceletTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  noBraceletSubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
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
    gap: 12,
    borderTopWidth: 1,
    marginTop: 12,
    paddingTop: 12,
  },
  braceletActionBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  braceletActionText: { fontSize: 13, fontFamily: "Inter_500Medium" },
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
