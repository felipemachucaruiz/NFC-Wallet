import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { fetchEventDetail, formatCOP, purchaseTickets, type EventDetail, type PurchaseRequest } from "@/lib/api";

interface CartItem {
  ticketTypeId: string;
  name: string;
  price: number;
  quantity: number;
}

interface AttendeeForm {
  name: string;
  email: string;
  phone: string;
  ticketTypeId: string;
}

export default function CheckoutPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [, setLocation] = useLocation();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [attendees, setAttendees] = useState<AttendeeForm[]>([]);
  const [step, setStep] = useState<"info" | "payment" | "processing">("info");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "nequi" | "pse">("nequi");
  const [nequiPhone, setNequiPhone] = useState("");
  const [pseBank, setPseBank] = useState("");
  const [pseLegalId, setPseLegalId] = useState("");
  const [pseLegalIdType, setPseLegalIdType] = useState<"CC" | "CE" | "NIT" | "PP" | "TI">("CC");

  useEffect(() => {
    const raw = sessionStorage.getItem("tapee_cart");
    const storedEventId = sessionStorage.getItem("tapee_event_id");
    if (!raw || storedEventId !== eventId) {
      setLocation(`/events/${eventId}`);
      return;
    }
    const items: CartItem[] = JSON.parse(raw);
    setCartItems(items);

    const forms: AttendeeForm[] = [];
    for (const item of items) {
      for (let i = 0; i < item.quantity; i++) {
        forms.push({ name: "", email: "", phone: "", ticketTypeId: item.ticketTypeId });
      }
    }
    setAttendees(forms);

    fetchEventDetail(eventId!)
      .then(setEvent)
      .finally(() => setLoading(false));
  }, [eventId, setLocation]);

  const totalAmount = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const totalTickets = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  function updateAttendee(index: number, field: keyof AttendeeForm, value: string) {
    setAttendees((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function isInfoValid() {
    return attendees.every((a) => a.name.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email));
  }

  function isPaymentValid() {
    if (paymentMethod === "nequi") return /^\d{10}$/.test(nequiPhone.replace(/\s/g, ""));
    if (paymentMethod === "pse") return pseBank.length > 0 && pseLegalId.length > 0;
    return false;
  }

  async function handlePurchase() {
    if (!eventId) return;
    setSubmitting(true);
    setError(null);
    setStep("processing");

    try {
      const buyerAttendee = attendees[0];
      const purchaseData: PurchaseRequest = {
        buyerName: buyerAttendee.name,
        buyerEmail: buyerAttendee.email,
        attendees: attendees.map((a) => ({
          name: a.name,
          email: a.email,
          phone: a.phone || undefined,
          ticketTypeId: a.ticketTypeId,
        })),
        paymentMethod,
      };

      if (paymentMethod === "nequi") {
        purchaseData.phoneNumber = nequiPhone.replace(/\s/g, "");
      } else if (paymentMethod === "pse") {
        purchaseData.bankCode = pseBank;
        purchaseData.userLegalId = pseLegalId;
        purchaseData.userLegalIdType = pseLegalIdType;
        purchaseData.redirectUrl = window.location.origin + import.meta.env.BASE_URL;
      }

      const result = await purchaseTickets(eventId, purchaseData);

      sessionStorage.removeItem("tapee_cart");
      sessionStorage.removeItem("tapee_event_id");
      sessionStorage.setItem("tapee_order", JSON.stringify(result));

      if (result.redirectUrl) {
        window.location.href = result.redirectUrl;
        return;
      }

      setLocation(`/order/${result.orderId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al procesar la compra");
      setStep("payment");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gray-900 text-white py-4">
        <div className="max-w-3xl mx-auto px-4 flex items-center gap-4">
          <button onClick={() => setLocation(`/events/${eventId}`)} className="text-white/70 hover:text-white">
            ← Volver
          </button>
          <h1 className="text-lg font-bold">{event?.event.name}</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          {["Datos", "Pago"].map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              {i > 0 && <div className="flex-1 h-px bg-border w-8" />}
              <div className={`flex items-center gap-2 ${
                (i === 0 && step === "info") || (i === 1 && (step === "payment" || step === "processing"))
                  ? "text-primary font-bold"
                  : "text-muted-foreground"
              }`}>
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
                  (i === 0 && step === "info") || (i === 1 && (step === "payment" || step === "processing"))
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}>{i + 1}</span>
                <span className="text-sm">{label}</span>
              </div>
            </div>
          ))}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700 mb-6">
            {error}
          </div>
        )}

        {step === "info" && (
          <div className="space-y-6">
            <p className="text-muted-foreground text-sm">
              Ingresa los datos de cada asistente. Cada persona recibirá su entrada por correo.
            </p>
            {attendees.map((attendee, i) => {
              const ticketName = cartItems.find((c) => c.ticketTypeId === attendee.ticketTypeId)?.name || "";
              return (
                <div key={i} className="bg-card border border-card-border rounded-xl p-5">
                  <p className="text-xs text-primary font-semibold mb-3">
                    Entrada {i + 1} de {totalTickets} &middot; {ticketName}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">Nombre completo *</label>
                      <input
                        type="text"
                        value={attendee.name}
                        onChange={(e) => updateAttendee(i, "name", e.target.value)}
                        className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="Juan Pérez"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">Correo electrónico *</label>
                      <input
                        type="email"
                        value={attendee.email}
                        onChange={(e) => updateAttendee(i, "email", e.target.value)}
                        className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="juan@email.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">Teléfono</label>
                      <input
                        type="tel"
                        value={attendee.phone}
                        onChange={(e) => updateAttendee(i, "phone", e.target.value)}
                        className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="+57 300 123 4567"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
            <div className="flex justify-between items-center pt-4">
              <p className="text-lg font-bold">{formatCOP(totalAmount)}</p>
              <button
                onClick={() => setStep("payment")}
                disabled={!isInfoValid()}
                className="px-8 py-3 bg-primary text-primary-foreground font-bold rounded-xl disabled:opacity-50 hover:opacity-90 transition-opacity"
              >
                Continuar al pago
              </button>
            </div>
          </div>
        )}

        {step === "payment" && (
          <div className="space-y-6">
            <div className="bg-card border border-card-border rounded-xl p-6">
              <h3 className="text-lg font-bold mb-4">Resumen</h3>
              <div className="space-y-2 mb-4">
                {cartItems.map((item) => (
                  <div key={item.ticketTypeId} className="flex justify-between text-sm">
                    <span>{item.name} &times; {item.quantity}</span>
                    <span className="font-semibold">{formatCOP(item.price * item.quantity)}</span>
                  </div>
                ))}
                <div className="border-t border-border pt-2 flex justify-between">
                  <span className="font-bold">Total</span>
                  <span className="font-bold text-lg">{formatCOP(totalAmount)}</span>
                </div>
              </div>
            </div>

            <div className="bg-card border border-card-border rounded-xl p-6">
              <h3 className="text-lg font-bold mb-4">Método de pago</h3>

              <div className="flex gap-3 mb-6">
                {(["nequi", "pse"] as const).map((method) => (
                  <button
                    key={method}
                    onClick={() => setPaymentMethod(method)}
                    className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-semibold transition-colors ${
                      paymentMethod === method
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {method === "nequi" ? "📱 Nequi" : "🏦 PSE"}
                  </button>
                ))}
              </div>

              {paymentMethod === "nequi" && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Número Nequi</label>
                  <input
                    type="tel"
                    value={nequiPhone}
                    onChange={(e) => setNequiPhone(e.target.value)}
                    className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="3001234567"
                    maxLength={10}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Ingresa tu número de teléfono Nequi (10 dígitos)</p>
                </div>
              )}

              {paymentMethod === "pse" && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Banco</label>
                    <select
                      value={pseBank}
                      onChange={(e) => setPseBank(e.target.value)}
                      className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="">Selecciona un banco</option>
                      <option value="1007">Bancolombia</option>
                      <option value="1009">Citibank</option>
                      <option value="1013">BBVA</option>
                      <option value="1019">Scotiabank</option>
                      <option value="1023">Banco de Occidente</option>
                      <option value="1032">Banco Caja Social</option>
                      <option value="1040">Banco Agrario</option>
                      <option value="1051">Davivienda</option>
                      <option value="1052">AV Villas</option>
                      <option value="1062">Banco Falabella</option>
                      <option value="1063">Banco Finandina</option>
                      <option value="1065">Banco Santander</option>
                      <option value="1066">Banco Cooperativo</option>
                      <option value="1507">Nequi</option>
                      <option value="1151">Rappipay</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">Tipo de documento</label>
                      <select
                        value={pseLegalIdType}
                        onChange={(e) => setPseLegalIdType(e.target.value as typeof pseLegalIdType)}
                        className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="CC">Cédula de Ciudadanía</option>
                        <option value="CE">Cédula de Extranjería</option>
                        <option value="NIT">NIT</option>
                        <option value="PP">Pasaporte</option>
                        <option value="TI">Tarjeta de Identidad</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">Número de documento</label>
                      <input
                        type="text"
                        value={pseLegalId}
                        onChange={(e) => setPseLegalId(e.target.value)}
                        className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="1234567890"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep("info")}
                className="flex-1 py-3 border border-border rounded-xl font-medium hover:bg-muted transition-colors"
              >
                ← Editar datos
              </button>
              <button
                onClick={handlePurchase}
                disabled={!isPaymentValid() || submitting}
                className="flex-1 py-3 bg-primary text-primary-foreground font-bold rounded-xl disabled:opacity-50 hover:opacity-90 transition-opacity"
              >
                Pagar {formatCOP(totalAmount)}
              </button>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              Al completar la compra, aceptas los términos y condiciones de Tapee. El pago se procesa a través de Wompi.
            </p>
          </div>
        )}

        {step === "processing" && (
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary mx-auto mb-6" />
            <p className="text-lg font-semibold">Procesando tu compra...</p>
            <p className="text-muted-foreground text-sm mt-2">No cierres esta ventana</p>
          </div>
        )}
      </main>
    </div>
  );
}
