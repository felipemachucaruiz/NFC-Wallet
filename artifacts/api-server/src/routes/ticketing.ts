import { Router, type IRouter, type Request, type Response } from "express";
import { db, eventsTable, eventDaysTable, venuesTable, venueSectionsTable, ticketTypesTable, ticketTypeUnitsTable, ticketsTable, ticketCheckInsTable, ticketOrdersTable, ticketPricingStagesTable, usersTable } from "@workspace/db";
import { eq, and, asc, sql } from "drizzle-orm";
import { requireRole } from "../middlewares/requireRole";
import { requireTicketingEnabled } from "../middlewares/featureGating";
import { z } from "zod";
import { randomUUID } from "crypto";
import multer from "multer";
import { uploadObject, isBucketConfigured } from "../lib/objectStorage";
import { Storage } from "@google-cloud/storage";
import { verifyTicketQrToken } from "./ticketCheckin";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const ticketingStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
} as ConstructorParameters<typeof Storage>[0]);

const venueImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const router: IRouter = Router();

async function canAccessEvent(req: Request, eventId: string): Promise<boolean> {
  const user = req.user!;
  if (user.role === "admin") return true;
  if (user.role === "event_admin") {
    const userCompanyId = (user as { promoterCompanyId?: string | null }).promoterCompanyId;
    if (userCompanyId) {
      const [event] = await db
        .select({ promoterCompanyId: eventsTable.promoterCompanyId })
        .from(eventsTable)
        .where(eq(eventsTable.id, eventId));
      return !!event && event.promoterCompanyId === userCompanyId;
    }
    return (user as { eventId?: string | null }).eventId === eventId;
  }
  return false;
}

const createEventDaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  label: z.string().max(255).optional(),
  doorsOpenAt: z.string().optional(),
  doorsCloseAt: z.string().optional(),
  displayOrder: z.number().int().min(0).optional(),
});

const updateEventDaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  label: z.string().max(255).nullable().optional(),
  doorsOpenAt: z.string().nullable().optional(),
  doorsCloseAt: z.string().nullable().optional(),
  displayOrder: z.number().int().min(0).optional(),
});

router.get(
  "/events/:eventId/days",
  requireRole("admin", "event_admin"),
  requireTicketingEnabled((req) => req.params.eventId as string),
  async (req: Request, res: Response) => {
    const { eventId } = req.params as { eventId: string };
    if (!(await canAccessEvent(req, eventId))) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const days = await db
      .select()
      .from(eventDaysTable)
      .where(eq(eventDaysTable.eventId, eventId))
      .orderBy(asc(eventDaysTable.displayOrder), asc(eventDaysTable.date));

    res.json({ days });
  },
);

router.post(
  "/events/:eventId/days",
  requireRole("admin", "event_admin"),
  requireTicketingEnabled((req) => req.params.eventId as string),
  async (req: Request, res: Response) => {
    const { eventId } = req.params as { eventId: string };
    if (!(await canAccessEvent(req, eventId))) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const parsed = createEventDaySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { date, label, doorsOpenAt, doorsCloseAt, displayOrder } = parsed.data;

    const [day] = await db
      .insert(eventDaysTable)
      .values({
        eventId,
        date,
        label: label ?? null,
        doorsOpenAt: doorsOpenAt ? new Date(doorsOpenAt) : null,
        doorsCloseAt: doorsCloseAt ? new Date(doorsCloseAt) : null,
        displayOrder: displayOrder ?? 0,
      })
      .returning();

    res.status(201).json(day);
  },
);

router.patch(
  "/events/:eventId/days/:dayId",
  requireRole("admin", "event_admin"),
  requireTicketingEnabled((req) => req.params.eventId as string),
  async (req: Request, res: Response) => {
    const { eventId, dayId } = req.params as { eventId: string; dayId: string };
    if (!(await canAccessEvent(req, eventId))) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const parsed = updateEventDaySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const updates: Record<string, unknown> = {};
    const d = parsed.data;
    if (d.date !== undefined) updates.date = d.date;
    if (d.label !== undefined) updates.label = d.label;
    if (d.doorsOpenAt !== undefined) updates.doorsOpenAt = d.doorsOpenAt ? new Date(d.doorsOpenAt) : null;
    if (d.doorsCloseAt !== undefined) updates.doorsCloseAt = d.doorsCloseAt ? new Date(d.doorsCloseAt) : null;
    if (d.displayOrder !== undefined) updates.displayOrder = d.displayOrder;

    const [updated] = await db
      .update(eventDaysTable)
      .set(updates)
      .where(and(eq(eventDaysTable.id, dayId), eq(eventDaysTable.eventId, eventId)))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Event day not found" });
      return;
    }

    res.json(updated);
  },
);

