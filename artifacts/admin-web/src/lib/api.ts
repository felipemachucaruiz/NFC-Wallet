const API_BASE = `${import.meta.env.BASE_URL}_srv`;
const ATTENDEE_BASE = `${import.meta.env.BASE_URL}_att`;

function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

function attendeeApiUrl(path: string): string {
  return `${ATTENDEE_BASE}${path}`;
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
  imageType: "cover" | "flyer" | "floating_graphic",
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

export async function apiCreateSection(eventId: string, venueId: string, body: { name: string; capacity?: number; totalTickets?: number; colorHex?: string; sectionType?: string; svgPathData?: string }) {
  const res = await fetch(apiUrl(`/api/events/${eventId}/venues/${venueId}/sections`), { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to create section");
  return data;
}

export async function apiUpdateSection(eventId: string, venueId: string, sectionId: string, body: { name?: string; capacity?: number; totalTickets?: number; colorHex?: string; sectionType?: string; svgPathData?: string }) {
  const res = await fetch(apiUrl(`/api/events/${eventId}/venues/${venueId}/sections/${sectionId}`), { method: "PATCH", headers: authHeaders(), body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to update section");
  return data;
}

export async function apiDeleteSection(eventId: string, venueId: string, sectionId: string) {
  const res = await fetch(apiUrl(`/api/events/${eventId}/venues/${venueId}/sections/${sectionId}`), { method: "DELETE", headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to delete section");
  return data;
}

export async function apiFetchTicketTypeUnits(eventId: string, typeId: string) {
  const res = await fetch(apiUrl(`/api/events/${eventId}/ticket-types/${typeId}/units`), { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to fetch units");
  return data.units as Array<{ id: string; ticketTypeId: string; unitNumber: number; unitLabel: string; status: string; mapX: string | null; mapY: string | null }>;
}

export async function apiUpdateUnitPositions(eventId: string, typeId: string, positions: { unitId: string; mapX: number | null; mapY: number | null }[]) {
  const res = await fetch(apiUrl(`/api/events/${eventId}/ticket-types/${typeId}/units/positions`), { method: "PATCH", headers: authHeaders(), body: JSON.stringify({ positions }) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to update unit positions");
  return data;
}

export async function apiFetchTicketTypes(eventId: string) {
  const res = await fetch(apiUrl(`/api/events/${eventId}/ticket-types`), { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to fetch ticket types");
  return data.ticketTypes as Array<{ id: string; eventId: string; sectionId: string | null; name: string; description: string | null; price: number; serviceFee: number; serviceFeeType: string; quantity: number; soldCount: number; saleStart: string | null; saleEnd: string | null; isActive: boolean; isHidden: boolean; validEventDayIds: string[]; isNumberedUnits?: boolean; unitLabel?: string; ticketsPerUnit?: number }>;
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

export async function apiFetchTicketServiceSummary(eventId: string) {
  const res = await fetch(apiUrl(`/api/events/${eventId}/ticket-service-summary`), { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to fetch ticket service summary");
  return data as {
    byTicketType: Array<{
      ticketTypeId: string;
      name: string;
      serviceFee: number;
      serviceFeeType: string;
      ticketsSold: number;
      totalUnitRevenue: number;
      totalFeeCollected: number;
    }>;
    totalCollected: number;
  };
}

export async function apiFetchTicketOrders(eventId: string) {
  const res = await fetch(apiUrl(`/api/events/${eventId}/ticket-orders`), { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to fetch orders");
  return data.orders as Array<{ id: string; buyerEmail: string; buyerName: string | null; totalAmount: number; ticketCount: number; paymentStatus: string; createdAt: string }>;
}

export interface AdminTicket {
  id: string;
  orderId: string;
  ticketTypeId: string | null;
  attendeeName: string;
  attendeeEmail: string;
  attendeePhone: string | null;
  attendeeDateOfBirth: string | null;
  attendeeSex: string | null;
  attendeeIdDocument: string | null;
  attendeeUserId: string | null;
  shirtSize?: string | null;
  bloodType?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  eps?: string | null;
  raceNumber?: number | null;
  unitPrice: number;
  serviceFeeAmount: number;
  status: string;
  createdAt: string;
}

export async function apiFetchTickets(eventId: string) {
  const res = await fetch(apiUrl(`/api/events/${eventId}/tickets`), { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to fetch tickets");
  return data.tickets as AdminTicket[];
}

export async function apiFetchCheckinStats(eventId: string) {
  const res = await fetch(apiUrl(`/api/events/${eventId}/checkin-stats`), { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to fetch checkin stats");
  return data as {
    days: Array<{ dayId: string; dayLabel: string; date: string; totalCheckins: number; totalTickets: number }>;
    totalTickets: number;
    sections?: Array<{
      sectionId: string;
      sectionName: string;
      color: string;
      sectionType: string;
      totalTickets: number;
      totalCheckins: number;
      hasNumberedUnits: boolean;
      units: Array<{
        unitId: string;
        unitNumber: number;
        unitLabel: string;
        ticketsPerUnit: number;
        totalCheckins: number;
        status: string | null;
      }>;
    }>;
  };
}

export async function apiFetchPricingStages(eventId: string, typeId: string) {
  const res = await fetch(apiUrl(`/api/events/${eventId}/ticket-types/${typeId}/pricing-stages`), { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to fetch pricing stages");
  return data.stages as Array<{ id: string; ticketTypeId: string; name: string; price: number; quantity: number | null; soldCount: number; startsAt: string; endsAt: string; displayOrder: number; createdAt: string }>;
}

export async function apiCreatePricingStage(eventId: string, typeId: string, body: { name: string; price: number; quantity?: number | null; startsAt: string; endsAt: string; displayOrder?: number }) {
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

export interface EventSummary {
  id: string;
  name: string;
  startsAt: string | null;
  endsAt: string | null;
  promoterCompanyName: string | null;
  category?: string | null;
  currencyCode?: string;
  platformCommissionRate?: string | null;
  raceNumberStart?: number | null;
  raceNumberEnd?: number | null;
}

export async function apiFetchEvent(eventId: string): Promise<EventSummary> {
  const res = await fetch(apiUrl(`/api/events/${eventId}`), { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to fetch event");
  return data as EventSummary;
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
  ticketTypeId: string | null;
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

export async function apiCreateGuestList(eventId: string, body: { name: string; maxGuests: number; isPublic?: boolean; expiresAt?: string | null; ticketTypeId?: string | null }) {
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

export interface WhatsAppTemplate {
  id: string;
  name: string;
  gupshupTemplateId: string;
  description: string | null;
  language: string;
  category: string;
  status: string;
  parameters: Array<{ name: string; description: string; example?: string }>;
  buttons: Array<{ type: "url" | "phone"; text: string }> | null;
  bodyPreview: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsAppTriggerMapping {
  mapping: {
    id: string;
    triggerType: string;
    templateId: string;
    eventId: string | null;
    active: boolean;
    priority: number;
    parameterMappings: Array<{ position: number; field: string }>;
    createdAt: string;
    updatedAt: string;
  };
  templateName: string | null;
  templateGupshupId: string | null;
}

export interface WatiTemplate {
  id: string;
  elementName: string;
  category: string;
  languageCode: string;
  status: string;
  templateType: string;
  data: string;
  meta: string;
}

/** @deprecated Use WatiTemplate */
export type GupshupTemplate = WatiTemplate;

export async function apiFetchWatiTemplates(): Promise<WatiTemplate[]> {
  const res = await fetch(apiUrl("/api/whatsapp-templates/wati"), { headers: authHeaders() });
  const data = await res.json();
  if (res.status === 503) return []; // WATI not configured — return empty, don't throw
  if (!res.ok) throw new Error(data.error ?? "Failed to fetch WATI templates");
  return data.templates;
}

/** @deprecated Use apiFetchWatiTemplates */
export const apiFetchGupshupTemplates = apiFetchWatiTemplates;

export async function apiFetchWhatsAppTemplates(): Promise<WhatsAppTemplate[]> {
  const res = await fetch(apiUrl("/api/whatsapp-templates"), { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to fetch templates");
  return data.templates;
}

export async function apiCreateWhatsAppTemplate(body: Omit<WhatsAppTemplate, "id" | "createdAt" | "updatedAt">): Promise<WhatsAppTemplate> {
  const res = await fetch(apiUrl("/api/whatsapp-templates"), { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to create template");
  return data.template;
}

export async function apiUpdateWhatsAppTemplate(id: string, body: Record<string, unknown>): Promise<WhatsAppTemplate> {
  const res = await fetch(apiUrl(`/api/whatsapp-templates/${id}`), { method: "PATCH", headers: authHeaders(), body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to update template");
  return data.template;
}

export async function apiDeleteWhatsAppTemplate(id: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/whatsapp-templates/${id}`), { method: "DELETE", headers: authHeaders() });
  if (!res.ok) { const data = await res.json(); throw new Error(data.error ?? "Failed to delete template"); }
}

export async function apiFetchWhatsAppTriggerMappings(): Promise<WhatsAppTriggerMapping[]> {
  const res = await fetch(apiUrl("/api/whatsapp-trigger-mappings"), { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to fetch trigger mappings");
  return data.mappings;
}

export async function apiCreateWhatsAppTriggerMapping(body: { triggerType: string; templateId: string; eventId?: string | null; active?: boolean; priority?: number; parameterMappings?: Array<{ position: number; field: string }> }): Promise<WhatsAppTriggerMapping> {
  const res = await fetch(apiUrl("/api/whatsapp-trigger-mappings"), { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to create trigger mapping");
  return data.mapping;
}

export async function apiUpdateWhatsAppTriggerMapping(id: string, body: Record<string, unknown>): Promise<WhatsAppTriggerMapping> {
  const res = await fetch(apiUrl(`/api/whatsapp-trigger-mappings/${id}`), { method: "PATCH", headers: authHeaders(), body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to update trigger mapping");
  return data.mapping;
}

export async function apiDeleteWhatsAppTriggerMapping(id: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/whatsapp-trigger-mappings/${id}`), { method: "DELETE", headers: authHeaders() });
  if (!res.ok) { const data = await res.json(); throw new Error(data.error ?? "Failed to delete trigger mapping"); }
}

export interface WhatsAppMessageLog {
  id: string;
  destination: string;
  messageType: "template" | "text" | "document" | "image";
  templateId: string | null;
  templateName: string | null;
  triggerType: string | null;
  status: "sent" | "failed" | "pending";
  errorMessage: string | null;
  payload: Record<string, unknown> | null;
  orderId: string | null;
  ticketId: string | null;
  eventId: string | null;
  attendeeName: string | null;
  gupshupMessageId: string | null;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface MessageLogResponse {
  messages: WhatsAppMessageLog[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export async function apiFetchMessageLog(params: { page?: number; limit?: number; status?: string; search?: string } = {}): Promise<MessageLogResponse> {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);
  const res = await fetch(apiUrl(`/api/whatsapp-message-log?${query.toString()}`), { headers: authHeaders() });
  if (!res.ok) { const data = await res.json(); throw new Error(data.error ?? "Failed to fetch message log"); }
  return res.json();
}

export async function apiFetchMessageLogStats(): Promise<Record<string, number>> {
  const res = await fetch(apiUrl("/api/whatsapp-message-log/stats"), { headers: authHeaders() });
  if (!res.ok) { const data = await res.json(); throw new Error(data.error ?? "Failed to fetch stats"); }
  return res.json();
}

export async function apiResendMessage(id: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const res = await fetch(apiUrl(`/api/whatsapp-message-log/${id}/resend`), { method: "POST", headers: authHeaders() });
  return res.json();
}

export interface ReminderSchedule {
  id: string;
  event_id: string | null;
  days_before: number;
  template_id: string | null;
  template_mapping_id: string | null;
  enabled: boolean;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
  template_name: string | null;
  gupshup_template_id: string | null;
}

export async function apiFetchReminderSchedules(eventId: string): Promise<ReminderSchedule[]> {
  const res = await fetch(apiUrl(`/api/whatsapp-reminder-schedules?eventId=${encodeURIComponent(eventId)}`), { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to fetch schedules");
  return data.schedules;
}

export async function apiUpsertReminderSchedule(body: { eventId?: string | null; daysBefore: number; templateId?: string | null; enabled?: boolean }): Promise<{ id: string }> {
  const res = await fetch(apiUrl("/api/whatsapp-reminder-schedules"), { method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to save schedule");
  return data;
}

export async function apiUpdateReminderSchedule(id: string, body: { templateId?: string | null; paramMappings?: Array<{ position: number; field: string }> | null; enabled?: boolean; resetSentAt?: boolean }): Promise<void> {
  const res = await fetch(apiUrl(`/api/whatsapp-reminder-schedules/${id}`), { method: "PATCH", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) { const data = await res.json(); throw new Error(data.error ?? "Failed to update schedule"); }
}

export async function apiDeleteReminderSchedule(id: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/whatsapp-reminder-schedules/${id}`), { method: "DELETE", headers: authHeaders() });
  if (!res.ok) { const data = await res.json(); throw new Error(data.error ?? "Failed to delete schedule"); }
}

export async function apiTestReminderSchedule(id: string, body: { phone: string; attendeeName?: string; eventId?: string }): Promise<{ ok: boolean; messageId?: string; dest?: string }> {
  const res = await fetch(apiUrl(`/api/whatsapp-reminder-schedules/${id}/test`), {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Test send failed");
  return data;
}

// ── Analytics ────────────────────────────────────────────────────────────────

export interface AnalyticsSummary {
  totalTopUps: number;
  totalSales: number;
  pendingBalance: number;
  transactionCount: number;
  topUpCount: number;
  braceletCount: number;
  ticketSales: number;
  ticketOrderCount: number;
}

export interface SalesByHourRow { hour: number; day: string; total: number; txCount: number; }
export interface TopProductRow { productId: string; productName: string; totalUnits: number; totalRevenue: number; totalCogs: number; grossProfit: number; profitMarginPercent: number; }
export interface TopMerchantRow { merchantId: string; merchantName: string; totalSales: number; totalCommission: number; totalNet: number; totalCogs: number; grossProfit: number; profitMarginPercent: number; txCount: number; }
export interface HeatmapRow { hour: number; day: string; dayNum: number; txCount: number; total: number; }
export interface StockAlertRow { inventoryId: string; locationId: string; locationName: string; eventId: string | null; productId: string; productName: string; quantityOnHand: number; restockTrigger: number; restockTargetQty: number; deficit: number; }

export async function apiFetchAnalyticsSummary(eventId: string): Promise<AnalyticsSummary> {
  const res = await fetch(apiUrl(`/api/analytics/summary?eventId=${encodeURIComponent(eventId)}`), { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to fetch analytics summary");
  return data as AnalyticsSummary;
}

export async function apiFetchAnalyticsSalesByHour(eventId: string): Promise<SalesByHourRow[]> {
  const res = await fetch(apiUrl(`/api/analytics/sales-by-hour?eventId=${encodeURIComponent(eventId)}`), { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to fetch sales by hour");
  return (data.salesByHour ?? []) as SalesByHourRow[];
}

export async function apiFetchAnalyticsTopProducts(eventId: string, limit = 10): Promise<TopProductRow[]> {
  const res = await fetch(apiUrl(`/api/analytics/top-products?eventId=${encodeURIComponent(eventId)}&limit=${limit}`), { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to fetch top products");
  return (data.topProducts ?? []) as TopProductRow[];
}

export async function apiFetchAnalyticsTopMerchants(eventId: string, limit = 10): Promise<TopMerchantRow[]> {
  const res = await fetch(apiUrl(`/api/analytics/top-merchants?eventId=${encodeURIComponent(eventId)}&limit=${limit}`), { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to fetch top merchants");
  return (data.topMerchants ?? []) as TopMerchantRow[];
}

export async function apiFetchAnalyticsHeatmap(eventId: string): Promise<HeatmapRow[]> {
  const res = await fetch(apiUrl(`/api/analytics/heatmap?eventId=${encodeURIComponent(eventId)}`), { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to fetch heatmap");
  return (data.heatmap ?? []) as HeatmapRow[];
}

export async function apiFetchAnalyticsStockAlerts(eventId: string): Promise<StockAlertRow[]> {
  const res = await fetch(apiUrl(`/api/analytics/stock-alerts?eventId=${encodeURIComponent(eventId)}`), { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to fetch stock alerts");
  return (data.alerts ?? []) as StockAlertRow[];
}

export interface WalletBehavior {
  activeBracelets: number;
  totalBracelets: number;
  activationRate: number;
  reloadedBracelets: number;
  reloadRate: number;
  avgSpend: number;
  avgTopUp: number;
  topupsByHour: { hour: number; amount: number; count: number }[];
  spendConcentration: { pct: number; revShare: number }[];
}

export async function apiFetchAnalyticsWalletBehavior(eventId: string): Promise<WalletBehavior> {
  const res = await fetch(apiUrl(`/api/analytics/wallet-behavior?eventId=${encodeURIComponent(eventId)}`), { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to fetch wallet behavior");
  return data as WalletBehavior;
}

export interface MerchantHealthRow {
  merchantId: string;
  merchantName: string;
  lastTransactionAt: string;
  minutesSince: number;
  recentTx: number;
  totalTx: number;
}

export async function apiFetchMerchantHealth(eventId: string): Promise<MerchantHealthRow[]> {
  const res = await fetch(apiUrl(`/api/analytics/merchant-health?eventId=${encodeURIComponent(eventId)}`), { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to fetch merchant health");
  return (data.merchants ?? []) as MerchantHealthRow[];
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
