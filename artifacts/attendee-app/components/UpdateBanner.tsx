import * as Updates from "expo-updates";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Animated,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

type Phase = "idle" | "downloading" | "reloading";

const AUTO_RELOAD_DELAY_MS = 2500;

export function UpdateBanner() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>("idle");
  const slideAnim = useRef(new Animated.Value(80)).current;
  const isChecking = useRef(false);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const slideIn = () =>
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 5,
    }).start();

  const slideOut = () =>
    Animated.spring(slideAnim, {
      toValue: 80,
      useNativeDriver: true,
      bounciness: 5,
    }).start();

  useEffect(() => {
    if (phase === "idle") {
      slideOut();
    } else {
      slideIn();
    }
  }, [phase]);

  const checkAndApply = async () => {
    if (
      Platform.OS === "web" ||
      __DEV__ ||
      isChecking.current
    ) return;
    isChecking.current = true;
    try {
      const check = await Updates.checkForUpdateAsync();
      if (!check.isAvailable) {
        isChecking.current = false;
        return;
      }
      setPhase("downloading");
      await Updates.fetchUpdateAsync();
      setPhase("reloading");
      // Auto-reload after brief delay so user sees the banner
      reloadTimer.current = setTimeout(async () => {
        try {
          await Updates.reloadAsync();
        } catch {
          setPhase("idle");
          isChecking.current = false;
        }
      }, AUTO_RELOAD_DELAY_MS);
    } catch {
      setPhase("idle");
      isChecking.current = false;
    }
  };

  // Check on launch
  useEffect(() => {
    checkAndApply();
    return () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
    };
  }, []);

  // Check every time app comes to foreground
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        isChecking.current = false; // reset so foreground check can run
        checkAndApply();
      }
    });
    return () => sub.remove();
  }, []);

  if (phase === "idle") return null;

  return (
    <Animated.View
      style={[
        styles.banner,
        { bottom: insets.bottom + 16, transform: [{ translateY: slideAnim }] },
      ]}
    >
      <ActivityIndicator color="#fff" size="small" />
      <Text style={styles.text}>
        {phase === "downloading" ? t("update.downloading") : t("update.reloading")}
      </Text>
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
    backgroundColor: "#00b4cc",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
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
});
