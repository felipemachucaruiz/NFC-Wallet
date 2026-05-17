import React from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text } from "react-native";
import Svg, { Path } from "react-native-svg";
import * as AppleAuthentication from "expo-apple-authentication";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  onError?: (msg: string) => void;
  compact?: boolean;
}

function AppleIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      <Path
        d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.4c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.39-1.32 2.76-2.54 3.99zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"
        fill="white"
      />
    </Svg>
  );
}

export function AppleSignInButton({ onError, compact }: Props) {
  const { t } = useTranslation();
  const { loginWithApple } = useAuth();
  const [loading, setLoading] = React.useState(false);

  if (Platform.OS !== "ios") return null;

  const handlePress = async () => {
    setLoading(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        onError?.(t("auth.appleFailed"));
        return;
      }

      const err = await loginWithApple(
        credential.identityToken,
        credential.fullName?.givenName ?? undefined,
        credential.fullName?.familyName ?? undefined,
      );

      if (err) {
        onError?.(
          err === "StaffNotAllowed"
            ? (t("auth.staffNotAllowed") ?? "Las cuentas de staff deben iniciar sesión en la app de staff.")
            : t("auth.appleFailed"),
        );
      }
    } catch (e: unknown) {
      if ((e as { code?: string }).code !== "ERR_REQUEST_CANCELED") {
        onError?.(t("auth.appleFailed"));
      }
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
        {loading ? <ActivityIndicator color="rgba(255,255,255,0.8)" size="small" /> : <AppleIcon />}
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
          <AppleIcon />
          <Text style={styles.label}>{t("auth.appleSignIn")}</Text>
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
