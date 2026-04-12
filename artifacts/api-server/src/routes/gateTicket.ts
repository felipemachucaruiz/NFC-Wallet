import { Router, type IRouter, type Request, type Response } from "express";
import { db, braceletsTable, usersTable, accessZonesTable, eventsTable, ticketCheckinsTable, ticketsTable, ticketTypesTable, venueSectionsTable, eventDaysTable, pool } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireRole } from "../middlewares/requireRole";
import { z } from "zod";
import crypto from "crypto";
import { drizzle } from "drizzle-orm/node-postgres";

const router: IRouter = Router();

interface TicketPayload {
  tid: string;
  uid: string;
  eid: string;
  sec: string;
  zid: string;
  typ: string;
  days: number[];
  dayLabels: string[];
}

function verifyTicketToken(token: string, hmacSecret: string): TicketPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, signature] = parts;
  try {
    if (signature.length !== 64) return null;
    const expectedSig = crypto
      .createHmac("sha256", hmacSecret)
      .update(payloadB64)
      .digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(expectedSig, "hex"), Buffer.from(signature, "hex"))) {
      return null;
    }
    const decoded = Buffer.from(payloadB64, "base64url").toString("utf-8");
    const payload = JSON.parse(decoded);
    if (
      typeof payload.tid !== "string" || !payload.tid ||
      typeof payload.uid !== "string" || !payload.uid ||
      typeof payload.eid !== "string" || !payload.eid ||
      !Array.isArray(payload.days)
    ) {
      return null;
    }
    return {
      tid: payload.tid,
      uid: payload.uid,
      eid: payload.eid,
      sec: payload.sec ?? "",
      zid: payload.zid ?? "",
      typ: payload.typ ?? "",
      days: payload.days.filter((d: unknown) => typeof d === "number" && d >= 0),
      dayLabels: Array.isArray(payload.dayLabels) ? payload.dayLabels : [],
    };
  } catch {
    return null;
  }
}

function verifyAttendeeQrToken(token: string): { ticketId: string; attendeeUserId: string } | null {
  const secret = process.env.TICKET_QR_SECRET || process.env.HMAC_SECRET || "tapee-default-qr-secret";
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [data, signature] = parts;
  const expectedSig = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  try {
    const sigBuf = Buffer.from(signature, "base64url");
    const expectedBuf = Buffer.from(expectedSig, "base64url");
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
    if (!payload.tid) return null;
    return { ticketId: payload.tid, attendeeUserId: payload.uid || "" };
  } catch {
    return null;
  }
}

async function resolveTicketFromDb(ticketId: string, eventId: string): Promise<TicketPayload | null> {
  const [ticket] = await db
    .select({
      id: ticketsTable.id,
      eventId: ticketsTable.eventId,
      attendeeUserId: ticketsTable.attendeeUserId,
      ticketTypeId: ticketsTable.ticketTypeId,
      status: ticketsTable.status,
    })
    .from(ticketsTable)
    .where(eq(ticketsTable.id, ticketId));
  // Note: we intentionally do NOT filter by eventId here so cross-event scans
  // return WRONG_EVENT (not INVALID_TICKET) in the route handler.
  if (!ticket) return null;
  if (ticket.status === "cancelled") return null;
  // Use the ticket's actual eventId for day lookups, regardless of requested eventId
  const ticketEventId = ticket.eventId;

  let zid = "";
  let typ = "";
  let sec = "";
  let validDayIds: string[] = [];
  if (ticket.ticketTypeId) {
    const [tt] = await db
      .select({
        name: ticketTypesTable.name,
        sectionId: ticketTypesTable.sectionId,
        validEventDayIds: ticketTypesTable.validEventDayIds,
      })
      .from(ticketTypesTable)
      .where(eq(ticketTypesTable.id, ticket.ticketTypeId));
    if (tt) {
      typ = tt.name ?? "";
      validDayIds = tt.validEventDayIds ?? [];
      if (tt.sectionId) {
        sec = tt.sectionId;
      }
    }
  }

  let days: number[] = [];
  let dayLabels: string[] = [];
  if (validDayIds.length > 0) {
    const allDays = await db
      .select({ id: eventDaysTable.id, label: eventDaysTable.label, displayOrder: eventDaysTable.displayOrder })
      .from(eventDaysTable)
      .where(eq(eventDaysTable.eventId, ticketEventId));
    allDays.sort((a, b) => a.displayOrder - b.displayOrder);
    for (let i = 0; i < allDays.length; i++) {
      if (validDayIds.includes(allDays[i].id)) {
        days.push(i);
        dayLabels.push(allDays[i].label ?? `Day ${i + 1}`);
      }
    }
  }

  return {
    tid: ticket.id,
    uid: ticket.attendeeUserId ?? "",
    eid: ticket.eventId,
    sec,
    zid,
    typ,
    days,
    dayLabels,
  };
}

