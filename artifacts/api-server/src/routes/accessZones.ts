import { Router, type IRouter, type Request, type Response } from "express";
import { db, accessZonesTable, accessUpgradesTable, braceletsTable, usersTable, eventsTable, venuesTable, venueSectionsTable } from "@workspace/db";
import { eq, and, asc, sql, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireRole";
import { z } from "zod";

const router: IRouter = Router();

const createZoneSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  colorHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "colorHex must be a 6-digit hex color like #FF0000").optional(),
  rank: z.number().int().min(0),
  upgradePrice: z.number().int().min(0).nullable().optional(),
});

const updateZoneSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  colorHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "colorHex must be a 6-digit hex color like #FF0000").optional(),
  rank: z.number().int().min(0).optional(),
  upgradePrice: z.number().int().min(0).nullable().optional(),
});

/**
 * Helper: check that the acting user may access the given event.
 * admin = all events; event_admin = only their own event.
 */
function canAccessEvent(req: Request, eventId: string): boolean {
  const user = req.user!;
  if (user.role === "admin") return true;
  if (user.role === "event_admin") return (user as { eventId?: string | null }).eventId === eventId;
  return false;
}

/**
 * Helper: check that the acting user may access the event that a bracelet belongs to.
 * admin = all; event_admin = only their own event; bank = any (bank staff scans any bracelet).
 */
function canAccessBraceletEvent(req: Request, braceletEventId: string | null): boolean {
  const user = req.user!;
  if (user.role === "admin") return true;
  if (user.role === "bank") return true;
  if (user.role === "event_admin") {
    return !!braceletEventId && (user as { eventId?: string | null }).eventId === braceletEventId;
  }
  return false;
}

/**
 * GET /api/events/:eventId/access-zones
 * Returns all zones for an event ordered by rank ascending.
 * Accessible by all staff roles. event_admin is scoped to their own event only.
 */
router.get(
  "/events/:eventId/access-zones",
  requireRole("gate", "bank", "merchant_staff", "merchant_admin", "warehouse_admin", "event_admin", "admin"),
  async (req: Request, res: Response) => {
    const { eventId } = req.params as { eventId: string };
    const user = req.user!;

    const role = user.role as string;
    const isEventScopedRole = role === "event_admin";

    if (isEventScopedRole && !canAccessEvent(req, eventId)) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const zones = await db
      .select()
      .from(accessZonesTable)
      .where(eq(accessZonesTable.eventId, eventId))
      .orderBy(asc(accessZonesTable.rank));

    res.json({ zones });
  },
);

/**
 * GET /api/access-zones?eventId=xxx
 * Flat alias for mobile clients — resolves eventId from query param or user session.
 */
router.get(
  "/access-zones",
  requireAuth,
  async (req: Request, res: Response) => {
    const eventId = (req.query.eventId as string) || (req.user! as { eventId?: string | null }).eventId;
    if (!eventId) {
      res.status(400).json({ error: "eventId required" });
      return;
    }
    const zones = await db
      .select()
      .from(accessZonesTable)
      .where(eq(accessZonesTable.eventId, eventId))
      .orderBy(asc(accessZonesTable.rank));
    res.json({ zones });
  },
);

/**
 * POST /api/events/:eventId/access-zones
 * Creates a new zone for the event.
 * Validates that rank is unique within the event.
 * Restricted to event_admin and admin.
 */
router.post(
  "/events/:eventId/access-zones",
  requireRole("admin", "event_admin"),
  async (req: Request, res: Response) => {
    const { eventId } = req.params as { eventId: string };

    if (!canAccessEvent(req, eventId)) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const parsed = createZoneSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { name, description, colorHex, rank, upgradePrice } = parsed.data;

    const [rankConflict] = await db
      .select({ id: accessZonesTable.id })
      .from(accessZonesTable)
      .where(and(eq(accessZonesTable.eventId, eventId), eq(accessZonesTable.rank, rank)));

    if (rankConflict) {
      res.status(409).json({ error: `A zone with rank ${rank} already exists for this event` });
      return;
    }

    const [zone] = await db
      .insert(accessZonesTable)
      .values({ eventId, name, description, colorHex, rank, upgradePrice: upgradePrice ?? null })
      .returning();

    res.status(201).json(zone);
  },
);

