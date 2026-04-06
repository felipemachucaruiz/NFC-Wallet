import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { apiForgotPassword } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, CheckCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

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
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src={`${import.meta.env.BASE_URL}tapee-logo.png`} alt="Tapee" className="h-14 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground">{t("forgotPassword.title")}</h1>
          <p className="text-muted-foreground text-sm mt-1">{subtitle}</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 shadow-lg">
          {sent ? (
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-primary/10">
                <CheckCircle className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-medium text-foreground">{t("forgotPassword.checkEmail")}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {source === "attendee" ? t("forgotPassword.attendeeEmailSent") : t("forgotPassword.adminEmailSent")}
                </p>
              </div>
              <Button variant="outline" className="w-full" onClick={() => setLocation("/login")}>
                {t("forgotPassword.backToLogin")}
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {source === "attendee" && (
                <div className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
                  {t("forgotPassword.attendeeApiNote")}
                </div>
              )}
              <p className="text-sm text-muted-foreground">
                {source === "attendee" ? t("forgotPassword.attendeeDescription") : t("forgotPassword.adminDescription")}
              </p>

              <div className="space-y-2">
                <Label htmlFor="email">{t("forgotPassword.emailAddress")}</Label>
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
                className="w-full flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-3 w-3" />
                {t("forgotPassword.backToLogin")}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
