import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { CheckCircle, XCircle, Loader2, Ticket, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchOrderStatus, type ThreeDsAuth } from "@/lib/api";

type PaymentState = "processing" | "confirmed" | "failed";

const MASTERCARD_LOGO = "/mastercard-id-check.svg";

function decodeHtmlEntities(html: string): string {
  return html
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

import { SEO } from "@/components/SEO";

export default function PaymentStatus() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<PaymentState>("processing");
  const [orderId, setOrderId] = useState("");
  const [threeDsAuth, setThreeDsAuth] = useState<ThreeDsAuth | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);
  const paymentMethod = sessionStorage.getItem("tapee_payment_method") ?? "nequi";

  const is3DsFingerprint =
    paymentMethod === "card" &&
    status === "processing" &&
    threeDsAuth?.current_step === "FINGERPRINT" &&
    threeDsAuth?.current_step_status === "PENDING" &&
    !!threeDsAuth?.three_ds_method_data;

  const is3DsChallenge =
    paymentMethod === "card" &&
    status === "processing" &&
    threeDsAuth?.current_step === "CHALLENGE" &&
    threeDsAuth?.current_step_status === "PENDING" &&
    !!threeDsAuth?.iframe_content;

  const checkStatus = useCallback(
    async (storedOrderId: string) => {
      try {
        const res = await fetchOrderStatus(storedOrderId);
        if (res.threeDsAuth) setThreeDsAuth(res.threeDsAuth);
        if (res.status === "confirmed") {
          setStatus("confirmed");
          sessionStorage.removeItem("tapee_order_id");
          sessionStorage.removeItem("tapee_order_status");
          sessionStorage.removeItem("tapee_payment_method");
          if (pollRef.current) clearInterval(pollRef.current);
        } else if (res.status === "cancelled" || res.status === "failed") {
          setStatus("failed");
          sessionStorage.removeItem("tapee_order_id");
          sessionStorage.removeItem("tapee_order_status");
          sessionStorage.removeItem("tapee_payment_method");
          if (pollRef.current) clearInterval(pollRef.current);
        }
        pollCountRef.current += 1;
        if (pollCountRef.current >= 150) {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
      }
    },
    [],
  );

  useEffect(() => {
    const storedOrderId = sessionStorage.getItem("tapee_order_id");
    if (!storedOrderId) {
      navigate("/");
      return;
    }
    setOrderId(storedOrderId);
    checkStatus(storedOrderId);
    pollRef.current = setInterval(() => checkStatus(storedOrderId), 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [navigate, checkStatus]);

  if (is3DsChallenge) {
    const htmlContent = decodeHtmlEntities(threeDsAuth!.iframe_content!);
    return (
      <div className="min-h-screen flex flex-col items-center justify-start pt-6 px-4">
        <div className="w-full max-w-lg">
          <div className="flex items-center gap-3 mb-4">
            <ShieldCheck className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold">Verificación 3D Secure</h1>
          </div>
          <p className="text-muted-foreground text-sm mb-4">
            Tu banco requiere verificación adicional. Completa el proceso a continuación.
          </p>
          <div className="flex items-center gap-3 mb-4">
            <img src={MASTERCARD_LOGO} alt="Mastercard" className="h-8" />
            <span className="text-sm text-muted-foreground">Autenticación segura 3D Secure</span>
          </div>
          <div className="rounded-xl overflow-hidden border border-border bg-white" style={{ height: 420 }}>
            <iframe
              srcDoc={htmlContent}
              style={{ width: "100%", height: "100%", border: "none" }}
              sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
              title="3DS Challenge"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <SEO noindex />
      {is3DsFingerprint && (
        <iframe
          srcDoc={decodeHtmlEntities(threeDsAuth!.three_ds_method_data!)}
          style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
          sandbox="allow-scripts allow-forms allow-same-origin"
          title="3DS Fingerprint"
        />
      )}
      <div className="max-w-md w-full text-center">
        {status === "processing" && (
          <div className="space-y-8">
            <div className="relative w-28 h-28 mx-auto flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border border-primary/20 animate-ping" style={{ animationDuration: "1.8s" }} />
              <div className="absolute inset-3 rounded-full border border-primary/30 animate-ping" style={{ animationDuration: "1.8s", animationDelay: "0.4s" }} />
              <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center shadow-[0_0_24px_rgba(0,241,255,0.15)]">
                <Ticket className="w-8 h-8 text-primary" />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-bold mb-2">{t("checkout.paymentPending")}</h1>
              <p className="text-muted-foreground text-sm">
                {is3DsFingerprint
                  ? "Verificando tu dispositivo con el banco..."
                  : t("checkout.paymentProcessing")}
              </p>
            </div>
          </div>
        )}

        {status === "confirmed" && (
          <div className="space-y-6">
            <div className="relative w-28 h-28 mx-auto flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-emerald-500/10 animate-ping" style={{ animationDuration: "2.5s" }} />
              <div className="w-28 h-28 rounded-full bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center shadow-[0_0_40px_rgba(34,197,94,0.25)]">
                <CheckCircle className="w-14 h-14 text-emerald-400" />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-bold mb-1">{t("checkout.paymentSuccess")}</h1>
              <p className="text-muted-foreground text-sm mb-5">{t("checkout.paymentSuccessDesc")}</p>
              <div className="bg-card rounded-xl border border-border p-4 text-left space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Ticket className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t("checkout.orderNumber")}</p>
                    <p className="font-mono font-bold text-xl tracking-widest">{orderId.slice(0, 8).toUpperCase()}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground border-t border-border pt-3">{t("checkout.qrSent")}</p>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <Link href="/my-tickets">
                <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_20px_rgba(0,241,255,0.2)]">
                  {t("checkout.viewTickets")}
                </Button>
              </Link>
              <Link href="/">
                <Button variant="outline" className="w-full">
                  {t("checkout.backToEvent")}
                </Button>
              </Link>
            </div>
          </div>
        )}

        {status === "failed" && (
          <div className="space-y-6">
            <div className="w-20 h-20 mx-auto rounded-full bg-red-600/20 flex items-center justify-center">
              <XCircle className="w-12 h-12 text-red-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold mb-2">{t("checkout.paymentFailed")}</h1>
              <p className="text-muted-foreground">{t("checkout.paymentFailedDesc")}</p>
            </div>
            <div className="flex flex-col gap-3">
              <Link href="/">
                <Button variant="outline" className="w-full">
                  {t("checkout.backToEvent")}
                </Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
