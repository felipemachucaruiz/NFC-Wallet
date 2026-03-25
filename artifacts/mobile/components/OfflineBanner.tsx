import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useOfflineQueue } from "@/contexts/OfflineQueueContext";
import { useTranslation } from "react-i18next";

export function OfflineBanner() {
  const { isOnline, isSyncing, pendingCount } = useOfflineQueue();
  const { t } = useTranslation();

  if (isOnline && pendingCount === 0) return null;

  const bg = isOnline ? "#F59E0B" : "#DC2626";
  const icon = isOnline ? (isSyncing ? "refresh-cw" : "upload-cloud") : "wifi-off";
  const label = isSyncing
    ? t("common.syncing")
    : isOnline && pendingCount > 0
    ? t("pos.syncPending", { count: pendingCount })
    : t("common.offline");

  return (
    <View style={[styles.banner, { backgroundColor: bg }]}>
      <Feather name={icon} size={14} color="#fff" />
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  text: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
});
