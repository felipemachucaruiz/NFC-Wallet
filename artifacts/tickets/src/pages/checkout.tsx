import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, Link } from "wouter";
import { Building2, Check, AlertCircle, Ticket, CreditCard } from "lucide-react";

function NequiIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 38.15 30">
      <path fill="#ca0080" d="M8.38,3.86h-3.93c-.46,0-.83.37-.83.83v3.34c0,.46.37.83.83.83h3.93c.46,0,.83-.37.83-.83v-3.34c0-.46-.37-.83-.83-.83Z"/>
      <path fill="currentColor" d="M32.4,3.86h-3.39c-.46,0-.83.38-.83.83v13.55c0,.28-.36.38-.49.13l-7.88-14.15c-.13-.23-.36-.36-.64-.36h-5.64c-.46,0-.83.38-.83.83v21.65c0,.46.38.83.83.83h3.39c.46,0,.83-.38.83-.83v-13.96c0-.28.36-.38.49-.13l8.1,14.57c.13.23.36.36.64.36h5.39c.46,0,.83-.38.83-.83V4.68c0-.46-.38-.83-.83-.83h.03Z"/>
    </svg>
  );
}

function BancolombiaIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 110.54 110.83" fill="currentColor">
      <path d="M82.66.03c-21.47,2.65-42.21,6.56-63,12.59-2.71.85-4.37,3.88-3.69,6.57,1.52,5.99,2.29,8.99,3.83,15,.65,2.54,3.21,3.84,5.8,2.98,21.24-6.54,42.53-11.01,64.51-14.27,2.52-.34,3.89-2.94,2.97-5.55-1.95-5.51-2.93-8.25-4.92-13.73-.86-2.32-3.15-3.85-5.5-3.59ZM100.62,33.37c-33.61,4.29-66.35,12.6-97.39,26.34-2.26,1.07-3.62,3.92-3.14,6.43,1.22,6.42,1.83,9.64,3.07,16.07.53,2.75,3.1,4.02,5.63,2.78,31.53-14.45,64.84-23.64,99.01-29.12,2.17-.36,3.28-2.85,2.45-5.41-1.72-5.32-2.59-7.98-4.37-13.27-.81-2.46-3.04-4.11-5.26-3.82ZM100.22,69.19c-20.99,4.56-41.51,10.05-61.83,17.03-2.58.95-4.03,3.66-3.35,6.17,1.62,5.96,2.42,8.95,4.06,14.93.77,2.81,3.93,4.25,6.83,3.14,20.31-7.28,40.83-13.63,61.79-18.73,2.01-.49,3-2.85,2.26-5.28-1.65-5.37-2.48-8.05-4.18-13.39-.83-2.63-3.27-4.35-5.58-3.87Z"/>
    </svg>
  );
}
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatPrice } from "@/lib/format";
import { purchaseTickets, getAuthToken, getWompiConfig } from "@/lib/api";
import { Turnstile } from "@/components/Turnstile";

interface CheckoutData {
  eventId: string;
  eventName: string;
  ticketTypeId: string;
  ticketTypeName: string;
  sectionName: string;
  validDays: string;
  price: number;
  quantity: number;
  attendees: { name: string; email: string; phone: string }[];
  subtotal: number;
  serviceFee: number;
  total: number;
  currencyCode: string;
  unitSelections?: { ticketTypeId: string; unitId: string }[];
  selectedUnitLabel?: string;
}

const PSE_BANKS = [
  { code: "1007", name: "Bancolombia" },
  { code: "1009", name: "Citibank" },
  { code: "1013", name: "BBVA" },
  { code: "1019", name: "Scotiabank" },
  { code: "1023", name: "Banco de Occidente" },
  { code: "1032", name: "Banco Caja Social" },
  { code: "1040", name: "Banco Agrario" },
  { code: "1051", name: "Davivienda" },
  { code: "1052", name: "AV Villas" },
  { code: "1062", name: "Banco Falabella" },
  { code: "1063", name: "Banco Finandina" },
  { code: "1065", name: "Banco Santander" },
  { code: "1066", name: "Banco Cooperativo" },
  { code: "1507", name: "Nequi" },
  { code: "1151", name: "Rappipay" },
];

