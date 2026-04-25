/**
 * Google Sign-In using expo-web-browser (no new native modules needed).
 *
 * SETUP REQUIRED (one-time):
 * Add `tapee-attendee://auth/google/callback` to the list of
 * "Authorized redirect URIs" in Google Cloud Console → your OAuth 2.0
 * web client credentials page.
 */
import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import * as Crypto from "expo-crypto";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  onError?: (msg: string) => void;
}

function parseFragment(url: string): Record<string, string> {
  const hashIdx = url.indexOf("#");
  if (hashIdx === -1) return {};
  return url
    .substring(hashIdx + 1)
    .split("&")
    .reduce<Record<string, string>>((acc, pair) => {
      const [k, v] = pair.split("=");
      if (k) acc[decodeURIComponent(k)] = decodeURIComponent(v ?? "");
      return acc;
    }, {});
}

export function GoogleSignInButton({ onError }: Props) {
  const { t } = useTranslation();
  const { googleClientId, loginWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);

  if (!googleClientId) return null;

  const handlePress = async () => {
    setLoading(true);
    try {
      const redirectUri = Linking.createURL("auth/google/callback");
      const nonce = Crypto.randomUUID();

      const params = new URLSearchParams({
        client_id: googleClientId,
        redirect_uri: redirectUri,
        response_type: "id_token",
        scope: "openid email profile",
        nonce,
        prompt: "select_account",
      });

      const result = await WebBrowser.openAuthSessionAsync(
        `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
        redirectUri,
      );

      if (result.type !== "success") return;

      const idToken = parseFragment(result.url).id_token;
      if (!idToken) {
        onError?.(t("auth.googleFailed"));
        return;
      }

      const err = await loginWithGoogle(idToken);
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
