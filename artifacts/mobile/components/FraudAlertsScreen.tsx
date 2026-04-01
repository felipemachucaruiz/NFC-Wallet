import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetFraudAlerts,
  usePatchFraudAlert,
  getGetFraudAlertsQueryKey,
} from "@workspace/api-client-react";
import type { FraudAlert, FraudAlertStatus } from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { Card } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { FraudAlertCard } from "@/components/FraudAlertCard";

type StatusFilter = "all" | FraudAlertStatus;
type SeverityFilter = "all" | FraudAlert["severity"];

interface Props {
  eventId?: string;
}

export function FraudAlertsScreen({ eventId }: Props) {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const queryParams = {
    ...(eventId ? { eventId } : {}),
    ...(statusFilter !== "all" ? { status: statusFilter } : {}),
    ...(severityFilter !== "all" ? { severity: severityFilter } : {}),
  };

  const { data, isLoading, refetch } = useGetFraudAlerts(queryParams, {
    query: { refetchInterval: 30000 },
  });

  const patchMutation = usePatchFraudAlert();

  const alerts = (data as { alerts?: FraudAlert[] } | undefined)?.alerts ?? [];

  const handleUpdateStatus = async (id: string, status: FraudAlertStatus) => {
    setUpdatingId(id);
    try {
      await patchMutation.mutateAsync({ id, data: { status } });
      await queryClient.invalidateQueries({ queryKey: getGetFraudAlertsQueryKey(queryParams) });
    } finally {
      setUpdatingId(null);
    }
  };

  const statusFilterOptions: { key: StatusFilter; label: string }[] = [
    { key: "all", label: t("fraud.filterAll") },
    { key: "open", label: t("fraud.filterOpen") },
    { key: "reviewed", label: t("fraud.filterReviewed") },
    { key: "dismissed", label: t("fraud.filterDismissed") },
  ];

  const severityOptions: { key: SeverityFilter; label: string }[] = [
    { key: "all", label: t("fraud.filterAll") },
    { key: "critical", label: t("fraud.severityCritical") },
    { key: "high", label: t("fraud.severityHigh") },
    { key: "medium", label: t("fraud.severityMedium") },
    { key: "low", label: t("fraud.severityLow") },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.background }}
      contentContainerStyle={{
        paddingTop: isWeb ? 67 : insets.top + 16,
        paddingBottom: isWeb ? 34 : insets.bottom + 100,
        paddingHorizontal: 20,
        gap: 16,
      }}
      contentInsetAdjustmentBehavior="automatic"
    >
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: C.text }]}>{t("fraud.alertsTitle")}</Text>
        <Pressable onPress={() => refetch()} hitSlop={10}>
          <Feather name="refresh-cw" size={18} color={C.primary} />
        </Pressable>
      </View>
      <Text style={[styles.subtitle, { color: C.textSecondary }]}>{t("fraud.alertsSubtitle")}</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={[styles.filterRow, { backgroundColor: C.inputBg }]}>
          {statusFilterOptions.map((f) => (
            <Pressable
              key={f.key}
              onPress={() => setStatusFilter(f.key)}
              style={[
                styles.filterBtn,
                statusFilter === f.key && {
                  backgroundColor: C.card,
                  borderRadius: 8,
                },
              ]}
            >
              <Text style={[styles.filterLabel, { color: statusFilter === f.key ? C.primary : C.textMuted }]}>
                {f.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={[styles.filterRow, { backgroundColor: C.inputBg }]}>
          {severityOptions.map((f) => (
            <Pressable
              key={f.key}
              onPress={() => setSeverityFilter(f.key)}
              style={[
                styles.filterBtn,
                severityFilter === f.key && {
                  backgroundColor: C.card,
                  borderRadius: 8,
                },
              ]}
            >
              <Text style={[styles.filterLabel, { color: severityFilter === f.key ? C.primary : C.textMuted }]}>
                {f.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {isLoading ? (
        <Loading label={t("common.loading")} />
      ) : alerts.length === 0 ? (
        <Card padding={24}>
          <Text style={[styles.emptyText, { color: C.textMuted }]}>{t("fraud.noAlerts")}</Text>
        </Card>
      ) : (
        <View style={{ gap: 10 }}>
          {alerts.map((alert) => (
            <FraudAlertCard
              key={alert.id}
              alert={alert}
              onMarkReviewed={
                alert.status === "open"
                  ? () => handleUpdateStatus(alert.id, "reviewed")
                  : undefined
              }
              onDismiss={
                alert.status === "open"
                  ? () => handleUpdateStatus(alert.id, "dismissed")
                  : undefined
              }
              isUpdating={updatingId === alert.id}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: -8,
  },
  filterRow: {
    flexDirection: "row",
    borderRadius: 10,
    padding: 3,
    gap: 2,
  },
  filterBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  filterLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});