type CardBrand = "visa" | "mastercard" | "amex" | "discover" | "diners" | null;

function detectCardBrand(raw: string): CardBrand {
  const n = raw.replace(/\D/g, "");
  if (/^4/.test(n)) return "visa";
  if (/^(5[1-5]|2[2-7]\d{2})/.test(n)) return "mastercard";
  if (/^3[47]/.test(n)) return "amex";
  if (/^(6011|65|64[4-9]|622)/.test(n)) return "discover";
  if (/^(30[0-5]|36|38)/.test(n)) return "diners";
  return null;
}

function formatCardNumber(raw: string, brand: CardBrand): string {
  const digits = raw.replace(/\D/g, "");
  if (brand === "amex") {
    const p1 = digits.slice(0, 4);
    const p2 = digits.slice(4, 10);
    const p3 = digits.slice(10, 15);
    return [p1, p2, p3].filter(Boolean).join(" ");
  }
  return (digits.match(/.{1,4}/g) || []).join(" ").slice(0, 19);
}

function CardBrandLogo({ brand }: { brand: CardBrand }) {
  if (!brand) return null;
  if (brand === "visa") {
    return (
      <div className="bg-white rounded px-1.5 py-0.5 shrink-0">
        <span className="text-[#1A1F71] font-black text-xs tracking-tighter italic select-none">VISA</span>
      </div>
    );
  }
  if (brand === "mastercard") {
    return (
      <div className="flex items-center shrink-0">
        <div className="w-5 h-5 rounded-full bg-[#EB001B]" />
        <div className="w-5 h-5 rounded-full bg-[#F79E1B] -ml-2.5 mix-blend-multiply opacity-90" />
      </div>
    );
  }
  if (brand === "amex") {
    return (
      <div className="bg-[#016FD0] rounded px-1.5 py-0.5 shrink-0">
        <span className="text-white font-bold text-[10px] tracking-tight select-none">AMEX</span>
      </div>
    );
  }
  if (brand === "discover") {
    return (
      <div className="bg-[#FF6600] rounded px-1.5 py-0.5 shrink-0">
        <span className="text-white font-bold text-[10px] tracking-tight select-none">DISC</span>
      </div>
    );
  }
  if (brand === "diners") {
    return (
      <div className="bg-zinc-600 rounded px-1.5 py-0.5 shrink-0">
        <span className="text-white font-bold text-[10px] tracking-tight select-none">DINERS</span>
      </div>
    );
  }
  return null;
}

