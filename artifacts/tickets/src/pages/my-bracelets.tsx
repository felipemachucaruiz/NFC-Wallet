import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import {
  Wifi, Clock, Plus, Trash2, Loader2, AlertTriangle,
  CreditCard, ChevronRight, CheckCircle, ArrowRightLeft,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/AuthContext";
import {
  fetchMyBracelets, fetchPendingWalletBalance,
  linkBracelet, unlinkBracelet, claimWalletBalance,
  type ApiBracelet,
} from "@/lib/api";

function formatCOP(amount: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency", currency: "COP", maximumFractionDigits: 0,
  }).format(amount);
}

function normalizeUid(raw: string): string {
  const clean = raw.replace(/[:\s\-]/g, "").toUpperCase();
  if (clean.length === 0) return "";
  return clean.match(/.{1,2}/g)?.join(":") ?? clean;
}

export default function MyBracelets() {
  const { t } = useTranslation();
  const { isAuthenticated, loading: authLoading, openAuthModal } = useAuth();
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const [uidInput, setUidInput] = useState("");
  const [unlinkConfirm, setUnlinkConfirm] = useState<string | null>(null);
  const [linkError, setLinkError] = useState("");
  const [linkSuccess, setLinkSuccess] = useState("");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      openAuthModal("login", "my-bracelets");
      navigate("/");
    }
  }, [authLoading, isAuthenticated]);

  const { data: braceletData, isLoading } = useQuery({
    queryKey: ["my-bracelets"],
    queryFn: fetchMyBracelets,
    enabled: isAuthenticated,
    staleTime: 15_000,
  });

  const { data: walletData } = useQuery({
    queryKey: ["wallet-pending"],
    queryFn: fetchPendingWalletBalance,
    enabled: isAuthenticated,
    staleTime: 15_000,
  });

  const pendingWalletBalance = walletData?.pendingWalletBalance ?? 0;
  const bracelets = braceletData?.bracelets ?? [];
  const activeBracelets = bracelets.filter((b) => !b.pendingRefund && b.refundStatus !== "disbursement_completed");
  const claimTarget = activeBracelets.find((b) => !b.flagged) ?? null;

  const { mutate: doLink, isPending: isLinking } = useMutation({
    mutationFn: (uid: string) => linkBracelet(uid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-bracelets"] });
      setLinkSuccess(t("myBracelets.linkSuccess"));
      setUidInput("");
      setLinkError("");
      setTimeout(() => setLinkSuccess(""), 4000);
    },
    onError: (err: Error) => {
      if (err.message === "BRACELET_ALREADY_LINKED") {
        setLinkError(t("myBracelets.alreadyLinked"));
      } else if (err.message === "ONE_BRACELET_PER_EVENT") {
        setLinkError(t("myBracelets.eventLimit"));
      } else if (err.message === "BRACELET_FLAGGED") {
        setLinkError(t("myBracelets.flaggedError"));
      } else if (err.message === "BRACELET_NOT_FOUND" || err.message === "BRACELET_NOT_REGISTERED") {
        setLinkError(t("myBracelets.notFound"));
      } else {
        setLinkError(err.message || t("myBracelets.linkError"));
      }
    },
  });

  const { mutate: doUnlink, isPending: isUnlinking } = useMutation({
    mutationFn: (uid: string) => unlinkBracelet(uid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-bracelets"] });
      setUnlinkConfirm(null);
    },
  });

  const { mutate: doClaim, isPending: isClaiming } = useMutation({
    mutationFn: (uid: string) => claimWalletBalance(uid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-bracelets"] });
      qc.invalidateQueries({ queryKey: ["wallet-pending"] });
    },
  });

  const normalizedUid = normalizeUid(uidInput);
  const isValidUid = [8, 14, 20].includes(normalizedUid.replace(/:/g, "").length);

  const handleLink = () => {
    if (!isValidUid || isLinking) return;
    setLinkError("");
    doLink(normalizedUid);
  };

  if (authLoading || (!isAuthenticated && !authLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t("myBracelets.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("myBracelets.subtitle")}</p>
        </div>

        {/* Pending wallet balance banner */}
        {pendingWalletBalance > 0 && (
          <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/8 p-4 flex gap-3 items-start">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Clock className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
                {t("myBracelets.walletBalance")}
              </p>
              <p className="text-lg font-bold text-white mt-0.5">{formatCOP(pendingWalletBalance)}</p>
              <p className="text-xs text-zinc-400 mt-1">
                {claimTarget
                  ? t("myBracelets.walletHintWithBracelet")
                  : t("myBracelets.walletHintNoBracelet")}
              </p>
            </div>
            {claimTarget && (
              <Button
                size="sm"
                className="bg-cyan-500 hover:bg-cyan-400 text-black font-semibold flex-shrink-0"
                disabled={isClaiming}
                onClick={() => doClaim(claimTarget.uid)}
              >
                {isClaiming ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <ArrowRightLeft className="w-3.5 h-3.5 mr-1.5" />
                    {t("myBracelets.transferToWristband")}
                  </>
                )}
              </Button>
            )}
          </div>
        )}

        {/* Bracelet list */}
        {activeBracelets.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              {t("myBracelets.myWristbands")}
            </p>
            {activeBracelets.map((b) => (
              <BraceletCard
                key={b.uid}
                bracelet={b}
                onTopUp={() => navigate(`/bracelet-topup?uid=${encodeURIComponent(b.uid)}`)}
                onUnlink={() => setUnlinkConfirm(b.uid)}
              />
            ))}
          </div>
        )}

        {activeBracelets.length === 0 && !isLoading && (
          <div className="text-center py-10">
            <Wifi className="w-14 h-14 text-zinc-600 mx-auto mb-3" />
            <p className="text-lg font-semibold">{t("myBracelets.noWristbands")}</p>
            <p className="text-sm text-muted-foreground mt-1">{t("myBracelets.noWristbandsHint")}</p>
          </div>
        )}

        {/* Add bracelet */}
        <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            {t("myBracelets.addWristband")}
          </p>

          <div className="flex gap-2">
            <input
              type="text"
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm font-mono uppercase placeholder:text-zinc-500 focus:outline-none focus:border-cyan-500 transition-colors"
              placeholder={t("myBracelets.uidPlaceholder")}
              value={uidInput}
              onChange={(e) => { setUidInput(e.target.value.toUpperCase()); setLinkError(""); setLinkSuccess(""); }}
              onKeyDown={(e) => e.key === "Enter" && handleLink()}
              disabled={isLinking}
              autoCorrect="off"
              autoCapitalize="characters"
            />
            <Button
              className="bg-primary hover:bg-primary/90 text-primary-foreground px-4"
              onClick={handleLink}
              disabled={!isValidUid || isLinking}
            >
              {isLinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            </Button>
          </div>

          {normalizedUid.length > 0 && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono ${isValidUid ? "bg-cyan-500/10 border border-cyan-500/25 text-cyan-400" : "bg-zinc-800 text-zinc-500"}`}>
              {isValidUid && <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />}
              <span>{normalizedUid}</span>
            </div>
          )}

          {linkError && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              {linkError}
            </div>
          )}

          {linkSuccess && (
            <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
              <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
              {linkSuccess}
            </div>
          )}

          <p className="text-xs text-zinc-500">{t("myBracelets.uidHint")}</p>
        </div>

        {/* Also top up without bracelet */}
        <button
          className="w-full flex items-center justify-between px-5 py-4 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors text-left"
          onClick={() => navigate("/bracelet-topup")}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-zinc-400" />
            </div>
            <div>
              <p className="text-sm font-semibold">{t("myBracelets.preloadTitle")}</p>
              <p className="text-xs text-zinc-500">{t("myBracelets.preloadHint")}</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-zinc-500" />
        </button>
      </div>

      {/* Unlink confirm dialog */}
      {unlinkConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <p className="font-semibold">{t("myBracelets.unlinkTitle")}</p>
                <p className="text-xs text-zinc-400 font-mono mt-0.5">{unlinkConfirm}</p>
              </div>
            </div>
            <p className="text-sm text-zinc-400">{t("myBracelets.unlinkConfirmMsg")}</p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setUnlinkConfirm(null)}>
                {t("myBracelets.cancel")}
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-500 text-white"
                disabled={isUnlinking}
                onClick={() => doUnlink(unlinkConfirm)}
              >
                {isUnlinking ? <Loader2 className="w-4 h-4 animate-spin" /> : t("myBracelets.confirmUnlink")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BraceletCard({
  bracelet, onTopUp, onUnlink,
}: {
  bracelet: ApiBracelet;
  onTopUp: () => void;
  onUnlink: () => void;
}) {
  const { t } = useTranslation();
  const chipBalance = bracelet.balance;
  const pending = bracelet.pendingTopUpAmount ?? 0;
  const total = chipBalance + pending;

  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden">
      <div className="p-4 flex items-start gap-4">
        {/* Bracelet graphic */}
        <div className="relative flex-shrink-0" style={{ width: 160, height: 91 }}>
          <img
            src={`${import.meta.env.BASE_URL}tapee-nfc-tag.png`}
            alt="bracelet"
            className="w-full h-full object-contain rounded-lg"
          />
          <div className="absolute bottom-2.5 left-0 right-0 flex justify-center pointer-events-none">
            <span className="text-[9px] font-semibold tracking-wide text-white/70 font-mono">
              {bracelet.uid.replace(/:/g, "")}
            </span>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          {bracelet.event && (
            <p className="text-xs text-zinc-500 mb-1">{bracelet.event.name}</p>
          )}
          <p className="text-xl font-bold text-white">{formatCOP(total)}</p>
          {pending > 0 && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <div className="flex items-center gap-1 bg-yellow-500/12 border border-yellow-500/25 rounded-md px-2 py-0.5">
                <Clock className="w-3 h-3 text-yellow-400" />
                <span className="text-[11px] font-semibold text-yellow-400">
                  {formatCOP(pending)} {t("myBracelets.pendingLabel")}
                </span>
              </div>
            </div>
          )}
        </div>

        {bracelet.flagged && (
          <Badge className="bg-red-500/15 text-red-400 border-red-500/30 text-xs flex-shrink-0">
            {t("myBracelets.blocked")}
          </Badge>
        )}
      </div>

      {!bracelet.flagged && !bracelet.pendingRefund && (
        <div className="border-t border-zinc-800 px-4 py-3 flex gap-2">
          <Button
            size="sm"
            className="bg-cyan-500 hover:bg-cyan-400 text-black font-semibold flex-1"
            onClick={onTopUp}
          >
            {t("myBracelets.topUp")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-zinc-400 border-zinc-700 hover:bg-red-500/10 hover:border-red-500/40 hover:text-red-400"
            onClick={onUnlink}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
