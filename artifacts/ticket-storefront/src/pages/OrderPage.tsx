import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { fetchOrderStatus, formatCOP, type OrderStatus } from "@/lib/api";

export default function OrderPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [, setLocation] = useLocation();
  const [order, setOrder] = useState<OrderStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;

    function poll() {
      fetchOrderStatus(orderId!)
        .then((data) => {
          setOrder(data);
          setLoading(false);
          if (data.status === "pending") {
            setTimeout(poll, 5000);
          }
        })
        .catch((err) => {
          setError(err.message);
          setLoading(false);
        });
    }

    poll();
  }, [orderId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive text-lg mb-4">{error}</p>
          <button onClick={() => setLocation("/")} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg">
            Ir a eventos
          </button>
        </div>
      </div>
    );
  }

  const statusConfig: Record<string, { icon: string; title: string; description: string; color: string }> = {
    pending: {
      icon: "⏳",
      title: "Pago pendiente",
      description: "Tu pago está siendo procesado. Esta página se actualizará automáticamente.",
      color: "text-yellow-600",
    },
    confirmed: {
      icon: "✅",
      title: "¡Compra confirmada!",
      description: "Tus entradas han sido enviadas al correo electrónico de cada asistente. Revisa tu bandeja de entrada.",
      color: "text-green-600",
    },
    cancelled: {
      icon: "❌",
      title: "Pago cancelado",
      description: "El pago no se pudo procesar. Intenta nuevamente.",
      color: "text-red-600",
    },
  };

  const config = statusConfig[order?.status ?? "pending"] ?? statusConfig.pending;

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gray-900 text-white py-4">
        <div className="max-w-3xl mx-auto px-4">
          <h1 className="text-lg font-bold">Estado de la orden</h1>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-16 text-center">
        <span className="text-6xl block mb-6">{config.icon}</span>
        <h2 className={`text-2xl font-bold mb-3 ${config.color}`}>{config.title}</h2>
        <p className="text-muted-foreground mb-8">{config.description}</p>

        {order && (
          <div className="bg-card border border-card-border rounded-xl p-6 text-left mb-8">
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Orden</span>
                <span className="font-mono text-xs">{order.orderId.slice(0, 8)}...</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Entradas</span>
                <span className="font-semibold">{order.ticketCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total</span>
                <span className="font-bold">{formatCOP(order.totalAmount)}</span>
              </div>
            </div>
          </div>
        )}

        {order?.status === "pending" && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-8">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
            Verificando pago...
          </div>
        )}

        <button
          onClick={() => setLocation("/")}
          className="px-8 py-3 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 transition-opacity"
        >
          Ver más eventos
        </button>
      </main>

      <footer className="bg-gray-900 text-gray-400 text-center py-6 text-sm">
        <p>&copy; Tapee &middot; Eventos</p>
      </footer>
    </div>
  );
}