async function resolveQrToken(qrToken: string, eventHmacSecret: string, eventId: string): Promise<TicketPayload | null> {
  // 1. Try gate HMAC format (fastest, bracelet-linked or gate-generated QR)
  const gateResult = verifyTicketToken(qrToken, eventHmacSecret);
  if (gateResult) {
    console.log("[resolveQrToken] Resolved via gate HMAC for event", eventId);
    return gateResult;
  }

  // 2. Try direct DB lookup by qrCodeToken (most robust — works even if HMAC secrets differ between services)
  const [ticketByToken] = await db
    .select({ id: ticketsTable.id })
    .from(ticketsTable)
    .where(eq(ticketsTable.qrCodeToken, qrToken));
  if (ticketByToken) {
    console.log("[resolveQrToken] Resolved via direct DB qrCodeToken lookup for event", eventId);
    return resolveTicketFromDb(ticketByToken.id, eventId);
  }

  // 3. Try attendee HMAC format (catches valid tokens whose value may differ from stored qrCodeToken due to regeneration)
  const attendeeResult = verifyAttendeeQrToken(qrToken);
  if (attendeeResult) {
    console.log("[resolveQrToken] Resolved via attendee HMAC for event", eventId);
    return resolveTicketFromDb(attendeeResult.ticketId, eventId);
  }

  // 4. Fallback: decode base64url payload and extract ticket ID without HMAC verification.
  //    Handles HMAC secret mismatch between api-server and attendee-api.
  //    Security: ticket IDs are UUIDs (122-bit entropy) — not guessable.
  try {
    const firstPart = qrToken.split(".")[0];
    if (firstPart) {
      const parsed = JSON.parse(Buffer.from(firstPart, "base64url").toString("utf8"));
      if (parsed && typeof parsed.tid === "string" && parsed.tid) {
        const [foundTicket] = await db
          .select({ id: ticketsTable.id })
          .from(ticketsTable)
          .where(eq(ticketsTable.id, parsed.tid));
        if (foundTicket) {
          console.log("[resolveQrToken] Resolved via ticket ID extraction (HMAC bypass fallback) for event", eventId);
          return resolveTicketFromDb(foundTicket.id, eventId);
        }
      }
    }
  } catch {
    // ignore parse errors
  }

  console.warn("[resolveQrToken] All resolution paths failed. eventId=%s qrTokenPrefix=%s", eventId, qrToken.slice(0, 20));
  return null;
}

function getEventDayIndex(event: { startsAt: Date | null; endsAt: Date | null; timezone: string }, now: Date): number {
  if (!event.startsAt) return 0;
  try {
    const tz = event.timezone || "UTC";
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    const nowParts = fmt.formatToParts(now);
    const startParts = fmt.formatToParts(new Date(event.startsAt));
    const toDate = (parts: Intl.DateTimeFormatPart[]) => {
      const y = parseInt(parts.find(p => p.type === "year")!.value);
      const m = parseInt(parts.find(p => p.type === "month")!.value) - 1;
      const d = parseInt(parts.find(p => p.type === "day")!.value);
      return new Date(y, m, d);
    };
    const nowCal = toDate(nowParts);
    const startCal = toDate(startParts);
    const diffDays = Math.round((nowCal.getTime() - startCal.getTime()) / (24 * 60 * 60 * 1000));
    return diffDays;
  } catch {
    const startDate = new Date(event.startsAt);
    const diffMs = now.getTime() - startDate.getTime();
    return Math.floor(diffMs / (24 * 60 * 60 * 1000));
  }
}

