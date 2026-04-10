import { type Request, type Response, type NextFunction } from "express";
import { db, eventsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export function requireTicketingEnabled(getEventId: (req: Request) => string | undefined) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const eventId = getEventId(req);
    if (!eventId) {
      res.status(400).json({ error: "eventId is required" });
      return;
    }

    const [event] = await db
      .select({ ticketingEnabled: eventsTable.ticketingEnabled })
      .from(eventsTable)
      .where(eq(eventsTable.id, eventId));

    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    if (!event.ticketingEnabled) {
      res.status(404).json({ error: "Ticketing is not enabled for this event" });
      return;
    }

    next();
  };
}

export function requireNfcBraceletsEnabled(getEventId: (req: Request) => string | undefined) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const eventId = getEventId(req);
    if (!eventId) {
      res.status(400).json({ error: "eventId is required" });
      return;
    }

    const [event] = await db
      .select({ nfcBraceletsEnabled: eventsTable.nfcBraceletsEnabled })
      .from(eventsTable)
      .where(eq(eventsTable.id, eventId));

    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    if (!event.nfcBraceletsEnabled) {
      res.status(404).json({ error: "NFC bracelets are not enabled for this event" });
      return;
    }

    next();
  };
}