/**
 * POST /api/access-zones
 * Flat alias for mobile/admin clients that pass eventId in the body.
 */
router.post(
  "/access-zones",
  requireRole("event_admin", "admin"),
  async (req: Request, res: Response) => {
    const parsed = createZoneSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const userEventId = (req.user! as { eventId?: string | null }).eventId;
    const effectiveEventId = (req.body.eventId as string | undefined) ?? userEventId;
    if (!effectiveEventId) {
      res.status(400).json({ error: "eventId required" });
      return;
    }

    if (!canAccessEvent(req, effectiveEventId)) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const { name, description, colorHex, rank, upgradePrice } = parsed.data;

    const [rankConflict] = await db
      .select({ id: accessZonesTable.id })
      .from(accessZonesTable)
      .where(and(eq(accessZonesTable.eventId, effectiveEventId), eq(accessZonesTable.rank, rank)));

    if (rankConflict) {
      res.status(409).json({ error: `A zone with rank ${rank} already exists for this event` });
      return;
    }

    const [zone] = await db
      .insert(accessZonesTable)
      .values({ eventId: effectiveEventId, name, description, colorHex, rank, upgradePrice: upgradePrice ?? null })
      .returning();

    res.status(201).json(zone);
  },
);

/**
 * PATCH /api/events/:eventId/access-zones/:zoneId
 * Updates a zone.
 * Validates rank uniqueness if rank is changing (DB unique constraint also enforces this).
 * Restricted to event_admin and admin.
 */
router.patch(
  "/events/:eventId/access-zones/:zoneId",
  requireRole("admin", "event_admin"),
  async (req: Request, res: Response) => {
    const { eventId, zoneId } = req.params as { eventId: string; zoneId: string };

    if (!canAccessEvent(req, eventId)) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const [currentZone] = await db
      .select()
      .from(accessZonesTable)
      .where(and(eq(accessZonesTable.id, zoneId), eq(accessZonesTable.eventId, eventId)));

    if (!currentZone) {
      res.status(404).json({ error: "Access zone not found" });
      return;
    }

    const parsed = updateZoneSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { name, description, colorHex, rank, upgradePrice } = parsed.data;

    if (rank !== undefined && rank !== currentZone.rank) {
      const rankConflict = await db
        .select({ id: accessZonesTable.id })
        .from(accessZonesTable)
        .where(and(eq(accessZonesTable.eventId, eventId), eq(accessZonesTable.rank, rank)));

      if (rankConflict.length > 0) {
        res.status(409).json({ error: `A zone with rank ${rank} already exists for this event` });
        return;
      }
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (colorHex !== undefined) updates.colorHex = colorHex;
    if (rank !== undefined) updates.rank = rank;
    if (upgradePrice !== undefined) updates.upgradePrice = upgradePrice;

    const [updated] = await db
      .update(accessZonesTable)
      .set(updates)
      .where(eq(accessZonesTable.id, zoneId))
      .returning();

    res.json(updated);
  },
);

/**
 * PATCH /api/access-zones/:id
 * Flat alias for mobile clients.
 */
router.patch(
  "/access-zones/:id",
  requireRole("event_admin", "admin"),
  async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };

    const [existing] = await db
      .select()
      .from(accessZonesTable)
      .where(eq(accessZonesTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "Zone not found" });
      return;
    }

    if (!canAccessEvent(req, existing.eventId)) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const parsed = updateZoneSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { name, description, colorHex, rank, upgradePrice } = parsed.data;

    if (rank !== undefined && rank !== existing.rank) {
      const rankConflict = await db
        .select({ id: accessZonesTable.id })
        .from(accessZonesTable)
        .where(and(eq(accessZonesTable.eventId, existing.eventId), eq(accessZonesTable.rank, rank)));

      if (rankConflict.length > 0) {
        res.status(409).json({ error: `A zone with rank ${rank} already exists for this event` });
        return;
      }
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (colorHex !== undefined) updates.colorHex = colorHex;
    if (rank !== undefined) updates.rank = rank;
    if (upgradePrice !== undefined) updates.upgradePrice = upgradePrice;

    const [updated] = await db
      .update(accessZonesTable)
      .set(updates)
      .where(eq(accessZonesTable.id, id))
      .returning();

    res.json(updated);
  },
);

