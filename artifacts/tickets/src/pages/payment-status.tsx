import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { CheckCircle, XCircle, Loader2, Ticket, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchOrderStatus, type ThreeDsAuth } from "@/lib/api";

type PaymentState = "processing" | "confirmed" | "failed";

const MASTERCARD_LOGO =
  "https://brand.mastercard.com/content/dam/mccom/brandcenter/thumbnails/mastercard_circles_92px_2x.png";

function decodeHtmlEntities(html: string): string {
  return html
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

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
          <div className="space-y-6">
            <div className="relative w-20 h-20 mx-auto">
              <Loader2 className="w-20 h-20 text-primary animate-spin" />
            </div>
            <div>
              <h1 className="text-2xl font-bold mb-2">{t("checkout.paymentPending")}</h1>
              <p className="text-muted-foreground">
                {is3DsFingerprint
                  ? "Verificando tu dispositivo con el banco..."
                  : t("checkout.paymentProcessing")}
              </p>
            </div>
            <div className="flex gap-2 justify-center">
              <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
              <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
              <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}

        {status === "confirmed" && (
          <div className="space-y-6">
            <div className="w-20 h-20 mx-auto rounded-full bg-emerald-600/20 flex items-center justify-center">
              <CheckCircle className="w-12 h-12 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold mb-2">{t("checkout.paymentSuccess")}</h1>
              <p className="text-muted-foreground mb-4">
                {t("checkout.orderNumber")}:{" "}
                <span className="font-mono font-bold text-foreground">{orderId.slice(0, 8).toUpperCase()}</span>
              </p>
              <div className="bg-card rounded-lg border border-border p-4 text-sm text-muted-foreground">
                <Ticket className="w-8 h-8 text-primary mx-auto mb-2" />
                <p>{t("checkout.qrSent")}</p>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <Link href="/my-tickets">
                <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
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
