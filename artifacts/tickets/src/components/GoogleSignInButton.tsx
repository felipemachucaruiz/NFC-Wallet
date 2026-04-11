import { useState } from "react";
import { useTranslation } from "react-i18next";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import { useAuth } from "@/context/AuthContext";

interface Props {
  onSuccess?: () => void;
  onError?: (msg: string) => void;
}

export function GoogleSignInButton({ onSuccess, onError }: Props) {
  const { t } = useTranslation();
  const { loginWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleSuccess = async (response: CredentialResponse) => {
    if (!response.credential) {
      onError?.(t("auth.googleFailed"));
      return;
    }
    setLoading(true);
    try {
      const ok = await loginWithGoogle(response.credential);
      if (ok) {
        onSuccess?.();
      } else {
        onError?.(t("auth.googleFailed"));
      }
    } catch (err) {
      onError?.(err instanceof Error ? err.message : t("auth.googleFailed"));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full flex justify-center py-2">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full flex justify-center [&>div]:w-full">
      <GoogleLogin
        onSuccess={handleSuccess}
        onError={() => onError?.(t("auth.googleFailed"))}
        theme="filled_black"
        size="large"
        width="400"
        text="continue_with"
        shape="rectangular"
      />
    </div>
  );
}
