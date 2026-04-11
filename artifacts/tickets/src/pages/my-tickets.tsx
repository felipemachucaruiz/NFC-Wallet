import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { Ticket, Calendar, MapPin, QrCode, Apple, Smartphone, Loader2, ArrowLeft, Clock, Tag, User, Mail, Phone } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";
import { fetchMyTickets, resolveImageUrl, type ApiTicket } from "@/lib/api";

function extractDominantColor(imageUrl: string): Promise<string> {
  return new Promise((resolve) => {
    if (!imageUrl) { resolve("rgba(90,50,180,0.4)"); return; }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 20;
        canvas.height = 20;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve("rgba(90,50,180,0.4)"); return; }
        ctx.drawImage(img, 0, 0, 20, 20);
        const data = ctx.getImageData(0, 0, 20, 20).data;
        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
          r += data[i]; g += data[i + 1]; b += data[i + 2]; count++;
        }
        r = Math.round(r / count);
        g = Math.round(g / count);
        b = Math.round(b / count);
        resolve(`rgba(${r},${g},${b},0.45)`);
      } catch { resolve("rgba(90,50,180,0.4)"); }
    };
    img.onerror = () => resolve("rgba(90,50,180,0.4)");
    img.src = imageUrl;
  });
}

export default function MyTickets() {
  const { t } = useTranslation();
  const { isAuthenticated, openAuthModal } = useAuth();
  const [, navigate] = useLocation();
  const [selectedTicket, setSelectedTicket] = useState<ApiTicket | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["my-tickets"],
    queryFn: fetchMyTickets,
    enabled: isAuthenticated,
    staleTime: 10_000,
  });

  if (!isAuthenticated) {
    openAuthModal("login", "my-tickets");
    navigate("/");
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
  const [dominantColor, setDominantColor] = useState("rgba(90,50,180,0.4)");
  const imageUrl = resolveImageUrl(ticket.eventCoverImage);

  useEffect(() => {
    if (imageUrl) extractDominantColor(imageUrl).then(setDominantColor);
  }, [imageUrl]);

  const isValid = ticket.status === "valid";

  return (
    <div
      className="rounded-2xl overflow-hidden cursor-pointer transition-transform hover:scale-[1.01] active:scale-[0.99]"
      style={{ backgroundColor: dominantColor }}
      onClick={onExpand}
    >
      <div className="relative h-44 overflow-hidden flex items-center justify-center">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="w-full h-full object-contain" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Ticket className="w-10 h-10 text-white/20" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/40" />
        <Badge
          className={`absolute top-3 right-3 ${isValid ? "bg-emerald-600/80 text-white border-emerald-500/50" : "bg-gray-600/80 text-gray-200 border-gray-500/50"}`}
        >
          {isValid ? t("myTickets.valid") : t("myTickets.used")}
        </Badge>
      </div>

      <div className="px-4 py-3 flex items-center gap-3" style={{ backgroundColor: "rgba(0,0,0,0.45)" }}>
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
          <p className="text-xs text-white/50 truncate">{ticket.ticketTypeName}</p>
          {ticket.eventStartsAt && (
            <p className="text-xs text-white/40 mt-0.5">
              {new Date(ticket.eventStartsAt).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          )}
        </div>
        <QrCode className="w-5 h-5 text-white/30" />
      </div>
    </div>
  );
}

function ETicketFull({ ticket }: { ticket: ApiTicket }) {
  const { t } = useTranslation();
  const [dominantColor, setDominantColor] = useState("rgba(90,50,180,0.4)");
  const imageUrl = resolveImageUrl(ticket.eventCoverImage);

  useEffect(() => {
    if (imageUrl) extractDominantColor(imageUrl).then(setDominantColor);
  }, [imageUrl]);

  const isValid = ticket.status === "valid";
  const startDate = ticket.eventStartsAt ? new Date(ticket.eventStartsAt) : null;

  return (
    <div className="rounded-3xl overflow-hidden" style={{ backgroundColor: dominantColor }}>
      <div className="relative h-56 overflow-hidden flex items-center justify-center" style={{ backgroundColor: dominantColor }}>
        {imageUrl ? (
          <img src={imageUrl} alt="" className="w-full h-full object-contain" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Ticket className="w-12 h-12 text-white/20" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/50" />
      </div>

      <div className="flex flex-col items-center -mt-16 relative z-10 pb-4">
        <div className="bg-white rounded-2xl p-4 shadow-2xl">
          {ticket.qrCodeToken ? (
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(ticket.qrCodeToken)}`}
              alt="QR Code"
              className="w-44 h-44"
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
        <div className="flex-1 border-t border-dashed border-white/20 mx-4" />
        <div className="absolute -right-3 w-6 h-6 rounded-full bg-background" />
      </div>

      <div className="px-5 pb-5 space-y-3" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
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
      </div>
    </div>
  );
}
