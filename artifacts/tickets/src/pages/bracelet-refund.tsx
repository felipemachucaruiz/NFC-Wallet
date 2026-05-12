import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useSearch } from "wouter";
import { ArrowLeft, Loader2, CheckCircle2, Clock, Info, Smartphone, CreditCard } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";
import { fetchMyBracelets, requestBraceletRefund } from "@/lib/api";

// ─── Data ─────────────────────────────────────────────────────────────────────

type RefundMethod = "nequi" | "bank_transfer";

const COLOMBIAN_BANKS = [
  "BANCO DE BOGOTÁ", "BANCO POPULAR", "BANCO ITAÚ", "BANCOLOMBIA", "CITIBANK",
  "BANCO GNB SUDAMERIS", "BANCO BBVA COLOMBIA S.A.", "SCOTIABANK COLPATRIA",
  "BANCO DE OCCIDENTE", "BANCO CAJA SOCIAL", "BANCO AGRARIO",
  "BANCO MUNDO MUJER S.A.", "BANCO DAVIVIENDA", "BANCO AV VILLAS",
  "BANCO PROCREDIT", "BANCAMIA S.A.", "BANCO PICHINCHA S.A.", "BANCOOMEVA S.A.",
  "BANCO FALABELLA", "BANCO FINANDINA S.A. BIC", "BANCO SANTANDER COLOMBIA",
  "BANCO COOPERATIVO COOPCENTRAL", "BANCO SERFINANZA", "LULO BANK", "JP MORGAN",
  "DALE", "RAPPIPAY DAVIPLATA", "CFA COOPERATIVA FINANCIERA",
  "JFK COOPERATIVA FINANCIERA", "COTRAFA", "COOFINEP COOPERATIVA FINANCIERA",
  "CONFIAR COOPERATIVA FINANCIERA", "BANCO UNIÓN", "COLTEFINANCIERA", "NEQUI",
  "DAVIPLATA", "BANCO CREDIFINANCIERA", "IRIS", "MOVII S.A.", "UALÁ",
  "NU COLOMBIA COMPAÑÍA DE FINANCIAMIENTO S.A.", "RAPPIPAY", "ALIANZA FIDUCIARIA",
  "CREZCAMOS S.A. COMPAÑÍA DE FINANCIAMIENTO",
];

const DOCUMENT_TYPES = [
  "Cédula de ciudadanía", "NIT", "Pasaporte", "Cédula de extranjería",
  "Tarjeta de identidad", "Registro civil", "Documento venezolano", "Carnet diplomático",
];

function formatCOP(amount: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency", currency: "COP", maximumFractionDigits: 0,
  }).format(amount);
}

// ─── Main component ───────────────────────────────────────────────────────────

import { SEO } from "@/components/SEO";

