import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, useState } from "react";
import { Animated, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

const LOGO = require("../assets/images/tapee-letters-white.png");
const PAD_KEYS = ["1","2","3","4","5","6","7","8","9","","0","⌫"];
const CODE_LENGTH = 4;

interface Props {
  mode: "unlock" | "setup" | "confirm";
  onSuccess: (code: string) => void;
  onCancel?: () => void;
  title?: string;
  subtitle?: string;
}

export function PasscodeScreen({ mode, onSuccess, onCancel, title, subtitle }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  const shakeAnim = useRef(new Animated.Value(0)).current;

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  useEffect(() => {
    if (code.length === CODE_LENGTH) {
      const timer = setTimeout(() => {
        onSuccess(code);
        setCode("");
      }, 180);
      return () => clearTimeout(timer);
    }
  }, [code]);

  const press = (key: string) => {
    setError("");
    if (key === "⌫") {
      setCode((c) => c.slice(0, -1));
    } else if (code.length < CODE_LENGTH) {
      setCode((c) => c + key);
    }
  };

  const showError = (msg: string) => {
    setError(msg);
    setCode("");
    shake();
  };

  const isDark = scheme === "dark";

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={isDark ? ["#0a0a0a", "#111111", "#0a0a0a"] : ["#1A56DB", "#1e3a8a", "#1A56DB"]}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.inner, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.logoWrap}>
          <Image source={LOGO} style={styles.logo} resizeMode="contain" />
        </View>

        <View style={styles.textBlock}>
          <Text style={styles.titleText}>
            {title ?? (mode === "unlock" ? t("passcode.enterPin") : t("passcode.createPin"))}
          </Text>
          {(subtitle || error) ? (
            <Text style={[styles.subtitleText, error ? styles.errorText : null]}>
              {error || subtitle}
            </Text>
          ) : null}
        </View>

        <Animated.View style={[styles.dots, { transform: [{ translateX: shakeAnim }] }]}>
          {Array.from({ length: CODE_LENGTH }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i < code.length ? styles.dotFilled : styles.dotEmpty,
              ]}
            />
          ))}
        </Animated.View>

        <View style={styles.pad}>
          {PAD_KEYS.map((key, idx) => {
            if (key === "") return <View key={idx} style={styles.padEmpty} />;
            const isBackspace = key === "⌫";
            return (
              <Pressable
                key={idx}
                onPress={() => press(key)}
                style={({ pressed }) => [
                  styles.padKey,
                  pressed && styles.padKeyPressed,
                ]}
              >
                {isBackspace ? (
                  <Feather name="delete" size={22} color="#ffffff" />
                ) : (
                  <Text style={styles.padKeyText}>{key}</Text>
                )}
              </Pressable>
            );
          })}
        </View>

        {onCancel && (
          <Pressable onPress={onCancel} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>{t("passcode.logout")}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, zIndex: 900 },
  inner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 28,
  },
  logoWrap: { alignItems: "center" },
  logo: { width: 220, height: 80 },
  textBlock: { alignItems: "center", gap: 8 },
  titleText: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#ffffff",
    textAlign: "center",
  },
  subtitleText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.7)",
    textAlign: "center",
  },
  errorText: { color: "#FCA5A5" },
  dots: {
    flexDirection: "row",
    gap: 18,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  dotFilled: { backgroundColor: "#ffffff" },
  dotEmpty: { backgroundColor: "transparent" },
  pad: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 16,
    maxWidth: 320,
  },
  padKey: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  padKeyPressed: { backgroundColor: "rgba(255,255,255,0.28)" },
  padEmpty: { width: 80, height: 80 },
  padKeyText: {
    fontSize: 28,
    fontFamily: "Inter_400Regular",
    color: "#ffffff",
  },
  cancelBtn: { paddingVertical: 12 },
  cancelText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.6)",
    textDecorationLine: "underline",
  },
});
