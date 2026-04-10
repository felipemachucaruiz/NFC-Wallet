const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_URL || "https://prod.tapee.app").replace(/\/+$/, "")
  : `${import.meta.env.BASE_URL}_srv`;
const ATTENDEE_API_URL = (import.meta.env.VITE_ATTENDEE_API_URL || "https://attendee.tapee.app").replace(/\/+$/, "");

function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

function attendeeApiUrl(path: string): string {
  return `${ATTENDEE_API_URL}${path}`;
}

export interface LoginResult {
  token?: string;
  requires_2fa?: boolean;
  partial_token?: string;
}

export async function apiLogin(identifier: string, password: string): Promise<LoginResult> {
  const res = await fetch(apiUrl("/api/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Login failed");
  return data as LoginResult;
}

export async function apiVerify2FA(partialToken: string, code: string): Promise<{ token: string }> {
  const res = await fetch(apiUrl("/api/2fa/verify"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ partial_token: partialToken, totp_code: code }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "2FA verification failed");
  return data as { token: string };
}

export async function apiForgotPassword(email: string, source: "admin" | "attendee"): Promise<void> {
  const url = source === "attendee"
    ? attendeeApiUrl("/api/auth/forgot-password")
    : apiUrl("/api/auth/forgot-password");

  const body: Record<string, string> = { email };
  if (source === "attendee") {
    const origin = window.location.origin;
    const base = import.meta.env.BASE_URL ?? "/";
    const resetPath = base.replace(/\/$/, "") + "/reset-password";
    body.redirectBaseUrl = `${origin}${resetPath}`;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as Record<string, string>).error ?? "Request failed");
  }
}

