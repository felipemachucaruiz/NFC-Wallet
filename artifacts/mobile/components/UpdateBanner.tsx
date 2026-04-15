import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Updates from "expo-updates";

/**
 * Floating banner that:
 * 1. Checks for an OTA update on mount (and then every 5 min).
 * 2. Downloads it silently.
 * 3. Shows a banner asking the user to restart once the download is done.
 *
 * Only active in production builds (__DEV__ === false).
 */
export function UpdateBanner() {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(80)).current;

  const { isUpdatePending, isDownloading, isChecking } = Updates.useUpdates();

  // Check + download on mount and every 5 minutes
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

  const label = isDownloading || isChecking
    ? "Descargando actualización…"
    : "Actualización lista — toca para reiniciar";

  const icon: "download-cloud" | "refresh-cw" = isDownloading || isChecking
    ? "download-cloud"
    : "refresh-cw";

  return (
    <Animated.View
      style={[
        styles.wrapper,
        { bottom: insets.bottom + 8, transform: [{ translateY: slideAnim }] },
      ]}
      pointerEvents={isUpdatePending ? "auto" : "none"}
    >
      <Pressable
        onPress={() => { if (isUpdatePending) Updates.reloadAsync().catch(() => {}); }}
        style={({ pressed }) => [styles.banner, pressed && styles.bannerPressed]}
      >
        <Feather name={icon} size={16} color="#fff" />
        <Text style={styles.label}>{label}</Text>
        {isUpdatePending && (
          <View style={styles.pill}>
            <Text style={styles.pillText}>REINICIAR</Text>
          </View>
        )}
      </Pressable>
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
  bannerPressed: {
    opacity: 0.8,
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
