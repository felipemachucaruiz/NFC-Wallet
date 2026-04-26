import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useSearch } from "wouter";
import { ArrowLeft, Loader2, CheckCircle2, RotateCcw } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/context/AuthContext";
import { fetchMyBracelets, requestBraceletRefund } from "@/lib/api";

type RefundMethod = "nequi" | "bancolombia" | "bank_transfer" | "cash" | "other";

function formatCOP(amount: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency", currency: "COP", maximumFractionDigits: 0,
  }).format(amount);
}

export default function BraceletRefund() {
  const { t } = useTranslation();
  const { isAuthenticated, loading: authLoading, openAuthModal } = useAuth();
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const braceletUid = params.get("uid") ?? "";

  const [method, setMethod] = useState<RefundMethod>("nequi");
  const [accountDetails, setAccountDetails] = useState("");
  const [notes, setNotes] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  if (!authLoading && !isAuthenticated) {
    openAuthModal("login", `bracelet-refund?uid=${braceletUid}`);
    navigate("/");
  }

  const { data: braceletData, isLoading: loadingBracelets } = useQuery({
    queryKey: ["my-bracelets"],
    queryFn: fetchMyBracelets,
    enabled: isAuthenticated,
    staleTime: 15_000,
  });

  const bracelet = braceletData?.bracelets.find((b) => b.uid === braceletUid) ?? null;

  const { mutate: submit, isPending } = useMutation({
    mutationFn: () => {
      setError("");
      return requestBraceletRefund({
        braceletUid,
        refundMethod: method,
        accountDetails: accountDetails.trim() || undefined,
        notes: notes.trim() || undefined,
      });
    },
    onSuccess: () => setDone(true),
    onError: (err: Error) => {
      if (err.message === "REFUND_DEADLINE_PASSED") {
        setError(t("refund.deadlinePassed"));
      } else if (err.message === "REFUND_REQUEST_ALREADY_PENDING") {
        setError(t("refund.alreadyPending"));
      } else if (err.message === "BRACELET_BLOCKED") {
        setError(t("myBracelets.flaggedError"));
      } else {
        setError(err.message || t("common.error"));
      }
    },
  });

  const needsAccountDetails = method !== "cash";

  if (authLoading || loadingBracelets) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-green-400" />
          </div>
          <h2 className="text-xl font-bold">{t("refund.successTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("refund.successHint")}</p>
          <Button className="w-full" onClick={() => navigate("/my-bracelets")}>
            {t("topUp.viewBracelets")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate("/my-bracelets")}
            className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center hover:bg-muted/70 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold">{t("refund.title")}</h1>
            {braceletUid && (
              <p className="text-xs text-muted-foreground font-mono mt-0.5">
                {braceletUid.replace(/:/g, "")}
              </p>
            )}
          </div>
        </div>

        {error && (
          <div className="p-4 bg-destructive/10 text-destructive text-sm rounded-lg mb-6">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 space-y-6">

            {/* Refund method */}
            <div className="bg-card rounded-xl border border-border p-5 space-y-4">
              <h2 className="font-semibold">{t("refund.method")}</h2>
              <div>
                <Select value={method} onValueChange={(v) => setMethod(v as RefundMethod)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nequi">{t("refund.nequi")}</SelectItem>
                    <SelectItem value="bancolombia">{t("refund.bancolombia")}</SelectItem>
                    <SelectItem value="bank_transfer">{t("refund.bankTransfer")}</SelectItem>
                    <SelectItem value="cash">{t("refund.cash")}</SelectItem>
                    <SelectItem value="other">{t("refund.other")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {needsAccountDetails && (
                <div>
                  <Label className="mb-1 block">{t("refund.accountDetails")}</Label>
                  <Input
                    type="text"
                    inputMode={method === "bank_transfer" ? "text" : "numeric"}
                    placeholder={
                      method === "bank_transfer"
                        ? t("refund.accountDetailsPlaceholderBank")
                        : t("refund.accountDetailsPlaceholder")
                    }
                    value={accountDetails}
                    onChange={(e) => setAccountDetails(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("refund.accountDetailsHint")}
                  </p>
                </div>
              )}

              <div>
                <Label className="mb-1 block">{t("refund.notes")}</Label>
                <Input
                  type="text"
                  placeholder={t("refund.notesPlaceholder")}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Right column — summary + submit */}
          <div className="lg:col-span-2">
            <div className="sticky top-20 bg-card rounded-xl border border-border p-5 space-y-4">
              {bracelet && (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("refund.balance")}</span>
                    <span>{formatCOP(bracelet.balance)}</span>
                  </div>
                  {bracelet.event && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("event.schedule")}</span>
                      <span className="text-right text-xs max-w-[140px]">{bracelet.event.name}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between font-bold text-lg">
                    <span>{t("refund.refundAmount")}</span>
                    <span className="text-primary">{formatCOP(bracelet.balance)}</span>
                  </div>
                </div>
              )}

              <Button
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                size="lg"
                disabled={isPending || (needsAccountDetails && !accountDetails.trim())}
                onClick={() => submit()}
              >
                {isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4 mr-2" />
                    {t("refund.submit")}
                  </>
                )}
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                {t("refund.disclaimer")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
