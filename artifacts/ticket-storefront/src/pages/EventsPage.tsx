import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { fetchEvents, formatCOP, formatDate, type PublicEvent } from "@/lib/api";

function EventCard({ event }: { event: PublicEvent }) {
  const [, setLocation] = useLocation();

  return (
    <div
      className="group cursor-pointer bg-card border border-card-border rounded-xl overflow-hidden transition-all hover:shadow-lg hover:-translate-y-1"
      onClick={() => setLocation(`/events/${event.id}`)}
    >
      <div className="aspect-[16/9] bg-muted overflow-hidden">
        {event.coverImageUrl ? (
          <img
            src={event.coverImageUrl}
            alt={event.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
            <span className="text-4xl">🎵</span>
          </div>
        )}
      </div>
      <div className="p-5">
        {event.startsAt && (
          <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-1">
            {formatDate(event.startsAt)}
          </p>
        )}
        <h3 className="text-lg font-bold text-foreground mb-1 line-clamp-2">
          {event.name}
        </h3>
        {event.venueAddress && (
          <p className="text-sm text-muted-foreground mb-3 line-clamp-1">
            📍 {event.venueAddress}
          </p>
        )}
        <div className="flex items-center justify-between">
          <div className="text-sm">
            {event.priceFrom > 0 ? (
              <span className="font-semibold text-foreground">
                {event.priceFrom === event.priceTo
                  ? formatCOP(event.priceFrom)
                  : `${formatCOP(event.priceFrom)} - ${formatCOP(event.priceTo)}`}
              </span>
            ) : (
              <span className="font-semibold text-green-600">Gratis</span>
            )}
          </div>
          {event.dayCount > 1 && (
            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
              {event.dayCount} días
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function EventsPage() {
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setLoading(true);
      setError(null);
      fetchEvents({ search: search || undefined })
        .then((data) => setEvents(data.events))
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-to-b from-gray-900 via-gray-900 to-gray-800 text-white">
        <div className="max-w-6xl mx-auto px-4 py-12 text-center">
          <img
            src={`${import.meta.env.BASE_URL}tapee-logo.png`}
            alt="Tapee"
            className="h-10 mx-auto mb-4"
          />
          <p className="text-cyan-400 text-lg font-semibold tracking-wide mb-1">Eventos</p>
          <p className="text-gray-400 text-sm mb-8">
            Descubre y compra entradas para los mejores eventos
          </p>
          <div className="max-w-md mx-auto">
            <input
              type="search"
              placeholder="Buscar eventos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-5 py-3 rounded-xl bg-white/10 backdrop-blur border border-white/20 text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent"
            />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-10">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-card border border-card-border rounded-xl overflow-hidden animate-pulse">
                <div className="aspect-[16/9] bg-muted" />
                <div className="p-5 space-y-3">
                  <div className="h-3 bg-muted rounded w-1/3" />
                  <div className="h-5 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-16">
            <p className="text-destructive text-lg">{error}</p>
            <button
              onClick={() => setSearch("")}
              className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg"
            >
              Reintentar
            </button>
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-16">
            <span className="text-5xl mb-4 block">🎶</span>
            <p className="text-xl text-muted-foreground">
              {search ? "No se encontraron eventos" : "No hay eventos disponibles"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </main>

      <footer className="bg-gray-900 text-gray-400 text-center py-6 text-sm">
        <p>&copy; Tapee &middot; Eventos</p>
      </footer>
    </div>
  );
}
