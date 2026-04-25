import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { API_BASE_URL } from "@/constants/domain";

interface Props {
  onError?: (msg: string) => void;
}

const DEEP_LINK_PREFIX = "tapee-attendee://auth/done";

export function GoogleSignInButton({ onError }: Props) {
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
          <View style={styles.gBadge}>
            <Text style={styles.gLetter}>G</Text>
          </View>
          <Text style={styles.label}>{t("auth.googleSignIn")}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  gBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  gLetter: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: "#4285F4",
    lineHeight: 15,
  },
  label: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "rgba(255,255,255,0.9)",
  },
});
