import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useSearch } from "wouter";
import { Loader2, CheckCircle, XCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchTopUpStatus } from "@/lib/api";

export default function BraceletPaymentStatus() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const search = useSearch();
  const intentId = new URLSearchParams(search).get("intentId") ?? "";

  type Phase = "polling" | "confirmed" | "failed";
  const [phase, setPhase] = useState<Phase>("polling");
  const [threeDsContent, setThreeDsContent] = useState<string>("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const attemptsRef = useRef(0);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  useEffect(() => {
    if (!intentId) { setPhase("failed"); return; }

    const check = async () => {
      attemptsRef.current += 1;
      if (attemptsRef.current > 150) {
        stopPolling();
        setPhase("failed");
        return;
      }
      try {
        const status = await fetchTopUpStatus(intentId);

        if (status.threeDsAuth?.iframe_content) {
          setThreeDsContent(status.threeDsAuth.iframe_content);
        }

        if (status.status === "confirmed") {
          stopPolling();
          setPhase("confirmed");
        } else if (status.status === "failed" || status.status === "cancelled") {
          stopPolling();
          setPhase("failed");
        }
      } catch {
        // keep polling on transient errors
      }
    };

    check();
    pollRef.current = setInterval(check, 2000);
    return stopPolling;
  }, [intentId]);

  // 3DS iframe
  if (threeDsContent && phase === "polling") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 gap-4">
        <p className="text-sm text-zinc-400">{t("topUp.completing3ds")}</p>
        <iframe
          srcDoc={threeDsContent}
          className="w-full max-w-md h-96 rounded-2xl border border-zinc-700"
          title="3D Secure"
        />
      </div>
    );
  }

  if (phase === "polling") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <div className="w-16 h-16 rounded-2xl bg-cyan-500/15 flex items-center justify-center">
          <Clock className="w-8 h-8 text-cyan-400" />
        </div>
        <h2 className="text-xl font-bold text-center">{t("topUp.processing")}</h2>
        <p className="text-sm text-zinc-400 text-center max-w-xs">{t("topUp.processingHint")}</p>
        <Loader2 className="w-6 h-6 text-cyan-400 animate-spin mt-2" />
      </div>
    );
  }

  if (phase === "confirmed") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 flex items-center justify-center">
          <CheckCircle className="w-8 h-8 text-emerald-400" />
        </div>
        <h2 className="text-xl font-bold text-center">{t("topUp.successTitle")}</h2>
        <p className="text-sm text-zinc-400 text-center max-w-xs">{t("topUp.successHint")}</p>
        <Button
          className="mt-4 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded-2xl"
          onClick={() => navigate("/my-bracelets")}
        >
          {t("topUp.viewBracelets")}
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
      <div className="w-16 h-16 rounded-2xl bg-red-500/15 flex items-center justify-center">
        <XCircle className="w-8 h-8 text-red-400" />
      </div>
      <h2 className="text-xl font-bold text-center">{t("topUp.failedTitle")}</h2>
      <p className="text-sm text-zinc-400 text-center max-w-xs">{t("topUp.failedHint")}</p>
      <Button
        className="mt-4 bg-zinc-700 hover:bg-zinc-600 text-white font-semibold rounded-2xl"
        onClick={() => navigate(-1 as any)}
      >
        {t("topUp.tryAgain")}
      </Button>
    </div>
  );
}
