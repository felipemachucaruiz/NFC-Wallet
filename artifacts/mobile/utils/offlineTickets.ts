import AsyncStorage from "@react-native-async-storage/async-storage";
import CryptoJS from "crypto-js";
import { API_BASE_URL } from "@/constants/domain";

const STORAGE_KEY_EVENT = "@tapee_offline_event";
const STORAGE_KEY_QUEUE = "@tapee_offline_checkin_queue";
const SYNC_FETCH_TIMEOUT = 10000;

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = SYNC_FETCH_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export interface OfflineTicket {
  id: string;
  eventId: string;
  ticketTypeId: string | null;
  attendeeName: string;
  attendeeEmail: string;
  attendeeUserId: string | null;
  qrCodeToken: string | null;
  status: string;
}

export interface OfflineTicketType {
  id: string;
  name: string;
  sectionId: string | null;
  validEventDayIds: string[];
}

export interface OfflineEventDay {
  id: string;
  date: string;
  label: string | null;
  displayOrder: number;
}

export interface OfflineZone {
  id: string;
  eventId: string;
  name: string;
}

export interface OfflineAttendee {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
  profileImageUrl: string | null;
}

export interface OfflineCheckinRecord {
  id: string;
  ticketId: string;
  eventDayIndex: number;
  checkedInAt: string;
  braceletId: string | null;
}

export interface OfflineEventData {
  event: {
    id: string;
    name: string;
    hmacSecret: string;
    attendeeQrSecret: string;
    startsAt: string | null;
    endsAt: string | null;
    timezone: string;
  };
  tickets: OfflineTicket[];
  ticketTypes: OfflineTicketType[];
  eventDays: OfflineEventDay[];
  zones: OfflineZone[];
  attendees: OfflineAttendee[];
  checkins: OfflineCheckinRecord[];
  syncedAt: string;
}

export interface QueuedCheckin {
  offlineId: string;
  ticketId: string;
  eventDayIndex: number;
  checkedInAt: string;
  braceletId: string | null;
  braceletNfcUid: string | null;
  accessZoneId: string | null;
}

