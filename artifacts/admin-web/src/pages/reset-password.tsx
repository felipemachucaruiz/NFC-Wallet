import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { apiResetPassword } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, Eye, EyeOff, CheckCircle, AlertTriangle } from "lucide-react";

export default function ResetPasswordPage() {
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
    const t = params.get("token") ?? "";
    const s = params.get("source");
    setToken(t);
    if (s === "attendee") setSource("attendee");
    else setSource("admin");
  }, []);

  const minLength = source === "attendee" ? 6 : 8;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!token) {
      setError("Reset token is missing from the URL.");
      return;
    }

    if (password.length < minLength) {
      setError(`Password must be at least ${minLength} characters.`);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsLoading(true);
    try {
      await apiResetPassword(token, password, source);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password");
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
            {source === "attendee" ? "Attendee password reset" : "Set a new password"}
          </p>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 shadow-lg">
          {!token ? (
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-destructive/10">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <p className="font-medium text-foreground">Invalid reset link</p>
                <p className="text-sm text-muted-foreground mt-1">
                  This reset link is missing a token. Please request a new password reset.
                </p>
              </div>
              <Button variant="outline" className="w-full" onClick={() => setLocation("/forgot-password")}>
                Request new reset link
              </Button>
            </div>
          ) : success ? (
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-primary/10">
                <CheckCircle className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-medium text-foreground">Password updated</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Your password has been reset successfully. You can now sign in with your new password.
                </p>
              </div>
              <Button className="w-full" onClick={() => setLocation("/login")}>
                Go to login
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {source === "attendee" && (
                <div className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
                  Resetting password for an attendee account
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="password">New password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={`At least ${minLength} characters`}
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

              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm new password</Label>
                <Input
                  id="confirm"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
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
                {isLoading ? "Resetting..." : "Reset password"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
