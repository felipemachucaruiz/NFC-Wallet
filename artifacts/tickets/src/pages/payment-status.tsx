import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { CheckCircle, XCircle, Loader2, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";

type PaymentState = "processing" | "success" | "failed";

export default function PaymentStatus() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<PaymentState>("processing");
  const [orderNumber, setOrderNumber] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      const randomSuccess = Math.random() > 0.15;
      if (randomSuccess) {
        const num = `ORD-${Date.now().toString(36).toUpperCase()}`;
        setOrderNumber(num);
        setStatus("success");
        sessionStorage.removeItem("tapee_checkout");
        sessionStorage.removeItem("tapee_payment_status");
      } else {
        setStatus("failed");
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

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

        {status === "success" && (
          <div className="space-y-6">
            <div className="w-20 h-20 mx-auto rounded-full bg-emerald-600/20 flex items-center justify-center">
              <CheckCircle className="w-12 h-12 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold mb-2">{t("checkout.paymentSuccess")}</h1>
              <p className="text-muted-foreground mb-4">
                {t("checkout.orderNumber")}: <span className="font-mono font-bold text-foreground">{orderNumber}</span>
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
              <Button
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => navigate("/checkout")}
              >
                {t("checkout.retry")}
              </Button>
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