router.delete(
  "/events/:eventId/days/:dayId",
  requireRole("admin", "event_admin"),
  requireTicketingEnabled((req) => req.params.eventId as string),
  async (req: Request, res: Response) => {
    const { eventId, dayId } = req.params as { eventId: string; dayId: string };
    if (!(await canAccessEvent(req, eventId))) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const [existing] = await db
      .select()
      .from(eventDaysTable)
      .where(and(eq(eventDaysTable.id, dayId), eq(eventDaysTable.eventId, eventId)));

    if (!existing) {
      res.status(404).json({ error: "Event day not found" });
      return;
    }

    await db.delete(eventDaysTable).where(eq(eventDaysTable.id, dayId));
    res.json({ success: true });
  },
);

const createVenueSchema = z.object({
  name: z.string().min(1).max(255),
  address: z.string().max(500).optional(),
  city: z.string().max(255).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

router.get(
  "/events/:eventId/venues",
  requireRole("admin", "event_admin"),
  requireTicketingEnabled((req) => req.params.eventId as string),
  async (req: Request, res: Response) => {
    const { eventId } = req.params as { eventId: string };
    if (!(await canAccessEvent(req, eventId))) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const venues = await db
      .select()
      .from(venuesTable)
      .where(eq(venuesTable.eventId, eventId));

    res.json({ venues });
  },
);

router.post(
  "/events/:eventId/venues",
  requireRole("admin", "event_admin"),
  requireTicketingEnabled((req) => req.params.eventId as string),
  async (req: Request, res: Response) => {
    const { eventId } = req.params as { eventId: string };
    if (!(await canAccessEvent(req, eventId))) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const parsed = createVenueSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { name, address, city, latitude, longitude } = parsed.data;

    const [venue] = await db
      .insert(venuesTable)
      .values({
        eventId,
        name,
        address: address ?? null,
        city: city ?? null,
        latitude: latitude !== undefined ? String(latitude) : null,
        longitude: longitude !== undefined ? String(longitude) : null,
      })
      .returning();

    res.status(201).json(venue);
  },
);

router.post(
  "/events/:eventId/venues/:venueId/floorplan",
  requireRole("admin", "event_admin"),
  requireTicketingEnabled((req) => req.params.eventId as string),
  venueImageUpload.single("image"),
  async (req: Request, res: Response) => {
    const { eventId, venueId } = req.params as { eventId: string; venueId: string };
    if (!(await canAccessEvent(req, eventId))) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const [venue] = await db
      .select({ id: venuesTable.id })
      .from(venuesTable)
      .where(and(eq(venuesTable.id, venueId), eq(venuesTable.eventId, eventId)));
    if (!venue) {
      res.status(404).json({ error: "Venue not found" });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: "No image file provided" });
      return;
    }

    if (!req.file.mimetype.startsWith("image/")) {
      res.status(400).json({ error: "Only image files are allowed" });
      return;
    }

    try {
      let imageUrl: string;
      const prefix = `venue-floorplans/${eventId}/${venueId}`;

      if (isBucketConfigured()) {
        const key = `${prefix}/floorplan-${randomUUID()}`;
        imageUrl = await uploadObject(key, req.file.buffer, req.file.mimetype);
      } else {
        const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
        if (!bucketId) {
          res.status(500).json({ error: "No image storage configured" });
          return;
        }
        const objectName = `${prefix}/floorplan-${randomUUID()}`;
        const bucket = ticketingStorageClient.bucket(bucketId);
        const file = bucket.file(objectName);
        await file.save(req.file.buffer, {
          metadata: { contentType: req.file.mimetype },
          resumable: false,
        });
        imageUrl = `/api/storage/objects/${objectName}`;
      }

      await db
        .update(venuesTable)
        .set({ floorplanImageUrl: imageUrl, updatedAt: new Date() })
        .where(eq(venuesTable.id, venueId));

      res.json({ floorplanImageUrl: imageUrl });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[ticketing] floorplan upload error:", msg);
      res.status(500).json({ error: `Failed to upload floorplan: ${msg}` });
    }
  },
);