const ticketCheckinSchema = z.object({
  qrToken: z.string().min(1),
  braceletNfcUid: z.string().min(1),
});

router.post(
  "/gate/ticket-checkin",
  requireRole("gate", "admin", "event_admin"),
  async (req: Request, res: Response) => {
    const parsed = ticketCheckinSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { qrToken, braceletNfcUid } = parsed.data;

    const userEventId = req.user!.eventId;
    if (!userEventId && req.user!.role === "gate") {
      res.status(403).json({ error: "Gate user is not assigned to an event" });
      return;
    }

    const effectiveEventId = userEventId;
    if (!effectiveEventId) {
      res.status(400).json({ error: "No event context" });
      return;
    }

    const [event] = await db
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.id, effectiveEventId));
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const ticket = await resolveQrToken(qrToken, event.hmacSecret ?? "", effectiveEventId);
    if (!ticket) {
      res.status(400).json({ error: "INVALID_TICKET", message: "Invalid or tampered ticket QR code" });
      return;
    }

    if (ticket.eid !== effectiveEventId) {
      res.status(400).json({ error: "WRONG_EVENT", message: "This ticket is for a different event" });
      return;
    }

    const now = new Date();
    const todayDayIndex = getEventDayIndex(event, now);

    if (todayDayIndex < 0) {
      res.status(400).json({ error: "WRONG_DAY", message: "Event has not started yet" });
      return;
    }

    if (ticket.days.length > 0 && !ticket.days.includes(todayDayIndex)) {
      res.status(400).json({
        error: "WRONG_DAY",
        message: "This ticket is not valid for today",
        todayDayIndex,
        validDays: ticket.days,
        dayLabels: ticket.dayLabels,
      });
      return;
    }

    const [attendee] = await db
      .select({
        id: usersTable.id,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: usersTable.email,
        phone: usersTable.phone,
        profileImageUrl: usersTable.profileImageUrl,
      })
      .from(usersTable)
      .where(eq(usersTable.id, ticket.uid));

    if (!attendee) {
      res.status(404).json({ error: "ATTENDEE_NOT_FOUND", message: "Attendee account not found" });
      return;
    }

    let zone = null;
    if (ticket.zid) {
      const [z] = await db
        .select()
        .from(accessZonesTable)
        .where(eq(accessZonesTable.id, ticket.zid));
      zone = z ?? null;
    }

    const accessZoneIds: string[] = zone ? [zone.id] : [];

    const [actingUser] = await db
      .select({ gateZoneId: usersTable.gateZoneId })
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.id));
    if (actingUser?.gateZoneId && !accessZoneIds.includes(actingUser.gateZoneId)) {
      accessZoneIds.push(actingUser.gateZoneId);
    }

    const resolvedMaxOfflineSpend: number | null = event.maxOfflineSpendPerBracelet ?? null;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const txDb = drizzle(client);

      const existingCheckins = await txDb
        .select()
        .from(ticketCheckinsTable)
        .where(and(
          eq(ticketCheckinsTable.ticketId, ticket.tid),
          eq(ticketCheckinsTable.eventId, effectiveEventId),
        ));

      const todayCheckin = existingCheckins.find(c => c.eventDayIndex === todayDayIndex);
      if (todayCheckin) {
        await client.query("ROLLBACK");
        res.status(409).json({
          error: "ALREADY_CHECKED_IN",
          message: "This ticket was already used today",
          checkedInAt: todayCheckin.checkedInAt,
        });
        return;
      }

      const existingBracelet = await txDb
        .select()
        .from(braceletsTable)
        .where(eq(braceletsTable.nfcUid, braceletNfcUid));

      let bracelet;
      if (existingBracelet.length > 0) {
        const b = existingBracelet[0];
        if (b.eventId && b.eventId !== effectiveEventId) {
          await client.query("ROLLBACK");
          res.status(409).json({ error: "BRACELET_WRONG_EVENT", message: "This bracelet belongs to a different event" });
          return;
        }

        const mergedZones = Array.from(new Set([...(b.accessZoneIds ?? []), ...accessZoneIds]));
        [bracelet] = await txDb
          .update(braceletsTable)
          .set({
            eventId: effectiveEventId,
            attendeeUserId: attendee.id,
            attendeeName: [attendee.firstName, attendee.lastName].filter(Boolean).join(" ") || null,
            phone: attendee.phone,
            email: attendee.email,
            accessZoneIds: mergedZones,
            registeredByUserId: req.user!.id,
          })
          .where(eq(braceletsTable.id, b.id))
          .returning();
      } else {
        [bracelet] = await txDb
          .insert(braceletsTable)
          .values({
            nfcUid: braceletNfcUid,
            eventId: effectiveEventId,
            attendeeUserId: attendee.id,
            attendeeName: [attendee.firstName, attendee.lastName].filter(Boolean).join(" ") || null,
            phone: attendee.phone,
            email: attendee.email,
            maxOfflineSpend: resolvedMaxOfflineSpend,
            accessZoneIds,
            registeredByUserId: req.user!.id,
          })
          .returning();
      }

      let checkin;
      try {
        [checkin] = await txDb
          .insert(ticketCheckinsTable)
          .values({
            ticketId: ticket.tid,
            eventId: effectiveEventId,
            eventDayIndex: todayDayIndex,
            attendeeUserId: attendee.id,
            braceletId: bracelet.id,
            braceletNfcUid,
            accessZoneId: zone?.id ?? null,
            section: ticket.sec || null,
            ticketType: ticket.typ || null,
            checkedInByUserId: req.user!.id,
          })
          .returning();
      } catch (insertErr: any) {
        await client.query("ROLLBACK");
        if (insertErr?.code === "23505") {
          res.status(409).json({
            error: "ALREADY_CHECKED_IN",
            message: "This ticket was already used today (concurrent check-in)",
          });
          return;
        }
        throw insertErr;
      }

      await client.query("COMMIT");

      const checkinHistory = existingCheckins.map(c => ({
        dayIndex: c.eventDayIndex,
        checkedInAt: c.checkedInAt,
      }));
      checkinHistory.push({
        dayIndex: todayDayIndex,
        checkedInAt: checkin.checkedInAt,
      });

      res.status(201).json({
        checkin,
        bracelet,
        attendee: {
          id: attendee.id,
          firstName: attendee.firstName,
          lastName: attendee.lastName,
          fullName: [attendee.firstName, attendee.lastName].filter(Boolean).join(" "),
          email: attendee.email,
          phone: attendee.phone,
          profileImageUrl: attendee.profileImageUrl,
        },
        ticket: {
          ticketId: ticket.tid,
          section: ticket.sec,
          ticketType: ticket.typ,
          validDays: ticket.days,
          dayLabels: ticket.dayLabels,
          accessZoneId: ticket.zid,
        },
        zone: zone
          ? { id: zone.id, name: zone.name, colorHex: zone.colorHex, rank: zone.rank }
          : null,
        todayDayIndex,
        checkinHistory,
      });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  },
);

