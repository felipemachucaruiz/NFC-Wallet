import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import {
  ShoppingBag, PlusCircle, RotateCcw, ArrowLeftRight,
  Loader2, ChevronDown, Receipt,
} from "lucide-react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/AuthContext";
import { fetchMyTransactions, type ApiTransaction } from "@/lib/api";

function formatCOP(amount: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency", currency: "COP", maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  }).format(new Date(iso));
}

function txConfig(type: ApiTransaction["type"]) {
  switch (type) {
    case "top_up":
      return {
        Icon: PlusCircle,
        iconBg: "bg-emerald-500/15",
        iconColor: "text-emerald-400",
        amountColor: "text-emerald-400",
        sign: "+",
      };
    case "refund":
      return {
        Icon: RotateCcw,
        iconBg: "bg-yellow-500/15",
        iconColor: "text-yellow-400",
        amountColor: "text-yellow-400",
        sign: "+",
      };
    case "transfer":
      return {
        Icon: ArrowLeftRight,
        iconBg: "bg-cyan-500/15",
        iconColor: "text-cyan-400",
        amountColor: "text-zinc-400",
        sign: "",
      };
    default:
      return {
        Icon: ShoppingBag,
        iconBg: "bg-red-500/15",
        iconColor: "text-red-400",
        amountColor: "text-red-400",
        sign: "−",
      };
  }
}

function refundBadge(status?: string | null, chipZeroed?: boolean | null) {
  if (status === "approved" && chipZeroed) return { label: "Pagado", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };
  if (status === "approved") return { label: "Aprobado", cls: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" };
  if (status === "rejected") return { label: "Rechazado", cls: "bg-red-500/15 text-red-400 border-red-500/30" };
  if (status === "pending") return { label: "Pendiente", cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" };
  return null;
}

export default function MyTransactions() {
  const { t } = useTranslation();
  const { isAuthenticated, loading: authLoading, openAuthModal } = useAuth();
  const [, navigate] = useLocation();
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      openAuthModal("login", "my-transactions");
      navigate("/");
    }
  }, [authLoading, isAuthenticated]);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ["my-transactions"],
    queryFn: ({ pageParam }) => fetchMyTransactions(pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  const allTransactions = useMemo(
    () => data?.pages.flatMap((p) => p.transactions) ?? [],
    [data],
  );

  const events = useMemo(() => {
    const map = new Map<string, string>();
    for (const tx of allTransactions) {
      if (tx.eventId && tx.eventName && !map.has(tx.eventId)) {
        map.set(tx.eventId, tx.eventName);
      }
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [allTransactions]);

  const filtered = useMemo(
    () => selectedEventId ? allTransactions.filter((tx) => tx.eventId === selectedEventId) : allTransactions,
    [allTransactions, selectedEventId],
  );

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
          <h1 className="text-2xl font-bold">{t("transactions.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("transactions.subtitle")}</p>
        </div>

        {/* Event filter chips */}
        {events.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setSelectedEventId(null)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                selectedEventId === null
                  ? "bg-primary border-primary text-primary-foreground"
                  : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500"
              }`}
            >
              {t("transactions.all")}
            </button>
            {events.map((ev) => (
              <button
                key={ev.id}
                onClick={() => setSelectedEventId(ev.id === selectedEventId ? null : ev.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  selectedEventId === ev.id
                    ? "bg-primary border-primary text-primary-foreground"
                    : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500"
                }`}
              >
                {ev.name}
              </button>
            ))}
          </div>
        )}

        {/* Empty state */}
        {filtered.length === 0 && (
          <div className="text-center py-16">
            <Receipt className="w-14 h-14 text-zinc-600 mx-auto mb-3" />
            <p className="text-lg font-semibold">{t("transactions.empty")}</p>
            <p className="text-sm text-muted-foreground mt-1">{t("transactions.emptyHint")}</p>
          </div>
        )}

        {/* Transaction list */}
        {filtered.length > 0 && (
          <div className="space-y-2">
            {filtered.map((tx) => (
              <TxCard key={tx.id} tx={tx} />
            ))}
          </div>
        )}

        {/* Load more */}
        {hasNextPage && (
          <Button
            variant="outline"
            className="w-full border-zinc-700 text-zinc-400"
            disabled={isFetchingNextPage}
            onClick={() => fetchNextPage()}
          >
            {isFetchingNextPage ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <ChevronDown className="w-4 h-4 mr-1.5" />
                {t("transactions.loadMore")}
              </>
            )}
          </Button>
        )}

        {!hasNextPage && filtered.length > 0 && (
          <p className="text-center text-xs text-zinc-600">{t("transactions.endOfList")}</p>
        )}
      </div>
    </div>
  );
}

function TxCard({ tx }: { tx: ApiTransaction }) {
  const { t } = useTranslation();
  const { Icon, iconBg, iconColor, amountColor, sign } = txConfig(tx.type);
  const badge = tx.type === "refund" ? refundBadge(tx.refundStatus, tx.refundChipZeroed) : null;

  const label = tx.type === "top_up"
    ? t("transactions.topUp")
    : tx.type === "refund"
    ? t("transactions.refund")
    : tx.type === "transfer"
    ? t("transactions.transfer")
    : tx.merchantName
    ? `${t("transactions.purchase")} · ${tx.merchantName}`
    : t("transactions.purchase");

  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
          <Icon className={`w-4 h-4 ${iconColor}`} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{label}</p>
              {tx.locationName && (
                <p className="text-xs text-zinc-500 truncate">{tx.locationName}</p>
              )}
              {tx.eventName && (
                <p className="text-xs text-zinc-600 truncate">{tx.eventName}</p>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              <p className={`text-sm font-bold ${amountColor}`}>
                {sign}{formatCOP(tx.amount)}
              </p>
              {tx.newBalance > 0 && (
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  {t("transactions.balance")}: {formatCOP(tx.newBalance)}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 mt-1.5">
            <p className="text-[11px] text-zinc-600">{formatDate(tx.createdAt)}</p>
            {badge && (
              <Badge className={`text-[10px] px-1.5 py-0 border ${badge.cls}`}>
                {badge.label}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Line items (purchases) */}
      {tx.lineItems.length > 0 && (
        <div className="border-t border-zinc-800 pt-2.5 space-y-1">
          {tx.lineItems.map((li, i) => (
            <div key={i} className="flex items-center justify-between text-xs text-zinc-500">
              <span className="truncate flex-1 mr-2">
                {li.quantity > 1 && <span className="text-zinc-400 font-medium mr-1">{li.quantity}×</span>}
                {li.name}
              </span>
              <span className="flex-shrink-0">{formatCOP(li.unitPrice * li.quantity)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
