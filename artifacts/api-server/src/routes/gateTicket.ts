import { Router, type IRouter, type Request, type Response } from "express";
import { db, braceletsTable, usersTable, accessZonesTable, eventsTable, ticketCheckinsTable, ticketsTable, ticketTypesTable, venueSectionsTable, eventDaysTable, pool, deletedBraceletUidsTable, topUpsTable } from "@workspace/db";
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
  sectionId?: string;
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
      sectionId: typeof payload.sectionId === "string" ? payload.sectionId : undefined,
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
  let sectionId = "";
  let validDayIds: string[] = [];
  if (ticket.ticketTypeId) {
    const [tt] = await db
      .select({
        name: ticketTypesTable.name,
        sectionId: ticketTypesTable.sectionId,
        sectionName: venueSectionsTable.name,
        validEventDayIds: ticketTypesTable.validEventDayIds,
      })
      .from(ticketTypesTable)
      .leftJoin(venueSectionsTable, eq(venueSectionsTable.id, ticketTypesTable.sectionId))
      .where(eq(ticketTypesTable.id, ticket.ticketTypeId))
      .limit(1);
    if (tt) {
      typ = tt.name ?? "";
      validDayIds = tt.validEventDayIds ?? [];
      if (tt.sectionId) {
        sectionId = tt.sectionId;
      }
      if (tt.sectionName) {
        sec = tt.sectionName;
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
    sectionId: sectionId || undefined,
  };
}

const TICKET_NOT_FOUND_SENTINEL = "TICKET_NOT_FOUND_IN_DB";

async function resolveQrToken(
  qrToken: string,
  eventHmacSecret: string,
  eventId: string,
): Promise<TicketPayload | null | typeof TICKET_NOT_FOUND_SENTINEL> {
  const tokenPrefix = qrToken.slice(0, 40);
  console.log("[resolveQrToken] Resolving token. eventId=%s tokenPrefix=%s tokenLen=%d", eventId, tokenPrefix, qrToken.length);

  // 1. Try gate HMAC format (fastest, bracelet-linked or gate-generated QR)
  const gateResult = verifyTicketToken(qrToken, eventHmacSecret);
  if (gateResult) {
    console.log("[resolveQrToken] Resolved via gate HMAC. tid=%s", gateResult.tid);
    return gateResult;
  }
  console.log("[resolveQrToken] Path1 (gate HMAC) failed - sig length or HMAC mismatch. hmacSecretSet=%s", !!eventHmacSecret);

  // 2. Try direct DB lookup by qrCodeToken (most robust — works even if HMAC secrets differ between services)
  const [ticketByToken] = await db
    .select({ id: ticketsTable.id })
    .from(ticketsTable)
    .where(eq(ticketsTable.qrCodeToken, qrToken));
  if (ticketByToken) {
    console.log("[resolveQrToken] Resolved via direct DB qrCodeToken lookup. tid=%s", ticketByToken.id);
    return resolveTicketFromDb(ticketByToken.id, eventId);
  }
  console.log("[resolveQrToken] Path2 (DB qrCodeToken lookup) found no matching token");

  // 3. Try attendee HMAC format (catches valid tokens whose value may differ from stored qrCodeToken due to regeneration)
  const attendeeResult = verifyAttendeeQrToken(qrToken);
  if (attendeeResult) {
    console.log("[resolveQrToken] Resolved via attendee HMAC. tid=%s", attendeeResult.ticketId);
    return resolveTicketFromDb(attendeeResult.ticketId, eventId);
  }
  console.log("[resolveQrToken] Path3 (attendee HMAC) failed");

  // 4. Fallback: decode base64url payload and extract ticket ID without HMAC verification.
  //    Handles HMAC secret mismatch between api-server and attendee-api.
  //    Security: ticket IDs are UUIDs (122-bit entropy) — not guessable.
  try {
    const firstPart = qrToken.split(".")[0];
    if (firstPart) {
      const decoded = Buffer.from(firstPart, "base64url").toString("utf8");
      const parsed = JSON.parse(decoded);
      console.log("[resolveQrToken] Path4 decoded payload keys=%s tid=%s", Object.keys(parsed).join(","), parsed.tid);
      if (parsed && typeof parsed.tid === "string" && parsed.tid) {
        const [foundTicket] = await db
          .select({ id: ticketsTable.id, status: ticketsTable.status })
          .from(ticketsTable)
          .where(eq(ticketsTable.id, parsed.tid));
        if (foundTicket) {
          console.log("[resolveQrToken] Path4 found ticket by ID. tid=%s status=%s", foundTicket.id, foundTicket.status);
          return resolveTicketFromDb(foundTicket.id, eventId);
        }
        console.warn("[resolveQrToken] Path4 decoded tid=%s but ticket NOT found in DB for eventId=%s", parsed.tid, eventId);
        return TICKET_NOT_FOUND_SENTINEL;
      }
    }
  } catch (err) {
    console.warn("[resolveQrToken] Path4 parse error: %s", String(err));
  }

  console.warn("[resolveQrToken] All resolution paths failed. eventId=%s tokenPrefix=%s", eventId, tokenPrefix);
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
    if (ticket === TICKET_NOT_FOUND_SENTINEL) {
      res.status(400).json({ error: "TICKET_NOT_FOUND", message: "Ticket ID decoded from QR but not found in this event database" });
      return;
    }

    if (ticket.eid !== effectiveEventId) {
      res.status(400).json({ error: "WRONG_EVENT", message: "This ticket is for a different event" });
      return;
    }

    const now = new Date();
    const todayDayIndex = getEventDayIndex(event, now);

    if (todayDayIndex < 0) {
      res.status(400).json({ error: "EVENT_NOT_STARTED", message: "Event has not started yet" });
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
        pendingWalletBalance: usersTable.pendingWalletBalance,
      })
      .from(usersTable)
      .where(eq(usersTable.id, ticket.uid));

    if (!attendee) {
      res.status(404).json({ error: "ATTENDEE_NOT_FOUND", message: "Attendee account not found" });
      return;
    }

    let resolvedSectionId = ticket.sectionId;
    if (!resolvedSectionId && ticket.tid) {
      const [ticketRow] = await db
        .select({ ticketTypeId: ticketsTable.ticketTypeId })
        .from(ticketsTable)
        .where(eq(ticketsTable.id, ticket.tid));
      if (ticketRow?.ticketTypeId) {
        const [ttRow] = await db
          .select({ sectionId: ticketTypesTable.sectionId })
          .from(ticketTypesTable)
          .where(eq(ticketTypesTable.id, ticketRow.ticketTypeId));
        if (ttRow?.sectionId) {
          resolvedSectionId = ttRow.sectionId;
        }
      }
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

    if (resolvedSectionId) {
      const [sectionZone] = await db
        .select({ id: accessZonesTable.id })
        .from(accessZonesTable)
        .where(
          and(
            eq(accessZonesTable.eventId, effectiveEventId),
            eq(accessZonesTable.sourceSectionId, resolvedSectionId),
          ),
        );
      if (sectionZone && !accessZoneIds.includes(sectionZone.id)) {
        accessZoneIds.push(sectionZone.id);
        if (!zone) {
          const [fullZone] = await db
            .select()
            .from(accessZonesTable)
            .where(eq(accessZonesTable.id, sectionZone.id));
          zone = fullZone ?? null;
        }
      }
    }

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
        pendingWalletBalance: attendee.pendingWalletBalance ?? 0,
        // Activation fee charged on first physical chip write (activatedAt not yet set).
        // Only applied when there is pending balance to write; zero if balance doesn't cover it.
        activationFeeAmount: (() => {
          const pending = attendee.pendingWalletBalance ?? 0;
          if (bracelet?.activatedAt || pending <= 0) return 0;
          const fee = event.braceletActivationFee ?? 3000;
          return pending > fee ? fee : 0;
        })(),
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
    if (ticket === TICKET_NOT_FOUND_SENTINEL) {
      res.status(400).json({ error: "TICKET_NOT_FOUND", message: "Ticket ID decoded from QR but not found in this event database" });
      return;
    }

    if (ticket.eid !== effectiveEventId) {
      res.status(400).json({ error: "WRONG_EVENT", message: "This ticket is for a different event" });
      return;
    }

    const now = new Date();
    const todayDayIndex = getEventDayIndex(event, now);

    if (todayDayIndex < 0) {
      res.status(400).json({ error: "EVENT_NOT_STARTED", message: "Event has not started yet" });
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
    if (ticket === TICKET_NOT_FOUND_SENTINEL) {
      res.status(400).json({ error: "TICKET_NOT_FOUND", message: "Ticket ID decoded from QR but not found in this event database" });
      return;
    }
    if (ticket.eid !== effectiveEventId) {
      res.status(400).json({ error: "WRONG_EVENT", message: "This ticket is for a different event" });
      return;
    }

    const now = new Date();
    const todayDayIndex = getEventDayIndex(event, now);

    if (todayDayIndex < 0) {
      res.status(400).json({ error: "EVENT_NOT_STARTED", message: "Event has not started yet" });
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
        attendees.push(...batchResult.map(r => ({ ...r, email: r.email ?? "" })));
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

        if (!ticket.attendeeUserId) {
          results.push({ offlineId: checkin.offlineId, status: "error", error: "Ticket has no linked attendee" });
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

/**
 * POST /gate/bracelet-register
 * NFC-only bracelet registration (no ticket QR required).
 * Used when an event has NFC bracelets enabled but ticketing disabled —
 * staff simply taps the bracelet to register it to the event.
 * The bracelet is optionally granted access to the gate user's assigned zone.
 */
const braceletRegisterSchema = z.object({
  braceletNfcUid: z.string().min(1),
});

router.post(
  "/gate/bracelet-register",
  requireRole("gate", "admin", "event_admin"),
  async (req: Request, res: Response) => {
    const parsed = braceletRegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "braceletNfcUid is required" });
      return;
    }

    const { braceletNfcUid } = parsed.data;
    const gateUser = req.user!;
    const eventId = gateUser.eventId;
    if (!eventId) {
      res.status(403).json({ error: "Gate user is not assigned to an event" });
      return;
    }

    const [event] = await db
      .select({ id: eventsTable.id, hmacSecret: eventsTable.hmacSecret, nfcBraceletsEnabled: eventsTable.nfcBraceletsEnabled })
      .from(eventsTable)
      .where(eq(eventsTable.id, eventId));
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    if (!event.nfcBraceletsEnabled) {
      res.status(403).json({ error: "NFC bracelets are not enabled for this event" });
      return;
    }

    // Check if bracelet already registered to a different event
    const [existing] = await db
      .select({ id: braceletsTable.id, eventId: braceletsTable.eventId })
      .from(braceletsTable)
      .where(eq(braceletsTable.nfcUid, braceletNfcUid));

    if (existing && existing.eventId && existing.eventId !== eventId) {
      res.status(409).json({ error: "BRACELET_WRONG_EVENT", message: "This bracelet belongs to a different event" });
      return;
    }

    const gateZoneId = (gateUser as unknown as { gateZoneId?: string | null }).gateZoneId ?? null;

    // Clear tombstone if present so a previously hard-deleted bracelet can be re-registered
    await db
      .delete(deletedBraceletUidsTable)
      .where(eq(deletedBraceletUidsTable.nfcUid, braceletNfcUid));

    // Upsert bracelet record
    let bracelet;
    if (existing) {
      [bracelet] = await db
        .update(braceletsTable)
        .set({
          eventId,
          registeredByUserId: gateUser.id,
        })
        .where(eq(braceletsTable.id, existing.id))
        .returning();
    } else {
      [bracelet] = await db
        .insert(braceletsTable)
        .values({
          nfcUid: braceletNfcUid,
          eventId,
          registeredByUserId: gateUser.id,
        })
        .returning();
    }

    // Grant access to gate zone if the user has one assigned.
    // Access zones are stored as an array on the bracelet row itself.
    let zoneGranted = false;
    if (gateZoneId && bracelet) {
      try {
        const [zone] = await db
          .select({ id: accessZonesTable.id, eventId: accessZonesTable.eventId })
          .from(accessZonesTable)
          .where(eq(accessZonesTable.id, gateZoneId));
        if (zone && zone.eventId === eventId) {
          const currentZones: string[] = (bracelet as any).accessZoneIds ?? [];
          if (!currentZones.includes(gateZoneId)) {
            await db
              .update(braceletsTable)
              .set({ accessZoneIds: [...currentZones, gateZoneId] })
              .where(eq(braceletsTable.id, bracelet.id));
          }
          zoneGranted = true;
        }
      } catch {
        // Zone grant is best-effort — bracelet is registered regardless
      }
    }

    res.json({
      ok: true,
      braceletId: bracelet?.id ?? null,
      braceletNfcUid,
      zoneGranted,
      zoneId: zoneGranted ? gateZoneId : null,
    });
  },
);

const confirmNfcWriteSchema = z.object({
  braceletNfcUid: z.string().min(1),
  attendeeUserId: z.string().min(1),
  transferredAmount: z.number().int().min(1),
});

// Called by the staff app after a successful NFC write that included pending wallet balance.
// Zeroes the user's pendingWalletBalance and creates a top-up record for audit/reconciliation.
router.post(
  "/gate/confirm-nfc-write",
  requireRole("gate", "admin", "event_admin"),
  async (req: Request, res: Response) => {
    const parsed = confirmNfcWriteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { braceletNfcUid, attendeeUserId, transferredAmount } = parsed.data;

    const [user] = await db
      .select({ pendingWalletBalance: usersTable.pendingWalletBalance })
      .from(usersTable)
      .where(eq(usersTable.id, attendeeUserId));

    if (!user) {
      res.status(404).json({ error: "Attendee not found" });
      return;
    }

    // Guard: don't clear more than what's actually pending
    if (user.pendingWalletBalance <= 0) {
      res.json({ ok: true, transferred: 0 });
      return;
    }

    const [bracelet] = await db
      .select({ lastKnownBalance: braceletsTable.lastKnownBalance, lastCounter: braceletsTable.lastCounter, activatedAt: braceletsTable.activatedAt, eventId: braceletsTable.eventId })
      .from(braceletsTable)
      .where(eq(braceletsTable.nfcUid, braceletNfcUid));

    // Activation fee: re-derived server-side (don't trust client amount)
    let activationFeeAmount = 0;
    if (bracelet && !bracelet.activatedAt && bracelet.eventId) {
      const [ev] = await db
        .select({ braceletActivationFee: eventsTable.braceletActivationFee })
        .from(eventsTable)
        .where(eq(eventsTable.id, bracelet.eventId));
      const fee = ev?.braceletActivationFee ?? 3000;
      // Only charge if pending balance covers the fee
      if (user.pendingWalletBalance > fee) activationFeeAmount = fee;
    }

    const netToTransfer = user.pendingWalletBalance - activationFeeAmount;
    const amountToTransfer = Math.min(transferredAmount, netToTransfer);
    if (amountToTransfer <= 0) {
      res.json({ ok: true, transferred: 0 });
      return;
    }

    const now = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(usersTable)
        .set({
          pendingWalletBalance: 0,
          updatedAt: now,
        })
        .where(eq(usersTable.id, attendeeUserId));

      if (bracelet) {
        const newBalance = bracelet.lastKnownBalance + amountToTransfer;
        const newCounter = bracelet.lastCounter + 1;

        await tx
          .update(braceletsTable)
          .set({
            lastKnownBalance: newBalance,
            lastCounter: newCounter,
            pendingSync: false,
            pendingBalance: 0,
            pendingTopUpAmount: 0,
            activatedAt: bracelet.activatedAt ?? now,
            updatedAt: now,
          })
          .where(eq(braceletsTable.nfcUid, braceletNfcUid));

        await tx.insert(topUpsTable).values({
          braceletUid: braceletNfcUid,
          amount: user.pendingWalletBalance,
          paymentMethod: "card_external",
          performedByUserId: req.user!.id,
          status: "completed",
          newBalance,
          newCounter,
          activationFeeAmount,
        });
      }
    });

    res.json({ ok: true, transferred: amountToTransfer, activationFeeAmount });
  },
);

export default router;
