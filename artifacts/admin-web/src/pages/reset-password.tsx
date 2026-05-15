import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { apiResetPassword } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Lock, CheckCircle, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import TapeeLogo from "@/components/TapeeLogo";

function AuthFooter() {
  return (
    <footer className="px-6 py-4 flex items-center justify-between text-[11px] text-muted-foreground/60 border-t border-border">
      <span>© 2025 Tapee. All rights reserved.</span>
      <div className="flex items-center gap-4">
        <span className="hover:text-muted-foreground cursor-pointer transition-colors">Privacy</span>
        <span className="hover:text-muted-foreground cursor-pointer transition-colors">Terms</span>
        <span className="hover:text-muted-foreground cursor-pointer transition-colors">Get help</span>
      </div>
    </footer>
  );
}

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [token, setToken] = useState("");
  const [source, setSource] = useState<"admin" | "attendee">("admin");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tk = params.get("token") ?? "";
    const s = params.get("source");
    setToken(tk);
    if (s === "attendee") setSource("attendee");
    else setSource("admin");
  }, []);

  const minLength = source === "attendee" ? 6 : 8;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!token) {
      setError(t("resetPassword.tokenMissing"));
      return;
    }
    if (password.length < minLength) {
      setError(t("resetPassword.minLength", { count: minLength }));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("resetPassword.passwordsNoMatch"));
      return;
    }

    setIsLoading(true);
    try {
      await apiResetPassword(token, password, source);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("resetPassword.failedToReset"));
    } finally {
      setIsLoading(false);
    }
  };

  const subtitle = source === "attendee" ? t("resetPassword.attendeeReset") : t("resetPassword.setNewPassword");

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="px-8 py-5 flex items-center">
        <TapeeLogo className="h-7" />
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm">
          <div className="bg-card border border-border rounded-2xl p-8 shadow-2xl">
            {!token ? (
              <>
                <div className="flex justify-center mb-5">
                  <div className="w-14 h-14 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center">
                    <AlertTriangle className="h-6 w-6 text-destructive" />
                  </div>
                </div>
                <h1 className="text-xl font-bold text-center text-foreground mb-1">{t("resetPassword.invalidLink")}</h1>
                <p className="text-sm text-muted-foreground text-center mb-6">{t("resetPassword.invalidLinkDesc")}</p>
                <Button variant="outline" className="w-full" onClick={() => setLocation("/forgot-password")}>
                  {t("resetPassword.requestNewLink")}
                </Button>
              </>
            ) : success ? (
              <>
                <div className="flex justify-center mb-5">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <CheckCircle className="h-6 w-6 text-primary" />
                  </div>
                </div>
                <h1 className="text-xl font-bold text-center text-foreground mb-1">{t("resetPassword.passwordUpdated")}</h1>
                <p className="text-sm text-muted-foreground text-center mb-6">{t("resetPassword.passwordUpdatedDesc")}</p>
                <Button className="w-full" onClick={() => setLocation("/login")}>
                  {t("resetPassword.goToLogin")}
                </Button>
              </>
            ) : (
              <>
                <div className="flex justify-center mb-5">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <Lock className="h-6 w-6 text-primary" />
                  </div>
                </div>
                <h1 className="text-xl font-bold text-center text-foreground mb-1">{t("resetPassword.title")}</h1>
                <p className="text-sm text-muted-foreground text-center mb-6">{subtitle}</p>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {source === "attendee" && (
                    <div className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
                      {t("resetPassword.attendeeAccountNote")}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor="password" className="text-xs font-medium">{t("resetPassword.newPassword")}</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={t("resetPassword.atLeastChars", { count: minLength })}
                        autoComplete="new-password"
                        disabled={isLoading}
                        required
                        className="pr-10"
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

                  <div className="space-y-1.5">
                    <Label htmlFor="confirm" className="text-xs font-medium">{t("resetPassword.confirmPassword")}</Label>
                    <Input
                      id="confirm"
                      type={showPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder={t("resetPassword.reEnterPassword")}
                      autoComplete="new-password"
                      disabled={isLoading}
                      required
                    />
                  </div>

                  {error && (
                    <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
                      {error}
                    </div>
                  )}

                  <Button type="submit" className="w-full" disabled={isLoading || !password || !confirmPassword}>
                    {isLoading ? t("resetPassword.resetingPassword") : t("resetPassword.resetPassword")}
                  </Button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>

      <AuthFooter />
    </div>
  );
}
