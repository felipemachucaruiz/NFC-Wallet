import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useSearch } from "wouter";
import { Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { useSocialAuth } from "@/context/SocialAuthProvider";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

export default function Register() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const search = useSearch();
  const { register } = useAuth();
  const { googleEnabled } = useSocialAuth();
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", password: "", confirmPassword: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const redirect = new URLSearchParams(search).get("redirect");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      setError(t("auth.passwordMismatch"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      const success = await register({
        email: form.email,
        password: form.password,
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone,
      });
      if (success) {
        navigate(redirect === "checkout" ? "/checkout" : "/");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const update = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center mx-auto mb-4">
            <Ticket className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">{t("auth.registerTitle")}</h1>
        </div>

        <form onSubmit={handleSubmit} className="bg-card rounded-xl border border-border p-6 space-y-4">
          {error && (
            <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-lg">{error}</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("auth.firstName")}</Label>
              <Input value={form.firstName} onChange={(e) => update("firstName", e.target.value)} required className="mt-1" />
            </div>
            <div>
              <Label>{t("auth.lastName")}</Label>
              <Input value={form.lastName} onChange={(e) => update("lastName", e.target.value)} required className="mt-1" />
            </div>
          </div>
          <div>
            <Label>{t("auth.email")}</Label>
            <Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} required className="mt-1" />
          </div>
          <div>
            <Label>{t("auth.phone")}</Label>
            <Input type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} required className="mt-1" />
          </div>
          <div>
            <Label>{t("auth.password")}</Label>
            <Input type="password" value={form.password} onChange={(e) => update("password", e.target.value)} required minLength={6} className="mt-1" />
          </div>
          <div>
            <Label>{t("auth.confirmPassword")}</Label>
            <Input type="password" value={form.confirmPassword} onChange={(e) => update("confirmPassword", e.target.value)} required className="mt-1" />
          </div>
          <Button type="submit" className="w-full bg-primary text-primary-foreground hover:bg-primary/90" disabled={loading}>
            {loading ? t("common.loading") : t("auth.register")}
          </Button>
          {googleEnabled && (
            <>
              <div className="relative my-2">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                <div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-muted-foreground">{t("auth.orDivider")}</span></div>
              </div>
              <GoogleSignInButton
                onSuccess={() => navigate(redirect === "checkout" ? "/checkout" : "/")}
                onError={(msg) => setError(msg)}
              />
            </>
          )}
          <div className="text-center text-sm">
            <p className="text-muted-foreground">
              {t("auth.hasAccount")}{" "}
              <Link href={redirect ? `/login?redirect=${redirect}` : "/login"} className="text-primary hover:underline">
                {t("auth.login")}
              </Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
