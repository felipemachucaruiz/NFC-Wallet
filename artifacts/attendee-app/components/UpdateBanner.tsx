import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

let Updates: typeof import("expo-updates") | null = null;
try {
  Updates = require("expo-updates");
} catch {}

type BannerState = "hidden" | "downloading" | "ready";

export function UpdateBanner() {
  const { t } = useTranslation();
  const [state, setState] = useState<BannerState>("hidden");
  const isReloading = useRef(false);

  useEffect(() => {
    if (Platform.OS === "web" || !Updates) return;

    let cancelled = false;

    async function check() {
      try {
        const result = await Updates!.checkForUpdateAsync();
        if (cancelled || !result.isAvailable) return;

        setState("downloading");
        const fetched = await Updates!.fetchUpdateAsync();
        if (cancelled) return;

        if (fetched.isNew) {
          setState("ready");
        } else {
          setState("hidden");
        }
      } catch (e) {
        if (__DEV__) console.warn("[UpdateBanner] OTA check failed:", e);
        setState("hidden");
      }
    }

    check();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleRestart = async () => {
    if (isReloading.current || !Updates) return;
    isReloading.current = true;
    try {
      await Updates.reloadAsync();
    } catch (e) {
      if (__DEV__) console.warn("[UpdateBanner] reload failed:", e);
      isReloading.current = false;
    }
  };

  if (state === "hidden") return null;

  return (
    <View style={styles.container}>
      {state === "downloading" && (
        <Text style={styles.text}>{t("update.downloading")}</Text>
      )}
      {state === "ready" && (
        <Pressable onPress={handleRestart} style={styles.readyRow}>
          <Text style={styles.text}>{t("update.tapToUpdate")}</Text>
          <View style={styles.btn}>
            <Text style={styles.btnText}>{t("update.restart")}</Text>
          </View>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 80,
    left: 16,
    right: 16,
    backgroundColor: "rgba(0,241,255,0.12)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(0,241,255,0.3)",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  readyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  text: {
    color: "#00f1ff",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    flexShrink: 1,
  },
  btn: {
    backgroundColor: "#00f1ff",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginLeft: 12,
  },
  btnText: {
    color: "#0d1117",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
});