const createSectionSchema = z.object({
  name: z.string().min(1).max(255),
  capacity: z.number().int().positive().optional(),
  totalTickets: z.number().int().min(0),
  colorHex: z.string().regex(/^#[0-9A-Fa-f]{6,8}$/).optional(),
  svgPathData: z.string().optional(),
  displayOrder: z.number().int().min(0).optional(),
});

router.get(
  "/events/:eventId/venues/:venueId/sections",
  requireRole("admin", "event_admin"),
  requireTicketingEnabled((req) => req.params.eventId as string),
  async (req: Request, res: Response) => {
    const { eventId, venueId } = req.params as { eventId: string; venueId: string };
    if (!(await canAccessEvent(req, eventId))) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const [venue] = await db
      .select({ id: venuesTable.id })
      .from(venuesTable)
      .where(and(eq(venuesTable.id, venueId), eq(venuesTable.eventId, eventId)));
    if (!venue) {
      res.status(404).json({ error: "Venue not found for this event" });
      return;
    }

    const sections = await db
      .select()
      .from(venueSectionsTable)
      .where(eq(venueSectionsTable.venueId, venueId))
      .orderBy(asc(venueSectionsTable.displayOrder));

    res.json({ sections });
  },
);

router.post(
  "/events/:eventId/venues/:venueId/sections",
  requireRole("admin", "event_admin"),
  requireTicketingEnabled((req) => req.params.eventId as string),
  async (req: Request, res: Response) => {
    const { eventId, venueId } = req.params as { eventId: string; venueId: string };
    if (!(await canAccessEvent(req, eventId))) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const [venue] = await db
      .select({ id: venuesTable.id })
      .from(venuesTable)
      .where(and(eq(venuesTable.id, venueId), eq(venuesTable.eventId, eventId)));
    if (!venue) {
      res.status(404).json({ error: "Venue not found" });
      return;
    }

    const parsed = createSectionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { name, capacity, totalTickets, colorHex, svgPathData, displayOrder } = parsed.data;

    const [section] = await db
      .insert(venueSectionsTable)
      .values({
        venueId,
        name,
        capacity: capacity ?? null,
        totalTickets,
        colorHex: colorHex ?? "#6366F1",
        svgPathData: svgPathData ?? null,
        displayOrder: displayOrder ?? 0,
      })
      .returning();

    res.status(201).json(section);
  },
);

router.patch(
  "/events/:eventId/venues/:venueId/sections/:sectionId",
  requireRole("admin", "event_admin"),
  requireTicketingEnabled((req) => req.params.eventId as string),
  async (req: Request, res: Response) => {
    const { eventId, venueId, sectionId } = req.params as { eventId: string; venueId: string; sectionId: string };
    if (!(await canAccessEvent(req, eventId))) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const [venue] = await db
      .select({ id: venuesTable.id })
      .from(venuesTable)
      .where(and(eq(venuesTable.id, venueId), eq(venuesTable.eventId, eventId)));
    if (!venue) {
      res.status(404).json({ error: "Venue not found for this event" });
      return;
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    const body = req.body as Record<string, unknown>;
    if (body.name !== undefined) updates.name = body.name;
    if (body.capacity !== undefined) updates.capacity = body.capacity;
    if (body.totalTickets !== undefined) updates.totalTickets = body.totalTickets;
    if (body.colorHex !== undefined) updates.colorHex = body.colorHex;
    if (body.svgPathData !== undefined) updates.svgPathData = body.svgPathData;
    if (body.displayOrder !== undefined) updates.displayOrder = body.displayOrder;

    const [updated] = await db
      .update(venueSectionsTable)
      .set(updates)
      .where(and(eq(venueSectionsTable.id, sectionId), eq(venueSectionsTable.venueId, venueId)))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Section not found" });
      return;
    }

    res.json(updated);
  },
);

const createTicketTypeSchema = z.object({
  sectionId: z.string().optional(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  price: z.number().int().min(0),
  serviceFee: z.number().int().min(0).optional(),
  quantity: z.number().int().min(1),
  saleStart: z.string().optional(),
  saleEnd: z.string().optional(),
  isActive: z.boolean().optional(),
  validEventDayIds: z.array(z.string()).optional(),
  isNumberedUnits: z.boolean().optional(),
  unitLabel: z.string().max(100).optional(),
  ticketsPerUnit: z.number().int().min(1).optional(),
});

router.get(
  "/events/:eventId/ticket-types",
  requireRole("admin", "event_admin"),
  requireTicketingEnabled((req) => req.params.eventId as string),
  async (req: Request, res: Response) => {
    const { eventId } = req.params as { eventId: string };
    if (!(await canAccessEvent(req, eventId))) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const types = await db
      .select()
      .from(ticketTypesTable)
      .where(eq(ticketTypesTable.eventId, eventId));

    res.json({ ticketTypes: types });
  },
);

router.post(
  "/events/:eventId/ticket-types",
  requireRole("admin", "event_admin"),
  requireTicketingEnabled((req) => req.params.eventId as string),
  async (req: Request, res: Response) => {
    const { eventId } = req.params as { eventId: string };
    if (!(await canAccessEvent(req, eventId))) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const parsed = createTicketTypeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { sectionId, name, description, price, serviceFee, quantity, saleStart, saleEnd, isActive, validEventDayIds, isNumberedUnits, unitLabel, ticketsPerUnit } = parsed.data;

    if (isNumberedUnits && (!unitLabel || !ticketsPerUnit)) {
      res.status(400).json({ error: "unitLabel and ticketsPerUnit are required for numbered units" });
      return;
    }

    const [ticketType] = await db
      .insert(ticketTypesTable)
      .values({
        eventId,
        sectionId: sectionId ?? null,
        name,
        description: description ?? null,
        price,
        serviceFee: serviceFee ?? 0,
        quantity,
        saleStart: saleStart ? new Date(saleStart) : null,
        saleEnd: saleEnd ? new Date(saleEnd) : null,
        isActive: isActive ?? true,
        validEventDayIds: validEventDayIds ?? [],
        isNumberedUnits: isNumberedUnits ?? false,
        unitLabel: isNumberedUnits ? unitLabel! : null,
        ticketsPerUnit: isNumberedUnits ? ticketsPerUnit! : null,
      })
      .returning();

    if (isNumberedUnits && quantity > 0) {
      const unitRows = Array.from({ length: quantity }, (_, i) => ({
        ticketTypeId: ticketType.id,
        unitNumber: i + 1,
        unitLabel: `${unitLabel} ${i + 1}`,
      }));
      await db.insert(ticketTypeUnitsTable).values(unitRows);
    }

    res.status(201).json(ticketType);
  },
);

router.patch(
  "/events/:eventId/ticket-types/:typeId",
  requireRole("admin", "event_admin"),
  requireTicketingEnabled((req) => req.params.eventId as string),
  async (req: Request, res: Response) => {
    const { eventId, typeId } = req.params as { eventId: string; typeId: string };
    if (!(await canAccessEvent(req, eventId))) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    const body = req.body as Record<string, unknown>;
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.price !== undefined) updates.price = body.price;
    if (body.serviceFee !== undefined) updates.serviceFee = body.serviceFee;
    if (body.quantity !== undefined) updates.quantity = body.quantity;
    if (body.saleStart !== undefined) updates.saleStart = body.saleStart ? new Date(body.saleStart as string) : null;
    if (body.saleEnd !== undefined) updates.saleEnd = body.saleEnd ? new Date(body.saleEnd as string) : null;
    if (body.isActive !== undefined) updates.isActive = body.isActive;
    if (body.validEventDayIds !== undefined) updates.validEventDayIds = body.validEventDayIds;
    if (body.sectionId !== undefined) updates.sectionId = body.sectionId;
    if (body.isNumberedUnits !== undefined) updates.isNumberedUnits = body.isNumberedUnits;
    if (body.unitLabel !== undefined) updates.unitLabel = body.unitLabel;
    if (body.ticketsPerUnit !== undefined) updates.ticketsPerUnit = body.ticketsPerUnit;

    const [updated] = await db
      .update(ticketTypesTable)
      .set(updates)
      .where(and(eq(ticketTypesTable.id, typeId), eq(ticketTypesTable.eventId, eventId)))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Ticket type not found" });
      return;
    }

    if (updated.isNumberedUnits && body.quantity !== undefined) {
      const existingUnits = await db
        .select()
        .from(ticketTypeUnitsTable)
        .where(eq(ticketTypeUnitsTable.ticketTypeId, typeId))
        .orderBy(asc(ticketTypeUnitsTable.unitNumber));

      const newQuantity = updated.quantity;
      const currentMax = existingUnits.length;

      if (newQuantity > currentMax) {
        const label = updated.unitLabel || "Unit";
        const newUnits = Array.from({ length: newQuantity - currentMax }, (_, i) => ({
          ticketTypeId: typeId,
          unitNumber: currentMax + i + 1,
          unitLabel: `${label} ${currentMax + i + 1}`,
        }));
        await db.insert(ticketTypeUnitsTable).values(newUnits);
      }
    }

    res.json(updated);
  },
);