export async function apiUploadEventImage(
  eventId: string,
  imageType: "cover" | "flyer",
  file: File,
): Promise<{ imageUrl: string }> {
  const token = localStorage.getItem("tapee_admin_token");
  const formData = new FormData();
  formData.append("image", file);
  const res = await fetch(apiUrl(`/api/events/${eventId}/image/${imageType}`), {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Upload failed");
  return data as { imageUrl: string };
}

const AUTH_TOKEN_KEY = "tapee_admin_token";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

export async function apiFetchEventDays(eventId: string) {
  const res = await fetch(apiUrl(`/api/events/${eventId}/days`), { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to fetch event days");
  return data.days as Array<{ id: string; eventId: string; date: string; label: string | null; doorsOpenAt: string | null; doorsCloseAt: string | null; displayOrder: number; createdAt: string }>;
}

export async function apiCreateEventDay(eventId: string, body: { date: string; label?: string; doorsOpenAt?: string; doorsCloseAt?: string; displayOrder?: number }) {
  const res = await fetch(apiUrl(`/api/events/${eventId}/days`), { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to create event day");
  return data;
}

export async function apiUpdateEventDay(eventId: string, dayId: string, body: Record<string, unknown>) {
  const res = await fetch(apiUrl(`/api/events/${eventId}/days/${dayId}`), { method: "PATCH", headers: authHeaders(), body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to update event day");
  return data;
}

export async function apiDeleteEventDay(eventId: string, dayId: string) {
  const res = await fetch(apiUrl(`/api/events/${eventId}/days/${dayId}`), { method: "DELETE", headers: authHeaders() });
  if (!res.ok) { const data = await res.json(); throw new Error(data.error ?? "Failed to delete event day"); }
}

export async function apiFetchVenues(eventId: string) {
  const res = await fetch(apiUrl(`/api/events/${eventId}/venues`), { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to fetch venues");
  return data.venues as Array<{ id: string; eventId: string; name: string; address: string | null; city: string | null; latitude: string | null; longitude: string | null; floorplanImageUrl: string | null }>;
}

export async function apiCreateVenue(eventId: string, body: { name: string; address?: string; city?: string }) {
  const res = await fetch(apiUrl(`/api/events/${eventId}/venues`), { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to create venue");
  return data;
}

export async function apiFetchSections(eventId: string, venueId: string) {
  const res = await fetch(apiUrl(`/api/events/${eventId}/venues/${venueId}/sections`), { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to fetch sections");
  return data.sections as Array<{ id: string; venueId: string; name: string; capacity: number | null; totalTickets: number; soldTickets: number; colorHex: string | null; displayOrder: number }>;
}

export async function apiUploadVenueFloorplan(eventId: string, venueId: string, file: File) {
  const formData = new FormData();
  formData.append("image", file);
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  const res = await fetch(apiUrl(`/api/events/${eventId}/venues/${venueId}/floorplan`), {
    method: "POST",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to upload floorplan");
  return data as { floorplanImageUrl: string };
}

export async function apiCreateSection(eventId: string, venueId: string, body: { name: string; capacity?: number; totalTickets?: number; colorHex?: string; svgPathData?: string }) {
  const res = await fetch(apiUrl(`/api/events/${eventId}/venues/${venueId}/sections`), { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to create section");
  return data;
}

export async function apiFetchTicketTypes(eventId: string) {
  const res = await fetch(apiUrl(`/api/events/${eventId}/ticket-types`), { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to fetch ticket types");
  return data.ticketTypes as Array<{ id: string; eventId: string; sectionId: string | null; name: string; description: string | null; price: number; serviceFee: number; quantity: number; soldCount: number; saleStart: string | null; saleEnd: string | null; isActive: boolean; validEventDayIds: string[] }>;
}

export async function apiCreateTicketType(eventId: string, body: { name: string; price: number; serviceFee?: number; quantity: number; sectionId?: string; saleStart?: string; saleEnd?: string; validEventDayIds?: string[] }) {
  const res = await fetch(apiUrl(`/api/events/${eventId}/ticket-types`), { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to create ticket type");
  return data;
}

export async function apiUpdateTicketType(eventId: string, typeId: string, body: Record<string, unknown>) {
  const res = await fetch(apiUrl(`/api/events/${eventId}/ticket-types/${typeId}`), { method: "PATCH", headers: authHeaders(), body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to update ticket type");
  return data;
}

export async function apiFetchTicketOrders(eventId: string) {
  const res = await fetch(apiUrl(`/api/events/${eventId}/ticket-orders`), { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to fetch orders");
  return data.orders as Array<{ id: string; buyerEmail: string; buyerName: string | null; totalAmount: number; ticketCount: number; paymentStatus: string; createdAt: string }>;
}

export async function apiFetchCheckinStats(eventId: string) {
  const res = await fetch(apiUrl(`/api/events/${eventId}/checkin-stats`), { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to fetch checkin stats");
  return data as { days: Array<{ dayId: string; dayLabel: string; date: string; totalCheckins: number; totalTickets: number }>; totalTickets: number };
}

export async function apiFetchPricingStages(eventId: string, typeId: string) {
  const res = await fetch(apiUrl(`/api/events/${eventId}/ticket-types/${typeId}/pricing-stages`), { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to fetch pricing stages");
  return data.stages as Array<{ id: string; ticketTypeId: string; name: string; price: number; startsAt: string; endsAt: string; displayOrder: number; createdAt: string }>;
}

export async function apiCreatePricingStage(eventId: string, typeId: string, body: { name: string; price: number; startsAt: string; endsAt: string; displayOrder?: number }) {
  const res = await fetch(apiUrl(`/api/events/${eventId}/ticket-types/${typeId}/pricing-stages`), { method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to create pricing stage");
  return data;
}

export async function apiUpdatePricingStage(eventId: string, typeId: string, stageId: string, body: Record<string, unknown>) {
  const res = await fetch(apiUrl(`/api/events/${eventId}/ticket-types/${typeId}/pricing-stages/${stageId}`), { method: "PATCH", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to update pricing stage");
  return data;
}

export async function apiDeletePricingStage(eventId: string, typeId: string, stageId: string) {
  const res = await fetch(apiUrl(`/api/events/${eventId}/ticket-types/${typeId}/pricing-stages/${stageId}`), { method: "DELETE", headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to delete pricing stage");
  return data;
}

export async function apiUpdateEvent(eventId: string, body: Record<string, unknown>) {
  const res = await fetch(apiUrl(`/api/events/${eventId}`), { method: "PATCH", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to update event");
  return data;
}

export interface GuestListData {
  id: string;
  eventId: string;
  name: string;
  slug: string;
  maxGuests: number;
  currentCount: number;
  isPublic: boolean;
  status: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GuestListEntryData {
  id: string;
  guestListId: string;
  name: string;
  email: string;
  phone: string | null;
  ticketId: string | null;
  orderId: string | null;
  createdAt: string;
}

export async function apiFetchGuestLists(eventId: string): Promise<GuestListData[]> {
  const res = await fetch(apiUrl(`/api/events/${eventId}/guest-lists`), { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to fetch guest lists");
  return data.guestLists as GuestListData[];
}

export async function apiCreateGuestList(eventId: string, body: { name: string; maxGuests: number; isPublic?: boolean; expiresAt?: string | null }) {
  const res = await fetch(apiUrl(`/api/events/${eventId}/guest-lists`), { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to create guest list");
  return data.guestList as GuestListData;
}

export async function apiUpdateGuestList(eventId: string, listId: string, body: Record<string, unknown>) {
  const res = await fetch(apiUrl(`/api/events/${eventId}/guest-lists/${listId}`), { method: "PATCH", headers: authHeaders(), body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to update guest list");
  return data.guestList as GuestListData;
}

export async function apiDeleteGuestList(eventId: string, listId: string) {
  const res = await fetch(apiUrl(`/api/events/${eventId}/guest-lists/${listId}`), { method: "DELETE", headers: authHeaders() });
  if (!res.ok) { const data = await res.json(); throw new Error(data.error ?? "Failed to delete guest list"); }
}

export async function apiFetchGuestListEntries(eventId: string, listId: string): Promise<GuestListEntryData[]> {
  const res = await fetch(apiUrl(`/api/events/${eventId}/guest-lists/${listId}/entries`), { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to fetch guest list entries");
  return data.entries as GuestListEntryData[];
}

export async function apiResetPassword(token: string, password: string, source: "admin" | "attendee"): Promise<void> {
  const url = source === "attendee"
    ? attendeeApiUrl("/api/auth/reset-password")
    : apiUrl("/api/auth/reset-password");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as Record<string, string>).error ?? "Reset failed");
  }
}
