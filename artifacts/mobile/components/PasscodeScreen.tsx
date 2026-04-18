import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, useState } from "react";
import { Animated, Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

const LOGO = require("../assets/images/tapee-logo.png");
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
  const { height: screenHeight } = useWindowDimensions();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  // Compact layout for small screens (< 700px)
  const compact = screenHeight < 700;
  const keySize = compact ? 58 : 72;
  const keyGap = compact ? 8 : 12;
  const cardGap = compact ? 12 : 20;
  const cardPadV = compact ? 16 : 28;
  const logoH = compact ? 36 : 56;
  const logoW = compact ? 103 : 160;
  const titleSize = compact ? 17 : 20;

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

      <View style={[styles.overlay, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={[styles.card, { gap: cardGap, paddingVertical: cardPadV }]}>
          <Image source={LOGO} style={{ width: logoW, height: logoH }} resizeMode="contain" />

          <View style={styles.textBlock}>
            <Text style={[styles.titleText, { fontSize: titleSize }]}>
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

          <View style={[styles.pad, { gap: keyGap }]}>
            {PAD_KEYS.map((key, idx) => {
              if (key === "") return <View key={idx} style={{ width: keySize, height: keySize }} />;
              const isBackspace = key === "⌫";
              return (
                <Pressable
                  key={idx}
                  onPress={() => press(key)}
                  style={({ pressed }) => [
                    styles.padKey,
                    { width: keySize, height: keySize, borderRadius: keySize / 2 },
                    pressed && styles.padKeyPressed,
                  ]}
                >
                  {isBackspace ? (
                    <Feather name="delete" size={compact ? 18 : 20} color="#ffffff" />
                  ) : (
                    <Text style={[styles.padKeyText, { fontSize: compact ? 22 : 26 }]}>{key}</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, zIndex: 900 },
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  textBlock: { alignItems: "center", gap: 6 },
  titleText: {
    fontFamily: "Inter_700Bold",
    color: "#ffffff",
    textAlign: "center",
  },
  subtitleText: {
    fontSize: 13,
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
    width: 14,
    height: 14,
    borderRadius: 7,
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
    maxWidth: 280,
  },
  padKey: {
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  padKeyPressed: { backgroundColor: "rgba(255,255,255,0.28)" },
  padKeyText: {
    fontFamily: "Inter_400Regular",
    color: "#ffffff",
  },
  cancelBtn: { paddingVertical: 8 },
  cancelText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.6)",
    textDecorationLine: "underline",
  },
});
