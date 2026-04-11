import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import React, { useState, useCallback, useEffect } from "react";
import {
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
import { Card } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { useAuth } from "@/contexts/AuthContext";
import { useEventContext } from "@/contexts/EventContext";
import { API_BASE_URL } from "@/constants/domain";

type DayStat = { dayId: string; dayLabel: string; date: string; totalCheckins: number; totalTickets: number };
type SectionStat = {
  sectionId: string;
  sectionName: string;
  color: string;
  totalTickets: number;
  totalCheckins: number;
  hasNumberedUnits: boolean;
  units: Array<{ unitId: string; unitNumber: number; unitLabel: string; ticketsPerUnit: number; totalCheckins: number; status: string | null }>;
};

export default function TicketCheckinsScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { token } = useAuth();
  const { eventId } = useEventContext();

  const [days, setDays] = useState<DayStat[]>([]);
  const [sections, setSections] = useState<SectionStat[]>([]);
  const [totalTickets, setTotalTickets] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDayId, setSelectedDayId] = useState("all");
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const authHeader = { Authorization: `Bearer ${token}` };

  const load = useCallback(async () => {
    if (!eventId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/events/${eventId}/checkin-stats`, { headers: authHeader });
      const data = await res.json();
      if (res.ok) {
        setDays(data.days ?? []);
        setSections(data.sections ?? []);
        setTotalTickets(data.totalTickets ?? 0);
      }
    } catch {}
    setLoading(false);
  }, [eventId, token]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const filteredDays = selectedDayId === "all" ? days : days.filter(d => d.dayId === selectedDayId);
  const totalCheckins = filteredDays.reduce((s, d) => s + d.totalCheckins, 0);
  const checkinRate = totalTickets > 0 ? Math.round((totalCheckins / totalTickets) * 100) : 0;

  if (loading) return <Loading />;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: C.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: isWeb ? 34 : insets.bottom + 100 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={[styles.header, { paddingTop: isWeb ? 67 : insets.top + 16 }]}>
        <Text style={[styles.title, { color: C.text }]}>{t("ticketCheckins.title")}</Text>
        <Text style={[styles.subtitle, { color: C.textMuted }]}>{t("ticketCheckins.subtitle")}</Text>
      </View>

      {/* Summary Cards */}
      <View style={styles.statsRow}>
        <Card style={[styles.statCard, { flex: 1 }]}>
          <View style={[styles.statIcon, { backgroundColor: C.primaryLight }]}>
            <Feather name="user-check" size={18} color={C.primary} />
          </View>
          <Text style={[styles.statValue, { color: C.text }]}>{totalCheckins.toLocaleString()}</Text>
          <Text style={[styles.statLabel, { color: C.textMuted }]}>{t("ticketCheckins.totalCheckins")}</Text>
          <Text style={[styles.statSub, { color: C.textMuted }]}>{t("ticketCheckins.ofTotal", { total: totalTickets.toLocaleString() })}</Text>
        </Card>
        <Card style={[styles.statCard, { flex: 1 }]}>
          <View style={[styles.statIcon, { backgroundColor: checkinRate >= 70 ? "#22C55E20" : C.primaryLight }]}>
            <Feather name="bar-chart-2" size={18} color={checkinRate >= 70 ? "#22C55E" : C.primary} />
          </View>
          <Text style={[styles.statValue, { color: C.text }]}>{checkinRate}%</Text>
          <Text style={[styles.statLabel, { color: C.textMuted }]}>{t("ticketCheckins.checkinRate")}</Text>
          <Text style={[styles.statSub, { color: C.textMuted }]}>{t("ticketCheckins.ofTicketsSold")}</Text>
        </Card>
      </View>

      {/* Day Filter */}
      {days.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { color: C.text }]}>{t("ticketCheckins.byDay")}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayFilters}>
            <Pressable
              onPress={() => setSelectedDayId("all")}
              style={[styles.dayChip, { backgroundColor: selectedDayId === "all" ? C.primary : C.inputBg, borderColor: selectedDayId === "all" ? C.primary : C.border }]}
            >
              <Text style={[styles.dayChipText, { color: selectedDayId === "all" ? "#fff" : C.textMuted }]}>{t("ticketCheckins.allDays")}</Text>
            </Pressable>
            {days.map(d => (
              <Pressable
                key={d.dayId}
                onPress={() => setSelectedDayId(d.dayId)}
                style={[styles.dayChip, { backgroundColor: selectedDayId === d.dayId ? C.primary : C.inputBg, borderColor: selectedDayId === d.dayId ? C.primary : C.border }]}
              >
                <Text style={[styles.dayChipText, { color: selectedDayId === d.dayId ? "#fff" : C.textMuted }]}>{d.dayLabel}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {filteredDays.map(day => {
            const rate = day.totalTickets > 0 ? Math.round((day.totalCheckins / day.totalTickets) * 100) : 0;
            return (
              <Card key={day.dayId} style={styles.dayCard}>
                <View style={styles.dayRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.dayLabel, { color: C.text }]}>{day.dayLabel}</Text>
                    <Text style={[styles.dayDate, { color: C.textMuted }]}>{day.date}</Text>
                  </View>
                  <View style={styles.dayStats}>
                    <Text style={[styles.dayCheckins, { color: C.primary }]}>{day.totalCheckins}/{day.totalTickets}</Text>
                    <Text style={[styles.dayRate, { color: C.textMuted }]}>{rate}%</Text>
                  </View>
                </View>
                <View style={[styles.progressBar, { backgroundColor: C.inputBg }]}>
                  <View style={[styles.progressFill, { width: `${rate}%` as any, backgroundColor: C.primary }]} />
                </View>
              </Card>
            );
          })}
        </>
      )}

      {/* Section Breakdown */}
      {sections.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { color: C.text }]}>{t("ticketCheckins.bySection")}</Text>
          {sections.map(sec => {
            const rate = sec.totalTickets > 0 ? Math.round((sec.totalCheckins / sec.totalTickets) * 100) : 0;
            const expanded = expandedSection === sec.sectionId;
            return (
              <Card key={sec.sectionId} style={styles.sectionCard}>
                <Pressable onPress={() => setExpandedSection(expanded ? null : sec.sectionId)}>
                  <View style={styles.secRow}>
                    <View style={[styles.secDot, { backgroundColor: sec.color || C.primary }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.secName, { color: C.text }]}>{sec.sectionName}</Text>
                    </View>
                    <Text style={[styles.secRate, { color: C.primary }]}>{sec.totalCheckins}/{sec.totalTickets}</Text>
                    <Text style={[styles.secPct, { color: C.textMuted }]}>{rate}%</Text>
                    {sec.hasNumberedUnits && <Feather name={expanded ? "chevron-up" : "chevron-down"} size={14} color={C.textMuted} />}
                  </View>
                  <View style={[styles.progressBar, { backgroundColor: C.inputBg, marginTop: 6 }]}>
                    <View style={[styles.progressFill, { width: `${rate}%` as any, backgroundColor: sec.color || C.primary }]} />
                  </View>
                </Pressable>
                {expanded && sec.hasNumberedUnits && (
                  <View style={styles.unitsGrid}>
                    {sec.units.map(u => (
                      <View key={u.unitId} style={[styles.unitChip, { backgroundColor: u.totalCheckins > 0 ? C.primaryLight : C.inputBg }]}>
                        <Text style={[styles.unitLabel, { color: u.totalCheckins > 0 ? C.primary : C.textMuted }]}>{u.unitLabel}</Text>
                        <Text style={[styles.unitCheckins, { color: u.totalCheckins > 0 ? C.primary : C.textMuted }]}>
                          {u.totalCheckins}/{u.ticketsPerUnit}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </Card>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 0 },
  header: { paddingBottom: 16, paddingHorizontal: 4 },
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  statCard: { alignItems: "center", gap: 4, marginHorizontal: 0 },
  statIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  statValue: { fontSize: 26, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  statSub: { fontSize: 11, fontFamily: "Inter_400Regular" },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 8, paddingHorizontal: 4 },
  dayFilters: { paddingBottom: 12, gap: 8 },
  dayChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  dayChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  dayCard: { marginHorizontal: 0, marginBottom: 8 },
  dayRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  dayLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  dayDate: { fontSize: 12, fontFamily: "Inter_400Regular" },
  dayStats: { alignItems: "flex-end" },
  dayCheckins: { fontSize: 15, fontFamily: "Inter_700Bold" },
  dayRate: { fontSize: 12, fontFamily: "Inter_400Regular" },
  progressBar: { height: 6, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3 },
  sectionCard: { marginHorizontal: 0, marginBottom: 8 },
  secRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  secDot: { width: 10, height: 10, borderRadius: 5 },
  secName: { fontSize: 14, fontFamily: "Inter_500Medium" },
  secRate: { fontSize: 14, fontFamily: "Inter_700Bold" },
  secPct: { fontSize: 12, fontFamily: "Inter_400Regular" },
  unitsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  unitChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, alignItems: "center" },
  unitLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  unitCheckins: { fontSize: 10, fontFamily: "Inter_400Regular" },
});
