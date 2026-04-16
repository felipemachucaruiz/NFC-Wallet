import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import {
  ShoppingBag,
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  Ticket,
  CreditCard,
  Calendar,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/AuthContext";
import { fetchMyOrders, fetchOrderDownloadLink, resolveImageUrl, type ApiOrder } from "@/lib/api";

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount / 100);
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  card: "Tarjeta",
  nequi: "Nequi",
  pse: "PSE",
  bancolombia_transfer: "Bancolombia",
  free: "Gratuita",
};

const STATUS_STYLES: Record<string, string> = {
  confirmed: "bg-emerald-600/20 text-emerald-400 border-emerald-600/30",
  pending: "bg-yellow-600/20 text-yellow-400 border-yellow-600/30",
  cancelled: "bg-red-600/20 text-red-400 border-red-600/30",
  expired: "bg-zinc-600/20 text-zinc-400 border-zinc-600/30",
};

const STATUS_LABELS: Record<string, string> = {
  confirmed: "Confirmada",
  pending: "Pendiente",
  cancelled: "Cancelada",
  expired: "Expirada",
};

export default function MyOrders() {
  const { t } = useTranslation();
  const { isAuthenticated, loading: authLoading, openAuthModal } = useAuth();
  const [, navigate] = useLocation();

  const { data, isLoading } = useQuery({
    queryKey: ["my-orders"],
    queryFn: fetchMyOrders,
    enabled: isAuthenticated,
    staleTime: 10_000,
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      openAuthModal("login", "my-orders");
      navigate("/");
    }
  }, [authLoading, isAuthenticated]);

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

  const orders = data?.orders ?? [];

  return (
    <div className="min-h-screen">
      <div className="max-w-lg mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">{t("myOrders.title", "Mis Órdenes")}</h1>

        {orders.length === 0 ? (
          <div className="text-center py-16">
            <ShoppingBag className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">{t("myOrders.noOrders", "No tienes compras")}</h2>
            <p className="text-muted-foreground mb-4">{t("myOrders.noOrdersDesc", "Explora eventos y compra tus boletas")}</p>
            <Link href="/">
              <button className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">
                {t("myTickets.browseEvents", "Explorar eventos")}
              </button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function OrderCard({ order }: { order: ApiOrder }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const imageUrl = resolveImageUrl(order.eventCoverImage);
  const statusStyle = STATUS_STYLES[order.paymentStatus] ?? STATUS_STYLES.expired;
  const statusLabel = STATUS_LABELS[order.paymentStatus] ?? order.paymentStatus;
  const paymentLabel = PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod;
  const orderDate = new Date(order.createdAt).toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "America/Bogota",
  });

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDownloading(true);
    try {
      const { url } = await fetchOrderDownloadLink(order.id);
      window.open(url, "_blank");
    } catch {
      // silently fail — user sees nothing happens
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800">
      {/* Header row */}
      <button
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-zinc-800/50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Event thumbnail */}
        <div className="w-12 h-12 rounded-xl overflow-hidden bg-zinc-800 shrink-0">
          {imageUrl ? (
            <img src={imageUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Ticket className="w-5 h-5 text-white/20" />
            </div>
          )}
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white truncate">{order.eventName ?? "Evento"}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-zinc-400">{orderDate}</span>
            <span className="text-zinc-700">·</span>
            <span className="text-xs text-zinc-400">
              {order.ticketCount} {order.ticketCount === 1 ? "boleta" : "boletas"}
            </span>
          </div>
        </div>

        {/* Amount + status */}
        <div className="shrink-0 text-right flex flex-col items-end gap-1">
          <span className="text-sm font-bold text-white">
            {formatCurrency(order.totalAmount, order.currencyCode)}
          </span>
          <Badge className={`text-[10px] px-1.5 py-0 ${statusStyle}`}>{statusLabel}</Badge>
        </div>

        <div className="shrink-0 ml-1">
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-zinc-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-zinc-500" />
          )}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-zinc-800 px-4 pb-4 space-y-4">
          {/* Order metadata */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 pt-4">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-0.5">
                {t("myOrders.orderNumber", "Número de orden")}
              </p>
              <p className="text-xs font-mono text-zinc-300">{order.id.slice(0, 8).toUpperCase()}</p>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-0.5">
                {t("myOrders.paymentMethod", "Método de pago")}
              </p>
              <div className="flex items-center gap-1.5">
                <CreditCard className="w-3 h-3 text-zinc-400" />
                <p className="text-xs text-zinc-300">{paymentLabel}</p>
              </div>
            </div>

            {order.wompiReference && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-0.5">
                  {t("myOrders.wompiReference", "Referencia Wompi")}
                </p>
                <p className="text-xs font-mono text-zinc-300 break-all">{order.wompiReference}</p>
              </div>
            )}

            {order.wompiTransactionId && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-0.5">
                  {t("myOrders.transactionId", "ID transacción")}
                </p>
                <p className="text-xs font-mono text-zinc-300 break-all">{order.wompiTransactionId}</p>
              </div>
            )}

            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-0.5">
                {t("myOrders.orderDate", "Fecha de compra")}
              </p>
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3 h-3 text-zinc-400" />
                <p className="text-xs text-zinc-300">{orderDate}</p>
              </div>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-0.5">
                {t("myOrders.total", "Total pagado")}
              </p>
              <p className="text-xs font-bold text-white">
                {formatCurrency(order.totalAmount, order.currencyCode)}
              </p>
            </div>
          </div>

          {/* Tickets list */}
          {order.tickets.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
                {t("myOrders.tickets", "Boletas")}
              </p>
              <div className="space-y-1.5">
                {order.tickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-800/60"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Ticket className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      <span className="text-xs text-zinc-300 truncate">{ticket.attendeeName}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {ticket.ticketTypeName && (
                        <span className="text-[10px] text-zinc-500">{ticket.ticketTypeName}</span>
                      )}
                      <Badge
                        className={`text-[10px] px-1.5 py-0 ${
                          ticket.status === "valid"
                            ? "bg-emerald-600/20 text-emerald-400 border-emerald-600/30"
                            : "bg-zinc-600/20 text-zinc-400 border-zinc-600/30"
                        }`}
                      >
                        {ticket.status === "valid" ? "Válida" : ticket.status === "used" ? "Usada" : "Cancelada"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Download button */}
          {order.paymentStatus === "confirmed" && (
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-zinc-700 text-zinc-300 text-sm font-medium hover:bg-zinc-800 transition-colors disabled:opacity-50"
            >
              {downloading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {t("myOrders.downloadTickets", "Descargar boletas (PDF)")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