export async function syncEventData(token: string): Promise<OfflineEventData | null> {
  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/api/gate/sync-event-data`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data: OfflineEventData = await res.json();
    await AsyncStorage.setItem(STORAGE_KEY_EVENT, JSON.stringify(data));
    return data;
  } catch {
    return null;
  }
}

export async function getOfflineEventData(): Promise<OfflineEventData | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_EVENT);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function verifyQrTokenOffline(
  qrToken: string,
  eventData: OfflineEventData,
): { ticketId: string; attendeeUserId: string } | null {
  const gateResult = verifyGateFormat(qrToken, eventData.event.hmacSecret, eventData.event.id);
  if (gateResult) return gateResult;

  const ticketByToken = eventData.tickets.find(t => t.qrCodeToken === qrToken);
  if (ticketByToken) {
    return { ticketId: ticketByToken.id, attendeeUserId: ticketByToken.attendeeUserId ?? "" };
  }

  const attendeeResult = verifyAttendeeFormat(qrToken, eventData.event.attendeeQrSecret);
  if (attendeeResult) {
    const ticket = eventData.tickets.find(t => t.id === attendeeResult.ticketId);
    if (ticket && ticket.eventId === eventData.event.id) {
      return { ticketId: ticket.id, attendeeUserId: ticket.attendeeUserId ?? "" };
    }
  }

  try {
    const firstPart = qrToken.split(".")[0];
    if (firstPart) {
      const decoded = base64urlDecode(firstPart);
      const parsed = JSON.parse(decoded);
      if (parsed && typeof parsed.tid === "string" && parsed.tid) {
        const ticket = eventData.tickets.find(t => t.id === parsed.tid && t.eventId === eventData.event.id);
        if (ticket) {
          return { ticketId: ticket.id, attendeeUserId: ticket.attendeeUserId ?? "" };
        }
      }
    }
  } catch {
    // ignore parse errors
  }

  return null;
}

function verifyGateFormat(
  token: string,
  hmacSecret: string,
  expectedEventId: string,
): { ticketId: string; attendeeUserId: string } | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, signature] = parts;
  try {
    if (signature.length !== 64) return null;
    const expectedSig = CryptoJS.HmacSHA256(payloadB64, hmacSecret).toString(CryptoJS.enc.Hex);
    if (expectedSig !== signature) return null;
    const decoded = base64urlDecode(payloadB64);
    const payload = JSON.parse(decoded);
    if (!payload.tid || !payload.uid || !payload.eid) return null;
    if (payload.eid !== expectedEventId) return null;
    return { ticketId: payload.tid, attendeeUserId: payload.uid };
  } catch {
    return null;
  }
}

function verifyAttendeeFormat(token: string, attendeeQrSecret: string): { ticketId: string; attendeeUserId: string } | null {
  if (!attendeeQrSecret) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [data, signature] = parts;
  const expectedSig = CryptoJS.HmacSHA256(data, attendeeQrSecret).toString(CryptoJS.enc.Base64url);
  if (expectedSig !== signature) return null;
  try {
    const decoded = base64urlDecode(data);
    const payload = JSON.parse(decoded);
    if (!payload.tid) return null;
    return { ticketId: payload.tid, attendeeUserId: payload.uid || "" };
  } catch {
    return null;
  }
}

function base64urlDecode(str: string): string {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) base64 += "=";
  return CryptoJS.enc.Base64.parse(base64).toString(CryptoJS.enc.Utf8);
}

export function resolveTicketOffline(
  ticketId: string,
  eventData: OfflineEventData,
): {
  ticket: OfflineTicket;
  attendee: OfflineAttendee | null;
  ticketType: OfflineTicketType | null;
  zone: OfflineZone | null;
  validDays: number[];
  dayLabels: string[];
  checkins: OfflineCheckinRecord[];
  todayDayIndex: number;
} | null {
  const ticket = eventData.tickets.find(t => t.id === ticketId);
  if (!ticket) return null;

  const attendee = ticket.attendeeUserId
    ? eventData.attendees.find(a => a.id === ticket.attendeeUserId) ?? null
    : null;

  const ticketType = ticket.ticketTypeId
    ? eventData.ticketTypes.find(tt => tt.id === ticket.ticketTypeId) ?? null
    : null;

  let zone: OfflineZone | null = null;
  const validDays: number[] = [];
  const dayLabels: string[] = [];

  if (ticketType && ticketType.validEventDayIds.length > 0) {
    for (let i = 0; i < eventData.eventDays.length; i++) {
      if (ticketType.validEventDayIds.includes(eventData.eventDays[i].id)) {
        validDays.push(i);
        dayLabels.push(eventData.eventDays[i].label ?? `Day ${i + 1}`);
      }
    }
  }

  const ticketCheckins = eventData.checkins.filter(c => c.ticketId === ticketId);

  const todayDayIndex = getEventDayIndex(eventData);

  return {
    ticket,
    attendee,
    ticketType,
    zone,
    validDays,
    dayLabels,
    checkins: ticketCheckins,
    todayDayIndex,
  };
}

function getEventDayIndex(eventData: OfflineEventData): number {
  if (!eventData.event.startsAt) return 0;
  const tz = eventData.event.timezone || "UTC";
  const now = new Date();
  try {
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    const nowParts = fmt.formatToParts(now);
    const startParts = fmt.formatToParts(new Date(eventData.event.startsAt));
    const toDate = (parts: Intl.DateTimeFormatPart[]) => {
      const y = parseInt(parts.find(p => p.type === "year")!.value);
      const m = parseInt(parts.find(p => p.type === "month")!.value) - 1;
      const d = parseInt(parts.find(p => p.type === "day")!.value);
      return new Date(y, m, d);
    };
    const diff = Math.floor((toDate(nowParts).getTime() - toDate(startParts).getTime()) / 86400000);
    return diff;
  } catch {
    return 0;
  }
}

export async function addCheckinToQueue(checkin: QueuedCheckin): Promise<void> {
  const queue = await getCheckinQueue();
  queue.push(checkin);
  await AsyncStorage.setItem(STORAGE_KEY_QUEUE, JSON.stringify(queue));
}

export async function getCheckinQueue(): Promise<QueuedCheckin[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_QUEUE);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function addOfflineCheckin(
  ticketId: string,
  eventDayIndex: number,
  braceletId: string | null = null,
  braceletNfcUid: string | null = null,
  accessZoneId: string | null = null,
): Promise<string> {
  const offlineId = `offline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const checkin: QueuedCheckin = {
    offlineId,
    ticketId,
    eventDayIndex,
    checkedInAt: new Date().toISOString(),
    braceletId,
    braceletNfcUid,
    accessZoneId,
  };
  await addCheckinToQueue(checkin);

  const eventData = await getOfflineEventData();
  if (eventData) {
    eventData.checkins.push({
      id: offlineId,
      ticketId,
      eventDayIndex,
      checkedInAt: checkin.checkedInAt,
      braceletId,
    });
    await AsyncStorage.setItem(STORAGE_KEY_EVENT, JSON.stringify(eventData));
  }

  return offlineId;
}

export async function syncCheckinQueue(token: string): Promise<{ synced: number; failed: number; duplicates: number }> {
  const queue = await getCheckinQueue();
  if (queue.length === 0) return { synced: 0, failed: 0, duplicates: 0 };

  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/api/gate/sync-checkins`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ checkins: queue }),
    });

    if (!res.ok) return { synced: 0, failed: queue.length, duplicates: 0 };

    const data = await res.json();
    const results = data.results as Array<{ offlineId: string; status: string }>;

    const failedIds = results
      .filter(r => r.status === "error")
      .map(r => r.offlineId);

    const remainingQueue = queue.filter(c => failedIds.includes(c.offlineId));
    await AsyncStorage.setItem(STORAGE_KEY_QUEUE, JSON.stringify(remainingQueue));

    return {
      synced: results.filter(r => r.status === "created").length,
      duplicates: results.filter(r => r.status === "duplicate").length,
      failed: failedIds.length,
    };
  } catch {
    return { synced: 0, failed: queue.length, duplicates: 0 };
  }
}

export async function getQueueCount(): Promise<number> {
  const queue = await getCheckinQueue();
  return queue.length;
}

export async function clearOfflineData(): Promise<void> {
  await AsyncStorage.multiRemove([STORAGE_KEY_EVENT, STORAGE_KEY_QUEUE]);
}
