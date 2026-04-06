import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { apiForgotPassword } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, ArrowLeft, CheckCircle } from "lucide-react";

export default function ForgotPasswordPage() {
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
      setError(err instanceof Error ? err.message : "Failed to send reset email");
    } finally {
      setIsLoading(false);
    }
  };

  const subtitle = source === "attendee" ? "Reset attendee password" : "Reset your password";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-primary/10 mb-4">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Tapee Admin</h1>
          <p className="text-muted-foreground text-sm mt-1">{subtitle}</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 shadow-lg">
          {sent ? (
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-primary/10">
                <CheckCircle className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-medium text-foreground">Check your email</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {source === "attendee"
                    ? "If an attendee account with that email exists, a reset link has been sent."
                    : "If a staff account with that email exists, a reset link has been sent."}
                </p>
              </div>
              <Button variant="outline" className="w-full" onClick={() => setLocation("/login")}>
                Back to login
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {source === "attendee" && (
                <div className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
                  Sending reset link to an attendee account via the Attendee API
                </div>
              )}
              <p className="text-sm text-muted-foreground">
                {source === "attendee"
                  ? "Enter the attendee's email address to send them a password reset link."
                  : "Enter the email address associated with your admin account and we'll send you a link to reset your password."}
              </p>

              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
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
                {isLoading ? "Sending..." : "Send reset link"}
              </Button>

              <button
                type="button"
                onClick={() => setLocation("/login")}
                className="w-full flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-3 w-3" />
                Back to login
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