const pricingStageSchema = z.object({
  name: z.string().min(1).max(255),
  price: z.number().int().min(0),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  displayOrder: z.number().int().optional(),
}).refine((d) => new Date(d.startsAt) < new Date(d.endsAt), {
  message: "startsAt must be before endsAt",
});

router.get(
  "/events/:eventId/ticket-types/:typeId/pricing-stages",
  requireRole("admin", "event_admin"),
  requireTicketingEnabled((req) => req.params.eventId as string),
  async (req: Request, res: Response) => {
    const { eventId, typeId } = req.params as { eventId: string; typeId: string };
    if (!(await canAccessEvent(req, eventId))) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const [tt] = await db.select({ id: ticketTypesTable.id }).from(ticketTypesTable).where(and(eq(ticketTypesTable.id, typeId), eq(ticketTypesTable.eventId, eventId)));
    if (!tt) {
      res.status(404).json({ error: "Ticket type not found" });
      return;
    }

    const stages = await db
      .select()
      .from(ticketPricingStagesTable)
      .where(eq(ticketPricingStagesTable.ticketTypeId, typeId))
      .orderBy(asc(ticketPricingStagesTable.displayOrder), asc(ticketPricingStagesTable.startsAt));

    res.json({ stages });
  },
);

router.post(
  "/events/:eventId/ticket-types/:typeId/pricing-stages",
  requireRole("admin", "event_admin"),
  requireTicketingEnabled((req) => req.params.eventId as string),
  async (req: Request, res: Response) => {
    const { eventId, typeId } = req.params as { eventId: string; typeId: string };
    if (!(await canAccessEvent(req, eventId))) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const [tt] = await db.select({ id: ticketTypesTable.id }).from(ticketTypesTable).where(and(eq(ticketTypesTable.id, typeId), eq(ticketTypesTable.eventId, eventId)));
    if (!tt) {
      res.status(404).json({ error: "Ticket type not found" });
      return;
    }

    const parsed = pricingStageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { name, price, startsAt, endsAt, displayOrder } = parsed.data;

    const [stage] = await db
      .insert(ticketPricingStagesTable)
      .values({
        ticketTypeId: typeId,
        name,
        price,
        startsAt: new Date(startsAt),
        endsAt: new Date(endsAt),
        displayOrder: displayOrder ?? 0,
      })
      .returning();

    res.status(201).json(stage);
  },
);

