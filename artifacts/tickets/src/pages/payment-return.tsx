import { useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function PaymentReturn() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();

  useEffect(() => {
    navigate("/payment-status", { replace: true });
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center space-y-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto" />
        <p className="text-muted-foreground">{t("checkout.paymentProcessing")}</p>
      </div>
    </div>
  );
}
