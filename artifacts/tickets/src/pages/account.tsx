import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Check, Loader2, ChevronDown, ChevronUp, Trash2, Lock, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PhoneField } from "@/components/ui/phone-input";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { updateProfile, deleteAccount, changePassword } from "@/lib/api";

const ID_TYPES = [
  { code: "CC", label: "Cédula de ciudadanía" },
  { code: "CE", label: "Cédula de extranjería" },
  { code: "TI", label: "Tarjeta de identidad" },
  { code: "PP", label: "Pasaporte" },
  { code: "RC", label: "Registro civil" },
  { code: "NIT", label: "NIT" },
  { code: "VEN", label: "Doc. venezolano" },
  { code: "DIP", label: "Carnet diplomático" },
];

function parseIdDocument(stored: string): { idType: string; idNumber: string } {
  for (const t of ID_TYPES) {
    if (stored.startsWith(t.code + ": ")) {
      return { idType: t.code, idNumber: stored.slice(t.code.length + 2) };
    }
  }
  return { idType: "CC", idNumber: stored };
}

export default function Account() {
  const { t } = useTranslation();
  const { user, isAuthenticated, openAuthModal, refreshUser, logout } = useAuth();
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
    idType: "CC",
    idNumber: "",
  });

  // Change password state
  const [showPwSection, setShowPwSection] = useState(false);
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSaved, setPwSaved] = useState(false);
  const [pwError, setPwError] = useState("");
  const [showPwCurrent, setShowPwCurrent] = useState(false);
  const [showPwNext, setShowPwNext] = useState(false);
  const [showPwConfirm, setShowPwConfirm] = useState(false);

  // Delete account state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      openAuthModal("login", "account");
      navigate("/");
      return;
    }
    if (user) {
      const { idType, idNumber } = parseIdDocument(user.idDocument || "");
      setForm({
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        dateOfBirth: user.dateOfBirth || "",
        sex: user.sex || "",
        idType,
        idNumber,
      });
    }
  }, [isAuthenticated, user, navigate]);

  if (!isAuthenticated || !user) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError("");
    setSaving(true);
    try {
      const fullId = form.idNumber.trim() ? `${form.idType}: ${form.idNumber.trim()}` : null;
      await updateProfile({
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone || null,
        dateOfBirth: form.dateOfBirth || null,
        sex: form.sex || null,
        idDocument: fullId,
      });
      await refreshUser();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : t("account.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError("");
    if (pwForm.next.length < 8) { setPwError(t("account.passwordTooShort")); return; }
    if (pwForm.next !== pwForm.confirm) { setPwError(t("account.passwordMismatch")); return; }
    setPwSaving(true);
    try {
      await changePassword({ currentPassword: pwForm.current, newPassword: pwForm.next });
      setPwSaved(true);
      setPwForm({ current: "", next: "", confirm: "" });
      setTimeout(() => { setPwSaved(false); setShowPwSection(false); }, 2500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("account.saveError");
      if (msg.includes("incorrecta") || msg.includes("incorrect")) {
        setPwError(t("account.wrongPassword"));
      } else if (msg.includes("no tiene contraseña") || msg.includes("no password")) {
        setPwError(t("account.noPassword"));
      } else {
        setPwError(msg);
      }
    } finally {
      setPwSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await deleteAccount();
      await logout();
      navigate("/");
    } catch {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const sexOptions = [
    { value: "male", label: t("ticketSelection.male") },
    { value: "female", label: t("ticketSelection.female") },
    { value: "non_binary", label: t("ticketSelection.nonBinary") },
  ];

  return (
    <div className="min-h-screen">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4">
        <h1 className="text-2xl font-bold">{t("account.title")}</h1>

        {/* Profile */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-4">{t("account.profile")}</h2>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>{t("auth.firstName")}</Label>
                <Input value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label>{t("auth.lastName")}</Label>
                <Input value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} className="mt-1" />
              </div>
            </div>

            <div>
              <Label>{t("auth.email")}</Label>
              <Input type="email" value={form.email} disabled className="mt-1 opacity-60" />
            </div>

            <div>
              <Label>{t("auth.phone")}</Label>
              <PhoneField value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} className="mt-1" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>{t("ticketSelection.dateOfBirth")}</Label>
                <div className="mt-1">
                  <DatePickerField value={form.dateOfBirth} onChange={(v) => setForm((f) => ({ ...f, dateOfBirth: v }))} />
                </div>
              </div>
              <div>
                <Label>{t("ticketSelection.sex")}</Label>
                <div className="flex gap-2 mt-1">
                  {sexOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, sex: f.sex === opt.value ? "" : opt.value }))}
                      className={cn(
                        "flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
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
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>{t("account.idType")}</Label>
                <Select value={form.idType} onValueChange={(v) => setForm((f) => ({ ...f, idType: v }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ID_TYPES.map((id) => (
                      <SelectItem key={id.code} value={id.code}>{id.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("ticketSelection.idDocument")}</Label>
                <Input
                  value={form.idNumber}
                  onChange={(e) => setForm((f) => ({ ...f, idNumber: e.target.value }))}
                  placeholder="123456789"
                  className="mt-1"
                />
              </div>
            </div>

            {saveError && <p className="text-sm text-destructive">{saveError}</p>}
            <Button type="submit" disabled={saving} className="gap-2">
              {saving ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Guardando…</>
              ) : saved ? (
                <><Check className="w-4 h-4" /> {t("account.saved")}</>
              ) : t("account.save")}
            </Button>
          </form>
        </div>

        {/* Change password */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => { setShowPwSection((s) => !s); setPwError(""); setPwForm({ current: "", next: "", confirm: "" }); }}
            className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/30 transition-colors"
          >
            <span className="flex items-center gap-2 font-semibold text-sm">
              <Lock className="w-4 h-4 text-primary" />
              {t("account.changePassword")}
            </span>
            {showPwSection ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>
          {showPwSection && (
            <form onSubmit={handleChangePassword} className="px-5 pb-5 space-y-3 border-t border-border pt-4">
              <div>
                <Label>{t("account.currentPassword")}</Label>
                <div className="relative mt-1">
                  <Input type={showPwCurrent ? "text" : "password"} value={pwForm.current} onChange={(e) => setPwForm((f) => ({ ...f, current: e.target.value }))} className="pr-10" autoComplete="current-password" />
                  <button type="button" onClick={() => setShowPwCurrent((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                    {showPwCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <Label>{t("account.newPassword")}</Label>
                <div className="relative mt-1">
                  <Input type={showPwNext ? "text" : "password"} value={pwForm.next} onChange={(e) => setPwForm((f) => ({ ...f, next: e.target.value }))} className="pr-10" autoComplete="new-password" />
                  <button type="button" onClick={() => setShowPwNext((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                    {showPwNext ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <Label>{t("account.confirmNewPassword")}</Label>
                <div className="relative mt-1">
                  <Input type={showPwConfirm ? "text" : "password"} value={pwForm.confirm} onChange={(e) => setPwForm((f) => ({ ...f, confirm: e.target.value }))} className="pr-10" autoComplete="new-password" />
                  <button type="button" onClick={() => setShowPwConfirm((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                    {showPwConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {pwError && <p className="text-sm text-destructive">{pwError}</p>}
              <Button type="submit" disabled={pwSaving} className="gap-2">
                {pwSaving ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Guardando…</>
                ) : pwSaved ? (
                  <><Check className="w-4 h-4" /> {t("account.passwordChanged")}</>
                ) : t("account.save")}
              </Button>
            </form>
          )}
        </div>

        {/* Delete account */}
        <div className="bg-card rounded-xl border border-destructive/30 p-5">
          <h2 className="font-semibold mb-1 text-destructive">{t("account.deleteAccount")}</h2>
          <p className="text-sm text-muted-foreground mb-4">{t("account.deleteConfirmDesc")}</p>
          {!showDeleteConfirm ? (
            <Button variant="destructive" size="sm" onClick={() => setShowDeleteConfirm(true)} className="gap-2">
              <Trash2 className="w-4 h-4" />
              {t("account.deleteAccount")}
            </Button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-medium text-destructive">{t("account.deleteConfirmTitle")}</p>
              <div className="flex gap-3">
                <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>
                  {t("common.cancel")}
                </Button>
                <Button variant="destructive" size="sm" onClick={handleDeleteAccount} disabled={deleting} className="gap-2">
                  {deleting ? <><Loader2 className="w-4 h-4 animate-spin" /> {t("account.deleting")}</> : t("account.deleteAccount")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