/**
 * DELETE /api/events/:eventId/access-zones/:zoneId
 * Deletes a zone only if no bracelets reference it in their accessZoneIds.
 * Restricted to event_admin and admin.
 */
router.delete(
  "/events/:eventId/access-zones/:zoneId",
  requireRole("admin", "event_admin"),
  async (req: Request, res: Response) => {
    const { eventId, zoneId } = req.params as { eventId: string; zoneId: string };

    if (!canAccessEvent(req, eventId)) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const [zone] = await db
      .select()
      .from(accessZonesTable)
      .where(and(eq(accessZonesTable.id, zoneId), eq(accessZonesTable.eventId, eventId)));

    if (!zone) {
      res.status(404).json({ error: "Access zone not found" });
      return;
    }

    const [braceletRef] = await db
      .select({ id: braceletsTable.id })
      .from(braceletsTable)
      .where(
        and(
          eq(braceletsTable.eventId, eventId),
          sql`${braceletsTable.accessZoneIds} @> ARRAY[${zoneId}]::text[]`,
        ),
      )
      .limit(1);

    if (braceletRef) {
      res.status(409).json({ error: "Cannot delete zone: one or more bracelets hold this zone. Remove it from bracelets first." });
      return;
    }

    await db.delete(accessZonesTable).where(eq(accessZonesTable.id, zoneId));
    res.json({ success: true });
  },
);

/**
 * DELETE /api/access-zones/:id
 * Flat alias for mobile clients.
 */
router.delete(
  "/access-zones/:id",
  requireRole("event_admin", "admin"),
  async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };

    const [existing] = await db
      .select()
      .from(accessZonesTable)
      .where(eq(accessZonesTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "Zone not found" });
      return;
    }

    if (!canAccessEvent(req, existing.eventId)) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const [braceletRef] = await db
      .select({ id: braceletsTable.id })
      .from(braceletsTable)
      .where(
        and(
          eq(braceletsTable.eventId, existing.eventId),
          sql`${braceletsTable.accessZoneIds} @> ARRAY[${id}]::text[]`,
        ),
      )
      .limit(1);

    if (braceletRef) {
      res.status(409).json({ error: "Zone is in use by one or more bracelets and cannot be deleted" });
      return;
    }

    await db.delete(accessZonesTable).where(eq(accessZonesTable.id, id));
    res.json({ success: true });
  },
);

router.post(
  "/events/:eventId/access-zones/sync-from-venue-map",
  requireRole("admin", "event_admin"),
  async (req: Request, res: Response) => {
    const { eventId } = req.params as { eventId: string };

    if (!canAccessEvent(req, eventId)) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const [event] = await db
      .select({
        ticketingEnabled: eventsTable.ticketingEnabled,
        nfcBraceletsEnabled: eventsTable.nfcBraceletsEnabled,
      })
      .from(eventsTable)
      .where(eq(eventsTable.id, eventId));

    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    if (!event.ticketingEnabled || !event.nfcBraceletsEnabled) {
      res.status(400).json({ error: "Both ticketing and NFC bracelets must be enabled for this event" });
      return;
    }

    const venues = await db
      .select({ id: venuesTable.id })
      .from(venuesTable)
      .where(eq(venuesTable.eventId, eventId));

    if (venues.length === 0) {
      res.status(400).json({ error: "No venues found for this event" });
      return;
    }

    const venueIds = venues.map((v) => v.id);
    const sections = await db
      .select()
      .from(venueSectionsTable)
      .where(inArray(venueSectionsTable.venueId, venueIds))
      .orderBy(asc(venueSectionsTable.displayOrder));

    if (sections.length === 0) {
      res.status(400).json({ error: "No venue sections found" });
      return;
    }

    const existingZones = await db
      .select()
      .from(accessZonesTable)
      .where(eq(accessZonesTable.eventId, eventId));

    const linkedSectionIds = new Set(
      existingZones
        .filter((z) => z.sourceSectionId)
        .map((z) => z.sourceSectionId!),
    );

    const existingRanks = new Set(existingZones.map((z) => z.rank));
    let maxRank = existingZones.length > 0 ? Math.max(...existingZones.map((z) => z.rank)) : -1;

    let created = 0;
    let alreadyExisted = 0;

    for (const section of sections) {
      if (linkedSectionIds.has(section.id)) {
        alreadyExisted++;
        continue;
      }

      let rank = section.displayOrder;
      while (existingRanks.has(rank)) {
        maxRank = maxRank + 1;
        rank = maxRank;
      }
      maxRank = Math.max(maxRank, rank);
      existingRanks.add(rank);

      try {
        await db.insert(accessZonesTable).values({
          eventId,
          name: section.name,
          colorHex: section.colorHex ?? "#6366F1",
          rank,
          sourceSectionId: section.id,
        });
        created++;
      } catch (insertErr: any) {
        if (insertErr?.code === "23505") {
          alreadyExisted++;
        } else {
          throw insertErr;
        }
      }
    }

    res.json({ created, alreadyExisted });
  },
);

