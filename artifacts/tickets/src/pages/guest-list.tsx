import { useState } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneField } from "@/components/ui/phone-input";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, MapPin, Users, CheckCircle, Loader2, AlertCircle } from "lucide-react";
import QRCode from "qrcode";
import { resolveImageUrl } from "@/lib/api";

const PROD_ORIGIN = "https://attendee.tapee.app";
const API_BASE = import.meta.env.PROD
  ? `${PROD_ORIGIN}/attendee-api/api`
  : "/tickets/prod-api";

async function fetchGuestListInfo(slug: string) {
  const res = await fetch(`${API_BASE}/guest-list/${slug}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Not found" }));
    throw new Error(data.error || "Not found");
  }
  return res.json();
}

async function submitGuestListSignup(slug: string, body: { name: string; email: string; phone?: string }) {
  const res = await fetch(`${API_BASE}/guest-list/${slug}/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Signup failed");
  return data;
}

export default function GuestListPage() {
  const { t } = useTranslation();
  const [, params] = useRoute("/guest-list/:slug");
  const slug = params?.slug || "";

  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [signupResult, setSignupResult] = useState<{ ticket: { id: string; qrCodeToken: string }; event: { name: string; venueAddress: string; startsAt: string } } | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["guest-list", slug],
    queryFn: () => fetchGuestListInfo(slug),
    enabled: !!slug,
  });

  const signupMutation = useMutation({
    mutationFn: () => submitGuestListSignup(slug, {
      name: formName.trim(),
      email: formEmail.trim(),
      phone: formPhone.trim() || undefined,
    }),
    onSuccess: async (result) => {
      setSignupResult(result);
      if (result.ticket?.qrCodeToken) {
        try {
          const url = await QRCode.toDataURL(result.ticket.qrCodeToken, {
            width: 280,
            margin: 2,
            color: { dark: "#000000", light: "#ffffff" },
            errorCorrectionLevel: "M",
          });
          setQrDataUrl(url);
        } catch {
          /* QR display falls back gracefully */
        }
      }
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim() || !formEmail.trim()) return;
    signupMutation.mutate();
  }

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

              {qrDataUrl && (
                <div className="text-center bg-white rounded-xl p-4 mx-auto max-w-[320px]">
                  <img src={qrDataUrl} alt="QR Code" className="mx-auto" style={{ width: 280, height: 280 }} />
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
                  {new Date(event.startsAt).toLocaleDateString()}
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
                <div>
                  <Label className="text-gray-300">{t("guestList.nameLabel")}</Label>
                  <Input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder={t("guestList.namePlaceholder")}
                    required
                    className="bg-gray-800 border-gray-700 text-white"
                  />
                </div>
                <div>
                  <Label className="text-gray-300">{t("guestList.emailLabel")}</Label>
                  <Input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder={t("guestList.emailPlaceholder")}
                    required
                    className="bg-gray-800 border-gray-700 text-white"
                  />
                </div>
                <div>
                  <Label className="text-gray-300">{t("guestList.phoneLabel")}</Label>
                  <PhoneField
                    value={formPhone}
                    onChange={setFormPhone}
                  />
                </div>

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
