import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { CheckCircle, XCircle, Loader2, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchOrderStatus } from "@/lib/api";

type PaymentState = "processing" | "confirmed" | "failed";

export default function PaymentStatus() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<PaymentState>("processing");
  const [orderId, setOrderId] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const storedOrderId = sessionStorage.getItem("tapee_order_id");
    if (!storedOrderId) {
      navigate("/");
      return;
    }
    setOrderId(storedOrderId);

    const pollStatus = async () => {
      try {
        const res = await fetchOrderStatus(storedOrderId);
        if (res.status === "confirmed") {
          setStatus("confirmed");
          sessionStorage.removeItem("tapee_order_id");
          sessionStorage.removeItem("tapee_order_status");
          if (pollRef.current) clearInterval(pollRef.current);
        } else if (res.status === "cancelled" || res.status === "failed") {
          setStatus("failed");
          sessionStorage.removeItem("tapee_order_id");
          sessionStorage.removeItem("tapee_order_status");
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
      }
    };

    pollStatus();
    pollRef.current = setInterval(pollStatus, 3000);

    const timeout = setTimeout(() => {
      if (pollRef.current) clearInterval(pollRef.current);
    }, 5 * 60 * 1000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      clearTimeout(timeout);
    };
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        {status === "processing" && (
          <div className="space-y-6">
            <div className="relative w-20 h-20 mx-auto">
              <Loader2 className="w-20 h-20 text-primary animate-spin" />
            </div>
            <div>
              <h1 className="text-2xl font-bold mb-2">{t("checkout.paymentPending")}</h1>
              <p className="text-muted-foreground">{t("checkout.paymentProcessing")}</p>
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
                {t("checkout.orderNumber")}: <span className="font-mono font-bold text-foreground">{orderId.slice(0, 8).toUpperCase()}</span>
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
              <p className="text-muted-foreground">
                Something went wrong with your payment. Please try again.
              </p>
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
