const PROD_ORIGIN = "https://attendee.tapee.app";
const API_BASE = import.meta.env.PROD
  ? `${PROD_ORIGIN}/attendee-api/api`
  : "/tickets/prod-api";

const STORAGE_ORIGIN = "https://prod.tapee.app";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function resolveImageUrl(path: string | null | undefined, width = 800): string {
  if (!path) return "";
  const fullUrl = path.startsWith("http") ? path : `${STORAGE_ORIGIN}${path}`;
  if (fullUrl.startsWith(`${STORAGE_ORIGIN}/`)) {
    return `${API_BASE}/public/image?url=${encodeURIComponent(fullUrl)}&w=${width}`;
  }
  return fullUrl;
}

let authToken: string | null = localStorage.getItem("tapee_auth_token");

export function setAuthToken(token: string | null) {
  authToken = token;
  if (token) {
    localStorage.setItem("tapee_auth_token", token);
  } else {
    localStorage.removeItem("tapee_auth_token");
  }
}

export function getAuthToken(): string | null {
  return authToken;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string>),
  };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(body.error || body.message || `API error ${res.status}`, res.status);
  }
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text);
}

export interface ApiEvent {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
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
  priceFrom: number;
  priceTo: number;
  eventDays: { id: string; date: string; label: string | null }[];
  dayCount: number;
}

export interface ApiEventDetail {
  event: {
    id: string;
    name: string;
    slug: string | null;
    description: string | null;
    longDescription: string | null;
    descriptionEn?: string | null;
    coverImageUrl: string | null;
    flyerImageUrl: string | null;
    floatingGraphicUrl?: string | null;
    floatingGraphics?: Array<{ url: string; opacity: number }> | null;
    vimeoUrl?: string | null;
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
    pulepId?: string | null;
  };
  eventDays: { id: string; date: string; label: string | null; doorsOpenAt: string | null; doorsCloseAt: string | null }[];
  venues: { id: string; name: string; address: string | null; city: string | null; floorplanImageUrl?: string | null }[];
  sections: { id: string; name: string; capacity: number | null; colorHex: string; sectionType?: string | null; svgPathData?: string | null }[];
  ticketTypes: {
    ticketTypeId: string;
    name: string;
    basePrice: number;
    currentPrice: number;
    currentStageName: string | null;
    price?: number;
    available: number;
    total: number;
    saleStart: string | null;
    saleEnd: string | null;
    validEventDayIds: string[] | null;
    sectionId: string | null;
    isNumberedUnits?: boolean;
    unitLabel?: string;
    ticketsPerUnit?: number;
    units?: { id: string; unitNumber: number; unitLabel: string; status: string; mapX?: number | null; mapY?: number | null }[];
    pricingStages?: { id: string; name: string; price: number; startsAt: string; endsAt: string }[];
    nextStage?: { name: string; price: number; startsAt: string } | null;
    serviceFee?: number;
    serviceFeeType?: "fixed" | "percentage";
  }[];
  guestLists?: {
    id: string;
    name: string;
    slug: string;
    maxGuests: number;
    currentCount: number;
    expiresAt: string | null;
  }[];
  promoterCompany?: { companyName: string; nit: string | null } | null;
}

export async function fetchEvents(params?: {
  search?: string;
  category?: string;
  city?: string;
  page?: number;
}): Promise<{ events: ApiEvent[]; page: number; limit: number }> {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  if (params?.category) qs.set("category", params.category);
  if (params?.city) qs.set("city", params.city);
  if (params?.page) qs.set("page", String(params.page));
  const query = qs.toString();
  return apiFetch(`/public/events${query ? `?${query}` : ""}`);
}

export async function fetchEventDetail(eventId: string): Promise<ApiEventDetail> {
  return apiFetch(`/public/events/${eventId}`);
}

export interface ApiUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  role: string;
  phone?: string | null;
  dateOfBirth?: string | null;
  sex?: string | null;
  idDocument?: string | null;
}

export async function fetchAuthProviders(): Promise<{ providers: { google?: string } }> {
  return apiFetch("/auth/providers");
}

export async function loginApi(identifier: string, password: string): Promise<{ token: string }> {
  return apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier, password }),
  });
}

export async function loginWithGoogleApi(credential: string): Promise<{ token: string }> {
  return apiFetch("/auth/google", {
    method: "POST",
    body: JSON.stringify({ credential }),
  });
}