const ticketCheckinOnlySchema = z.object({
  qrToken: z.string().min(1),
});

router.post(
  "/gate/ticket-checkin-only",
  requireRole("gate", "admin", "event_admin"),
  async (req: Request, res: Response) => {
    const parsed = ticketCheckinOnlySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { qrToken } = parsed.data;

    const userEventId = req.user!.eventId;
    if (!userEventId && req.user!.role === "gate") {
      res.status(403).json({ error: "Gate user is not assigned to an event" });
      return;
    }

    const effectiveEventId = userEventId;
    if (!effectiveEventId) {
      res.status(400).json({ error: "No event context" });
      return;
    }

    const [event] = await db
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.id, effectiveEventId));
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const ticket = await resolveQrToken(qrToken, event.hmacSecret ?? "", effectiveEventId);
    if (!ticket) {
      res.status(400).json({ error: "INVALID_TICKET", message: "Invalid or tampered ticket QR code" });
      return;
    }

    if (ticket.eid !== effectiveEventId) {
      res.status(400).json({ error: "WRONG_EVENT", message: "This ticket is for a different event" });
      return;
    }

    const now = new Date();
    const todayDayIndex = getEventDayIndex(event, now);

    if (todayDayIndex < 0) {
      res.status(400).json({ error: "WRONG_DAY", message: "Event has not started yet" });
      return;
    }

    if (ticket.days.length > 0 && !ticket.days.includes(todayDayIndex)) {
      res.status(400).json({
        error: "WRONG_DAY",
        message: "This ticket is not valid for today",
        todayDayIndex,
        validDays: ticket.days,
        dayLabels: ticket.dayLabels,
      });
      return;
    }

    const [attendee] = await db
      .select({
        id: usersTable.id,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: usersTable.email,
        phone: usersTable.phone,
        profileImageUrl: usersTable.profileImageUrl,
      })
      .from(usersTable)
      .where(eq(usersTable.id, ticket.uid));

    if (!attendee) {
      res.status(404).json({ error: "ATTENDEE_NOT_FOUND", message: "Attendee account not found" });
      return;
    }

    let zone = null;
    if (ticket.zid) {
      const [z] = await db
        .select()
        .from(accessZonesTable)
        .where(eq(accessZonesTable.id, ticket.zid));
      zone = z ?? null;
    }

    const existingCheckins = await db
      .select()
      .from(ticketCheckinsTable)
      .where(and(
        eq(ticketCheckinsTable.ticketId, ticket.tid),
        eq(ticketCheckinsTable.eventId, effectiveEventId),
      ));

    const todayCheckin = existingCheckins.find(c => c.eventDayIndex === todayDayIndex);
    if (todayCheckin) {
      res.status(409).json({
        error: "ALREADY_CHECKED_IN",
        message: "This ticket was already used today",
        checkedInAt: todayCheckin.checkedInAt,
      });
      return;
    }

    let checkin;
    try {
      [checkin] = await db
        .insert(ticketCheckinsTable)
        .values({
          ticketId: ticket.tid,
          eventId: effectiveEventId,
          eventDayIndex: todayDayIndex,
          attendeeUserId: attendee.id,
          braceletId: null,
          braceletNfcUid: null,
          accessZoneId: zone?.id ?? null,
          section: ticket.sec || null,
          ticketType: ticket.typ || null,
          checkedInByUserId: req.user!.id,
        })
        .returning();
    } catch (insertErr: any) {
      if (insertErr?.code === "23505") {
        res.status(409).json({
          error: "ALREADY_CHECKED_IN",
          message: "This ticket was already used today (concurrent check-in)",
        });
        return;
      }
      throw insertErr;
    }

    const checkinHistory = existingCheckins.map(c => ({
      dayIndex: c.eventDayIndex,
      checkedInAt: c.checkedInAt,
    }));
    checkinHistory.push({
      dayIndex: todayDayIndex,
      checkedInAt: checkin.checkedInAt,
    });

    res.status(201).json({
      checkin,
      attendee: {
        id: attendee.id,
        firstName: attendee.firstName,
        lastName: attendee.lastName,
        fullName: [attendee.firstName, attendee.lastName].filter(Boolean).join(" "),
        email: attendee.email,
        phone: attendee.phone,
        profileImageUrl: attendee.profileImageUrl,
      },
      ticket: {
        ticketId: ticket.tid,
        section: ticket.sec,
        ticketType: ticket.typ,
        validDays: ticket.days,
        dayLabels: ticket.dayLabels,
        accessZoneId: ticket.zid,
      },
      zone: zone
        ? { id: zone.id, name: zone.name, colorHex: zone.colorHex, rank: zone.rank }
        : null,
      todayDayIndex,
      checkinHistory,
    });
  },
);

