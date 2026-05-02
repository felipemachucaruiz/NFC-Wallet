import React from "react";
import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  onError?: (msg: string) => void;
}

export function AppleSignInButton({ onError }: Props) {
  const { t } = useTranslation();
  const { loginWithApple } = useAuth();

  if (Platform.OS !== "ios") return null;

  const handlePress = async () => {
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
    }
  };

  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE_OUTLINE}
      cornerRadius={12}
      style={{ height: 48 }}
      onPress={handlePress}
    />
  );
}
