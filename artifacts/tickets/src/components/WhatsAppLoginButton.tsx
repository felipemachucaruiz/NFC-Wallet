import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { ArrowLeft, MessageCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PhoneField } from "@/components/ui/phone-input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useAuth } from "@/context/AuthContext";
import { sendWhatsAppOtp, verifyWhatsAppOtp } from "@/lib/api";

interface Props {
  onSuccess?: () => void;
  onBack?: () => void;
}

export function WhatsAppLoginForm({ onSuccess, onBack }: Props) {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const { loginWithToken, authRedirect } = useAuth();
  const [phone, setPhone] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(0);
  const submitRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || phone.length < 7) return;
    setLoading(true);
    setError("");
    try {
      await sendWhatsAppOtp(phone);
      setStep("otp");
      setCountdown(30);
    } catch {
      setError(t("auth.otpSendFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) return;
    setLoading(true);
    setError("");
    try {
      const res = await verifyWhatsAppOtp(phone, otp);
      const ok = await loginWithToken(res.token);
      if (ok) {
        onSuccess?.();
        if (authRedirect) navigate(`/${authRedirect}`);
      }
    } catch {
      setError(t("auth.otpFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    setLoading(true);
    setError("");
    try {
      await sendWhatsAppOtp(phone);
      setCountdown(30);
      setOtp("");
    } catch {
      setError(t("auth.otpSendFailed"));
    } finally {
      setLoading(false);
    }
  };

  if (step === "otp") {
    return (
      <form onSubmit={handleVerifyOtp} className="space-y-4">
        <div className="text-center mb-2">
          <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-3">
            <MessageCircle className="w-7 h-7 text-green-500" />
          </div>
          <h2 className="text-xl font-bold">{t("auth.verifyCode")}</h2>
          <p className="text-sm text-muted-foreground mt-2">{t("auth.otpSent")}</p>
          <p className="text-xs text-muted-foreground mt-1 font-mono">{phone}</p>
        </div>

        {error && (
          <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-lg">{error}</div>
        )}

        <div className="flex justify-center">
          <InputOTP
            maxLength={6}
            value={otp}
            onChange={(val) => {
              setOtp(val);
              if (val.length === 6) {
                setTimeout(() => submitRef.current?.click(), 100);
              }
            }}
            autoFocus
          >
            <InputOTPGroup className="gap-2">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <InputOTPSlot
                  key={i}
                  index={i}
                  className="w-12 h-14 text-xl font-bold rounded-lg border-border bg-muted/30 first:rounded-l-lg last:rounded-r-lg first:border-l"
                />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>

        <Button
          ref={submitRef}
          type="submit"
          className="w-full bg-green-600 text-white hover:bg-green-700"
          disabled={loading || otp.length !== 6}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          {t("auth.verifyCode")}
        </Button>

        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() => { setStep("phone"); setOtp(""); setError(""); }}
            className="text-primary hover:underline inline-flex items-center gap-1"
          >
            <ArrowLeft className="w-3 h-3" />
            {t("auth.changeNumber")}
          </button>
          <button
            type="button"
            onClick={handleResend}
            disabled={countdown > 0 || loading}
            className="text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
          >
            {countdown > 0 ? `${t("auth.resendCode")} (${countdown}s)` : t("auth.resendCode")}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handleSendOtp} className="space-y-4">
      <div className="text-center mb-2">
        <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-3">
          <MessageCircle className="w-7 h-7 text-green-500" />
        </div>
        <h2 className="text-xl font-bold">{t("auth.phoneLoginTitle")}</h2>
        <p className="text-sm text-muted-foreground mt-2">{t("auth.phoneLoginDesc")}</p>
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-lg">{error}</div>
      )}

      <div>
        <Label>{t("auth.phone")}</Label>
        <PhoneField
          value={phone}
          onChange={setPhone}
          required
          className="mt-1"
        />
      </div>

      <Button
        type="submit"
        className="w-full bg-green-600 text-white hover:bg-green-700"
        disabled={loading || !phone || phone.length < 7}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <MessageCircle className="w-4 h-4 mr-2" />}
        {t("auth.sendCode")}
      </Button>

      {onBack && (
        <div className="text-center">
          <button
            type="button"
            onClick={onBack}
            className="text-sm text-primary hover:underline inline-flex items-center gap-1"
          >
            <ArrowLeft className="w-3 h-3" />
            {t("auth.emailLogin")}
          </button>
        </div>
      )}
    </form>
  );
}
