import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, Link } from "wouter";
import { Smartphone, Building2, Check, AlertCircle, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatPrice } from "@/lib/format";
import { purchaseTickets } from "@/lib/api";

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

export default function Checkout() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const [data, setData] = useState<CheckoutData | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"nequi" | "pse">("nequi");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const freeSubmittedRef = useRef(false);

  const [nequiPhone, setNequiPhone] = useState("");
  const [pseBank, setPseBank] = useState("");
  const [pseLegalId, setPseLegalId] = useState("");
  const [pseLegalIdType, setPseLegalIdType] = useState<"CC" | "CE" | "NIT" | "PP" | "TI">("CC");

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
    freeSubmittedRef.current = true;
    submitFreeOrder();
  }, [data, isFreeOrder]);

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
              <Ticket className="w-12 h-12 text-primary mx-auto animate-pulse" />
              <p className="text-lg font-medium">{t("checkout.processingFreeOrder", "Confirmando tu entrada gratuita...")}</p>
            </>
          )}
        </div>
      </div>
    );
  }

  const isPaymentValid = () => {
    if (paymentMethod === "nequi") return /^\d{10}$/.test(nequiPhone.replace(/\s/g, ""));
    if (paymentMethod === "pse") return pseBank.length > 0 && pseLegalId.length > 0;
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
      };

      if (paymentMethod === "nequi") {
        purchaseData.phoneNumber = nequiPhone.replace(/\s/g, "");
      } else if (paymentMethod === "pse") {
        purchaseData.bankCode = pseBank;
        purchaseData.userLegalId = pseLegalId;
        purchaseData.userLegalIdType = pseLegalIdType;
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
    { id: "nequi" as const, icon: Smartphone, label: t("checkout.nequi") },
    { id: "pse" as const, icon: Building2, label: t("checkout.pse") },
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
                    <m.icon className="w-5 h-5" />
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

              <Button
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                size="lg"
                disabled={!termsAccepted || processing || !isPaymentValid()}
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
