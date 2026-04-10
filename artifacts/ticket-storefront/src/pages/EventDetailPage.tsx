import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { fetchEventDetail, formatCOP, formatDate, type EventDetail } from "@/lib/api";

interface CartItem {
  ticketTypeId: string;
  name: string;
  price: number;
  quantity: number;
}

export default function EventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [, setLocation] = useLocation();
  const [data, setData] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cart, setCart] = useState<Map<string, CartItem>>(new Map());

  useEffect(() => {
    if (!eventId) return;
    setLoading(true);
    fetchEventDetail(eventId)
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [eventId]);

  function updateCart(ticketTypeId: string, name: string, price: number, delta: number) {
    setCart((prev) => {
      const next = new Map(prev);
      const existing = next.get(ticketTypeId);
      const newQty = (existing?.quantity ?? 0) + delta;
      if (newQty <= 0) {
        next.delete(ticketTypeId);
      } else {
        next.set(ticketTypeId, { ticketTypeId, name, price, quantity: newQty });
      }
      return next;
    });
  }

  const cartItems = Array.from(cart.values());
  const totalAmount = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const totalTickets = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive text-lg mb-4">{error || "Evento no encontrado"}</p>
          <button onClick={() => setLocation("/")} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg">
            Volver a eventos
          </button>
        </div>
      </div>
    );
  }

  const { event, eventDays, venues, ticketTypes } = data;

  return (
    <div className="min-h-screen bg-background">
      <div className="relative">
        {event.coverImageUrl ? (
          <div className="h-64 md:h-80 overflow-hidden">
            <img src={event.coverImageUrl} alt={event.name} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-black/20" />
          </div>
        ) : (
          <div className="h-64 md:h-80 bg-gradient-to-br from-gray-900 to-gray-800" />
        )}
        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10 text-white">
          <div className="max-w-4xl mx-auto">
            <button
              onClick={() => setLocation("/")}
              className="mb-4 text-sm text-white/70 hover:text-white transition-colors flex items-center gap-1"
            >
              ← Todos los eventos
            </button>
            <h1 className="text-3xl md:text-4xl font-bold mb-2">{event.name}</h1>
            {event.venueAddress && (
              <p className="text-white/80 flex items-center gap-1">📍 {event.venueAddress}</p>
            )}
          </div>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            {eventDays.length > 0 && (
              <section>
                <h2 className="text-xl font-bold mb-4">Fechas</h2>
                <div className="flex flex-wrap gap-3">
                  {eventDays.map((day) => (
                    <div key={day.id} className="bg-card border border-card-border rounded-lg px-4 py-3 text-center">
                      <p className="text-sm font-semibold text-primary">{formatDate(day.date)}</p>
                      {day.label && <p className="text-xs text-muted-foreground">{day.label}</p>}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {(event.description || event.longDescription) && (
              <section>
                <h2 className="text-xl font-bold mb-4">Descripción</h2>
                <div className="prose prose-sm max-w-none text-muted-foreground">
                  <p className="whitespace-pre-wrap">{event.longDescription || event.description}</p>
                </div>
              </section>
            )}

            {venues.length > 0 && (
              <section>
                <h2 className="text-xl font-bold mb-4">Lugar</h2>
                {venues.map((venue) => (
                  <div key={venue.id} className="bg-card border border-card-border rounded-lg p-4">
                    <p className="font-semibold">{venue.name}</p>
                    {venue.address && <p className="text-sm text-muted-foreground">{venue.address}</p>}
                    {venue.city && <p className="text-sm text-muted-foreground">{venue.city}</p>}
                  </div>
                ))}
              </section>
            )}

            {event.minAge && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
                ⚠️ Edad mínima: {event.minAge} años
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-card border border-card-border rounded-xl p-6 sticky top-4">
              <h2 className="text-xl font-bold mb-4">Entradas</h2>

              {!event.ticketingEnabled ? (
                <p className="text-muted-foreground text-sm">La venta de entradas no está habilitada para este evento.</p>
              ) : event.salesChannel === "door" ? (
                <p className="text-muted-foreground text-sm">Las entradas solo se venden en la puerta del evento.</p>
              ) : ticketTypes.length === 0 ? (
                <p className="text-muted-foreground text-sm">No hay entradas disponibles en este momento.</p>
              ) : (
                <div className="space-y-4">
                  {ticketTypes.map((tt) => {
                    const inCart = cart.get(tt.ticketTypeId)?.quantity ?? 0;
                    const soldOut = tt.available <= 0;
                    const now = new Date();
                    const notYet = tt.saleStart && new Date(tt.saleStart) > now;
                    const ended = tt.saleEnd && new Date(tt.saleEnd) < now;

                    return (
                      <div key={tt.ticketTypeId} className="border border-border rounded-lg p-4">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-semibold text-sm">{tt.name}</p>
                            <p className="text-lg font-bold text-primary">{formatCOP(tt.price)}</p>
                          </div>
                          {soldOut ? (
                            <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-full font-medium">Agotado</span>
                          ) : notYet ? (
                            <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full font-medium">Próximamente</span>
                          ) : ended ? (
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full font-medium">Finalizado</span>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground mb-3">
                          {tt.available} disponibles
                        </p>
                        {!soldOut && !notYet && !ended && (
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => updateCart(tt.ticketTypeId, tt.name, tt.price, -1)}
                              disabled={inCart === 0}
                              className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-lg font-bold disabled:opacity-30 hover:bg-muted transition-colors"
                            >
                              −
                            </button>
                            <span className="w-6 text-center font-semibold">{inCart}</span>
                            <button
                              onClick={() => updateCart(tt.ticketTypeId, tt.name, tt.price, 1)}
                              disabled={inCart >= Math.min(tt.available, 10)}
                              className="w-8 h-8 rounded-full border border-primary bg-primary/10 text-primary flex items-center justify-center text-lg font-bold disabled:opacity-30 hover:bg-primary/20 transition-colors"
                            >
                              +
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {totalTickets > 0 && (
                    <div className="border-t border-border pt-4 space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{totalTickets} entrada{totalTickets > 1 ? "s" : ""}</span>
                        <span className="font-bold text-lg">{formatCOP(totalAmount)}</span>
                      </div>
                      <button
                        onClick={() => {
                          const cartData = JSON.stringify(cartItems);
                          sessionStorage.setItem("tapee_cart", cartData);
                          sessionStorage.setItem("tapee_event_id", eventId!);
                          setLocation(`/checkout/${eventId}`);
                        }}
                        className="w-full py-3 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 transition-opacity"
                      >
                        Continuar
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <footer className="bg-gray-900 text-gray-400 text-center py-6 text-sm mt-12">
        <p>&copy; Tapee &middot; Eventos</p>
      </footer>
    </div>
  );
}
