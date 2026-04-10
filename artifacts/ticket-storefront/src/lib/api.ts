const API_BASE = import.meta.env.VITE_API_BASE_URL || "/attendee-api/api";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || body.message || `API error ${res.status}`);
  }
  return res.json();
}

export interface PublicEvent {
  id: string;
  name: string;
  description: string | null;
  coverImageUrl: string | null;
  category: string | null;
  tags: string[] | null;
  minAge: number | null;
  venueAddress: string | null;
  startsAt: string | null;
  endsAt: string | null;
  latitude: string | null;
  longitude: string | null;
  salesChannel: string | null;
  priceFrom: number;
  priceTo: number;
  eventDays: { id: string; date: string; label: string | null }[];
  dayCount: number;
}

export interface EventDetail {
  event: {
    id: string;
    name: string;
    description: string | null;
    longDescription: string | null;
    coverImageUrl: string | null;
    flyerImageUrl: string | null;
    category: string | null;
    tags: string[] | null;
    minAge: number | null;
    venueAddress: string | null;
    startsAt: string | null;
    endsAt: string | null;
    latitude: string | null;
    longitude: string | null;
    salesChannel: string | null;
    ticketingEnabled: boolean;
    currencyCode: string;
  };
  eventDays: { id: string; date: string; label: string | null; doorsOpenAt: string | null; doorsCloseAt: string | null }[];
  venues: { id: string; name: string; address: string | null; city: string | null }[];
  sections: { id: string; name: string; capacity: number | null; colorHex: string }[];
  ticketTypes: {
    ticketTypeId: string;
    name: string;
    price: number;
    available: number;
    total: number;
    saleStart: string | null;
    saleEnd: string | null;
    validEventDayIds: string[] | null;
    sectionId: string | null;
  }[];
}

export async function fetchEvents(params?: {
  search?: string;
  category?: string;
  city?: string;
  page?: number;
}): Promise<{ events: PublicEvent[]; page: number; limit: number }> {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  if (params?.category) qs.set("category", params.category);
  if (params?.city) qs.set("city", params.city);
  if (params?.page) qs.set("page", String(params.page));
  const query = qs.toString();
  return apiFetch(`/public/events${query ? `?${query}` : ""}`);
}

export async function fetchEventDetail(eventId: string): Promise<EventDetail> {
  return apiFetch(`/public/events/${eventId}`);
}

export function formatCOP(amount: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat("es-CO", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export interface PurchaseRequest {
  buyerName: string;
  buyerEmail: string;
  attendees: { name: string; email: string; phone?: string; ticketTypeId: string }[];
  paymentMethod: "card" | "nequi" | "pse";
  cardToken?: string;
  phoneNumber?: string;
  bankCode?: string;
  userLegalIdType?: "CC" | "CE" | "NIT" | "PP" | "TI";
  userLegalId?: string;
  installments?: number;
  redirectUrl?: string;
}

export interface PurchaseResponse {
  orderId: string;
  totalAmount: number;
  ticketCount: number;
  paymentMethod: string;
  wompiTransactionId: string | null;
  redirectUrl: string | null;
  status: string;
}

export async function purchaseTickets(eventId: string, data: PurchaseRequest): Promise<PurchaseResponse> {
  return apiFetch(`/public/events/${eventId}/purchase`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export interface OrderStatus {
  orderId: string;
  status: string;
  ticketCount: number;
  totalAmount: number;
}

export async function fetchOrderStatus(orderId: string): Promise<OrderStatus> {
  return apiFetch(`/public/orders/${orderId}/status`);
}
