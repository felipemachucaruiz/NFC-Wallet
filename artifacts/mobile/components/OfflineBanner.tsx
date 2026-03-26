import { Feather } from "@expo/vector-icons";
import { router, usePathname } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { useOfflineQueue } from "@/contexts/OfflineQueueContext";
import { useTranslation } from "react-i18next";

interface OfflineBannerProps {
  syncIssuesRoute?: string;
}

function resolveSyncIssuesRoute(
  pathname: string,
  override: string | undefined
): string | null {
  if (override !== undefined) return override || null;
  if (pathname.startsWith("/(bank)") || pathname.startsWith("/bank")) {
    return "/(bank)/sync-issues";
  }
  if (
    pathname.startsWith("/(merchant-pos)") ||
    pathname.startsWith("/merchant-pos") ||
    pathname.startsWith("/charge") ||
    pathname.includes("charge")
  ) {
    return "/(merchant-pos)/sync-issues";
  }
  return null;
}

export function OfflineBanner({ syncIssuesRoute }: OfflineBannerProps = {}) {
  const { isOnline, isSyncing, pendingCount, allFailedItems } = useOfflineQueue();
  const { t } = useTranslation();
  const pathname = usePathname();

  const failedCount = allFailedItems.length;
  const hasContent = !isOnline || pendingCount > 0 || failedCount > 0;

  if (!hasContent) return null;

  let bg = isOnline ? "#F59E0B" : "#DC2626";
  let icon: React.ComponentProps<typeof Feather>["name"] = isOnline
    ? isSyncing
      ? "refresh-cw"
      : "upload-cloud"
    : "wifi-off";
  let label = isSyncing
    ? t("common.syncing")
    : isOnline && pendingCount > 0
    ? t("pos.syncPending", { count: pendingCount })
    : t("common.offline");

  if (failedCount > 0 && !isSyncing) {
    bg = "#DC2626";
    icon = "alert-triangle";
    label = t("syncIssues.bannerLabel", { count: failedCount });
  }

  const resolvedRoute = resolveSyncIssuesRoute(pathname, syncIssuesRoute);
  const isTappable = failedCount > 0 && resolvedRoute !== null;

  const handlePress = () => {
    if (isTappable && resolvedRoute) {
      router.push(resolvedRoute as never);
    }
  };

  return (
    <Pressable
      onPress={isTappable ? handlePress : undefined}
      style={[styles.banner, { backgroundColor: bg }]}
    >
      <Feather name={icon} size={14} color="#fff" />
      <Text style={styles.text}>{label}</Text>
      {isTappable && <Feather name="chevron-right" size={14} color="#fff" />}
    </Pressable>
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