router.patch(
  "/events/:eventId/ticket-types/:typeId/pricing-stages/:stageId",
  requireRole("admin", "event_admin"),
  requireTicketingEnabled((req) => req.params.eventId as string),
  async (req: Request, res: Response) => {
    const { eventId, typeId, stageId } = req.params as { eventId: string; typeId: string; stageId: string };
    if (!(await canAccessEvent(req, eventId))) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const [tt] = await db.select({ id: ticketTypesTable.id }).from(ticketTypesTable).where(and(eq(ticketTypesTable.id, typeId), eq(ticketTypesTable.eventId, eventId)));
    if (!tt) {
      res.status(404).json({ error: "Ticket type not found" });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.price !== undefined) updates.price = body.price;
    if (body.startsAt !== undefined) updates.startsAt = new Date(body.startsAt as string);
    if (body.endsAt !== undefined) updates.endsAt = new Date(body.endsAt as string);
    if (body.displayOrder !== undefined) updates.displayOrder = body.displayOrder;

    const [updated] = await db
      .update(ticketPricingStagesTable)
      .set(updates)
      .where(and(eq(ticketPricingStagesTable.id, stageId), eq(ticketPricingStagesTable.ticketTypeId, typeId)))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Pricing stage not found" });
      return;
    }

    res.json(updated);
  },
);

router.delete(
  "/events/:eventId/ticket-types/:typeId/pricing-stages/:stageId",
  requireRole("admin", "event_admin"),
  requireTicketingEnabled((req) => req.params.eventId as string),
  async (req: Request, res: Response) => {
    const { eventId, typeId, stageId } = req.params as { eventId: string; typeId: string; stageId: string };
    if (!(await canAccessEvent(req, eventId))) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const [tt] = await db.select({ id: ticketTypesTable.id }).from(ticketTypesTable).where(and(eq(ticketTypesTable.id, typeId), eq(ticketTypesTable.eventId, eventId)));
    if (!tt) {
      res.status(404).json({ error: "Ticket type not found" });
      return;
    }

    const [deleted] = await db
      .delete(ticketPricingStagesTable)
      .where(and(eq(ticketPricingStagesTable.id, stageId), eq(ticketPricingStagesTable.ticketTypeId, typeId)))
      .returning({ id: ticketPricingStagesTable.id });

    if (!deleted) {
      res.status(404).json({ error: "Pricing stage not found" });
      return;
    }

    res.json({ success: true });
  },
);

