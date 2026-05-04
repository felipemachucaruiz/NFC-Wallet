import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { Ticket, MapPin, QrCode, Loader2, Tag, Send, X, Archive, ChevronDown, ChevronUp, CheckCircle, ChevronRight } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";
import { fetchMyTickets, resolveImageUrl, transferTicket, addTicketToWallet, type ApiTicket } from "@/lib/api";

function isArchivedTicket(ticket: ApiTicket) {
  return ticket.status === "used" || ticket.status === "cancelled";
}

export default function MyTickets() {
  const { t } = useTranslation();
  const { isAuthenticated, loading: authLoading, openAuthModal } = useAuth();
  const [, navigate] = useLocation();
  const [selectedTicket, setSelectedTicket] = useState<ApiTicket | null>(null);
  const [showArchived, setShowArchived] = useState(false);

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
      <div className="min-h-screen">
        <div className="max-w-lg mx-auto px-4 py-8">
          <div className="h-8 w-40 bg-card rounded animate-pulse mb-6" />
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-800 animate-pulse">
                <div className="aspect-square bg-zinc-800" />
                <div className="px-4 py-3 flex items-center gap-3">
                  <div className="w-14 h-14 bg-zinc-800 rounded-lg shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-zinc-800 rounded w-3/4" />
                    <div className="h-3 bg-zinc-800 rounded w-1/2" />
                    <div className="h-3 bg-zinc-800 rounded w-1/3" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const allTickets = data?.tickets ?? [];
  const activeTickets = allTickets.filter((t) => !isArchivedTicket(t));
  const archivedTickets = allTickets.filter((t) => isArchivedTicket(t));

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <div className="max-w-lg mx-auto px-4 py-8">
          <div className="h-8 w-40 bg-card rounded animate-pulse mb-6" />
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-800 animate-pulse">
                <div className="aspect-square bg-zinc-800" />
                <div className="px-4 py-3 flex items-center gap-3">
                  <div className="w-14 h-14 bg-zinc-800 rounded-lg shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-zinc-800 rounded w-3/4" />
                    <div className="h-3 bg-zinc-800 rounded w-1/2" />
                    <div className="h-3 bg-zinc-800 rounded w-1/3" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-lg mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">{t("myTickets.title")}</h1>

        {allTickets.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-primary/10 flex items-center justify-center shadow-[0_0_32px_rgba(0,241,255,0.15)]">
              <Ticket className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-xl font-semibold mb-2">{t("myTickets.noTickets")}</h2>
            <p className="text-muted-foreground text-sm mb-6">{t("myTickets.noTicketsDesc")}</p>
            <Link href="/">
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2">
                {t("myTickets.browseEvents")}
                <ChevronRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Active tickets */}
            {activeTickets.length > 0 && (
              <div className="space-y-4">
                {activeTickets.map((ticket) => (
                  <ETicketCard key={ticket.id} ticket={ticket} onExpand={() => setSelectedTicket(ticket)} />
                ))}
              </div>
            )}

            {activeTickets.length === 0 && archivedTickets.length > 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Ticket className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">{t("myTickets.noActiveTickets", "No tienes boletas activas")}</p>
              </div>
            )}

            {/* Archived tickets section */}
            {archivedTickets.length > 0 && (
              <div className="space-y-3">
                <button
                  onClick={() => setShowArchived((v) => !v)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <Archive className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-semibold text-muted-foreground">
                      {t("myTickets.archivedEvents", "Eventos archivados")}
                    </span>
                    <span className="text-xs font-semibold bg-muted text-muted-foreground rounded-full px-2 py-0.5">
                      {archivedTickets.length}
                    </span>
                  </div>
                  {showArchived ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>

                {showArchived && (
                  <div className="space-y-4">
                    {archivedTickets.map((ticket) => (
                      <ETicketCard
                        key={ticket.id}
                        ticket={ticket}
                        onExpand={() => setSelectedTicket(ticket)}
                        archived
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={!!selectedTicket} onOpenChange={() => setSelectedTicket(null)}>
        <DialogContent className="max-w-md p-0 border-0 bg-transparent shadow-none overflow-y-auto max-h-[90dvh]">
          {selectedTicket && <ETicketFull ticket={selectedTicket} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ETicketCard({ ticket, onExpand, archived }: { ticket: ApiTicket; onExpand: () => void; archived?: boolean }) {
  const { t } = useTranslation();
  const imageUrl = resolveImageUrl(ticket.eventCoverImage);
  const isValid = ticket.status === "valid";

  return (
    <div
      className={`rounded-2xl overflow-hidden cursor-pointer transition-transform hover:scale-[1.01] active:scale-[0.99] bg-zinc-900 border border-zinc-800 ${archived ? "opacity-60" : ""}`}
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

        {archived ? (
          <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/60 rounded-full px-2.5 py-1">
            <CheckCircle className="w-3.5 h-3.5 text-white/70" />
            <span className="text-xs font-semibold text-white/70">{t("myTickets.used", "Usada")}</span>
          </div>
        ) : (
          <Badge
            className={`absolute top-3 right-3 ${isValid ? "bg-emerald-600/90 text-white border-emerald-500/50" : "bg-gray-600/90 text-gray-200 border-gray-500/50"}`}
          >
            {isValid ? t("myTickets.valid") : t("myTickets.used")}
          </Badge>
        )}

        {archived && (
          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-1.5 bg-black/50 py-1.5">
            <Archive className="w-3.5 h-3.5 text-white/50" />
            <span className="text-xs text-white/50">{t("myTickets.archivedEvent", "Evento archivado")}</span>
          </div>
        )}
      </div>

      <div className="px-4 py-3 flex items-center gap-3 bg-zinc-900">
        <div className="bg-white rounded-lg p-1.5 shrink-0">
          {ticket.qrCodeToken ? (
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=60x60&data=${encodeURIComponent(ticket.qrCodeToken)}`}
              alt="QR"
              className={`w-10 h-10 ${archived ? "opacity-40 grayscale" : ""}`}
            />
          ) : (
            <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center">
              <QrCode className="w-5 h-5 text-gray-400" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className={`font-bold text-sm truncate ${archived ? "text-white/50" : "text-white"}`}>{ticket.eventName || "Event"}</h3>
          <p className="text-xs text-zinc-400 truncate">{ticket.ticketTypeName}</p>
          {ticket.eventStartsAt && (
            <p className="text-xs text-zinc-500 mt-0.5">
              {new Date(ticket.eventStartsAt).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Bogota" })}
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
  const [walletLoading, setWalletLoading] = useState<"apple" | "google" | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isAndroid = /android/i.test(navigator.userAgent);
  const archived = isArchivedTicket(ticket);

  const handleAddToWallet = async (platform: "apple" | "google") => {
    setWalletLoading(platform);
    setWalletError(null);
    try {
      const { passUrl } = await addTicketToWallet(ticket.id, platform);
      if (passUrl) window.open(passUrl, "_blank");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("common.unknownError", "Error desconocido");
      setWalletError(msg);
    } finally {
      setWalletLoading(null);
    }
  };

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
      setTransferError(err.message || t("myTickets.transferError"));
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
      <div className="relative w-full aspect-square overflow-hidden bg-zinc-900">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Ticket className="w-12 h-12 text-white/20" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent from-40% via-zinc-900/60 via-70% to-zinc-900" />

        {archived && (
          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-2 bg-black/60 py-2">
            <Archive className="w-4 h-4 text-white/70" />
            <span className="text-sm font-semibold text-white/70">
              {t("myTickets.archivedEvent", "Evento archivado")}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-col items-center -mt-16 relative z-10 pb-4">
        <div className={`bg-white rounded-2xl p-4 shadow-2xl ${archived ? "opacity-40 grayscale" : ""}`}>
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
        {archived && (
          <div className="flex items-center gap-1.5 mt-3">
            <CheckCircle className="w-3.5 h-3.5 text-white/40" />
            <span className="text-xs text-white/40">{t("myTickets.used", "Usada")}</span>
          </div>
        )}
      </div>

      <div className="relative mx-0 h-6 flex items-center">
        <div className="absolute -left-3 w-6 h-6 rounded-full bg-background" />
        <div className="flex-1 border-t border-dashed border-zinc-700 mx-4" />
        <div className="absolute -right-3 w-6 h-6 rounded-full bg-background" />
      </div>

      <div className="px-5 pb-5 space-y-3 bg-zinc-900">
        <h2 className="text-xl font-bold text-white">{ticket.eventName || "Event"}</h2>

        {ticket.venueAddress && (
          <div className="flex items-center gap-2 text-white/60 text-sm">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{ticket.venueAddress}</span>
          </div>
        )}

        {startDate && (
          <div className="flex gap-8">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/50 font-medium">{t("myTickets.date")}</p>
              <p className="text-sm text-white font-medium">
                {startDate.toLocaleDateString("es-CO", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "America/Bogota" })}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/50 font-medium">{t("myTickets.time")}</p>
              <p className="text-sm text-white font-medium">
                {startDate.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" })}
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-primary" />
            <span className="text-sm text-primary font-semibold">{ticket.ticketTypeName}</span>
          </div>
          <Badge className={isValid
            ? "bg-emerald-600/20 text-emerald-400 border-emerald-600/30"
            : "bg-gray-600/20 text-gray-400 border-gray-600/30"
          }>
            {isValid ? t("myTickets.valid") : t("myTickets.used")}
          </Badge>
        </div>

        <div className="text-xs text-white/40 text-center pt-1">
          {ticket.attendeeName}
        </div>

        <div className="flex gap-8 pt-1 border-t border-white/5">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/30 font-medium">{t("myTickets.orderNumber")}</p>
            <p className="text-xs text-white/50 font-mono">{ticket.orderId.slice(0, 8).toUpperCase()}</p>
          </div>
          {ticket.createdAt && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/30 font-medium">{t("myTickets.orderDate")}</p>
              <p className="text-xs text-white/50">
                {new Date(ticket.createdAt).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })}
              </p>
            </div>
          )}
        </div>

        {!archived && isValid && isIOS && !showTransfer && (
          <button
            onClick={() => handleAddToWallet("apple")}
            disabled={!!walletLoading}
            className="w-full flex items-center justify-center mt-2 disabled:opacity-60 hover:opacity-90 transition-opacity"
          >
            {walletLoading === "apple" ? (
              <div className="flex items-center gap-2 py-3">
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span className="text-white text-sm">{t("myTickets.addAppleWallet", "Añadir a Apple Wallet")}</span>
              </div>
            ) : (
              <img src={`${import.meta.env.BASE_URL}apple-wallet-badge.png`} alt="Añadir a Apple Wallet" className="h-12 w-auto" />
            )}
          </button>
        )}

        {!archived && isValid && (isAndroid || !isIOS) && !showTransfer && (
          <button
            onClick={() => handleAddToWallet("google")}
            disabled={!!walletLoading}
            className="w-full flex items-center justify-center mt-2 disabled:opacity-60 hover:opacity-90 transition-opacity"
          >
            {walletLoading === "google" ? (
              <div className="flex items-center gap-2 py-3">
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span className="text-white text-sm">{t("myTickets.addGoogleWallet", "Añadir a Google Wallet")}</span>
              </div>
            ) : (
              <img src={`${import.meta.env.BASE_URL}google-wallet-badge.png`} alt="Añadir a Google Wallet" className="h-12 w-auto" />
            )}
          </button>
        )}

        {walletError && !showTransfer && (
          <p className="text-red-400 text-xs text-center mt-1 px-2">{walletError}</p>
        )}

        {!archived && isValid && !showTransfer && (
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
