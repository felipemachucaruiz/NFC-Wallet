import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { apiForgotPassword } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, CheckCircle, ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import TapeeLogo from "@/components/TapeeLogo";
import { AuthFooter } from "@/components/auth-footer";

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [source, setSource] = useState<"admin" | "attendee">("admin");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("source") === "attendee") setSource("attendee");
    else setSource("admin");
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      await apiForgotPassword(email.trim().toLowerCase(), source);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("forgotPassword.failedToSend"));
    } finally {
      setIsLoading(false);
    }
  };

  const subtitle = source === "attendee" ? t("forgotPassword.resetAttendeePassword") : t("forgotPassword.resetPassword");

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="px-8 py-5 flex items-center">
        <TapeeLogo className="h-7" />
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm">
          <div className="bg-card border border-border rounded-2xl p-8 shadow-2xl">
            {sent ? (
              <>
                <div className="flex justify-center mb-5">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <CheckCircle className="h-6 w-6 text-primary" />
                  </div>
                </div>
                <h1 className="text-xl font-bold text-center text-foreground mb-1">{t("forgotPassword.checkEmail")}</h1>
                <p className="text-sm text-muted-foreground text-center mb-6">
                  {source === "attendee" ? t("forgotPassword.attendeeEmailSent") : t("forgotPassword.adminEmailSent")}
                </p>
                <Button variant="outline" className="w-full" onClick={() => setLocation("/login")}>
                  {t("forgotPassword.backToLogin")}
                </Button>
              </>
            ) : (
              <>
                <div className="flex justify-center mb-5">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <Lock className="h-6 w-6 text-primary" />
                  </div>
                </div>
                <h1 className="text-xl font-bold text-center text-foreground mb-1">{t("forgotPassword.title")}</h1>
                <p className="text-sm text-muted-foreground text-center mb-6">{subtitle}</p>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {source === "attendee" && (
                    <div className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
                      {t("forgotPassword.attendeeApiNote")}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-xs font-medium">{t("forgotPassword.emailAddress")}</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@tapee.app"
                      autoComplete="email"
                      disabled={isLoading}
                      required
                    />
                  </div>

                  {error && (
                    <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
                      {error}
                    </div>
                  )}

                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? t("forgotPassword.sending") : t("forgotPassword.sendResetLink")}
                  </Button>

                  <button
                    type="button"
                    onClick={() => setLocation("/login")}
                    className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowLeft className="h-3 w-3" />
                    {t("forgotPassword.backToLogin")}
                  </button>
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
