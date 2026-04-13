import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneField } from "@/components/ui/phone-input";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { updateProfile } from "@/lib/api";

export default function Account() {
  const { t } = useTranslation();
  const { user, isAuthenticated, openAuthModal } = useAuth();
  const [, navigate] = useLocation();
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    dateOfBirth: "",
    sex: "",
    idDocument: "",
  });

  useEffect(() => {
    if (!isAuthenticated) {
      openAuthModal("login", "account");
      navigate("/");
      return;
    }
    if (user) {
      setForm({
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        dateOfBirth: user.dateOfBirth || "",
        sex: user.sex || "",
        idDocument: user.idDocument || "",
      });
    }
  }, [isAuthenticated, user, navigate]);

  if (!isAuthenticated || !user) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError("");
    setSaving(true);
    try {
      await updateProfile({
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone || null,
        dateOfBirth: form.dateOfBirth || null,
        sex: form.sex || null,
        idDocument: form.idDocument || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : t("account.saveError");
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  };

  const sexOptions = [
    { value: "male", label: t("tickets.male") },
    { value: "female", label: t("tickets.female") },
  ];

  return (
    <div className="min-h-screen">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold mb-6">{t("account.title")}</h1>

        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-4">{t("account.profile")}</h2>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>{t("auth.firstName")}</Label>
                <Input
                  value={form.firstName}
                  onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>{t("auth.lastName")}</Label>
                <Input
                  value={form.lastName}
                  onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label>{t("auth.email")}</Label>
              <Input type="email" value={form.email} disabled className="mt-1 opacity-60" />
            </div>

            <div>
              <Label>{t("auth.phone")}</Label>
              <PhoneField
                value={form.phone}
                onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>{t("tickets.dateOfBirth")}</Label>
                <div className="mt-1">
                  <DatePickerField
                    value={form.dateOfBirth}
                    onChange={(v) => setForm((f) => ({ ...f, dateOfBirth: v }))}
                  />
                </div>
              </div>
              <div>
                <Label>{t("tickets.idDocument")}</Label>
                <Input
                  value={form.idDocument}
                  onChange={(e) => setForm((f) => ({ ...f, idDocument: e.target.value }))}
                  placeholder="123456789"
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label>{t("tickets.sex")}</Label>
              <div className="flex gap-2 mt-1">
                {sexOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() =>
                      setForm((f) => ({ ...f, sex: f.sex === opt.value ? "" : opt.value }))
                    }
                    className={cn(
                      "flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
                      form.sex === opt.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:border-primary/50"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {saveError && (
              <p className="text-sm text-destructive">{saveError}</p>
            )}
            <Button type="submit" disabled={saving} className="gap-2">
              {saving ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Guardando…</>
              ) : saved ? (
                <><Check className="w-4 h-4" /> {t("account.saved")}</>
              ) : t("account.save")}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
