import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { API_BASE_URL, STAFF_API_BASE_URL, WOMPI_PUBLIC_KEY, WOMPI_BASE_URL } from "@/constants/domain";
import { useAuth } from "@/contexts/AuthContext";
import { fetchWithTimeout } from "@/utils/fetchWithTimeout";
import type {
  EventListItem,
  EventDetail,
  EventCategory,
  TicketAvailability,
  TicketPurchaseResult,
  MyTicket,
  PaymentMethod,
  AttendeeInfo,
} from "@/types/events";

function useAuthHeaders(): Record<string, string> {
  const { token } = useAuth();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function useApiFetch() {
  const { handleUnauthorized } = useAuth();

  return async function apiFetch<T>(
    url: string,
    headers: Record<string, string>,
    options?: RequestInit,
  ): Promise<T> {
    const res = await fetchWithTimeout(url, {
      ...options,
      headers: { ...headers, "Content-Type": "application/json", ...options?.headers },
      cache: "no-store",
    });

    if (res.status === 401) {
      const newToken = await handleUnauthorized();
      if (newToken) {
        const retryRes = await fetchWithTimeout(url, {
          ...options,
          headers: {
            ...headers,
            "Content-Type": "application/json",
            ...options?.headers,
            Authorization: `Bearer ${newToken}`,
          },
          cache: "no-store",
        });
        if (!retryRes.ok) {
          const body = await retryRes.json().catch(() => ({}));
          const msg = (body as { error?: string }).error || retryRes.statusText || `HTTP ${retryRes.status}`;
          throw new Error(msg);
        }
        return retryRes.json() as Promise<T>;
      }
      throw new Error("Sesión expirada");
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg = (body as { error?: string }).error || res.statusText || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return res.json() as Promise<T>;
  };
}

interface PublicEventRaw {
  id: string;
  name: string;
  slug?: string;
  description?: string;
  coverImageUrl?: string;
  flyerImageUrl?: string;
  category?: string;
  tags?: string[];
  venueAddress?: string;
  startsAt: string;
  endsAt?: string;
  latitude?: string;
  longitude?: string;
  salesChannel?: string;
  priceFrom?: number;
  priceTo?: number;
  eventDays?: Array<{ id: string; date: string; label: string }>;
  dayCount?: number;
}

function extractCity(venueAddress?: string): string {
  if (!venueAddress) return "";
  const parts = venueAddress.split(",").map((p) => p.trim());
  return parts.length >= 2 ? parts[parts.length - 2] : parts[0] || "";
}

function mapPublicEvent(raw: PublicEventRaw): EventListItem {
  return {
    id: raw.id,
    name: raw.name,
    coverImageUrl: raw.coverImageUrl
      ? raw.coverImageUrl.startsWith("http")
        ? raw.coverImageUrl
        : `${STAFF_API_BASE_URL}${raw.coverImageUrl}`
      : undefined,
    flyerImageUrl: raw.flyerImageUrl
      ? raw.flyerImageUrl.startsWith("http")
        ? raw.flyerImageUrl
        : `${STAFF_API_BASE_URL}${raw.flyerImageUrl}`
      : undefined,
    startsAt: raw.startsAt,
    endsAt: raw.endsAt,
    venueName: raw.venueAddress?.split(",")[0]?.trim() ?? "",
    venueAddress: raw.venueAddress ?? "",
    city: extractCity(raw.venueAddress),
    category: (raw.category as EventCategory) ?? "other",
    minPrice: raw.priceFrom ?? 0,
    maxPrice: raw.priceTo ?? 0,
    currencyCode: "COP",
    soldOut: false,
    multiDay: (raw.dayCount ?? 1) > 1,
    days: raw.eventDays?.map((d, i) => ({ dayNumber: i + 1, label: d.label, date: d.date })),
  };
}

export function useEventCatalogue(filters?: {
  search?: string;
  category?: string;
  city?: string;
  dateFilter?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.search) params.set("search", filters.search);
  if (filters?.category) params.set("category", filters.category);
  if (filters?.city) params.set("city", filters.city);
  if (filters?.dateFilter) {
    const now = new Date();
    if (filters.dateFilter === "upcoming") {
      params.set("dateFrom", now.toISOString());
    } else if (filters.dateFilter === "this_week") {
      const weekEnd = new Date(now);
      weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()));
      params.set("dateFrom", now.toISOString());
      params.set("dateTo", weekEnd.toISOString());
    } else if (filters.dateFilter === "this_month") {
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      params.set("dateFrom", now.toISOString());
      params.set("dateTo", monthEnd.toISOString());
    }
  }
  const qs = params.toString();
  const url = `${API_BASE_URL}/api/public/events${qs ? `?${qs}` : ""}`;

  return useQuery({
    queryKey: ["events", "catalogue", filters],
    queryFn: async () => {
      const res = await fetchWithTimeout(url, {
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
      }
      const data = await res.json() as { events: PublicEventRaw[] };
      return { events: data.events.map(mapPublicEvent) };
    },
    staleTime: 60_000,
  });
}

interface PublicEventDetailRaw {
  event: PublicEventRaw & {
    minAge?: number;
    longDescription?: string;
    ticketingEnabled?: boolean;
    currencyCode?: string;
  };
  eventDays?: Array<{ id: string; date: string; label: string; dayNumber?: number }>;
  venues?: Array<{ name: string; address?: string; city?: string; latitude?: string | number; longitude?: string | number; floorplanImageUrl?: string }>;
  sections?: Array<{ id: string; name: string; svgPathData?: string; colorHex?: string; soldTickets: number; totalTickets: number }>;
  ticketTypes?: Array<{
    ticketTypeId: string;
    name: string;
    currentPrice: number;
    serviceFee: number;
    available: number;
    total: number;
    saleStart?: string;
    saleEnd?: string;
    validEventDayIds?: string[];
    sectionId?: string;
  }>;
}

function mapPublicEventDetail(raw: PublicEventDetailRaw, days: PublicEventDetailRaw["eventDays"]): EventDetail {
  const e = raw.event;
  const venue = raw.venues?.[0];
  const venueName = venue?.name ?? e.venueAddress?.split(",")[0]?.trim() ?? "";
  const city = venue?.city ?? extractCity(e.venueAddress);
  const lat = venue?.latitude ?? e.latitude;
  const lng = venue?.longitude ?? e.longitude;

  const ticketTypes: EventDetail["ticketTypes"] = (raw.ticketTypes ?? []).map((tt) => {
    const avail: TicketAvailability = tt.available <= 0 ? "sold_out" : tt.available <= 10 ? "limited" : "available";
    const dayIds = tt.validEventDayIds ?? [];
    const validDays = dayIds.length > 0 && days
      ? dayIds.map((did) => {
          const idx = days.findIndex((d) => d.id === did);
          return idx >= 0 ? idx + 1 : 0;
        }).filter((n) => n > 0)
      : undefined;
    return {
      id: tt.ticketTypeId,
      name: tt.name,
      price: tt.currentPrice,
      serviceFee: tt.serviceFee,
      availability: avail,
      maxPerOrder: 10,
      validDays,
      sectionId: tt.sectionId,
    };
  });

  const floorplanImageUrl = venue?.floorplanImageUrl
    ? venue.floorplanImageUrl.startsWith("http")
      ? venue.floorplanImageUrl
      : `${STAFF_API_BASE_URL}${venue.floorplanImageUrl}`
    : undefined;

  let venueMap: EventDetail["venueMap"] | undefined;
  if (raw.sections && raw.sections.length > 0) {
    venueMap = {
      svgViewBox: "0 0 100 100",
      floorplanImageUrl,
      sections: raw.sections.map((sec) => {
        const sectionTTs = ticketTypes.filter((tt) => tt.sectionId === sec.id);
        const secAvail: TicketAvailability = sec.soldTickets >= sec.totalTickets ? "sold_out" : sec.totalTickets - sec.soldTickets <= 10 ? "limited" : "available";
        return {
          id: sec.id,
          name: sec.name,
          svgPathData: sec.svgPathData,
          color: sec.colorHex ?? "#888",
          availability: secAvail,
          ticketTypes: sectionTTs,
        };
      }),
    };
  }

  return {
    id: e.id,
    name: e.name,
    coverImageUrl: e.coverImageUrl
      ? e.coverImageUrl.startsWith("http") ? e.coverImageUrl : `${STAFF_API_BASE_URL}${e.coverImageUrl}`
      : undefined,
    flyerImageUrl: e.flyerImageUrl
      ? e.flyerImageUrl.startsWith("http") ? e.flyerImageUrl : `${STAFF_API_BASE_URL}${e.flyerImageUrl}`
      : undefined,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    venueName,
    venueAddress: venue?.address ?? e.venueAddress ?? "",
    city,
    category: (e.category as EventCategory) ?? "other",
    minPrice: e.priceFrom ?? 0,
    maxPrice: e.priceTo ?? 0,
    currencyCode: e.currencyCode ?? "COP",
    soldOut: ticketTypes.every((tt) => tt.availability === "sold_out"),
    multiDay: (days?.length ?? 0) > 1,
    days: days?.map((d, i) => ({ dayNumber: d.dayNumber ?? i + 1, label: d.label, date: d.date })),
    description: e.longDescription ?? e.description,
    minAge: e.minAge,
    latitude: lat != null ? Number(lat) : undefined,
    longitude: lng != null ? Number(lng) : undefined,
    timezone: "America/Bogota",
    ticketTypes,
    venueMap,
  };
}

export function useEventDetail(eventId: string) {
  return useQuery({
    queryKey: ["events", "detail", eventId],
    queryFn: async () => {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/public/events/${eventId}`, {
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
      }
      const data = await res.json() as PublicEventDetailRaw;
      return mapPublicEventDetail(data, data.eventDays);
    },
    enabled: !!eventId,
    staleTime: 60_000,
  });
}

export function usePurchaseTickets() {
  const headers = useAuthHeaders();
  const apiFetch = useApiFetch();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      eventId: string;
      tickets: Array<{
        ticketTypeId: string;
        attendee: AttendeeInfo;
      }>;
      unitSelections?: Array<{
        ticketTypeId: string;
        unitId: string;
      }>;
      paymentMethod: PaymentMethod;
      phoneNumber?: string;
      bankCode?: string;
      userLegalIdType?: string;
      userLegalId?: string;
      cardToken?: string;
    }) => {
      const { tickets, ...rest } = data;
      const body = {
        ...rest,
        attendees: tickets.map((tk) => ({
          ticketTypeId: tk.ticketTypeId,
          name: tk.attendee.name,
          email: tk.attendee.email,
          phone: tk.attendee.phone,
        })),
      };
      return apiFetch<TicketPurchaseResult>(
        `${API_BASE_URL}/api/tickets/purchase`,
        headers,
        { method: "POST", body: JSON.stringify(body) },
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tickets", "my"] });
    },
  });
}

export function useTicketPaymentStatus(orderId: string) {
  const headers = useAuthHeaders();
  const apiFetch = useApiFetch();
  return useQuery({
    queryKey: ["ticket-payment", "status", orderId],
    queryFn: () =>
      apiFetch<{ status: string; tickets?: Array<{ qrCode: string; attendeeEmail: string }> }>(
        `${API_BASE_URL}/api/tickets/orders/${orderId}/status`,
        headers,
      ),
    enabled: !!orderId && !!headers.Authorization,
    refetchInterval: false,
  });
}

export function useMyTickets() {
  const headers = useAuthHeaders();
  const apiFetch = useApiFetch();
  return useQuery({
    queryKey: ["tickets", "my"],
    queryFn: async () => {
      const data = await apiFetch<{ tickets: Array<Record<string, unknown>> }>(
        `${API_BASE_URL}/api/tickets/my-tickets`,
        headers,
      );
      const mapped: MyTicket[] = data.tickets.map((t) => ({
        id: t.id as string,
        eventId: t.eventId as string,
        eventName: (t.eventName as string) ?? "",
        eventCoverImageUrl: t.eventCoverImage
          ? (t.eventCoverImage as string).startsWith("http")
            ? (t.eventCoverImage as string)
            : `${STAFF_API_BASE_URL}${t.eventCoverImage}`
          : undefined,
        startsAt: (t.eventStartsAt as string) ?? "",
        endsAt: (t.eventEndsAt as string) ?? undefined,
        venueName: (t.venueAddress as string) ?? "",
        ticketTypeName: (t.ticketTypeName as string) ?? "",
        status: (t.status as MyTicket["status"]) ?? "active",
        qrCode: (t.qrCodeToken as string) ?? "",
        attendeeName: (t.attendeeName as string) ?? "",
        attendeeEmail: "",
        attendeePhone: "",
        purchasedByMe: true,
        currencyCode: (t.currencyCode as string) ?? "COP",
        price: 0,
      }));
      return { tickets: mapped };
    },
    enabled: !!headers.Authorization,
    staleTime: 30_000,
  });
}

export function useTicketDetail(ticketId: string) {
  const headers = useAuthHeaders();
  const apiFetch = useApiFetch();
  return useQuery({
    queryKey: ["tickets", "detail", ticketId],
    queryFn: () => apiFetch<MyTicket>(`${API_BASE_URL}/api/attendee/me/tickets/${ticketId}`, headers),
    enabled: !!ticketId && !!headers.Authorization,
    staleTime: 30_000,
  });
}

export function useTokenizeCard() {
  return useMutation({
    mutationFn: async (data: {
      number: string;
      cvc: string;
      expMonth: string;
      expYear: string;
      cardHolder: string;
    }) => {
      const res = await fetch(`${WOMPI_BASE_URL}/tokens/cards`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${WOMPI_PUBLIC_KEY}`,
        },
        body: JSON.stringify({
          number: data.number,
          cvc: data.cvc,
          exp_month: data.expMonth,
          exp_year: data.expYear,
          card_holder: data.cardHolder,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: { messages?: Record<string, string[]> } }).error?.messages
          ? "Datos de tarjeta inválidos"
          : `Error ${res.status}`);
      }
      const body = await res.json() as { data: { id: string } };
      return body.data.id;
    },
  });
}

export function useAddToWallet() {
  const headers = useAuthHeaders();
  const apiFetch = useApiFetch();
  return useMutation({
    mutationFn: (data: { ticketId: string; platform: "apple" | "google" }) =>
      apiFetch<{ passUrl: string }>(
        `${API_BASE_URL}/api/attendee/tickets/${data.ticketId}/wallet`,
        headers,
        { method: "POST", body: JSON.stringify({ platform: data.platform }) },
      ),
  });
}

export function useTransferTicket() {
  const headers = useAuthHeaders();
  const apiFetch = useApiFetch();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { ticketId: string; recipientName: string; recipientEmail: string; recipientPhone?: string }) =>
      apiFetch<{ success: boolean; ticketId: string }>(
        `${API_BASE_URL}/api/tickets/${data.ticketId}/transfer`,
        headers,
        { method: "POST", body: JSON.stringify({ recipientName: data.recipientName, recipientEmail: data.recipientEmail, recipientPhone: data.recipientPhone }) },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets", "my"] });
    },
  });
}