export default function BraceletRefund() {
  const { t } = useTranslation();
  const { isAuthenticated, loading: authLoading, openAuthModal } = useAuth();
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const braceletUid = params.get("uid") ?? "";

  const [refundMethod, setRefundMethod] = useState<RefundMethod>("nequi");

  // Nequi fields
  const [nequiPhone, setNequiPhone] = useState("");

  // Bank transfer fields
  const [bankName, setBankName] = useState("");
  const [accountType, setAccountType] = useState<"Ahorros" | "Corriente">("Ahorros");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [docType, setDocType] = useState("");
  const [docNumber, setDocNumber] = useState("");

  // Common
  const [notes, setNotes] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [step, setStep] = useState<"form" | "success">("form");
  const [errorMsg, setErrorMsg] = useState("");

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
  const hasPendingRefund = bracelet?.pendingRefund ?? false;
  const balance = bracelet?.balance ?? 0;
  const refundDeadline = bracelet?.event?.refundDeadline ?? null;
  const isDeadlinePassed = refundDeadline ? new Date() > new Date(refundDeadline) : false;

  const deadlineFormatted = refundDeadline
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "long", timeStyle: "short" }).format(new Date(refundDeadline))
    : null;

  const buildBankAccountDetails = () =>
    [
      `Banco: ${bankName}`,
      `Tipo de cuenta: ${accountType}`,
      `Número de cuenta: ${bankAccountNumber}`,
      `Titular: ${accountHolder}`,
      `Tipo documento: ${docType}`,
      `Número documento: ${docNumber}`,
    ].join(" | ");

  const isBankTransferValid = () => {
    if (refundMethod !== "bank_transfer") return true;
    return (
      bankName.trim() !== "" &&
      bankAccountNumber.trim() !== "" &&
      accountHolder.trim() !== "" &&
      docType.trim() !== "" &&
      docNumber.trim() !== ""
    );
  };

  const { mutate: submit, isPending } = useMutation({
    mutationFn: () => {
      const details =
        refundMethod === "nequi"
          ? `+57${nequiPhone.replace(/\D/g, "")}`
          : buildBankAccountDetails();
      return requestBraceletRefund({
        braceletUid,
        refundMethod,
        accountDetails: details || undefined,
        notes: notes.trim() || undefined,
      });
    },
    onSuccess: () => {
      setShowConfirm(false);
      setStep("success");
    },
    onError: (err: Error) => {
      setShowConfirm(false);
      if (err.message === "REFUND_REQUEST_ALREADY_PENDING") {
        setErrorMsg(t("refund.alreadyPendingMessage"));
      } else if (err.message === "REFUND_DEADLINE_PASSED") {
        setErrorMsg(t("refund.deadlinePassedMessage"));
      } else if (err.message === "BRACELET_BLOCKED") {
        setErrorMsg(t("myBracelets.flaggedError"));
      } else {
        setErrorMsg(err.message || t("common.error"));
      }
    },
  });

  const handleSubmitPress = () => {
    setErrorMsg("");
    if (!isBankTransferValid()) {
      setErrorMsg(t("refund.bankTransferIncomplete"));
      return;
    }
    setShowConfirm(true);
  };

  if (authLoading || loadingBracelets) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (isDeadlinePassed && step !== "success") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
            <Clock className="w-10 h-10 text-destructive" />
          </div>
          <h2 className="text-xl font-bold">{t("refund.deadlinePassedTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("refund.deadlinePassedMessage")}</p>
          {deadlineFormatted && (
            <p className="text-xs text-muted-foreground">
              {t("refund.deadlineWas")} {deadlineFormatted}
            </p>
          )}
          <Button variant="outline" className="w-full" onClick={() => navigate("/my-bracelets")}>
            {t("common.back")}
          </Button>
        </div>
      </div>
    );
  }

  if (step === "success" || hasPendingRefund) {
    const isPending_ = hasPendingRefund && step !== "success";
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto ${isPending_ ? "bg-yellow-500/15" : "bg-green-500/15"}`}>
            {isPending_
              ? <Clock className="w-10 h-10 text-yellow-400" />
              : <CheckCircle2 className="w-10 h-10 text-green-400" />}
          </div>
          <h2 className="text-xl font-bold">
            {isPending_ ? t("refund.alreadyPendingTitle") : t("refund.successTitle")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isPending_ ? t("refund.alreadyPendingMessage") : t("refund.successMessage")}
          </p>
          <Button className="w-full" onClick={() => navigate("/my-bracelets")}>
            {t("common.back")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <SEO noindex />
      <div className="max-w-lg mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/my-bracelets")}
            className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center hover:bg-muted/70 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-xl font-bold">{t("refund.title")}</h1>
        </div>

        {/* Bracelet info card */}
        <div className="bg-card rounded-2xl border border-border p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12.55a11 11 0 0 1 14.08 0" /><path d="M1.42 9a16 16 0 0 1 21.16 0" />
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><circle cx="12" cy="20" r="1" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{t("common.bracelet") ?? "Pulsera"}</p>
            <p className="text-sm font-semibold font-mono">{braceletUid.replace(/:/g, "")}</p>
          </div>
          <span className="text-lg font-bold text-primary">{formatCOP(balance)}</span>
        </div>

        {/* Amount summary */}
        <div className="bg-card rounded-2xl border border-border p-4 flex items-center justify-between">
          <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t("refund.amount")}</p>
          <span className="text-2xl font-bold text-primary">{formatCOP(balance)}</span>
        </div>

        {errorMsg && (
          <div className="p-4 bg-destructive/10 text-destructive text-sm rounded-xl">
            {errorMsg}
          </div>
        )}

        {/* Method selector */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            {t("refund.method")}
          </p>
          <div className="grid grid-cols-2 gap-3">
            {([
              { value: "nequi" as RefundMethod, icon: <Smartphone className="w-5 h-5" />, labelKey: "refund.methodNequi" },
              { value: "bank_transfer" as RefundMethod, icon: <CreditCard className="w-5 h-5" />, labelKey: "refund.methodBankTransfer" },
            ]).map((m) => {
              const selected = refundMethod === m.value;
              return (
                <button
                  key={m.value}
                  onClick={() => setRefundMethod(m.value)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-colors ${
                    selected
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border bg-card text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {m.icon}
                  <span className="text-xs font-semibold text-center">{t(m.labelKey)}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Nequi */}
        {refundMethod === "nequi" && (
          <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground block">
              {t("refund.methodNequi")}
            </Label>
            <div className="flex gap-2">
              <div className="flex items-center px-3 bg-muted border border-border rounded-lg text-sm font-mono text-muted-foreground select-none">
                🇨🇴 +57
              </div>
              <Input
                type="tel"
                inputMode="numeric"
                placeholder={t("refund.accountPlaceholder")}
                value={nequiPhone}
                onChange={(e) => setNequiPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                className="flex-1"
              />
            </div>
          </div>
        )}

        {/* Bank transfer */}
        {refundMethod === "bank_transfer" && (
          <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
            {/* Bank selector */}
            <div>
              <Label className="mb-1.5 block">{t("refund.bankPickerTitle")}</Label>
              <Select value={bankName} onValueChange={setBankName}>
                <SelectTrigger>
                  <SelectValue placeholder={t("refund.bankPlaceholder")} />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {COLOMBIAN_BANKS.map((b) => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Account type toggle */}
            <div>
              <Label className="mb-1.5 block">Tipo de cuenta</Label>
              <div className="flex gap-2">
                {(["Ahorros", "Corriente"] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setAccountType(type)}
                    className={`flex-1 py-2.5 rounded-lg border-2 text-sm font-semibold transition-colors ${
                      accountType === type
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* Account number */}
            <div>
              <Label className="mb-1.5 block">{t("refund.accountNumberPlaceholder")}</Label>
              <Input
                type="text"
                inputMode="numeric"
                placeholder={t("refund.accountNumberPlaceholder")}
                value={bankAccountNumber}
                onChange={(e) => setBankAccountNumber(e.target.value.replace(/\D/g, ""))}
              />
            </div>

            {/* Account holder */}
            <div>
              <Label className="mb-1.5 block">{t("refund.accountHolderPlaceholder")}</Label>
              <Input
                type="text"
                autoCapitalize="words"
                placeholder={t("refund.accountHolderPlaceholder")}
                value={accountHolder}
                onChange={(e) => setAccountHolder(e.target.value)}
              />
            </div>

            {/* Doc type */}
            <div>
              <Label className="mb-1.5 block">{t("refund.docTypePickerTitle")}</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger>
                  <SelectValue placeholder={t("refund.docTypePlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Doc number */}
            <div>
              <Label className="mb-1.5 block">{t("refund.docNumberPlaceholder")}</Label>
              <Input
                type="text"
                inputMode="numeric"
                placeholder={t("refund.docNumberPlaceholder")}
                value={docNumber}
                onChange={(e) => setDocNumber(e.target.value.replace(/\D/g, ""))}
              />
            </div>
          </div>
        )}

        {/* Notes */}
        <div>
          <Label className="mb-1.5 block">{t("refund.notes")}</Label>
          <Textarea
            placeholder={t("refund.notesPlaceholder")}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </div>

        {/* Info banner */}
        <div className="bg-card rounded-2xl border border-border p-4 flex gap-3 items-start">
          <Info className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            {deadlineFormatted
              ? t("refund.pendingInfoWithDeadline", { date: deadlineFormatted })
              : t("refund.pendingInfo")}
          </p>
        </div>

        {/* Submit */}
        <Button
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
          size="lg"
          onClick={handleSubmitPress}
          disabled={isPending}
        >
          {t("refund.submit")}
        </Button>
      </div>

      {/* Confirmation dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("refund.confirmTitle")}</DialogTitle>
            <DialogDescription>{t("refund.confirmMessage")}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowConfirm(false)} disabled={isPending}>
              {t("common.cancel")}
            </Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => submit()}
              disabled={isPending}
            >
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("common.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