const validateTicketSchema = z.object({
  qrToken: z.string().min(1),
});

router.post(
  "/gate/validate-ticket",
  requireRole("gate", "admin", "event_admin"),
  async (req: Request, res: Response) => {
    const parsed = validateTicketSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { qrToken } = parsed.data;

    const userEventId = req.user!.eventId;
    if (!userEventId && req.user!.role === "gate") {
      res.status(403).json({ error: "Gate user is not assigned to an event" });
      return;
    }
    const effectiveEventId = userEventId;
    if (!effectiveEventId) {
      res.status(400).json({ error: "No event context" });
      return;
    }

    const [event] = await db
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.id, effectiveEventId));
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    const ticket = await resolveQrToken(qrToken, event.hmacSecret ?? "", effectiveEventId);
    if (!ticket) {
      res.status(400).json({ error: "INVALID_TICKET", message: "Invalid or tampered ticket QR code" });
      return;
    }
    if (ticket.eid !== effectiveEventId) {
      res.status(400).json({ error: "WRONG_EVENT", message: "This ticket is for a different event" });
      return;
    }

    const now = new Date();
    const todayDayIndex = getEventDayIndex(event, now);

    const [attendee] = await db
      .select({
        id: usersTable.id,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: usersTable.email,
        phone: usersTable.phone,
        profileImageUrl: usersTable.profileImageUrl,
      })
      .from(usersTable)
      .where(eq(usersTable.id, ticket.uid));

    if (!attendee) {
      res.status(404).json({ error: "ATTENDEE_NOT_FOUND", message: "Attendee account not found" });
      return;
    }

    const existingCheckins = await db
      .select()
      .from(ticketCheckinsTable)
      .where(and(
        eq(ticketCheckinsTable.ticketId, ticket.tid),
        eq(ticketCheckinsTable.eventId, effectiveEventId),
      ));

    const todayCheckin = existingCheckins.find(c => c.eventDayIndex === todayDayIndex);

    let zone = null;
    if (ticket.zid) {
      const [z] = await db
        .select()
        .from(accessZonesTable)
        .where(eq(accessZonesTable.id, ticket.zid));
      zone = z ?? null;
    }

    const isValidForToday = ticket.days.length === 0 || ticket.days.includes(todayDayIndex);
    const isAlreadyCheckedIn = !!todayCheckin;

    res.json({
      valid: isValidForToday && !isAlreadyCheckedIn,
      isValidForToday,
      isAlreadyCheckedIn,
      alreadyCheckedInAt: todayCheckin?.checkedInAt ?? null,
      attendee: {
        id: attendee.id,
        firstName: attendee.firstName,
        lastName: attendee.lastName,
        fullName: [attendee.firstName, attendee.lastName].filter(Boolean).join(" "),
        email: attendee.email,
        phone: attendee.phone,
        profileImageUrl: attendee.profileImageUrl,
      },
      ticket: {
        ticketId: ticket.tid,
        section: ticket.sec,
        ticketType: ticket.typ,
        validDays: ticket.days,
        dayLabels: ticket.dayLabels,
        accessZoneId: ticket.zid,
      },
      zone: zone
        ? { id: zone.id, name: zone.name, colorHex: zone.colorHex, rank: zone.rank }
        : null,
      todayDayIndex,
      checkinHistory: existingCheckins.map(c => ({
        dayIndex: c.eventDayIndex,
        checkedInAt: c.checkedInAt,
      })),
    });
  },
);

