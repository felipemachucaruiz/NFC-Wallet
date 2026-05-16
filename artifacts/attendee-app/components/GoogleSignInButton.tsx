import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import Svg, { Path, Rect, G, Defs, ClipPath } from "react-native-svg";
import * as WebBrowser from "expo-web-browser";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { API_BASE_URL } from "@/constants/domain";

interface Props {
  onError?: (msg: string) => void;
  compact?: boolean;
}

const DEEP_LINK_PREFIX = "tapee-attendee://auth/done";

function GoogleIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 40 40">
      <Rect x={0.5} y={0.5} width={39} height={39} rx={19.5} fill="white" />
      <G clipPath="url(#gclip)">
        <Path d="M29.6 20.2273C29.6 19.5182 29.5364 18.8364 29.4182 18.1818H20V22.05H25.3818C25.15 23.3 24.4455 24.3591 23.3864 25.0682V27.5773H26.6182C28.5091 25.8364 29.6 23.2727 29.6 20.2273Z" fill="#4285F4" />
        <Path d="M20 30C22.7 30 24.9636 29.1045 26.6181 27.5773L23.3863 25.0682C22.4909 25.6682 21.3454 26.0227 20 26.0227C17.3954 26.0227 15.1909 24.2636 14.4045 21.9H11.0636V24.4909C12.7091 27.7591 16.0909 30 20 30Z" fill="#34A853" />
        <Path d="M14.4045 21.9C14.2045 21.3 14.0909 20.6591 14.0909 20C14.0909 19.3409 14.2045 18.7 14.4045 18.1V15.5091H11.0636C10.3864 16.8591 10 18.3864 10 20C10 21.6136 10.3864 23.1409 11.0636 24.4909L14.4045 21.9Z" fill="#FBBC04" />
        <Path d="M20 13.9773C21.4681 13.9773 22.7863 14.4818 23.8227 15.4727L26.6909 12.6045C24.9591 10.9909 22.6954 10 20 10C16.0909 10 12.7091 12.2409 11.0636 15.5091L14.4045 18.1C15.1909 15.7364 17.3954 13.9773 20 13.9773Z" fill="#E94235" />
      </G>
      <Defs>
        <ClipPath id="gclip">
          <Rect width={20} height={20} fill="white" x={10} y={10} />
        </ClipPath>
      </Defs>
    </Svg>
  );
}

export function GoogleSignInButton({ onError, compact }: Props) {
  const { t } = useTranslation();
  const { googleClientId, loginWithSessionToken } = useAuth();
  const [loading, setLoading] = useState(false);

  if (!googleClientId) return null;

  const handlePress = async () => {
    setLoading(true);
    try {
      const result = await WebBrowser.openAuthSessionAsync(
        `${API_BASE_URL}/api/auth/google/mobile-start`,
        DEEP_LINK_PREFIX,
      );

      if (result.type !== "success") return;

      const url = new URL(result.url);
      const errorParam = url.searchParams.get("error");
      if (errorParam) {
        onError?.(
          errorParam === "staff_not_allowed"
            ? (t("auth.staffNotAllowed") ?? "Las cuentas de staff deben iniciar sesión en la app de staff.")
            : t("auth.googleFailed"),
        );
        return;
      }

      const token = url.searchParams.get("token");
      if (!token) {
        onError?.(t("auth.googleFailed"));
        return;
      }

      const err = await loginWithSessionToken(token);
      if (err) {
        onError?.(
          err === "StaffNotAllowed"
            ? (t("auth.staffNotAllowed") ?? "Las cuentas de staff deben iniciar sesión en la app de staff.")
            : t("auth.googleFailed"),
        );
      }
    } catch {
      onError?.(t("auth.googleFailed"));
    } finally {
      setLoading(false);
    }
  };

  if (compact) {
    return (
      <Pressable
        onPress={handlePress}
        disabled={loading}
        style={({ pressed }) => [styles.circle, pressed && styles.pressed, loading && styles.disabled]}
      >
        {loading ? <ActivityIndicator color="rgba(255,255,255,0.8)" size="small" /> : <GoogleIcon />}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={handlePress}
      disabled={loading}
      style={({ pressed }) => [
        styles.button,
        pressed && styles.pressed,
        loading && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color="rgba(255,255,255,0.8)" size="small" />
      ) : (
        <>
          <GoogleIcon />
          <Text style={styles.label}>{t("auth.googleSignIn")}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingVertical: 13,
    paddingHorizontal: 20,
    minHeight: 48,
  },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.5 },
  label: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "rgba(255,255,255,0.9)",
  },
});
