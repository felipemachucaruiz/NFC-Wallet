import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneField } from "@/components/ui/phone-input";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, MapPin, Users, CheckCircle, Loader2, AlertCircle, CreditCard as IdCard, Heart, Shirt, Phone } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { resolveImageUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const PROD_ORIGIN = "https://attendee.tapee.app";
const API_BASE = import.meta.env.PROD
  ? `${PROD_ORIGIN}/attendee-api/api`
  : "/tickets/prod-api";

const SHIRT_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];
const BLOOD_TYPES = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];
const EPS_LIST = [
  "Aliansalud EPS", "Anas Wayuu", "Asmet Salud", "Capresoca EPS",
  "Coosalud EPS", "Compensar EPS", "Comfamiliar Huila", "Comfenalco Valle",
  "Dusakawi EPSI", "Emssanar EPS", "Famisanar EPS", "Mallamas EPSI",
  "Medimás EPS", "Mutual Ser EPS", "Nueva EPS", "Pijaos Salud EPSI",
  "Salud MIA", "Salud Total EPS", "Sanitas EPS", "Savia Salud EPS", "Sura EPS",
];

async function fetchGuestListInfo(slug: string) {
  const res = await fetch(`${API_BASE}/guest-list/${slug}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Not found" }));
    throw new Error(data.error || "Not found");
  }
  return res.json();
}

interface SignupBody {
  name: string;
  email: string;
  phone?: string;
  idDocument?: string;
  dateOfBirth?: string;
  sex?: "male" | "female";
  shirtSize?: string;
  bloodType?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  eps?: string;
}

async function submitGuestListSignup(slug: string, body: SignupBody) {
  const res = await fetch(`${API_BASE}/guest-list/${slug}/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Signup failed");
  return data;
}

function PillButton({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
        selected
          ? "border-cyan-500 bg-cyan-500/10 text-cyan-400"
          : "border-gray-700 text-gray-400 hover:border-cyan-700"
      }`}
    >
      {label}
    </button>
  );
}

export default function GuestListPage() {
  const { t } = useTranslation();
  const [, params] = useRoute("/guest-list/:slug");
  const slug = params?.slug || "";
  const { user, isAuthenticated } = useAuth();

  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formIdDocument, setFormIdDocument] = useState("");
  const [formDateOfBirth, setFormDateOfBirth] = useState("");
  const [formSex, setFormSex] = useState<"male" | "female" | "non_binary" | "">("");
  // Race fields
  const [formShirtSize, setFormShirtSize] = useState("");
  const [formBloodType, setFormBloodType] = useState("");
  const [formEps, setFormEps] = useState("");
  const [formEmergencyName, setFormEmergencyName] = useState("");
  const [formEmergencyPhone, setFormEmergencyPhone] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [signupResult, setSignupResult] = useState<{ ticket: { id: string; qrCodeToken: string }; event: { name: string; venueAddress: string; startsAt: string } } | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["guest-list", slug],
    queryFn: () => fetchGuestListInfo(slug),
    enabled: !!slug,
  });

  const isRace = data?.event?.category === "race";

  useEffect(() => {
    if (isAuthenticated && user) {
      setFormName(`${user.firstName} ${user.lastName}`.trim());
      setFormEmail(user.email || "");
      setFormPhone(user.phone || "");
      setFormIdDocument(user.idDocument || "");
      setFormDateOfBirth(user.dateOfBirth || "");
      if (user.sex === "male" || user.sex === "female" || user.sex === "non_binary") setFormSex(user.sex);
    }
  }, [isAuthenticated, user]);

  const signupMutation = useMutation({
    mutationFn: () => submitGuestListSignup(slug, {
      name: formName.trim(),
      email: formEmail.trim(),
      phone: formPhone.trim() || undefined,
      idDocument: formIdDocument.trim() || undefined,
      dateOfBirth: formDateOfBirth.trim() || undefined,
      sex: (formSex as "male" | "female" | "non_binary") || undefined,
      shirtSize: isRace ? formShirtSize || undefined : undefined,
      bloodType: isRace ? formBloodType || undefined : undefined,
      emergencyContactName: isRace ? formEmergencyName.trim() || undefined : undefined,
      emergencyContactPhone: isRace ? formEmergencyPhone.trim() || undefined : undefined,
      eps: isRace ? formEps || undefined : undefined,
    }),
    onSuccess: (result) => {
      setSignupResult(result);
    },
  });

  function clearErr(key: string) {
    setErrors((p) => { const n = { ...p }; delete n[key]; return n; });
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    if (!formName.trim()) newErrors.name = t("guestList.required");
    if (!formEmail.trim()) newErrors.email = t("guestList.required");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formEmail)) newErrors.email = t("guestList.invalidEmail");
    if (!formIdDocument.trim()) newErrors.idDocument = t("guestList.required");
    if (!formDateOfBirth.trim()) newErrors.dateOfBirth = t("guestList.required");
    if (!formSex) newErrors.sex = t("guestList.required");
    if (isRace) {
      if (!formShirtSize) newErrors.shirtSize = t("guestList.required");
      if (!formBloodType) newErrors.bloodType = t("guestList.required");
      if (!formEmergencyName.trim()) newErrors.emergencyName = t("guestList.required");
      if (!formEmergencyPhone.trim()) newErrors.emergencyPhone = t("guestList.required");
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    signupMutation.mutate();
  }

  const isLoggedIn = isAuthenticated && !!user;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-red-400 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">{t("guestList.notFound")}</h2>
        <p className="text-gray-400">{(error as Error)?.message}</p>
      </div>
    );
  }

  const guestList = data?.guestList;
  const event = data?.event;

  if (signupResult) {
    return (
      <div className="max-w-lg mx-auto px-4 py-8">
        <Card className="bg-gray-900 border-gray-800 overflow-hidden">
          <CardContent className="p-0">
            <div className="bg-gradient-to-r from-emerald-600 to-cyan-600 p-6 text-center">
              <CheckCircle className="mx-auto h-12 w-12 text-white mb-3" />
              <h2 className="text-2xl font-bold text-white">{t("guestList.confirmed")}</h2>
              <p className="text-emerald-100 mt-1">{t("guestList.confirmedSubtitle")}</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="text-center">
                <p className="text-lg font-semibold text-white">{event?.name || signupResult.event?.name}</p>
                {(event?.venueAddress || signupResult.event?.venueAddress) && (
                  <p className="text-sm text-gray-400 flex items-center justify-center gap-1 mt-1">
                    <MapPin className="h-3 w-3" />
                    {event?.venueAddress || signupResult.event?.venueAddress}
                  </p>
                )}
              </div>

              {signupResult.ticket?.qrCodeToken && (
                <div className="text-center bg-white rounded-xl p-4 mx-auto max-w-[320px]">
                  <QRCodeSVG
                    value={signupResult.ticket.qrCodeToken}
                    size={260}
                    bgColor="#ffffff"
                    fgColor="#000000"
                    level="H"
                    imageSettings={{
                      src: `${import.meta.env.BASE_URL}tapee-qr-logo.png`,
                      height: 52,
                      width: 52,
                      excavate: true,
                    }}
                  />
                </div>
              )}

              <div className="text-center">
                <p className="text-sm text-gray-400">{t("guestList.qrInstructions")}</p>
              </div>
              <div className="text-center text-sm text-gray-500 mt-4">
                <p>{t("guestList.emailSent")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <Card className="bg-gray-900 border-gray-800 overflow-hidden">
        <CardContent className="p-0">
          {event?.coverImageUrl && (
            <div className="h-40 overflow-hidden">
              <img
                src={resolveImageUrl(event.coverImageUrl)}
                alt={event.name}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          <div className="p-6 space-y-4">
            <div>
              <h1 className="text-2xl font-bold text-white">{guestList?.name}</h1>
              <p className="text-lg text-cyan-400 font-medium mt-1">{event?.name}</p>
            </div>

            <div className="flex flex-wrap gap-4 text-sm text-gray-400">
              {event?.startsAt && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {new Date(event.startsAt).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Bogota" })}
                </span>
              )}
              {event?.venueAddress && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {event.venueAddress}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                {t("guestList.spotsRemaining", { count: guestList?.spotsRemaining ?? 0 })}
              </span>
            </div>

            {!guestList?.isAvailable ? (
              <div className="bg-red-900/30 border border-red-800 rounded-lg p-4 text-center">
                <AlertCircle className="mx-auto h-8 w-8 text-red-400 mb-2" />
                <p className="text-red-300 font-medium">
                  {guestList?.status === "closed"
                    ? t("guestList.listClosed")
                    : guestList?.spotsRemaining === 0
                      ? t("guestList.listFull")
                      : t("guestList.listExpired")}
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4 pt-2">
                {isLoggedIn && (
                  <p className="text-xs text-cyan-400 bg-cyan-950/40 border border-cyan-800/50 rounded-lg px-3 py-2">
                    {t("guestList.prefilled")}
                  </p>
                )}

                {/* ── Basic fields ── */}
                <div>
                  <Label className="text-gray-300">{t("guestList.nameLabel")} *</Label>
                  <Input
                    value={formName}
                    onChange={(e) => { setFormName(e.target.value); clearErr("name"); }}
                    placeholder={t("guestList.namePlaceholder")}
                    className={`bg-gray-800 border-gray-700 text-white mt-1 ${errors.name ? "border-destructive" : ""} ${isLoggedIn && formName ? "opacity-70" : ""}`}
                    readOnly={isLoggedIn && !!formName}
                  />
                  {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
                </div>

                <div>
                  <Label className="text-gray-300">{t("guestList.emailLabel")} *</Label>
                  <Input
                    type="email"
                    value={formEmail}
                    onChange={(e) => { setFormEmail(e.target.value); clearErr("email"); }}
                    placeholder={t("guestList.emailPlaceholder")}
                    className={`bg-gray-800 border-gray-700 text-white mt-1 ${errors.email ? "border-destructive" : ""} ${isLoggedIn && formEmail ? "opacity-70" : ""}`}
                    readOnly={isLoggedIn && !!formEmail}
                  />
                  {errors.email && <p className="text-xs text-destructive mt-1">{errors.email}</p>}
                </div>

                <div>
                  <Label className="text-gray-300">{t("guestList.phoneLabel")}</Label>
                  <div className={`mt-1 ${isLoggedIn && formPhone ? "opacity-70 pointer-events-none" : ""}`}>
                    <PhoneField value={formPhone} onChange={setFormPhone} />
                  </div>
                </div>

                <div>
                  <Label className="text-gray-300 flex items-center gap-1">
                    <IdCard className="w-3.5 h-3.5" />
                    {t("guestList.idDocumentLabel")} *
                  </Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={formIdDocument}
                    onChange={(e) => { setFormIdDocument(e.target.value.replace(/\D/g, "")); clearErr("idDocument"); }}
                    placeholder="1234567890"
                    className={`bg-gray-800 border-gray-700 text-white mt-1 ${errors.idDocument ? "border-destructive" : ""} ${isLoggedIn && formIdDocument ? "opacity-70" : ""}`}
                    readOnly={isLoggedIn && !!formIdDocument}
                  />
                  {errors.idDocument && <p className="text-xs text-destructive mt-1">{errors.idDocument}</p>}
                </div>

                <div>
                  <Label className="text-gray-300 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {t("guestList.dateOfBirthLabel")} *
                  </Label>
                  <div className={`mt-1 ${isLoggedIn && formDateOfBirth ? "opacity-70 pointer-events-none" : ""}`}>
                    <DatePickerField
                      value={formDateOfBirth}
                      onChange={(v) => { setFormDateOfBirth(v); clearErr("dateOfBirth"); }}
                      hasError={!!errors.dateOfBirth}
                    />
                  </div>
                  {errors.dateOfBirth && <p className="text-xs text-destructive mt-1">{errors.dateOfBirth}</p>}
                </div>

                <div>
                  <Label className="text-gray-300 flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    {t("guestList.sexLabel")} *
                  </Label>
                  <div className={`flex gap-2 mt-1 ${isLoggedIn && formSex ? "opacity-70 pointer-events-none" : ""}`}>
                    <button
                      type="button"
                      onClick={() => { setFormSex("male"); clearErr("sex"); }}
                      className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${formSex === "male" ? "border-cyan-500 bg-cyan-500/10 text-cyan-400" : "border-gray-700 text-gray-400 hover:border-cyan-700"}`}
                    >
                      {t("guestList.male")}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setFormSex("female"); clearErr("sex"); }}
                      className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${formSex === "female" ? "border-cyan-500 bg-cyan-500/10 text-cyan-400" : "border-gray-700 text-gray-400 hover:border-cyan-700"}`}
                    >
                      {t("guestList.female")}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setFormSex("non_binary"); clearErr("sex"); }}
                      className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${formSex === "non_binary" ? "border-cyan-500 bg-cyan-500/10 text-cyan-400" : "border-gray-700 text-gray-400 hover:border-cyan-700"}`}
                    >
                      {t("guestList.nonBinary")}
                    </button>
                  </div>
                  {errors.sex && <p className="text-xs text-destructive mt-1">{errors.sex}</p>}
                </div>

                {/* ── Race-only fields ── */}
                {isRace && (
                  <div className="space-y-4 pt-2 border-t border-gray-700/60">
                    <p className="text-xs text-cyan-400/80 font-semibold uppercase tracking-wider pt-1">
                      {t("guestList.raceSection")}
                    </p>

                    <div>
                      <Label className="text-gray-300 flex items-center gap-1">
                        <Shirt className="w-3.5 h-3.5" />
                        {t("guestList.shirtSize")} *
                      </Label>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {SHIRT_SIZES.map((s) => (
                          <PillButton key={s} label={s} selected={formShirtSize === s} onClick={() => { setFormShirtSize(s); clearErr("shirtSize"); }} />
                        ))}
                      </div>
                      {errors.shirtSize && <p className="text-xs text-destructive mt-1">{errors.shirtSize}</p>}
                    </div>

                    <div>
                      <Label className="text-gray-300 flex items-center gap-1">
                        <Heart className="w-3.5 h-3.5" />
                        {t("guestList.bloodType")} *
                      </Label>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {BLOOD_TYPES.map((bt) => (
                          <PillButton key={bt} label={bt} selected={formBloodType === bt} onClick={() => { setFormBloodType(bt); clearErr("bloodType"); }} />
                        ))}
                      </div>
                      {errors.bloodType && <p className="text-xs text-destructive mt-1">{errors.bloodType}</p>}
                    </div>

                    <div>
                      <Label className="text-gray-300">{t("guestList.eps")}</Label>
                      <div className="mt-1">
                        <SearchableSelect
                          value={formEps}
                          onChange={setFormEps}
                          options={[...EPS_LIST, t("guestList.noEps")]}
                          placeholder={t("guestList.epsPlaceholder")}
                        />
                      </div>
                    </div>

                    <div>
                      <Label className="text-gray-300 flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5" />
                        {t("guestList.emergencyContact")} *
                      </Label>
                      <Input
                        value={formEmergencyName}
                        onChange={(e) => { setFormEmergencyName(e.target.value); clearErr("emergencyName"); }}
                        placeholder={t("guestList.emergencyNamePlaceholder")}
                        className={`bg-gray-800 border-gray-700 text-white mt-1 ${errors.emergencyName ? "border-destructive" : ""}`}
                      />
                      {errors.emergencyName && <p className="text-xs text-destructive mt-1">{errors.emergencyName}</p>}
                    </div>

                    <div>
                      <Label className="text-gray-300">{t("guestList.emergencyPhone")} *</Label>
                      <div className="mt-1">
                        <PhoneField
                          value={formEmergencyPhone}
                          onChange={(v) => { setFormEmergencyPhone(v); clearErr("emergencyPhone"); }}
                        />
                      </div>
                      {errors.emergencyPhone && <p className="text-xs text-destructive mt-1">{errors.emergencyPhone}</p>}
                    </div>
                  </div>
                )}

                {signupMutation.isError && (
                  <p className="text-red-400 text-sm">{(signupMutation.error as Error)?.message}</p>
                )}

                <Button
                  type="submit"
                  className="w-full bg-cyan-500 hover:bg-cyan-600 text-black font-bold py-3"
                  disabled={signupMutation.isPending}
                >
                  {signupMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("guestList.signUp")}
                </Button>

                <p className="text-xs text-gray-500 text-center">{t("guestList.freeEntry")}</p>
              </form>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
