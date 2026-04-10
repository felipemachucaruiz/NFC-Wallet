import { useQuery } from "@tanstack/react-query";
import { useListEvents } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Ticket, Search, Calendar, MapPin, ArrowRight, Loader2, BarChart3, ShoppingCart, DollarSign } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useEventContext } from "@/contexts/event-context";
import { formatCurrency } from "@/lib/currency";
import { useState, useMemo } from "react";

type EventRow = {
  id: string;
  name: string;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  currencyCode: string;
  ticketingEnabled: boolean;
  venueAddress: string | null;
  city?: string | null;
};

export default function Ticketing() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { setEventId } = useEventContext();
  const { data: eventsData, isLoading } = useListEvents();
  const [search, setSearch] = useState("");

  const events = useMemo(() => {
    const all = (eventsData?.events ?? []) as unknown as EventRow[];
    const ticketingEvents = all.filter((ev) => ev.ticketingEnabled);
    if (!search.trim()) return ticketingEvents;
    const q = search.toLowerCase();
    return ticketingEvents.filter(
      (ev) =>
        ev.name.toLowerCase().includes(q) ||
        (ev.venueAddress || "").toLowerCase().includes(q)
    );
  }, [eventsData, search]);

  const handleManageEvent = (eventId: string) => {
    setEventId(eventId);
    setLocation("/event-sales-dashboard");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("ticketingHub.title", "Boletería")}</h1>
          <p className="text-muted-foreground mt-1">
            {t("ticketingHub.subtitle", "Gestiona la boletería de tus eventos. Selecciona un evento para configurar.")}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Ticket className="w-4 h-4" /> {t("ticketingHub.totalEvents", "Eventos con Boletería")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{events.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <BarChart3 className="w-4 h-4" /> {t("ticketingHub.activeEvents", "Eventos Activos")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{events.filter((e) => e.active).length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Calendar className="w-4 h-4" /> {t("ticketingHub.upcomingEvents", "Próximos Eventos")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {events.filter((e) => e.startsAt && new Date(e.startsAt) > new Date()).length}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("ticketingHub.searchPlaceholder", "Buscar evento...")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {events.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Ticket className="w-12 h-12 mx-auto text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">
              {search
                ? t("ticketingHub.noResults", "No se encontraron eventos.")
                : t("ticketingHub.noTicketingEvents", "No hay eventos con boletería habilitada.")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {events.map((ev) => {
            const isUpcoming = ev.startsAt && new Date(ev.startsAt) > new Date();
            const isPast = ev.endsAt && new Date(ev.endsAt) < new Date();
            return (
              <Card
                key={ev.id}
                className="hover:border-primary/50 transition-colors cursor-pointer group"
                onClick={() => handleManageEvent(ev.id)}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-semibold text-base leading-tight flex-1 mr-2">{ev.name}</h3>
                    <div className="flex items-center gap-1.5">
                      {ev.active ? (
                        <Badge className="bg-emerald-600/20 text-emerald-400 border-emerald-600/30 text-xs">
                          {t("common.active")}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          {t("common.inactive")}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {ev.startsAt && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>
                        {new Date(ev.startsAt).toLocaleDateString("es-CO", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                        {ev.endsAt && ev.endsAt !== ev.startsAt && (
                          <>
                            {" – "}
                            {new Date(ev.endsAt).toLocaleDateString("es-CO", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </>
                        )}
                      </span>
                    </div>
                  )}

                  {ev.venueAddress && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                      <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{ev.venueAddress}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <div className="flex items-center gap-2">
                      {isUpcoming && (
                        <Badge variant="outline" className="text-xs text-primary border-primary/30">
                          {t("ticketingHub.upcoming", "Próximo")}
                        </Badge>
                      )}
                      {isPast && (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          {t("ticketingHub.past", "Finalizado")}
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-primary font-medium flex items-center gap-1 group-hover:underline">
                      {t("ticketingHub.manage", "Gestionar")}
                      <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
