import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { Ticket, Calendar, MapPin, QrCode, Apple, Smartphone, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";
import { fetchMyTickets, type ApiTicket } from "@/lib/api";

export default function MyTickets() {
  const { t } = useTranslation();
  const { isAuthenticated, openAuthModal } = useAuth();
  const [, navigate] = useLocation();
  const [showQR, setShowQR] = useState<ApiTicket | null>(null);

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
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
              <TicketCard key={ticket.id} ticket={ticket} onViewQR={() => setShowQR(ticket)} />
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!showQR} onOpenChange={() => setShowQR(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("myTickets.viewQR")}</DialogTitle>
          </DialogHeader>
          {showQR && (
            <div className="text-center space-y-4">
              <div className="bg-white rounded-xl p-6 mx-auto w-fit">
                {showQR.qrCodeToken ? (
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(showQR.qrCodeToken)}`}
                    alt="QR Code"
                    className="w-48 h-48"
                  />
                ) : (
                  <div className="w-48 h-48 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 text-sm">
                    QR pending
                  </div>
                )}
              </div>
              <p className="font-mono text-sm text-muted-foreground">{showQR.qrCodeToken || "Pending"}</p>
              <p className="text-sm">{showQR.eventName}</p>
              <p className="text-xs text-muted-foreground">{showQR.ticketTypeName}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TicketCard({ ticket, onViewQR }: { ticket: ApiTicket; onViewQR: () => void }) {
  const { t } = useTranslation();

  const isValid = ticket.status === "valid";

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <Link href={`/event/${ticket.eventId}`}>
              <h3 className="font-semibold hover:text-primary transition-colors cursor-pointer">{ticket.eventName || "Event"}</h3>
            </Link>
            <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
              {ticket.eventStartsAt && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {new Date(ticket.eventStartsAt).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              )}
            </div>
          </div>
          <Badge className={isValid ? "bg-emerald-600/20 text-emerald-400 border-emerald-600/30" : "bg-gray-600/20 text-gray-400 border-gray-600/30"}>
            {isValid ? t("myTickets.valid") : t("myTickets.used")}
          </Badge>
        </div>

        <div className="text-sm mb-3">
          <span className="text-muted-foreground">{ticket.ticketTypeName}</span>
          <p className="text-xs text-muted-foreground mt-0.5">{ticket.attendeeName}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onViewQR}>
            <QrCode className="w-3.5 h-3.5" />
            {t("myTickets.viewQR")}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Apple className="w-3.5 h-3.5" />
            {t("myTickets.addAppleWallet")}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Smartphone className="w-3.5 h-3.5" />
            {t("myTickets.addGoogleWallet")}
          </Button>
        </div>
      </div>
    </div>
  );
}
