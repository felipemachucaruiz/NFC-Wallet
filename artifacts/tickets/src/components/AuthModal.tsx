import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { X, ArrowLeft, Mail } from "lucide-react";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneField } from "@/components/ui/phone-input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";
import { useSocialAuth } from "@/context/SocialAuthProvider";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { WhatsAppLoginForm } from "@/components/WhatsAppLoginButton";

function LoginForm() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const { login, switchAuthView, authRedirect } = useAuth();
  const { googleEnabled } = useSocialAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPhoneLogin, setShowPhoneLogin] = useState(false);

  if (showPhoneLogin) {
    return (
      <WhatsAppLoginForm
        onSuccess={() => { if (authRedirect) navigate(`/${authRedirect}`); }}
        onBack={() => setShowPhoneLogin(false)}
      />
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const success = await login(email, password);
      if (success && authRedirect) {
        navigate(`/${authRedirect}`);
      }
    } catch {
      setError(t("auth.loginFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="text-center mb-2">
        <h2 className="text-xl font-bold">{t("auth.loginTitle")}</h2>
      </div>

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
        <div className="flex items-center justify-between">
          <Label>{t("auth.password")}</Label>
          <button
            type="button"
            onClick={() => switchAuthView("forgot")}
            className="text-xs text-primary hover:underline"
          >
            {t("auth.forgotPassword")}
          </button>
        </div>
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

      <div className="relative my-2">
        <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
        <div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-muted-foreground">{t("auth.orDivider")}</span></div>
      </div>

      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          className="w-full border-green-600/50 text-green-500 hover:bg-green-600/10 hover:text-green-400"
          onClick={() => setShowPhoneLogin(true)}
        >
          <WhatsAppIcon className="w-4 h-4 mr-2" />
          {t("auth.phoneLogin")}
        </Button>
        {googleEnabled && (
          <div>
            <GoogleSignInButton
              onSuccess={() => { if (authRedirect) navigate(`/${authRedirect}`); }}
              onError={(msg) => setError(msg)}
            />
          </div>
        )}
      </div>

      <div className="text-center text-sm">
        <p className="text-muted-foreground">
          {t("auth.noAccount")}{" "}
          <button
            type="button"
            onClick={() => switchAuthView("register")}
            className="text-primary hover:underline"
          >
            {t("auth.register")}
          </button>
        </p>
      </div>
    </form>
  );
}

function ForgotPasswordForm() {
  const { t } = useTranslation();
  const { switchAuthView } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await new Promise((r) => setTimeout(r, 1000));
    setLoading(false);
    setSent(true);
  };

  if (sent) {
    return (
      <div className="space-y-4 text-center py-4">
        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
          <Mail className="w-7 h-7 text-primary" />
        </div>
        <h2 className="text-xl font-bold">{t("auth.resetSentTitle")}</h2>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto">
          {t("auth.resetSentDesc")}
        </p>
        <Button
          variant="ghost"
          className="text-primary hover:text-primary/90"
          onClick={() => switchAuthView("login")}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t("auth.backToLogin")}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="text-center mb-2">
        <h2 className="text-xl font-bold">{t("auth.forgotPasswordTitle")}</h2>
        <p className="text-sm text-muted-foreground mt-2">
          {t("auth.forgotPasswordDesc")}
        </p>
      </div>

      <div>
        <Label>{t("auth.email")}</Label>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="mt-1"
          autoFocus
        />
      </div>
      <Button
        type="submit"
        className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
        disabled={loading}
      >
        {loading ? t("common.loading") : t("auth.sendResetLink")}
      </Button>
      <div className="text-center">
        <button
          type="button"
          onClick={() => switchAuthView("login")}
          className="text-sm text-primary hover:underline inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" />
          {t("auth.backToLogin")}
        </button>
      </div>
    </form>
  );
}

function RegisterForm() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const { register, switchAuthView, authRedirect } = useAuth();
  const { googleEnabled } = useSocialAuth();
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", password: "", confirmPassword: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPhoneLogin, setShowPhoneLogin] = useState(false);

  if (showPhoneLogin) {
    return (
      <WhatsAppLoginForm
        onSuccess={() => { if (authRedirect) navigate(`/${authRedirect}`); }}
        onBack={() => setShowPhoneLogin(false)}
      />
    );
  }

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
      if (success && authRedirect) {
        navigate(`/${authRedirect}`);
      }
    } catch {
      setError(t("auth.registerFailed"));
    } finally {
      setLoading(false);
    }
  };

  const update = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="text-center mb-2">
        <h2 className="text-xl font-bold">{t("auth.registerTitle")}</h2>
      </div>

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
        <PhoneField value={form.phone} onChange={(v) => update("phone", v)} required className="mt-1" />
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

      <div className="relative my-2">
        <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
        <div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-muted-foreground">{t("auth.orDivider")}</span></div>
      </div>

      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          className="w-full border-green-600/50 text-green-500 hover:bg-green-600/10 hover:text-green-400"
          onClick={() => setShowPhoneLogin(true)}
        >
          <WhatsAppIcon className="w-4 h-4 mr-2" />
          {t("auth.phoneLogin")}
        </Button>
        {googleEnabled && (
          <GoogleSignInButton
            onSuccess={() => { if (authRedirect) navigate(`/${authRedirect}`); }}
            onError={(msg) => setError(msg)}
          />
        )}
      </div>

      <div className="text-center text-sm">
        <p className="text-muted-foreground">
          {t("auth.hasAccount")}{" "}
          <button
            type="button"
            onClick={() => switchAuthView("login")}
            className="text-primary hover:underline"
          >
            {t("auth.login")}
          </button>
        </p>
      </div>
    </form>
  );
}

function ModalContent({ view }: { view: "login" | "register" | "forgot" }) {
  switch (view) {
    case "login": return <LoginForm />;
    case "register": return <RegisterForm />;
    case "forgot": return <ForgotPasswordForm />;
  }
}

export function AuthModal() {
  const { showAuthModal, authModalView, closeAuthModal } = useAuth();

  const { t } = useTranslation();
  const titleMap = { login: t("auth.loginTitle"), register: t("auth.registerTitle"), forgot: t("auth.forgotPasswordTitle") };

  return (
    <Dialog open={showAuthModal} onOpenChange={(open) => { if (!open) closeAuthModal(); }}>
      <DialogContent className="sm:max-w-md bg-card border-border p-6 [&>button]:hidden">
        <DialogTitle className="sr-only">
          {titleMap[authModalView]}
        </DialogTitle>
        <button
          onClick={closeAuthModal}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none"
        >
          <X className="h-4 w-4" />
        </button>
        <ModalContent view={authModalView} />
      </DialogContent>
    </Dialog>
  );
}
