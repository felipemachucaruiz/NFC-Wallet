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

export default function Login() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const search = useSearch();
  const { login } = useAuth();
  const { googleEnabled } = useSocialAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const redirect = new URLSearchParams(search).get("redirect");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const success = await login(email, password);
      if (success) {
        if (redirect === "checkout") {
          navigate("/checkout");
        } else if (redirect === "my-tickets") {
          navigate("/my-tickets");
        } else {
          navigate("/");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.loginFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center mx-auto mb-4">
            <Ticket className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">{t("auth.loginTitle")}</h1>
          {redirect === "checkout" && (
            <p className="text-sm text-muted-foreground mt-2">{t("auth.loginRequired")}</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="bg-card rounded-xl border border-border p-6 space-y-4">
          {error && (
            <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-lg">{error}</div>
          )}
          <div>
            <Label>{t("auth.email")}</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1"
            />
          </div>
          <div>
            <Label>{t("auth.password")}</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1"
            />
          </div>
          <Button
            type="submit"
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={loading}
          >
            {loading ? t("common.loading") : t("auth.login")}
          </Button>
          {googleEnabled && (
            <>
              <div className="relative my-2">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                <div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-muted-foreground">{t("auth.orDivider")}</span></div>
              </div>
              <GoogleSignInButton
                onSuccess={() => navigate(redirect === "checkout" ? "/checkout" : redirect === "my-tickets" ? "/my-tickets" : "/")}
                onError={(msg) => setError(msg)}
              />
            </>
          )}
          <div className="text-center text-sm">
            <p className="text-muted-foreground">
              {t("auth.noAccount")}{" "}
              <Link href={redirect ? `/register?redirect=${redirect}` : "/register"} className="text-primary hover:underline">
                {t("auth.register")}
              </Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
