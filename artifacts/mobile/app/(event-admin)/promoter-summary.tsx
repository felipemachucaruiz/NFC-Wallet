import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { CopAmount } from "@/components/CopAmount";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { useAuth } from "@/contexts/AuthContext";
import { useGetPromoterCompanySummary } from "@workspace/api-client-react";

export default function PromoterSummaryScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();

  const companyId = user?.promoterCompanyId ?? null;

  const { data: summary, isLoading } = useGetPromoterCompanySummary(companyId ?? "placeholder", {
    query: { enabled: !!companyId },
  });

  if (!companyId) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: C.background }}
        contentContainerStyle={{
          paddingTop: isWeb ? 67 : insets.top + 16,
          paddingBottom: isWeb ? 34 : insets.bottom + 100,
          paddingHorizontal: 20,
          gap: 20,
          alignItems: "center",
          justifyContent: "center",
          flex: 1,
        }}
      >
        <Feather name="briefcase" size={48} color={C.textMuted} />
        <Text style={[styles.emptyText, { color: C.textMuted }]}>
          {t("eventAdmin.noPromoterCompany")}
        </Text>
      </ScrollView>
    );
  }

  if (isLoading) return <Loading label={t("common.loading")} />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.background }}
      contentContainerStyle={{
        paddingTop: isWeb ? 67 : insets.top + 16,
        paddingBottom: isWeb ? 34 : insets.bottom + 100,
        paddingHorizontal: 20,
        gap: 20,
      }}
      contentInsetAdjustmentBehavior="automatic"
    >
      <View style={styles.headerRow}>
        <View style={[styles.headerIcon, { backgroundColor: C.primaryLight }]}>
          <Feather name="briefcase" size={22} color={C.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: C.text }]} numberOfLines={2}>
            {summary?.companyName ?? t("eventAdmin.promoterSummary")}
          </Text>
          <Text style={[styles.subtitle, { color: C.textSecondary }]}>
            {t("eventAdmin.promoterSummarySubtitle")}
          </Text>
        </View>
      </View>

      <Card style={[styles.mainCard, { backgroundColor: C.primary }]} padding={24}>
        <View style={styles.mainRow}>
          <View>
            <Text style={styles.mainLabel}>{t("eventAdmin.totalRevenue")}</Text>
            <CopAmount amount={summary?.totalRevenueCop} size={36} color="#0a0a0a" />
          </View>
          <View style={[styles.mainIconBox, { backgroundColor: "rgba(0,0,0,0.12)" }]}>
            <Feather name="trending-up" size={28} color="#0a0a0a" />
          </View>
        </View>
        <View style={styles.statsRow}>
          <StatPill
            label={t("eventAdmin.eventsCount")}
            value={String(summary?.eventCount ?? 0)}
          />
          <StatPill
            label={t("eventAdmin.totalAttendees")}
            value={String(summary?.totalAttendees ?? 0)}
          />
        </View>
      </Card>

      <View style={styles.kpiGrid}>
        <Card style={styles.kpiCard} padding={16}>
          <View style={[styles.kpiIcon, { backgroundColor: C.success + "22" }]}>
            <Feather name="plus-circle" size={16} color={C.success} />
          </View>
          <Text style={[styles.kpiLabel, { color: C.textSecondary }]}>
            {t("eventAdmin.totalTopUps")}
          </Text>
          <CopAmount amount={summary?.totalTopupsCop} size={18} color={C.success} />
        </Card>
        <Card style={styles.kpiCard} padding={16}>
          <View style={[styles.kpiIcon, { backgroundColor: C.warning + "22" }]}>
            <Feather name="clock" size={16} color={C.warning} />
          </View>
          <Text style={[styles.kpiLabel, { color: C.textSecondary }]}>
            {t("eventAdmin.unclaimedBalance")}
          </Text>
          <CopAmount amount={summary?.totalUnclaimedCop} size={18} color={C.warning} />
        </Card>
      </View>

      {summary?.events && summary.events.length > 0 && (
        <View style={{ gap: 10 }}>
          <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>
            {t("eventAdmin.eventsList")}
          </Text>
          {summary.events.map((event) => (
            <Card key={event.id} padding={14}>
              <View style={styles.eventRow}>
                <View style={[styles.eventIcon, { backgroundColor: C.primaryLight }]}>
                  <Feather name="calendar" size={16} color={C.primary} />
                </View>
                <Text style={[styles.eventName, { color: C.text }]} numberOfLines={2}>
                  {event.name}
                </Text>
                <Badge
                  label={event.active ? t("eventAdmin.eventActive") : t("eventAdmin.eventInactive")}
                  variant={event.active ? "success" : "muted"}
                  size="sm"
                />
              </View>
            </Card>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statPill}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  headerIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  mainCard: { borderRadius: 20 },
  mainRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  mainLabel: { color: "rgba(0,0,0,0.7)", fontFamily: "Inter_500Medium", fontSize: 13, marginBottom: 4 },
  mainIconBox: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  statsRow: { flexDirection: "row", gap: 16, marginTop: 16 },
  statPill: { flex: 1, alignItems: "center" },
  statValue: { color: "#0a0a0a", fontSize: 20, fontFamily: "Inter_700Bold" },
  statLabel: { color: "rgba(0,0,0,0.6)", fontSize: 11, fontFamily: "Inter_400Regular" },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  kpiCard: { flex: 1, minWidth: "47%" },
  kpiIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  kpiLabel: { fontSize: 11, fontFamily: "Inter_500Medium", marginBottom: 4 },
  sectionTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  eventRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  eventIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  eventName: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 16 },
});
