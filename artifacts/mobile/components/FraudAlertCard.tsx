import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View, useColorScheme } from "react-native";
import { useTranslation } from "react-i18next";
import type { FraudAlert } from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

interface Props {
  alert: FraudAlert;
  onMarkReviewed?: () => void;
  onDismiss?: () => void;
  isUpdating?: boolean;
}

export function FraudAlertCard({ alert, onMarkReviewed, onDismiss, isUpdating }: Props) {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;

  const severityColors: Record<FraudAlert["severity"], { bg: string; text: string; badge: "muted" | "warning" | "success" | "danger" }> = {
    low: { bg: C.successLight, text: C.success, badge: "success" },
    medium: { bg: C.warningLight, text: C.warning, badge: "warning" },
    high: { bg: C.dangerLight, text: C.danger, badge: "danger" },
    critical: { bg: C.dangerLight, text: C.danger, badge: "danger" },
  };

  const severityLabels: Record<FraudAlert["severity"], string> = {
    low: t("fraud.severityLow"),
    medium: t("fraud.severityMedium"),
    high: t("fraud.severityHigh"),
    critical: t("fraud.severityCritical"),
  };

  const typeLabels: Record<FraudAlert["type"], string> = {
    double_location: t("fraud.typeDoubleLocation"),
    offline_volume_anomaly: t("fraud.typeOfflineVolume"),
    high_value_staff: t("fraud.typeHighValueStaff"),
    balance_increase_no_topup: t("fraud.typeBalanceIncrease"),
    manual_report: t("fraud.typeManualReport"),
    hmac_invalid: t("fraud.typeHmacInvalid"),
  };

  const typeDescriptions: Record<FraudAlert["type"], string> = {
    hmac_invalid: t("fraud.descriptionHmacInvalid", { entityId: alert.entityId }),
    double_location: t("fraud.descriptionDoubleLocation", { entityId: alert.entityId }),
    offline_volume_anomaly: t("fraud.descriptionOfflineVolume", { entityId: alert.entityId }),
    high_value_staff: t("fraud.descriptionHighValueStaff", { entityId: alert.entityId }),
    balance_increase_no_topup: t("fraud.descriptionBalanceIncrease", { entityId: alert.entityId }),
    // manual_report: show the raw description (contains user-entered reason + notes)
    manual_report: alert.description,
  };

  const statusColors: Record<FraudAlert["status"], "muted" | "warning" | "success" | "danger"> = {
    open: "danger",
    reviewed: "warning",
    dismissed: "muted",
  };

  const statusLabels: Record<FraudAlert["status"], string> = {
    open: t("fraud.statusOpen"),
    reviewed: t("fraud.statusReviewed"),
    dismissed: t("fraud.statusDismissed"),
  };

  const sc = severityColors[alert.severity];
  const isManual = alert.type === "manual_report";
  const createdAt = new Date(alert.createdAt).toLocaleString();

  return (
    <Card padding={14}>
      <View style={styles.row}>
        <View style={[styles.severityDot, { backgroundColor: sc.bg }]}>
          <Feather
            name={alert.severity === "critical" || alert.severity === "high" ? "alert-triangle" : "alert-circle"}
            size={16}
            color={sc.text}
          />
        </View>

        <View style={{ flex: 1, gap: 4 }}>
          <View style={styles.topRow}>
            <Text style={[styles.type, { color: C.text }]} numberOfLines={1}>
              {typeLabels[alert.type]}
            </Text>
            <View style={styles.badges}>
              <Badge label={severityLabels[alert.severity]} variant={sc.badge} />
              {isManual ? (
                <Badge label={t("fraud.manualLabel")} variant="warning" />
              ) : (
                <Badge label={t("fraud.autoLabel")} variant="muted" />
              )}
              <Badge label={statusLabels[alert.status]} variant={statusColors[alert.status]} />
            </View>
          </View>

          <Text style={[styles.entity, { color: C.textSecondary }]}>
            {t(`fraud.entity${alert.entityType.charAt(0).toUpperCase() + alert.entityType.slice(1)}` as never)}: {alert.entityId}
          </Text>

          <Text style={[styles.description, { color: C.textSecondary }]} numberOfLines={3}>
            {typeDescriptions[alert.type]}
          </Text>

          <Text style={[styles.date, { color: C.textMuted }]}>
            {t("fraud.createdAt")}: {createdAt}
          </Text>

          {alert.status === "open" && (
            <View style={styles.actions}>
              {onMarkReviewed && (
                <Button
                  title={t("fraud.markReviewed")}
                  onPress={onMarkReviewed}
                  variant="secondary"
                  size="sm"
                  loading={isUpdating}
                />
              )}
              {onDismiss && (
                <Button
                  title={t("fraud.dismiss")}
                  onPress={onDismiss}
                  variant="ghost"
                  size="sm"
                  loading={isUpdating}
                />
              )}
            </View>
          )}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  severityDot: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  topRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  type: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  entity: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  description: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  date: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6,
  },
});
