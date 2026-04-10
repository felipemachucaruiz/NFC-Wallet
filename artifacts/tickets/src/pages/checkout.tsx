import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, Link } from "wouter";
import { CreditCard, Smartphone, Building2, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/context/AuthContext";
import { formatPrice } from "@/data/mockEvents";

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
}

export default function Checkout() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const [data, setData] = useState<CheckoutData | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "nequi" | "pse">("card");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login?redirect=checkout");
      return;
    }
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
  }, [isAuthenticated, navigate]);

  if (!data) return null;

  const handlePayNow = () => {
    if (!termsAccepted) return;
    setProcessing(true);
    sessionStorage.setItem("tapee_payment_status", "processing");
    navigate("/payment-status");
  };

  const methods = [
    { id: "card" as const, icon: CreditCard, label: t("checkout.creditCard") },
    { id: "nequi" as const, icon: Smartphone, label: t("checkout.nequi") },
    { id: "pse" as const, icon: Building2, label: t("checkout.pse") },
  ];

  return (
    <div className="min-h-screen">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold mb-6">{t("checkout.title")}</h1>

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
                    <p className="text-muted-foreground">{t("checkout.validDays")}: {data.validDays}</p>
                    <p className="text-muted-foreground">{t("checkout.attendee")}: {attendee.name} ({attendee.email})</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-card rounded-xl border border-border p-5">
              <h2 className="font-semibold mb-4">{t("checkout.paymentMethod")}</h2>
              <div className="space-y-2">
                {methods.map((m) => (
                  <button
                    key={m.id}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${
                      paymentMethod === m.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                    }`}
                    onClick={() => setPaymentMethod(m.id)}
                  >
                    <m.icon className="w-5 h-5" />
                    <span className="text-sm font-medium">{m.label}</span>
                    {paymentMethod === m.id && <Check className="w-4 h-4 text-primary ml-auto" />}
                  </button>
                ))}
              </div>
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
                />
                <label htmlFor="terms" className="text-xs text-muted-foreground cursor-pointer leading-tight">
                  {t("checkout.terms")}
                </label>
              </div>

              <Button
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                size="lg"
                disabled={!termsAccepted || processing}
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