export default function Checkout() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const [data, setData] = useState<CheckoutData | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"nequi" | "pse" | "card" | "bancolombia_transfer">("nequi");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const freeSubmittedRef = useRef(false);

  const [nequiPhone, setNequiPhone] = useState("");
  const [pseBank, setPseBank] = useState("");
  const [pseLegalId, setPseLegalId] = useState("");
  const [pseLegalIdType, setPseLegalIdType] = useState<"CC" | "CE" | "NIT" | "PP" | "TI">("CC");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [cardHolder, setCardHolder] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const isGuest = !getAuthToken();

  useEffect(() => {
    const raw = sessionStorage.getItem("tapee_checkout");
    if (!raw) {
      navigate("/");
      return;
    }
    try {
      setData(JSON.parse(raw));
    } catch {
      navigate("/");
    }
  }, [navigate]);

  const isFreeOrder = data !== null && data.total === 0;

  const submitFreeOrder = async () => {
    if (!data) return;
    setProcessing(true);
    setError("");
    try {
      const result = await purchaseTickets({
        eventId: data.eventId,
        attendees: data.attendees.map((a) => ({
          name: a.name,
          email: a.email,
          phone: a.phone || undefined,
          ticketTypeId: data.ticketTypeId,
        })),
        unitSelections: data.unitSelections,
        paymentMethod: "free",
        turnstileToken: isGuest ? turnstileToken : undefined,
      });

      sessionStorage.removeItem("tapee_checkout");
      sessionStorage.setItem("tapee_order_id", result.orderId);
      sessionStorage.setItem("tapee_order_status", result.status);
      navigate("/payment-status");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al procesar la compra");
      setProcessing(false);
    }
  };

  useEffect(() => {
    if (!data || !isFreeOrder || freeSubmittedRef.current) return;
    if (isGuest && !turnstileToken) return;
    freeSubmittedRef.current = true;
    submitFreeOrder();
  }, [data, isFreeOrder, turnstileToken]);

  if (!data) return null;

  if (isFreeOrder) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          {error ? (
            <>
              <div className="p-4 bg-destructive/10 text-destructive text-sm rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
              <Button onClick={submitFreeOrder}>
                {t("common.retry", "Reintentar")}
              </Button>
            </>
          ) : (
            <>
              {isGuest && !turnstileToken ? (
                <div className="space-y-4">
                  <p className="text-lg font-medium">{t("checkout.verifyHuman", "Verificación de seguridad")}</p>
                  <Turnstile onToken={setTurnstileToken} />
                </div>
              ) : (
                <>
                  <Ticket className="w-12 h-12 text-primary mx-auto animate-pulse" />
                  <p className="text-lg font-medium">{t("checkout.processingFreeOrder", "Confirmando tu entrada gratuita...")}</p>
                </>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  const isPaymentValid = () => {
    if (paymentMethod === "nequi") return /^\d{10}$/.test(nequiPhone.replace(/\s/g, ""));
    if (paymentMethod === "pse") return pseBank.length > 0 && pseLegalId.length > 0;
    if (paymentMethod === "card") return cardNumber.replace(/\s/g, "").length >= 15 && cardExpiry.length >= 5 && cardCvc.length >= 3 && cardHolder.trim().length > 0;
    if (paymentMethod === "bancolombia_transfer") return true;
    return false;
  };

  const handlePayNow = async () => {
    if (!termsAccepted || !isPaymentValid()) return;
    setProcessing(true);
    setError("");

    try {
      const purchaseData: Parameters<typeof purchaseTickets>[0] = {
        eventId: data.eventId,
        attendees: data.attendees.map((a) => ({
          name: a.name,
          email: a.email,
          phone: a.phone || undefined,
          ticketTypeId: data.ticketTypeId,
        })),
        unitSelections: data.unitSelections,
        paymentMethod,
        turnstileToken: isGuest ? turnstileToken : undefined,
      };

      if (paymentMethod === "nequi") {
        purchaseData.phoneNumber = nequiPhone.replace(/\s/g, "");
      } else if (paymentMethod === "pse") {
        purchaseData.bankCode = pseBank;
        purchaseData.userLegalId = pseLegalId;
        purchaseData.userLegalIdType = pseLegalIdType;
      } else if (paymentMethod === "card") {
        const wompiConfig = await getWompiConfig();
        const [expMonth, expYear] = cardExpiry.split("/");
        const tokenRes = await fetch(`${wompiConfig.baseUrl}/tokens/cards`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${wompiConfig.publicKey}` },
          body: JSON.stringify({
            number: cardNumber.replace(/\s/g, ""),
            cvc: cardCvc,
            exp_month: expMonth?.trim() ?? "",
            exp_year: expYear?.trim() ?? "",
            card_holder: cardHolder.trim(),
          }),
        });
        const tokenData = await tokenRes.json() as { data?: { id?: string }; status?: string };
        if (!tokenRes.ok || !tokenData.data?.id) {
          throw new Error("No se pudo tokenizar la tarjeta. Verifica los datos e intenta de nuevo.");
        }
        purchaseData.cardToken = tokenData.data.id;
        purchaseData.installments = 1;
      }

      const result = await purchaseTickets(purchaseData);

      sessionStorage.removeItem("tapee_checkout");
      sessionStorage.setItem("tapee_order_id", result.orderId);
      sessionStorage.setItem("tapee_order_status", result.status);

      if (result.redirectUrl) {
        window.location.href = result.redirectUrl;
        return;
      }

      navigate("/payment-status");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al procesar la compra");
      setProcessing(false);
    }
  };

  const methods = [
    { id: "nequi" as const, icon: null, label: t("checkout.nequi") },
    { id: "pse" as const, icon: Building2, label: t("checkout.pse") },
    { id: "card" as const, icon: CreditCard, label: t("checkout.card", "Tarjeta") },
    { id: "bancolombia_transfer" as const, icon: null, label: "Bancolombia" },
  ];

  return (
    <div className="min-h-screen">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold mb-6">{t("checkout.title")}</h1>

        {error && (
          <div className="p-4 bg-destructive/10 text-destructive text-sm rounded-lg mb-6 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 space-y-6">
            <div className="bg-card rounded-xl border border-border p-5">
              <h2 className="font-semibold mb-4">{t("checkout.orderSummary")}</h2>
              <p className="text-sm text-muted-foreground mb-3">{data.eventName}</p>
              <div className="space-y-3">
                {data.attendees.map((attendee, i) => (
                  <div key={i} className="p-3 bg-muted/30 rounded-lg text-sm">
                    <div className="flex justify-between mb-1">
                      <span className="font-medium">{t("ticketSelection.ticket")} {i + 1}</span>
                      <span>{formatPrice(data.price, data.currencyCode)}</span>
                    </div>
                    <p className="text-muted-foreground">{data.ticketTypeName} — {data.sectionName}</p>
                    {data.selectedUnitLabel && (
                      <p className="text-muted-foreground font-medium">{data.selectedUnitLabel}</p>
                    )}
                    <p className="text-muted-foreground">{t("checkout.validDays")}: {data.validDays}</p>
                    <p className="text-muted-foreground">{t("checkout.attendee")}: {attendee.name} ({attendee.email})</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-card rounded-xl border border-border p-5">
              <h2 className="font-semibold mb-4">{t("checkout.paymentMethod")}</h2>
              <div className="space-y-2 mb-4">
                {methods.map((m) => (
                  <button
                    key={m.id}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${
                      paymentMethod === m.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                    }`}
                    onClick={() => setPaymentMethod(m.id)}
                    disabled={processing}
                  >
                    {m.id === "nequi" ? <NequiIcon className="w-5 h-5" /> : m.id === "bancolombia_transfer" ? <BancolombiaIcon className="w-5 h-5" /> : m.icon ? <m.icon className="w-5 h-5" /> : null}
                    <span className="text-sm font-medium">{m.label}</span>
                    {paymentMethod === m.id && <Check className="w-4 h-4 text-primary ml-auto" />}
                  </button>
                ))}
              </div>

              {paymentMethod === "nequi" && (
                <div className="space-y-2">
                  <Label>Número Nequi</Label>
                  <Input
                    type="tel"
                    value={nequiPhone}
                    onChange={(e) => setNequiPhone(e.target.value)}
                    placeholder="3001234567"
                    maxLength={10}
                    disabled={processing}
                  />
                  <p className="text-xs text-muted-foreground">Ingresa tu número de teléfono Nequi (10 dígitos)</p>
                </div>
              )}

              {paymentMethod === "pse" && (
                <div className="space-y-4">
                  <div>
                    <Label>Banco</Label>
                    <Select value={pseBank} onValueChange={setPseBank} disabled={processing}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Selecciona un banco" />
                      </SelectTrigger>
                      <SelectContent>
                        {PSE_BANKS.map((bank) => (
                          <SelectItem key={bank.code} value={bank.code}>{bank.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Tipo de documento</Label>
                      <Select value={pseLegalIdType} onValueChange={(v) => setPseLegalIdType(v as typeof pseLegalIdType)} disabled={processing}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CC">Cédula de Ciudadanía</SelectItem>
                          <SelectItem value="CE">Cédula de Extranjería</SelectItem>
                          <SelectItem value="NIT">NIT</SelectItem>
                          <SelectItem value="PP">Pasaporte</SelectItem>
                          <SelectItem value="TI">Tarjeta de Identidad</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Número de documento</Label>
                      <Input
                        type="text"
                        value={pseLegalId}
                        onChange={(e) => setPseLegalId(e.target.value)}
                        placeholder="1234567890"
                        className="mt-1"
                        disabled={processing}
                      />
                    </div>
                  </div>
                </div>
              )}

              {paymentMethod === "card" && (
                <div className="space-y-3">
                  <div>
                    <Label>Número de tarjeta</Label>
                    <div className="relative mt-1">
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={cardNumber}
                        onChange={(e) => {
                          const brand = detectCardBrand(e.target.value);
                          setCardNumber(formatCardNumber(e.target.value, brand));
                        }}
                        placeholder="1234 5678 9012 3456"
                        maxLength={detectCardBrand(cardNumber) === "amex" ? 17 : 19}
                        className="font-mono pr-16"
                        disabled={processing}
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
                        <CardBrandLogo brand={detectCardBrand(cardNumber)} />
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Vencimiento (MM/AA)</Label>
                      <Input
                        type="text"
                        value={cardExpiry}
                        onChange={(e) => setCardExpiry(e.target.value)}
                        placeholder="12/28"
                        maxLength={5}
                        className="mt-1"
                        disabled={processing}
                      />
                    </div>
                    <div>
                      <Label>CVC</Label>
                      <Input
                        type="password"
                        value={cardCvc}
                        onChange={(e) => setCardCvc(e.target.value)}
                        placeholder="•••"
                        maxLength={4}
                        className="mt-1"
                        disabled={processing}
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Titular de la tarjeta</Label>
                    <Input
                      type="text"
                      value={cardHolder}
                      onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
                      placeholder="NOMBRE APELLIDO"
                      className="mt-1 uppercase"
                      disabled={processing}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Los datos de tu tarjeta se cifran con TLS y se tokenizarán por Wompi.
                  </p>
                </div>
              )}

              {paymentMethod === "bancolombia_transfer" && (
                <div className="p-3 bg-muted/40 rounded-lg text-sm text-muted-foreground">
                  Serás redirigido a Bancolombia para autorizar la transferencia. No se requieren datos adicionales.
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="sticky top-20 bg-card rounded-xl border border-border p-5 space-y-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("checkout.unitPrice")} x {data.quantity}</span>
                  <span>{formatPrice(data.subtotal, data.currencyCode)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("checkout.serviceFee")}</span>
                  <span>{formatPrice(data.serviceFee, data.currencyCode)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-bold text-lg">
                  <span>{t("checkout.total")}</span>
                  <span className="text-primary">{formatPrice(data.total, data.currencyCode)}</span>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Checkbox
                  id="terms"
                  checked={termsAccepted}
                  onCheckedChange={(checked) => setTermsAccepted(!!checked)}
                  disabled={processing}
                />
                <label htmlFor="terms" className="text-xs text-muted-foreground cursor-pointer leading-tight">
                  {t("checkout.terms")}
                </label>
              </div>

              {isGuest && (
                <Turnstile onToken={setTurnstileToken} />
              )}

              <Button
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                size="lg"
                disabled={!termsAccepted || processing || !isPaymentValid() || (isGuest && !turnstileToken)}
                onClick={handlePayNow}
              >
                {processing ? t("checkout.processing") : t("checkout.payNow")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
