import { useState, useRef, useEffect } from "react";
import TapeeLogo from "@/components/TapeeLogo";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { getGetCurrentAuthUserQueryKey, getGetCurrentAuthUserQueryOptions, setAuthTokenGetter } from "@workspace/api-client-react";
import { apiLogin, apiVerify2FA } from "@/lib/api";
import { useTranslation } from "react-i18next";
import { AuthFooter } from "@/components/auth-footer";

export const AUTH_TOKEN_KEY = "tapee_admin_token";

type Step = "credentials" | "totp";

export default function Login() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("credentials");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [partialToken, setPartialToken] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const digitRefs = useRef<(HTMLInputElement | null)[]>([]);

  const totpCode = digits.join("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "unauthorized_role") {
      setError(t("login.unauthorizedRole"));
    }
  }, [t]);

  const finishLogin = async (token: string) => {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    setAuthTokenGetter(() => localStorage.getItem(AUTH_TOKEN_KEY));
    await queryClient.invalidateQueries({ queryKey: getGetCurrentAuthUserQueryKey() });
    const authData = await queryClient.fetchQuery(getGetCurrentAuthUserQueryOptions());
    const role = (authData as { user?: { role?: string } } | null)?.user?.role;
    if (role === "admin") {
      setLocation("/dashboard");
    } else if (role === "event_admin") {
      setLocation("/event-dashboard");
    } else if (role === "ticketing_auditor") {
      setLocation("/auditor-ticket-sales");
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      setAuthTokenGetter(null);
      setError(t("login.unauthorizedRole"));
    }
  };

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) return;
    setError("");
    setIsLoading(true);
    try {
      const result = await apiLogin(identifier.trim(), password);
      if (result.requires_2fa && result.partial_token) {
        setPartialToken(result.partial_token);
        setStep("totp");
      } else if (result.token) {
        await finishLogin(result.token);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("login.loginFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleTotpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totpCode.length !== 6) return;
    setError("");
    setIsLoading(true);
    try {
      const result = await apiVerify2FA(partialToken, totpCode);
      await finishLogin(result.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("login.twoFaFailed"));
      setDigits(["", "", "", "", "", ""]);
      digitRefs.current[0]?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  const handleDigitChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);
    if (digit && index < 5) digitRefs.current[index + 1]?.focus();
  };

  const handleDigitKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      digitRefs.current[index - 1]?.focus();
    }
  };

  const handleDigitPaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    const next = [...digits];
    pasted.split("").forEach((ch, i) => { if (i < 6) next[i] = ch; });
    setDigits(next);
    const focus = Math.min(pasted.length, 5);
    digitRefs.current[focus]?.focus();
  };

  return (
    <div
      className="min-h-screen flex flex-col bg-background relative"
      style={{ backgroundImage: `url('${import.meta.env.BASE_URL}login-bg.jpg')`, backgroundSize: "cover", backgroundPosition: "center bottom" }}
    >
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/65 pointer-events-none" />

      {/* Center content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-8 gap-8">
        <TapeeLogo className="h-16 drop-shadow-[0_0_18px_rgba(0,241,255,0.5)]" />
        <div className="w-full max-w-sm">
          <div className="bg-card/80 backdrop-blur-md border border-border/60 rounded-2xl p-8 shadow-2xl">
            {step === "credentials" ? (
              <>
                <div className="flex justify-center mb-5">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <Lock className="h-6 w-6 text-primary" />
                  </div>
                </div>
                <h1 className="text-xl font-bold text-center text-foreground mb-1">{t("login.title")}</h1>
                <p className="text-sm text-muted-foreground text-center mb-6">{t("login.signIn")}</p>

                <form onSubmit={handleCredentialsSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="identifier" className="text-xs font-medium">{t("login.emailOrUsername")}</Label>
                    <Input
                      id="identifier"
                      type="text"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="admin@tapee.app"
                      autoComplete="username"
                      disabled={isLoading}
                      required
                      data-testid="input-username"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="password" className="text-xs font-medium">{t("login.password")}</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        disabled={isLoading}
                        required
                        className="pr-10"
                        data-testid="input-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
                      {error}
                    </div>
                  )}

                  <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-submit">
                    {isLoading ? t("login.signingIn") : t("login.submitSignIn")}
                  </Button>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => setLocation("/forgot-password")}
                      className="text-xs text-primary hover:underline"
                    >
                      {t("login.forgotPassword")}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <div className="flex justify-center mb-5">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <Mail className="h-6 w-6 text-primary" />
                  </div>
                </div>
                <h1 className="text-xl font-bold text-center text-foreground mb-1">{t("login.twoFactor")}</h1>
                <p className="text-sm text-muted-foreground text-center mb-6">{t("login.enterCode")}</p>

                <form onSubmit={handleTotpSubmit} className="space-y-5">
                  <div className="flex gap-2 justify-center" onPaste={handleDigitPaste}>
                    {digits.map((d, i) => (
                      <input
                        key={i}
                        ref={(el) => { digitRefs.current[i] = el; }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={d}
                        onChange={(e) => handleDigitChange(i, e.target.value)}
                        onKeyDown={(e) => handleDigitKeyDown(i, e)}
                        disabled={isLoading}
                        autoFocus={i === 0}
                        className="w-11 h-12 text-center text-lg font-bold rounded-lg border border-border bg-muted/50 text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-colors"
                      />
                    ))}
                  </div>

                  {error && (
                    <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
                      {error}
                    </div>
                  )}

                  <Button type="submit" className="w-full" disabled={isLoading || totpCode.length !== 6}>
                    {isLoading ? t("login.verifying") : t("login.verify")}
                  </Button>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => { setStep("credentials"); setError(""); setDigits(["", "", "", "", "", ""]); }}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {t("login.backToLogin")}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="relative z-10">
        <AuthFooter />
      </div>
    </div>
  );
}