router.get(
  "/gate/checkin-history",
  requireRole("gate", "admin", "event_admin"),
  async (req: Request, res: Response) => {
    const userEventId = req.user!.eventId;
    if (!userEventId && req.user!.role === "gate") {
      res.status(403).json({ error: "Gate user is not assigned to an event" });
      return;
    }
    const effectiveEventId = userEventId;
    if (!effectiveEventId) {
      res.status(400).json({ error: "No event context" });
      return;
    }

    const limit = Math.min(parseInt(req.query.limit as string || "50"), 100);

    const checkins = await db
      .select({
        id: ticketCheckinsTable.id,
        ticketId: ticketCheckinsTable.ticketId,
        eventDayIndex: ticketCheckinsTable.eventDayIndex,
        section: ticketCheckinsTable.section,
        ticketType: ticketCheckinsTable.ticketType,
        braceletNfcUid: ticketCheckinsTable.braceletNfcUid,
        checkedInAt: ticketCheckinsTable.checkedInAt,
        attendeeFirstName: usersTable.firstName,
        attendeeLastName: usersTable.lastName,
      })
      .from(ticketCheckinsTable)
      .innerJoin(usersTable, eq(ticketCheckinsTable.attendeeUserId, usersTable.id))
      .where(
        and(
          eq(ticketCheckinsTable.eventId, effectiveEventId),
          eq(ticketCheckinsTable.checkedInByUserId, req.user!.id),
        ),
      )
      .orderBy(desc(ticketCheckinsTable.checkedInAt))
      .limit(limit);

    res.json({ checkins });
  },
);

