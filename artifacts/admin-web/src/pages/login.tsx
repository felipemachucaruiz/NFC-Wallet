import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, Eye, EyeOff } from "lucide-react";
import { getGetCurrentAuthUserQueryKey, setAuthTokenGetter } from "@workspace/api-client-react";
import { apiLogin, apiVerify2FA } from "@/lib/api";

export const AUTH_TOKEN_KEY = "tapee_admin_token";

type Step = "credentials" | "totp";

export default function Login() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("credentials");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [partialToken, setPartialToken] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "unauthorized_role") {
      setError("Your account does not have access to the admin portal.");
    }
  }, []);

  const finishLogin = async (token: string) => {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    setAuthTokenGetter(() => localStorage.getItem(AUTH_TOKEN_KEY));
    await queryClient.invalidateQueries({ queryKey: getGetCurrentAuthUserQueryKey() });
    const authData = await queryClient.fetchQuery({ queryKey: getGetCurrentAuthUserQueryKey() });
    const role = (authData as { user?: { role?: string } } | null)?.user?.role;
    if (role === "admin" || role === "event_admin") {
      setLocation(role === "event_admin" ? "/event-dashboard" : "/dashboard");
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      setAuthTokenGetter(null);
      setError("Your account does not have access to the admin portal.");
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
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleTotpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!totpCode.trim()) return;
    setError("");
    setIsLoading(true);
    try {
      const result = await apiVerify2FA(partialToken, totpCode.trim());
      await finishLogin(result.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "2FA verification failed");
      setTotpCode("");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-primary/10 mb-4">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Tapee Admin</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {step === "credentials" ? "Sign in to your account" : "Two-factor authentication"}
          </p>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 shadow-lg">
          {step === "credentials" ? (
            <form onSubmit={handleCredentialsSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="identifier">Email or username</Label>
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

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
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
                {isLoading ? "Signing in..." : "Sign in"}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setLocation("/forgot-password")}
                  className="text-sm text-primary hover:underline"
                >
                  Forgot your password?
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleTotpSubmit} className="space-y-4">
              <div className="text-sm text-muted-foreground text-center">
                Enter the 6-digit code from your authenticator app
              </div>

              <div className="space-y-2">
                <Label htmlFor="totp">Verification code</Label>
                <Input
                  id="totp"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  autoFocus
                  disabled={isLoading}
                  required
                  className="text-center text-xl tracking-widest"
                />
              </div>

              {error && (
                <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isLoading || totpCode.length !== 6}>
                {isLoading ? "Verifying..." : "Verify"}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => { setStep("credentials"); setError(""); setTotpCode(""); }}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Back to login
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