/**
 * POST /api/bracelets/:nfcUid/check-access
 * Body: { zoneId: string }
 * Returns { granted, allowed, attendeeName, zones, grantedZones }
 * — both field naming conventions for backward compatibility.
 * Handles flagged bracelets with reason field.
 */
router.post(
  "/bracelets/:nfcUid/check-access",
  requireRole("gate", "bank", "merchant_staff", "merchant_admin", "warehouse_admin", "event_admin", "admin"),
  async (req: Request, res: Response) => {
    const { nfcUid } = req.params as { nfcUid: string };

    const parsed = z.object({ zoneId: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { zoneId } = parsed.data;

    const [bracelet] = await db
      .select()
      .from(braceletsTable)
      .where(eq(braceletsTable.nfcUid, nfcUid));

    if (!bracelet) {
      res.status(404).json({ error: "Bracelet not found" });
      return;
    }

    if (bracelet.eventId) {
      const userEventId = req.user!.eventId;
      if (userEventId && bracelet.eventId !== userEventId) {
        res.status(403).json({ error: "BRACELET_WRONG_EVENT", message: "This bracelet belongs to a different event" });
        return;
      }

      const [ev] = await db.select({ nfcBraceletsEnabled: eventsTable.nfcBraceletsEnabled }).from(eventsTable).where(eq(eventsTable.id, bracelet.eventId));
      if (ev && !ev.nfcBraceletsEnabled) {
        res.status(404).json({ error: "NFC_BRACELETS_DISABLED" });
        return;
      }
    }

    if (bracelet.flagged) {
      res.json({ granted: false, allowed: false, reason: "flagged", attendeeName: bracelet.attendeeName ?? null, zones: [], grantedZones: [] });
      return;
    }

    const grantedZoneIds: string[] = (bracelet.accessZoneIds as string[]) ?? [];

    const grantedZones = grantedZoneIds.length > 0
      ? await db
        .select({
          id: accessZonesTable.id,
          name: accessZonesTable.name,
          colorHex: accessZonesTable.colorHex,
          rank: accessZonesTable.rank,
        })
        .from(accessZonesTable)
        .where(inArray(accessZonesTable.id, grantedZoneIds))
      : [];

    const granted = grantedZoneIds.includes(zoneId);

    res.json({
      granted,
      allowed: granted,
      attendeeName: bracelet.attendeeName ?? null,
      zones: grantedZones,
      grantedZones,
    });
  },
);

/**
 * GET /api/bracelets/:nfcUid/available-upgrades
 * Returns zones with rank strictly greater than the bracelet's current highest-ranked zone.
 * Each upgrade option includes:
 *   - totalUpgradePrice: cumulative price of all step prices from current rank+1 to target rank
 *   - zonesGranted: all zones that will be added (target + any skipped intermediate zones)
 * This supports "jump" upgrades where the attendee pays the sum of all step prices.
 * Also returns currentZones and atMaxLevel for mobile UI.
 * Accessible by bank, event_admin (own event's bracelets only), and admin.
 */
router.get(
  "/bracelets/:nfcUid/available-upgrades",
  requireRole("bank", "event_admin", "admin"),
  async (req: Request, res: Response) => {
    const { nfcUid } = req.params as { nfcUid: string };

    const [bracelet] = await db
      .select()
      .from(braceletsTable)
      .where(eq(braceletsTable.nfcUid, nfcUid));

    if (!bracelet) {
      res.status(404).json({ error: "Bracelet not found" });
      return;
    }

    if (!canAccessBraceletEvent(req, bracelet.eventId ?? null)) {
      res.status(403).json({ error: "Access denied: bracelet does not belong to your event" });
      return;
    }

    if (!bracelet.eventId) {
      res.json({ currentZones: [], availableUpgrades: [], atMaxLevel: false });
      return;
    }

    const [evForUpgrade] = await db.select({ nfcBraceletsEnabled: eventsTable.nfcBraceletsEnabled }).from(eventsTable).where(eq(eventsTable.id, bracelet.eventId));
    if (evForUpgrade && !evForUpgrade.nfcBraceletsEnabled) {
      res.status(404).json({ error: "NFC_BRACELETS_DISABLED" });
      return;
    }

    const grantedZoneIds: string[] = (bracelet.accessZoneIds as string[]) ?? [];

    const allEventZones = await db
      .select()
      .from(accessZonesTable)
      .where(eq(accessZonesTable.eventId, bracelet.eventId))
      .orderBy(asc(accessZonesTable.rank));

    const currentZones = allEventZones.filter((z) => grantedZoneIds.includes(z.id));
    const maxCurrentRank = currentZones.length > 0 ? Math.max(...currentZones.map((z) => z.rank)) : -1;
    const maxPossibleRank = allEventZones.length > 0 ? Math.max(...allEventZones.map((z) => z.rank)) : -1;

    // All zones above current rank (includes skipped intermediate ranks too)
    const zonesAboveCurrent = allEventZones.filter((z) => z.rank > maxCurrentRank);

    // For each possible target zone, compute cumulative price and the full set of zones granted
    const availableUpgrades = zonesAboveCurrent
      .filter((z) => !grantedZoneIds.includes(z.id))
      .map((targetZone) => {
        // All zones from rank maxCurrentRank+1 up to targetZone.rank that aren't already granted
        const zonesGranted = zonesAboveCurrent.filter(
          (z) => z.rank <= targetZone.rank && !grantedZoneIds.includes(z.id),
        );
        const totalUpgradePrice = zonesGranted.reduce(
          (sum, z) => sum + (z.upgradePrice ?? 0),
          0,
        );
        return { ...targetZone, totalUpgradePrice, zonesGranted };
      });

    const atMaxLevel = grantedZoneIds.length > 0 && maxCurrentRank >= maxPossibleRank && availableUpgrades.length === 0;

    res.json({ currentZones, availableUpgrades, atMaxLevel });
  },
);

/**
 * POST /api/bracelets/:nfcUid/upgrade-access
 * Body: { targetZoneId: string, note?: string }
 *
 * "Jump" upgrade logic — the attendee picks a TARGET zone (e.g. rank 3).
 * The server automatically adds ALL intermediate zones between their current max rank
 * and the target rank (e.g. rank 1, rank 2, rank 3 are all added).
 * The price the bank staff should collect is the cumulative sum of each step price
 * (returned by GET /available-upgrades as totalUpgradePrice).
 *
 * Server-side validation:
 *   - targetZoneId must belong to this event
 *   - targetZone.rank must be strictly greater than the bracelet's current max rank
 *
 * Restricted to bank, event_admin (own event's bracelets only), and admin.
 */
router.post(
  "/bracelets/:nfcUid/upgrade-access",
  requireRole("bank", "event_admin", "admin"),
  async (req: Request, res: Response) => {
    const { nfcUid } = req.params as { nfcUid: string };

    const parsed = z.object({
      targetZoneId: z.string().min(1),
      note: z.string().optional(),
    }).safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { targetZoneId, note } = parsed.data;

    const [bracelet] = await db
      .select()
      .from(braceletsTable)
      .where(eq(braceletsTable.nfcUid, nfcUid));

    if (!bracelet) {
      res.status(404).json({ error: "Bracelet not found" });
      return;
    }

    if (!canAccessBraceletEvent(req, bracelet.eventId ?? null)) {
      res.status(403).json({ error: "Access denied: bracelet does not belong to your event" });
      return;
    }

    if (!bracelet.eventId) {
      res.status(422).json({ error: "Bracelet is not assigned to an event" });
      return;
    }

    const [evForAccess] = await db.select({ nfcBraceletsEnabled: eventsTable.nfcBraceletsEnabled }).from(eventsTable).where(eq(eventsTable.id, bracelet.eventId));
    if (evForAccess && !evForAccess.nfcBraceletsEnabled) {
      res.status(404).json({ error: "NFC_BRACELETS_DISABLED" });
      return;
    }

    const allEventZones = await db
      .select()
      .from(accessZonesTable)
      .where(eq(accessZonesTable.eventId, bracelet.eventId))
      .orderBy(asc(accessZonesTable.rank));

    const zoneMap = new Map(allEventZones.map((z) => [z.id, z]));

    const targetZone = zoneMap.get(targetZoneId);
    if (!targetZone) {
      res.status(422).json({ error: `Zone ${targetZoneId} does not exist for this event` });
      return;
    }

    const currentGrantedIds: string[] = (bracelet.accessZoneIds as string[]) ?? [];
    let maxCurrentRank = -1;
    for (const zId of currentGrantedIds) {
      const z = zoneMap.get(zId);
      if (z && z.rank > maxCurrentRank) maxCurrentRank = z.rank;
    }

    if (targetZone.rank <= maxCurrentRank) {
      res.status(422).json({
        error: `Zone "${targetZone.name}" (rank ${targetZone.rank}) is not an upgrade — bracelet's current max rank is ${maxCurrentRank}`,
      });
      return;
    }

    // Collect all zones from current max rank + 1 up to target rank (inclusive)
    // These are ALL the zones the bracelet gains access to in this upgrade
    const zonesToAdd = allEventZones.filter(
      (z) => z.rank > maxCurrentRank && z.rank <= targetZone.rank && !currentGrantedIds.includes(z.id),
    );
    const zoneIdsToAdd = zonesToAdd.map((z) => z.id);

    const newZoneIdsSet = new Set([...currentGrantedIds, ...zoneIdsToAdd]);
    const updatedZoneIds = Array.from(newZoneIdsSet);

    const [updatedBracelet] = await db
      .update(braceletsTable)
      .set({
        accessZoneIds: updatedZoneIds,
        updatedAt: new Date(),
      })
      .where(eq(braceletsTable.nfcUid, nfcUid))
      .returning();

    await db.insert(accessUpgradesTable).values({
      braceletId: bracelet.id,
      zoneIdsAdded: zoneIdsToAdd,
      performedByUserId: req.user!.id,
      note: note ?? null,
    });

    const resolvedZones = await db
      .select()
      .from(accessZonesTable)
      .where(sql`${accessZonesTable.id} = ANY(${updatedZoneIds}::text[])`)
      .orderBy(asc(accessZonesTable.rank));

    res.json({ bracelet: updatedBracelet, grantedZones: resolvedZones, currentZones: resolvedZones, zonesAdded: zonesToAdd });
  },
);

/**
 * PATCH /api/users/:userId/gate-zone
 * Assign a gate zone to a user (event_admin, admin)
 */
router.patch(
  "/users/:userId/gate-zone",
  requireRole("event_admin", "admin"),
  async (req: Request, res: Response) => {
    const { userId } = req.params as { userId: string };
    const gateZoneId = req.body.gateZoneId as string | null;

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (req.user!.role === "event_admin" && user.eventId !== (req.user! as { eventId?: string | null }).eventId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const [updated] = await db
      .update(usersTable)
      .set({ gateZoneId: gateZoneId ?? null, updatedAt: new Date() })
      .where(eq(usersTable.id, userId))
      .returning();

    res.json(updated);
  },
);

export default router;