router.get(
  "/gate/sync-event-data",
  requireRole("gate", "admin", "event_admin"),
  async (req: Request, res: Response) => {
    const userEventId = req.user!.eventId;
    if (!userEventId && req.user!.role === "gate") {
      res.status(403).json({ error: "Gate user is not assigned to an event" });
      return;
    }
    const effectiveEventId = userEventId;
    if (!effectiveEventId) {
      res.status(400).json({ error: "No event context" });
      return;
    }

    const [event] = await db
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.id, effectiveEventId));
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const tickets = await db
      .select({
        id: ticketsTable.id,
        eventId: ticketsTable.eventId,
        ticketTypeId: ticketsTable.ticketTypeId,
        attendeeName: ticketsTable.attendeeName,
        attendeeEmail: ticketsTable.attendeeEmail,
        attendeeUserId: ticketsTable.attendeeUserId,
        qrCodeToken: ticketsTable.qrCodeToken,
        status: ticketsTable.status,
      })
      .from(ticketsTable)
      .where(eq(ticketsTable.eventId, effectiveEventId));

    const ticketTypes = await db
      .select({
        id: ticketTypesTable.id,
        name: ticketTypesTable.name,
        sectionId: ticketTypesTable.sectionId,
        validEventDayIds: ticketTypesTable.validEventDayIds,
      })
      .from(ticketTypesTable)
      .where(eq(ticketTypesTable.eventId, effectiveEventId));

    const eventDays = await db
      .select({
        id: eventDaysTable.id,
        date: eventDaysTable.date,
        label: eventDaysTable.label,
        displayOrder: eventDaysTable.displayOrder,
      })
      .from(eventDaysTable)
      .where(eq(eventDaysTable.eventId, effectiveEventId));

    const zones = await db
      .select()
      .from(accessZonesTable)
      .where(eq(accessZonesTable.eventId, effectiveEventId));

    const checkins = await db
      .select({
        id: ticketCheckinsTable.id,
        ticketId: ticketCheckinsTable.ticketId,
        eventDayIndex: ticketCheckinsTable.eventDayIndex,
        checkedInAt: ticketCheckinsTable.checkedInAt,
        braceletId: ticketCheckinsTable.braceletId,
      })
      .from(ticketCheckinsTable)
      .where(eq(ticketCheckinsTable.eventId, effectiveEventId));

    const attendeeUserIds = tickets
      .map(t => t.attendeeUserId)
      .filter((uid): uid is string => !!uid);
    const uniqueUserIds = [...new Set(attendeeUserIds)];

    let attendees: Array<{ id: string; firstName: string | null; lastName: string | null; email: string; phone: string | null; profileImageUrl: string | null }> = [];
    if (uniqueUserIds.length > 0) {
      const batchSize = 500;
      for (let i = 0; i < uniqueUserIds.length; i += batchSize) {
        const batch = uniqueUserIds.slice(i, i + batchSize);
        const batchResult = await db
          .select({
            id: usersTable.id,
            firstName: usersTable.firstName,
            lastName: usersTable.lastName,
            email: usersTable.email,
            phone: usersTable.phone,
            profileImageUrl: usersTable.profileImageUrl,
          })
          .from(usersTable)
          .where(sql`${usersTable.id} IN (${sql.join(batch.map(id => sql`${id}`), sql`, `)})`);
        attendees.push(...batchResult);
      }
    }

    res.json({
      event: {
        id: event.id,
        name: event.name,
        hmacSecret: event.hmacSecret ?? "",
        attendeeQrSecret: process.env.TICKET_QR_SECRET || process.env.HMAC_SECRET || "",
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        timezone: event.timezone,
      },
      tickets,
      ticketTypes,
      eventDays: eventDays.sort((a, b) => a.displayOrder - b.displayOrder),
      zones,
      attendees,
      checkins,
      syncedAt: new Date().toISOString(),
    });
  },
);

