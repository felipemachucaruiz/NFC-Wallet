import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Updates from "expo-updates";

export function UpdateBanner() {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(80)).current;

  const { isUpdatePending, isDownloading, isChecking } = Updates.useUpdates();

  useEffect(() => {
    if (__DEV__) return;
    const run = async () => {
      try {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) {
          await Updates.fetchUpdateAsync();
        }
      } catch {}
    };
    run();
    const interval = setInterval(run, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (__DEV__) return;
    if (!isUpdatePending) return;
    const timer = setTimeout(() => {
      Updates.reloadAsync().catch(() => {});
    }, 2000);
    return () => clearTimeout(timer);
  }, [isUpdatePending]);

  const isVisible = !__DEV__ && (isUpdatePending || isDownloading || isChecking);

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: isVisible ? 0 : 80,
      useNativeDriver: true,
      speed: 14,
      bounciness: 4,
    }).start();
  }, [isVisible, slideAnim]);

  if (__DEV__) return null;

  const label = isUpdatePending
    ? "Aplicando actualización…"
    : isDownloading
      ? "Descargando actualización…"
      : "Buscando actualizaciones…";

  const icon: "refresh-cw" | "download-cloud" | "search" = isUpdatePending
    ? "refresh-cw"
    : isDownloading
      ? "download-cloud"
      : "search";

  return (
    <Animated.View
      style={[
        styles.wrapper,
        { bottom: insets.bottom + 8, transform: [{ translateY: slideAnim }] },
      ]}
      pointerEvents="none"
    >
      <View style={styles.banner}>
        <Feather name={icon} size={16} color="#fff" />
        <Text style={styles.label}>{label}</Text>
        {isUpdatePending && (
          <View style={styles.pill}>
            <Text style={styles.pillText}>REINICIANDO</Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 9999,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#0f172a",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#334155",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  label: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#e2e8f0",
  },
  pill: {
    backgroundColor: "#00f1ff",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pillText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: "#0a0a0a",
    letterSpacing: 0.5,
  },
});
