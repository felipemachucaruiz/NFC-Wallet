import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { Ticket, Calendar, MapPin, QrCode, Apple, Smartphone, Loader2, ArrowLeft, Clock, Tag, User, Mail, Phone, Send, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";
import { fetchMyTickets, resolveImageUrl, transferTicket, type ApiTicket } from "@/lib/api";


export default function MyTickets() {
  const { t } = useTranslation();
  const { isAuthenticated, loading: authLoading, openAuthModal } = useAuth();
  const [, navigate] = useLocation();
  const [selectedTicket, setSelectedTicket] = useState<ApiTicket | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["my-tickets"],
    queryFn: fetchMyTickets,
    enabled: isAuthenticated,
    staleTime: 10_000,
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      openAuthModal("login", "my-tickets");
      navigate("/");
    }
  }, [authLoading, isAuthenticated]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const tickets = data?.tickets ?? [];

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-lg mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">{t("myTickets.title")}</h1>

        {tickets.length === 0 ? (
          <div className="text-center py-16">
            <Ticket className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">{t("myTickets.noTickets")}</h2>
            <p className="text-muted-foreground mb-4">{t("myTickets.noTicketsDesc")}</p>
            <Link href="/">
              <Button>{t("myTickets.browseEvents")}</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {tickets.map((ticket) => (
              <ETicketCard key={ticket.id} ticket={ticket} onExpand={() => setSelectedTicket(ticket)} />
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!selectedTicket} onOpenChange={() => setSelectedTicket(null)}>
        <DialogContent className="max-w-md p-0 border-0 bg-transparent shadow-none overflow-visible">
          {selectedTicket && <ETicketFull ticket={selectedTicket} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ETicketCard({ ticket, onExpand }: { ticket: ApiTicket; onExpand: () => void }) {
  const { t } = useTranslation();
  const imageUrl = resolveImageUrl(ticket.eventCoverImage);
  const isValid = ticket.status === "valid";

  return (
    <div
      className="rounded-2xl overflow-hidden cursor-pointer transition-transform hover:scale-[1.01] active:scale-[0.99] bg-zinc-900 border border-zinc-800"
      onClick={onExpand}
    >
      <div className="relative w-full aspect-square overflow-hidden bg-zinc-800">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Ticket className="w-10 h-10 text-white/20" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/30" />
        <Badge
          className={`absolute top-3 right-3 ${isValid ? "bg-emerald-600/90 text-white border-emerald-500/50" : "bg-gray-600/90 text-gray-200 border-gray-500/50"}`}
        >
          {isValid ? t("myTickets.valid") : t("myTickets.used")}
        </Badge>
      </div>

      <div className="px-4 py-3 flex items-center gap-3 bg-zinc-900">
        <div className="bg-white rounded-lg p-1.5 shrink-0">
          {ticket.qrCodeToken ? (
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=60x60&data=${encodeURIComponent(ticket.qrCodeToken)}`}
              alt="QR"
              className="w-10 h-10"
            />
          ) : (
            <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center">
              <QrCode className="w-5 h-5 text-gray-400" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-white text-sm truncate">{ticket.eventName || "Event"}</h3>
          <p className="text-xs text-zinc-400 truncate">{ticket.ticketTypeName}</p>
          {ticket.eventStartsAt && (
            <p className="text-xs text-zinc-500 mt-0.5">
              {new Date(ticket.eventStartsAt).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          )}
        </div>
        <QrCode className="w-5 h-5 text-zinc-600" />
      </div>
    </div>
  );
}

function ETicketFull({ ticket }: { ticket: ApiTicket }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const imageUrl = resolveImageUrl(ticket.eventCoverImage);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferName, setTransferName] = useState("");
  const [transferEmail, setTransferEmail] = useState("");
  const [transferPhone, setTransferPhone] = useState("");
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferError, setTransferError] = useState("");
  const [transferDone, setTransferDone] = useState(false);

  const isValid = ticket.status === "valid";
  const startDate = ticket.eventStartsAt ? new Date(ticket.eventStartsAt) : null;

  const handleTransfer = async () => {
    if (!transferName.trim() || !transferEmail.trim()) return;
    setTransferLoading(true);
    setTransferError("");
    try {
      await transferTicket(ticket.id, {
        recipientName: transferName.trim(),
        recipientEmail: transferEmail.trim(),
        recipientPhone: transferPhone.trim() || undefined,
      });
      setTransferDone(true);
      queryClient.invalidateQueries({ queryKey: ["my-tickets"] });
    } catch (err: any) {
      setTransferError(err.message || "Error transferring ticket");
    } finally {
      setTransferLoading(false);
    }
  };

  if (transferDone) {
    return (
      <div className="rounded-3xl overflow-hidden bg-zinc-900 p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-600/20 flex items-center justify-center mx-auto mb-4">
          <Send className="w-7 h-7 text-emerald-400" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">{t("myTickets.transferSuccess", "Entrada transferida")}</h2>
        <p className="text-white/60 text-sm">{t("myTickets.transferSuccessMsg", "La entrada ha sido transferida exitosamente.")}</p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl overflow-hidden bg-zinc-900 border border-zinc-800">
      <div className="relative w-full aspect-square overflow-hidden bg-zinc-800">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Ticket className="w-12 h-12 text-white/20" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/40" />
      </div>

      <div className="flex flex-col items-center -mt-16 relative z-10 pb-4">
        <div className="bg-white rounded-2xl p-4 shadow-2xl">
          {ticket.qrCodeToken ? (
            <QRCodeSVG
              value={ticket.qrCodeToken}
              size={176}
              bgColor="#ffffff"
              fgColor="#000000"
              level="H"
              imageSettings={{
                src: `${import.meta.env.BASE_URL}tapee-qr-logo.png`,
                height: 38,
                width: 38,
                excavate: true,
              }}
            />
          ) : (
            <div className="w-44 h-44 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400">
              <QrCode className="w-12 h-12" />
            </div>
          )}
        </div>
      </div>

      <div className="relative mx-0 h-6 flex items-center">
        <div className="absolute -left-3 w-6 h-6 rounded-full bg-background" />
        <div className="flex-1 border-t border-dashed border-zinc-700 mx-4" />
        <div className="absolute -right-3 w-6 h-6 rounded-full bg-background" />
      </div>

      <div className="px-5 pb-5 space-y-3 bg-zinc-900">
        <h2 className="text-xl font-bold text-white">{ticket.eventName || "Event"}</h2>

        <div className="flex items-center gap-2 text-white/60 text-sm">
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">—</span>
        </div>

        {startDate && (
          <div className="flex gap-8">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/50 font-medium">{t("myTickets.date", "Fecha")}</p>
              <p className="text-sm text-white font-medium">
                {startDate.toLocaleDateString("es-CO", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/50 font-medium">{t("myTickets.time", "Hora")}</p>
              <p className="text-sm text-white font-medium">
                {startDate.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-primary" />
            <span className="text-sm text-primary font-semibold">{ticket.ticketTypeName}</span>
          </div>
          <Badge className={isValid ? "bg-emerald-600/20 text-emerald-400 border-emerald-600/30" : "bg-gray-600/20 text-gray-400 border-gray-600/30"}>
            {isValid ? t("myTickets.valid") : t("myTickets.used")}
          </Badge>
        </div>

        <div className="text-xs text-white/40 text-center pt-2">
          {ticket.attendeeName}
        </div>

        {isValid && !showTransfer && (
          <button
            onClick={() => setShowTransfer(true)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-white/15 text-white/70 text-sm font-medium hover:bg-white/5 transition-colors mt-2"
          >
            <Send className="w-4 h-4" />
            {t("myTickets.transferTicket", "Transferir entrada")}
          </button>
        )}

        {showTransfer && (
          <div className="pt-3 space-y-3 border-t border-white/10 mt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">{t("myTickets.transferTicket", "Transferir entrada")}</h3>
              <button onClick={() => setShowTransfer(false)} className="text-white/40 hover:text-white/70">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-white/50">{t("myTickets.transferDesc", "Ingresa los datos de la persona a quien deseas transferir esta entrada.")}</p>

            <div>
              <label className="text-xs text-white/50 mb-1 block">{t("myTickets.recipientName", "Nombre")} *</label>
              <input
                type="text"
                value={transferName}
                onChange={(e) => setTransferName(e.target.value)}
                placeholder={t("myTickets.recipientNamePlaceholder", "Nombre completo")}
                className="w-full h-10 rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-primary/50"
              />
            </div>

            <div>
              <label className="text-xs text-white/50 mb-1 block">{t("myTickets.recipientEmail", "Correo electrónico")} *</label>
              <input
                type="email"
                value={transferEmail}
                onChange={(e) => setTransferEmail(e.target.value)}
                placeholder="correo@ejemplo.com"
                className="w-full h-10 rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-primary/50"
              />
            </div>

            <div>
              <label className="text-xs text-white/50 mb-1 block">{t("myTickets.recipientPhone", "Teléfono (WhatsApp)")}</label>
              <input
                type="tel"
                value={transferPhone}
                onChange={(e) => setTransferPhone(e.target.value)}
                placeholder="+57 300 123 4567"
                className="w-full h-10 rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-primary/50"
              />
            </div>

            {transferError && (
              <p className="text-xs text-red-400">{transferError}</p>
            )}

            <button
              onClick={handleTransfer}
              disabled={transferLoading || !transferName.trim() || !transferEmail.trim()}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#00f1ff] text-black font-bold text-sm disabled:opacity-50 hover:bg-[#00d4e0] transition-colors"
            >
              {transferLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  {t("myTickets.confirmTransfer", "Transferir")}
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