export async function createAccountApi(data: {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
}): Promise<{ id: string; email: string }> {
  return apiFetch("/auth/create-account", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function fetchCurrentUser(): Promise<{ user: ApiUser | null }> {
  return apiFetch("/auth/user");
}

export async function updateProfile(data: {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  dateOfBirth?: string | null;
  sex?: string | null;
  idDocument?: string | null;
}): Promise<{ user: ApiUser }> {
  return apiFetch("/auth/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function logoutApi(): Promise<void> {
  await apiFetch("/auth/logout", { method: "POST" });
}

export async function deleteAccount(): Promise<void> {
  await apiFetch("/attendee/me", { method: "DELETE" });
}

export async function changePassword(data: { currentPassword: string; newPassword: string }): Promise<void> {
  await apiFetch("/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export interface SavedCard {
  id: string;
  brand: string;
  lastFour: string;
  cardHolderName: string;
  expiryMonth: string;
  expiryYear: string;
  alias: string | null;
  createdAt: string;
}

export async function fetchSavedCards(): Promise<{ cards: SavedCard[] }> {
  return apiFetch("/cards");
}

export async function saveCard(data: {
  wompiToken: string;
  brand: string;
  lastFour: string;
  cardHolderName: string;
  expiryMonth: string;
  expiryYear: string;
  alias?: string;
}): Promise<{ card: SavedCard }> {
  return apiFetch("/cards", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateCardAlias(id: string, alias: string | null): Promise<{ card: Partial<SavedCard> }> {
  return apiFetch(`/cards/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ alias }),
  });
}

export async function deleteCard(id: string): Promise<{ success: boolean }> {
  return apiFetch(`/cards/${id}`, { method: "DELETE" });
}

export interface PurchaseRequest {
  eventId: string;
  attendees: { name: string; email: string; phone?: string; dateOfBirth?: string; sex?: "male" | "female"; idDocument?: string; ticketTypeId: string; shirtSize?: string }[];
  unitSelections?: { ticketTypeId: string; unitId: string }[];
  paymentMethod: "nequi" | "pse" | "card" | "bancolombia_transfer" | "daviplata" | "puntoscolombia" | "free";
  phoneNumber?: string;
  bankCode?: string;
  pseUserType?: 0 | 1;
  pseEmail?: string;
  userLegalIdType?: "CC" | "CE" | "NIT" | "PP" | "TI";
  userLegalId?: string;
  cardToken?: string;
  savedCardId?: string;
  installments?: number;
  turnstileToken?: string;
  browserInfo?: {
    browser_color_depth: string;
    browser_screen_height: string;
    browser_screen_width: string;
    browser_language: string;
    browser_user_agent: string;
    browser_tz: string;
  };
}

export interface WompiConfig {
  publicKey: string;
  baseUrl: string;
}

export async function getWompiConfig(): Promise<WompiConfig> {
  return apiFetch("/config/wompi");
}

export interface PseBank {
  financial_institution_code: string;
  financial_institution_name: string;
}

export async function getPseBanks(): Promise<PseBank[]> {
  const res = await apiFetch<{ data: PseBank[] }>("/payments/pse/banks/public");
  return res.data;
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

export async function purchaseTickets(data: PurchaseRequest): Promise<PurchaseResponse> {
  return apiFetch("/tickets/purchase", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export interface ThreeDsAuth {
  current_step: string;
  current_step_status: string;
  three_ds_method_data?: string;
  iframe_content?: string;
}

export interface OrderStatus {
  orderId: string;
  status: string;
  threeDsAuth?: ThreeDsAuth | null;
}

export async function fetchOrderStatus(orderId: string): Promise<OrderStatus> {
  return apiFetch(`/tickets/orders/${orderId}/status`);
}

export interface ApiTicket {
  id: string;
  eventId: string;
  attendeeName: string;
  status: string;
  ticketTypeId: string;
  qrCodeToken: string | null;
  orderId: string;
  createdAt: string;
  eventName: string | null;
  eventStartsAt: string | null;
  eventCoverImage: string | null;
  ticketTypeName: string | null;
  validEventDayIds: string[];
  venueAddress: string | null;
}

export async function fetchMyTickets(): Promise<{ tickets: ApiTicket[] }> {
  return apiFetch("/tickets/my-tickets");
}

export interface ApiOrderTicket {
  id: string;
  attendeeName: string;
  ticketTypeId: string | null;
  ticketTypeName: string | null;
  status: string;
}

export interface ApiOrder {
  id: string;
  eventId: string;
  eventName: string | null;
  eventCoverImage: string | null;
  currencyCode: string;
  totalAmount: number;
  ticketCount: number;
  paymentStatus: string;
  paymentMethod: string;
  wompiTransactionId: string | null;
  wompiReference: string | null;
  createdAt: string;
  tickets: ApiOrderTicket[];
}

export async function fetchMyOrders(): Promise<{ orders: ApiOrder[] }> {
  return apiFetch("/tickets/my-orders");
}

export async function fetchOrderDownloadLink(orderId: string): Promise<{ url: string }> {
  return apiFetch(`/tickets/orders/${orderId}/download-link`);
}

export async function transferTicket(ticketId: string, data: {
  recipientName: string;
  recipientEmail: string;
  recipientPhone?: string;
}): Promise<{ success: boolean; ticketId: string }> {
  return apiFetch(`/tickets/${ticketId}/transfer`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function addTicketToWallet(ticketId: string, platform: "apple" | "google"): Promise<{ passUrl: string }> {
  return apiFetch(`/attendee/tickets/${ticketId}/wallet`, {
    method: "POST",
    body: JSON.stringify({ platform }),
  });
}

export async function sendWhatsAppOtp(phone: string): Promise<{ success: boolean; expiresIn: number }> {
  return apiFetch("/auth/whatsapp-otp/send", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
}

export async function verifyWhatsAppOtp(phone: string, code: string): Promise<{ token: string; isNewUser: boolean; userId: string }> {
  return apiFetch("/auth/whatsapp-otp/verify", {
    method: "POST",
    body: JSON.stringify({ phone, code }),
  });
}

export interface ApiAd {
  id: string;
  title: string;
  imageUrl: string;
  linkUrl: string | null;
  isActive: boolean;
  displayOrder: number;
  startsAt: string | null;
  endsAt: string | null;
}

export async function fetchAds(): Promise<{ ads: ApiAd[] }> {
  return apiFetch("/public/ads");
}

// ─── Bracelets ────────────────────────────────────────────────────────────────

export interface ApiBracelet {
  uid: string;
  balance: number;
  pendingTopUpAmount: number;
  flagged: boolean;
  flagReason?: string | null;
  pendingRefund?: boolean;
  refundStatus?: string | null;
  attendeeName?: string | null;
  event?: { id: string; name: string; active: boolean; refundDeadline?: string | null } | null;
  updatedAt: string;
}

export async function fetchMyBracelets(): Promise<{ bracelets: ApiBracelet[] }> {
  return apiFetch("/attendee/me/bracelets");
}

export async function fetchPendingWalletBalance(): Promise<{ pendingWalletBalance: number }> {
  return apiFetch("/user/wallet");
}

export async function linkBracelet(uid: string): Promise<{ uid: string; message: string }> {
  return apiFetch("/attendee/me/bracelets/link", {
    method: "POST",
    body: JSON.stringify({ uid }),
  });
}

export async function unlinkBracelet(uid: string): Promise<{ success: boolean }> {
  return apiFetch(`/attendee/me/bracelets/${encodeURIComponent(uid)}`, {
    method: "DELETE",
  });
}

export async function claimWalletBalance(uid: string): Promise<{ transferred: number }> {
  return apiFetch(`/attendee/me/bracelets/${encodeURIComponent(uid)}/claim-wallet-balance`, {
    method: "POST",
  });
}

export interface TopUpRequest {
  braceletUid?: string;
  amount: number;
  paymentMethod: "nequi" | "pse" | "card" | "bancolombia_transfer" | "daviplata" | "puntoscolombia";
  phoneNumber?: string;
  bankCode?: string;
  pseUserType?: 0 | 1;
  pseEmail?: string;
  userLegalIdType?: "CC" | "CE" | "NIT" | "PP" | "TI";
  userLegalId?: string;
  cardToken?: string;
  savedCardId?: string;
  installments?: number;
  browserInfo?: {
    browser_color_depth: string;
    browser_screen_height: string;
    browser_screen_width: string;
    browser_language: string;
    browser_user_agent: string;
    browser_tz: string;
  };
}

export interface TopUpResponse {
  intentId: string;
  status: string;
  paymentMethod: string;
  purposeType: "topup" | "preload";
  wompiTransactionId: string | null;
  redirectUrl: string | null;
}

export async function initiateTopUp(data: TopUpRequest): Promise<TopUpResponse> {
  return apiFetch("/payments/initiate", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export interface TopUpStatus {
  intentId: string;
  status: "pending" | "confirmed" | "success" | "failed" | "cancelled";
  purposeType: "topup" | "preload";
  topUpId: string | null;
  threeDsAuth: {
    current_step: string;
    current_step_status: string;
    three_ds_method_data?: string;
    iframe_content?: string;
  } | null;
}

export async function fetchTopUpStatus(intentId: string): Promise<TopUpStatus> {
  return apiFetch(`/payments/${intentId}/status`);
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export interface ApiTransaction {
  id: string;
  type: "purchase" | "top_up" | "refund" | "transfer";
  braceletUid: string;
  amount: number;
  newBalance: number;
  merchantName: string | null;
  locationName: string | null;
  eventId: string | null;
  eventName: string | null;
  lineItems: { name: string; quantity: number; unitPrice: number }[];
  createdAt: string;
  refundStatus?: "pending" | "approved" | "rejected" | null;
  refundChipZeroed?: boolean | null;
}

export async function fetchMyTransactions(cursor?: string): Promise<{ transactions: ApiTransaction[]; nextCursor: string | null }> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return apiFetch(`/attendee/me/transactions${qs}`);
}

export interface RefundRequest {
  braceletUid: string;
  refundMethod: "nequi" | "bancolombia" | "bank_transfer" | "cash" | "other";
  accountDetails?: string;
  notes?: string;
}

export async function requestBraceletRefund(data: RefundRequest): Promise<{ id: string }> {
  return apiFetch("/attendee/me/refund-request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}