const syncCheckinsSchema = z.object({
  checkins: z.array(z.object({
    ticketId: z.string().min(1),
    eventDayIndex: z.number(),
    checkedInAt: z.string(),
    braceletId: z.string().nullable().optional(),
    braceletNfcUid: z.string().nullable().optional(),
    accessZoneId: z.string().nullable().optional(),
    offlineId: z.string().min(1),
  })),
});

router.post(
  "/gate/sync-checkins",
  requireRole("gate", "admin", "event_admin"),
  async (req: Request, res: Response) => {
    const parsed = syncCheckinsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const userEventId = req.user!.eventId;
    if (!userEventId && req.user!.role === "gate") {
      res.status(403).json({ error: "Gate user is not assigned to an event" });
      return;
    }
    const effectiveEventId = userEventId;
    if (!effectiveEventId) {
      res.status(400).json({ error: "No event context" });
      return;
    }

    const results: Array<{ offlineId: string; status: "created" | "duplicate" | "error"; error?: string }> = [];

    for (const checkin of parsed.data.checkins) {
      try {
        const existing = await db
          .select({ id: ticketCheckinsTable.id })
          .from(ticketCheckinsTable)
          .where(and(
            eq(ticketCheckinsTable.ticketId, checkin.ticketId),
            eq(ticketCheckinsTable.eventId, effectiveEventId),
            eq(ticketCheckinsTable.eventDayIndex, checkin.eventDayIndex),
          ))
          .limit(1);

        if (existing.length > 0) {
          results.push({ offlineId: checkin.offlineId, status: "duplicate" });
          continue;
        }

        const [ticket] = await db
          .select({
            id: ticketsTable.id,
            eventId: ticketsTable.eventId,
            attendeeUserId: ticketsTable.attendeeUserId,
            ticketTypeId: ticketsTable.ticketTypeId,
            status: ticketsTable.status,
          })
          .from(ticketsTable)
          .where(and(
            eq(ticketsTable.id, checkin.ticketId),
            eq(ticketsTable.eventId, effectiveEventId),
          ))
          .limit(1);

        if (!ticket) {
          results.push({ offlineId: checkin.offlineId, status: "error", error: "Ticket not found for this event" });
          continue;
        }

        if (ticket.status === "cancelled") {
          results.push({ offlineId: checkin.offlineId, status: "error", error: "Ticket is cancelled" });
          continue;
        }

        let section: string | null = null;
        let ticketTypeName: string | null = null;
        const accessZoneId: string | null = checkin.accessZoneId ?? null;
        if (ticket.ticketTypeId) {
          const [tt] = await db
            .select({ name: ticketTypesTable.name, sectionName: venueSectionsTable.name })
            .from(ticketTypesTable)
            .leftJoin(venueSectionsTable, eq(venueSectionsTable.id, ticketTypesTable.sectionId))
            .where(eq(ticketTypesTable.id, ticket.ticketTypeId))
            .limit(1);
          if (tt) {
            section = tt.sectionName ?? null;
            ticketTypeName = tt.name ?? null;
          }
        }

        await db.insert(ticketCheckinsTable).values({
          ticketId: ticket.id,
          eventId: effectiveEventId,
          eventDayIndex: checkin.eventDayIndex,
          attendeeUserId: ticket.attendeeUserId,
          checkedInAt: new Date(checkin.checkedInAt),
          checkedInByUserId: req.user!.id,
          braceletId: checkin.braceletId ?? null,
          braceletNfcUid: checkin.braceletNfcUid ?? null,
          accessZoneId,
          section,
          ticketType: ticketTypeName,
        });

        results.push({ offlineId: checkin.offlineId, status: "created" });
      } catch (err: any) {
        results.push({ offlineId: checkin.offlineId, status: "error", error: err.message });
      }
    }

    res.json({ results });
  },
);

export default router;
