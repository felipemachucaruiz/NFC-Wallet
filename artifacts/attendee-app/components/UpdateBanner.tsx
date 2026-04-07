import * as Updates from "expo-updates";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Animated,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

type Phase = "idle" | "downloading" | "ready";

export function UpdateBanner() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>("idle");
  const slideAnim = useRef(new Animated.Value(80)).current;
  const isChecking = useRef(false);
  const isReloading = useRef(false);

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
      setPhase("ready");
    } catch {
      setPhase("idle");
      isChecking.current = false;
    }
  };

  const handleTapToUpdate = async () => {
    if (isReloading.current) return;
    isReloading.current = true;
    try {
      await Updates.reloadAsync();
    } catch {
      // reloadAsync failed — reset so user isn't stuck with a non-functional button
      isReloading.current = false;
      setPhase("idle");
      isChecking.current = false;
      Alert.alert(
        t("update.errorTitle", "Update failed"),
        t("update.errorMessage", "Could not apply the update. Please restart the app manually."),
      );
    }
  };

  // Check on launch
  useEffect(() => {
    checkAndApply();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
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
      {phase === "downloading" ? (
        <>
          <ActivityIndicator color="#fff" size="small" />
          <Text style={styles.text}>{t("update.downloading")}</Text>
        </>
      ) : (
        <TouchableOpacity
          style={styles.tapTarget}
          onPress={handleTapToUpdate}
          activeOpacity={0.8}
        >
          <Text style={styles.text}>{t("update.tapToUpdate")}</Text>
        </TouchableOpacity>
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
    backgroundColor: "#00b4cc",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 999,
  },
  tapTarget: {
    flex: 1,
  },
  text: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});
