import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { Ticket, Calendar, MapPin, QrCode, Apple, Smartphone, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";
import type { UserTicket, OrderData } from "@/data/types";

const MOCK_TICKETS: UserTicket[] = [
  {
    id: "tkt-001",
    eventId: "evt-001",
    eventName: "Estéreo Picnic 2026",
    eventDate: "2026-11-15",
    venueName: "Parque Simón Bolívar",
    sectionName: "General",
    ticketTypeName: "Abono 3 días - General",
    validDays: "Viernes, Sábado, Domingo",
    status: "valid",
    qrCode: "TAPEE-EP2026-001-GEN",
    dayStatuses: [
      { day: "Viernes 15 Nov", status: "upcoming" },
      { day: "Sábado 16 Nov", status: "upcoming" },
      { day: "Domingo 17 Nov", status: "upcoming" },
    ],
  },
  {
    id: "tkt-002",
    eventId: "evt-003",
    eventName: "Colombia vs Argentina",
    eventDate: "2026-10-12",
    venueName: "Estadio Metropolitano",
    sectionName: "Oriental",
    ticketTypeName: "Oriental",
    validDays: "12 Oct",
    status: "valid",
    qrCode: "TAPEE-COL-ARG-002",
  },
];

const MOCK_ORDERS: OrderData[] = [
  {
    id: "ORD-ABC123",
    eventId: "evt-001",
    eventName: "Estéreo Picnic 2026",
    createdAt: "2026-08-15T10:30:00-05:00",
    status: "completed",
    tickets: [MOCK_TICKETS[0]],
    total: 702000,
  },
  {
    id: "ORD-DEF456",
    eventId: "evt-003",
    eventName: "Colombia vs Argentina",
    createdAt: "2026-09-01T14:00:00-05:00",
    status: "completed",
    tickets: [MOCK_TICKETS[1]],
    total: 162000,
  },
];

export default function MyTickets() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [showQR, setShowQR] = useState<UserTicket | null>(null);

  if (!isAuthenticated) {
    navigate("/login?redirect=my-tickets");
    return null;
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold mb-6">{t("myTickets.title")}</h1>

        <Tabs defaultValue="tickets">
          <TabsList className="mb-6">
            <TabsTrigger value="tickets">{t("myTickets.title")}</TabsTrigger>
            <TabsTrigger value="orders">{t("myTickets.orderHistory")}</TabsTrigger>
          </TabsList>

          <TabsContent value="tickets">
            {MOCK_TICKETS.length === 0 ? (
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
                {MOCK_TICKETS.map((ticket) => (
                  <TicketCard key={ticket.id} ticket={ticket} onViewQR={() => setShowQR(ticket)} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="orders">
            <div className="space-y-4">
              {MOCK_ORDERS.map((order) => (
                <OrderCard key={order.id} order={order} />
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={!!showQR} onOpenChange={() => setShowQR(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("myTickets.viewQR")}</DialogTitle>
          </DialogHeader>
          {showQR && (
            <div className="text-center space-y-4">
              <div className="bg-white rounded-xl p-6 mx-auto w-fit">
                <div className="w-48 h-48 bg-gray-100 rounded-lg flex items-center justify-center">
                  <div className="grid grid-cols-8 gap-0.5 w-40 h-40">
                    {Array.from({ length: 64 }).map((_, i) => (
                      <div
                        key={i}
                        className={`w-full aspect-square ${Math.random() > 0.5 ? "bg-black" : "bg-white"}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <p className="font-mono text-sm text-muted-foreground">{showQR.qrCode}</p>
              <p className="text-sm">{showQR.eventName}</p>
              <p className="text-xs text-muted-foreground">{showQR.ticketTypeName} — {showQR.sectionName}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TicketCard({ ticket, onViewQR }: { ticket: UserTicket; onViewQR: () => void }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <Link href={`/event/${ticket.eventId}`}>
              <h3 className="font-semibold hover:text-primary transition-colors cursor-pointer">{ticket.eventName}</h3>
            </Link>
            <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
              <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {ticket.eventDate}</span>
              <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {ticket.venueName}</span>
            </div>
          </div>
          <Badge className={ticket.status === "valid" ? "bg-emerald-600/20 text-emerald-400 border-emerald-600/30" : "bg-gray-600/20 text-gray-400 border-gray-600/30"}>
            {ticket.status === "valid" ? t("myTickets.valid") : t("myTickets.used")}
          </Badge>
        </div>

        <div className="text-sm mb-3">
          <span className="text-muted-foreground">{ticket.ticketTypeName}</span>
          <span className="text-muted-foreground"> — {ticket.sectionName}</span>
          <p className="text-xs text-muted-foreground mt-0.5">{ticket.validDays}</p>
        </div>

        {ticket.dayStatuses && (
          <div className="mb-3">
            <button
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {ticket.dayStatuses.length} {t("event.days")}
            </button>
            {expanded && (
              <div className="mt-2 space-y-1.5">
                {ticket.dayStatuses.map((ds, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <div className={`w-2 h-2 rounded-full ${ds.status === "checked_in" ? "bg-emerald-400" : "bg-muted-foreground"}`} />
                    <span>{ds.day}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {ds.status === "checked_in" ? t("myTickets.checkedIn") : t("myTickets.upcoming")}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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

function OrderCard({ order }: { order: OrderData }) {
  const { t } = useTranslation();

  return (
    <div className="bg-card rounded-xl border border-border p-4 sm:p-5">
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="font-semibold text-sm">{t("myTickets.order")} {order.id}</p>
          <p className="text-xs text-muted-foreground">
            {new Date(order.createdAt).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <Badge className="bg-emerald-600/20 text-emerald-400 border-emerald-600/30 text-xs">
          {order.status}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">{order.eventName}</p>
      <div className="flex items-center justify-between mt-2 text-sm">
        <span className="text-muted-foreground">{order.tickets.length} {t("myTickets.tickets")}</span>
        <span className="font-bold text-primary">
          {new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 }).format(order.total)}
        </span>
      </div>
    </div>
  );
}