router.get(
  "/events/:eventId/ticket-types/:typeId/units",
  requireRole("admin", "event_admin"),
  requireTicketingEnabled((req) => req.params.eventId as string),
  async (req: Request, res: Response) => {
    const { eventId, typeId } = req.params as { eventId: string; typeId: string };
    if (!(await canAccessEvent(req, eventId))) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const [tt] = await db.select({ id: ticketTypesTable.id }).from(ticketTypesTable).where(and(eq(ticketTypesTable.id, typeId), eq(ticketTypesTable.eventId, eventId)));
    if (!tt) {
      res.status(404).json({ error: "Ticket type not found" });
      return;
    }

    const units = await db
      .select()
      .from(ticketTypeUnitsTable)
      .where(eq(ticketTypeUnitsTable.ticketTypeId, typeId))
      .orderBy(asc(ticketTypeUnitsTable.unitNumber));

    res.json({ units });
  },
);

router.get(
  "/events/:eventId/ticket-orders",
  requireRole("admin", "event_admin"),
  requireTicketingEnabled((req) => req.params.eventId as string),
  async (req: Request, res: Response) => {
    const { eventId } = req.params as { eventId: string };
    if (!(await canAccessEvent(req, eventId))) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const orders = await db
      .select()
      .from(ticketOrdersTable)
      .where(eq(ticketOrdersTable.eventId, eventId));

    res.json({ orders });
  },
);

router.get(
  "/events/:eventId/tickets",
  requireRole("admin", "event_admin"),
  requireTicketingEnabled((req) => req.params.eventId as string),
  async (req: Request, res: Response) => {
    const { eventId } = req.params as { eventId: string };
    if (!(await canAccessEvent(req, eventId))) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const tickets = await db
      .select({
        id: ticketsTable.id,
        orderId: ticketsTable.orderId,
        ticketTypeId: ticketsTable.ticketTypeId,
        attendeeName: ticketsTable.attendeeName,
        attendeeEmail: ticketsTable.attendeeEmail,
        attendeePhone: ticketsTable.attendeePhone,
        attendeeUserId: ticketsTable.attendeeUserId,
        status: ticketsTable.status,
        createdAt: ticketsTable.createdAt,
      })
      .from(ticketsTable)
      .where(eq(ticketsTable.eventId, eventId));

    res.json({ tickets });
  },
);

router.get(
  "/events/:eventId/checkin-stats",
  requireRole("admin", "event_admin"),
  requireTicketingEnabled((req) => req.params.eventId as string),
  async (req: Request, res: Response) => {
    const { eventId } = req.params as { eventId: string };
    if (!(await canAccessEvent(req, eventId))) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const days = await db
      .select()
      .from(eventDaysTable)
      .where(eq(eventDaysTable.eventId, eventId))
      .orderBy(asc(eventDaysTable.displayOrder), asc(eventDaysTable.date));

    const checkIns = await db
      .select({
        eventDayId: ticketCheckInsTable.eventDayId,
        count: sql<number>`count(*)::int`,
      })
      .from(ticketCheckInsTable)
      .innerJoin(ticketsTable, eq(ticketCheckInsTable.ticketId, ticketsTable.id))
      .where(eq(ticketsTable.eventId, eventId))
      .groupBy(ticketCheckInsTable.eventDayId);

    const ticketsByDay = await db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(ticketsTable)
      .where(and(eq(ticketsTable.eventId, eventId), sql`${ticketsTable.status} != 'cancelled'`));

    const totalTickets = ticketsByDay[0]?.count ?? 0;
    const checkinMap = Object.fromEntries(checkIns.map((c) => [c.eventDayId, c.count]));

    const dayStats = days.map((day) => ({
      dayId: day.id,
      dayLabel: day.label || day.date,
      date: day.date,
      totalCheckins: checkinMap[day.id] ?? 0,
      totalTickets,
    }));

    res.json({ days: dayStats, totalTickets });
  },
);

export { verifyTicketQrToken };

export default router;
