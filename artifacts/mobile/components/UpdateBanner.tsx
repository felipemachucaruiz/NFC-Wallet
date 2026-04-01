import { Feather } from "@expo/vector-icons";
import * as Updates from "expo-updates";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

type Phase = "idle" | "downloading" | "ready";

export function UpdateBanner() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === "dark";
  const [phase, setPhase] = useState<Phase>("idle");
  const slideAnim = useRef(new Animated.Value(80)).current;
  const hasChecked = useRef(false);

  // Slide the banner in/out
  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: phase === "idle" ? 80 : 0,
      useNativeDriver: true,
      bounciness: 6,
    }).start();
  }, [phase]);

  useEffect(() => {
    // Only run on device with expo-updates (not in dev/Expo Go without updates)
    if (Platform.OS === "web" || __DEV__ || hasChecked.current) return;
    hasChecked.current = true;

    (async () => {
      try {
        const check = await Updates.checkForUpdateAsync();
        if (!check.isAvailable) return;
        setPhase("downloading");
        await Updates.fetchUpdateAsync();
        setPhase("ready");
      } catch {
        // Silently fail — update check is best-effort
        setPhase("idle");
      }
    })();
  }, []);

  if (phase === "idle") return null;

  const bgColor = phase === "ready" ? "#22c55e" : "#00f1ff";
  const bottomOffset = insets.bottom + 16;

  return (
    <Animated.View
      style={[
        styles.banner,
        { backgroundColor: bgColor, bottom: bottomOffset, transform: [{ translateY: slideAnim }] },
      ]}
    >
      {phase === "downloading" ? (
        <>
          <ActivityIndicator color="#fff" size="small" />
          <Text style={styles.text}>{t("update.downloading")}</Text>
        </>
      ) : (
        <>
          <Feather name="check-circle" size={18} color="#fff" />
          <Text style={styles.text}>{t("update.ready")}</Text>
          <Pressable
            onPress={() => Updates.reloadAsync()}
            style={({ pressed }) => [styles.restartBtn, pressed && styles.restartBtnPressed]}
          >
            <Text style={styles.restartText}>{t("update.restart")}</Text>
          </Pressable>
        </>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    left: 20,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 999,
  },
  text: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  restartBtn: {
    backgroundColor: "rgba(255,255,255,0.22)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  restartBtnPressed: {
    backgroundColor: "rgba(255,255,255,0.38)",
  },
  restartText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
});
