import { Router } from "express";
import { z } from "zod";
import { db, pool } from "@workspace/db";
import { whatsappTemplatesTable, whatsappTriggerMappingsTable, whatsappMessageLogTable } from "@workspace/db/schema";
import { eq, and, desc, asc, sql, like, or } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireRole";

const router = Router();

const createTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  gupshupTemplateId: z.string().min(1).max(255),
  description: z.string().optional(),
  language: z.string().max(10).default("es"),
  category: z.enum(["UTILITY", "MARKETING", "AUTHENTICATION"]).default("UTILITY"),
  status: z.enum(["active", "inactive", "pending_approval"]).default("active"),
  parameters: z.array(z.object({
    name: z.string(),
    description: z.string(),
    example: z.string().optional(),
  })).default([]),
  buttons: z.array(z.object({
    type: z.enum(["url", "phone"]),
    text: z.string(),
  })).default([]),
  bodyPreview: z.string().optional(),
});

const updateTemplateSchema = createTemplateSchema.partial();

const createMappingSchema = z.object({
  triggerType: z.enum(["ticket_purchased", "otp_verification", "event_reminder", "ticket_refund", "welcome_message", "custom"]),
  templateId: z.string().min(1),
  eventId: z.string().optional().nullable(),
  active: z.boolean().default(true),
  priority: z.number().int().default(0),
  parameterMappings: z.array(z.object({
    position: z.number().int().min(1),
    field: z.string().min(1),
  })).default([]).refine(
    (arr) => new Set(arr.map(m => m.position)).size === arr.length,
    { message: "Duplicate positions are not allowed" }
  ),
});

const updateMappingSchema = createMappingSchema.partial();

router.get("/whatsapp-templates/gupshup", requireAuth, requireRole("admin"), async (req, res) => {
  const apiKey = process.env.GUPSHUP_API_KEY;
  const appId = process.env.GUPSHUP_APP_ID;

  if (!apiKey || !appId) {
    res.status(503).json({ error: "Gupshup not configured", templates: [] });
    return;
  }

  try {
    const params = new URLSearchParams();
    params.set("pageSize", "100");
    const status = req.query.templateStatus as string | undefined;
    if (status) params.set("templateStatus", status);

    const gupshupRes = await fetch(
      `https://api.gupshup.io/wa/app/${encodeURIComponent(appId)}/template?${params.toString()}`,
      { headers: { apikey: apiKey } },
    );

    if (!gupshupRes.ok) {
      const text = await gupshupRes.text();
      console.error("Gupshup template list error:", gupshupRes.status, text);
      res.status(502).json({ error: "Failed to fetch from Gupshup" });
      return;
    }

    const data = await gupshupRes.json() as { status: string; templates?: Array<Record<string, unknown>> };
    const templates = (data.templates ?? []).map((t: Record<string, unknown>) => ({
      id: t.id,
      elementName: t.elementName,
      category: t.category,
      languageCode: t.languageCode,
      status: t.status,
      templateType: t.templateType,
      data: t.data,
      meta: t.meta,
    }));

    res.json({ templates });
  } catch (err) {
    console.error("Failed to fetch Gupshup templates:", err);
    res.status(502).json({ error: "Failed to fetch from Gupshup" });
  }
});

router.get("/whatsapp-templates", requireAuth, requireRole("admin"), async (_req, res) => {
  try {
    const templates = await db.select().from(whatsappTemplatesTable).orderBy(desc(whatsappTemplatesTable.createdAt));
    res.json({ templates });
  } catch (err) {
    console.error("Failed to fetch whatsapp templates:", err);
    res.status(500).json({ error: "Failed to fetch templates" });
  }
});

router.post("/whatsapp-templates", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const parsed = createTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }
    const [template] = await db.insert(whatsappTemplatesTable).values(parsed.data).returning();
    res.status(201).json({ template });
  } catch (err) {
    console.error("Failed to create whatsapp template:", err);
    res.status(500).json({ error: "Failed to create template" });
  }
});

router.patch("/whatsapp-templates/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = req.params.id as string;
    const parsed = updateTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }
    const [template] = await db.update(whatsappTemplatesTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(whatsappTemplatesTable.id, id))
      .returning();
    if (!template) {
      res.status(404).json({ error: "Template not found" });
      return;
    }
    res.json({ template });
  } catch (err) {
    console.error("Failed to update whatsapp template:", err);
    res.status(500).json({ error: "Failed to update template" });
  }
});

router.delete("/whatsapp-templates/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = req.params.id as string;
    const [deleted] = await db.delete(whatsappTemplatesTable)
      .where(eq(whatsappTemplatesTable.id, id))
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Template not found" });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Failed to delete whatsapp template:", err);
    res.status(500).json({ error: "Failed to delete template" });
  }
});

router.get("/whatsapp-trigger-mappings", requireAuth, requireRole("admin"), async (_req, res) => {
  try {
    const mappings = await db.select({
      mapping: whatsappTriggerMappingsTable,
      templateName: whatsappTemplatesTable.name,
      templateGupshupId: whatsappTemplatesTable.gupshupTemplateId,
    })
      .from(whatsappTriggerMappingsTable)
      .leftJoin(whatsappTemplatesTable, eq(whatsappTriggerMappingsTable.templateId, whatsappTemplatesTable.id))
      .orderBy(asc(whatsappTriggerMappingsTable.triggerType), desc(whatsappTriggerMappingsTable.priority));
    res.json({ mappings });
  } catch (err) {
    console.error("Failed to fetch trigger mappings:", err);
    res.status(500).json({ error: "Failed to fetch trigger mappings" });
  }
});

router.post("/whatsapp-trigger-mappings", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const parsed = createMappingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }
    const [existing] = await db.select().from(whatsappTemplatesTable).where(eq(whatsappTemplatesTable.id, parsed.data.templateId));
    if (!existing) {
      res.status(400).json({ error: "Template not found" });
      return;
    }
    const [mapping] = await db.insert(whatsappTriggerMappingsTable).values({
      ...parsed.data,
      eventId: parsed.data.eventId || null,
    }).returning();
    res.status(201).json({ mapping });
  } catch (err) {
    console.error("Failed to create trigger mapping:", err);
    res.status(500).json({ error: "Failed to create trigger mapping" });
  }
});

router.patch("/whatsapp-trigger-mappings/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = req.params.id as string;
    const parsed = updateMappingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }
    const [mapping] = await db.update(whatsappTriggerMappingsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(whatsappTriggerMappingsTable.id, id))
      .returning();
    if (!mapping) {
      res.status(404).json({ error: "Mapping not found" });
      return;
    }
    res.json({ mapping });
  } catch (err) {
    console.error("Failed to update trigger mapping:", err);
    res.status(500).json({ error: "Failed to update trigger mapping" });
  }
});

router.delete("/whatsapp-trigger-mappings/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = req.params.id as string;
    const [deleted] = await db.delete(whatsappTriggerMappingsTable)
      .where(eq(whatsappTriggerMappingsTable.id, id))
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Mapping not found" });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Failed to delete trigger mapping:", err);
    res.status(500).json({ error: "Failed to delete trigger mapping" });
  }
});

router.get("/whatsapp-trigger-mappings/resolve/:triggerType", requireAuth, async (req, res) => {
  try {
    const { triggerType } = req.params;
    const { eventId } = req.query;

    const conditions = [
      eq(whatsappTriggerMappingsTable.active, true),
      eq(whatsappTriggerMappingsTable.triggerType, triggerType as any),
    ];

    const allMappings = await db.select({
      mapping: whatsappTriggerMappingsTable,
      template: whatsappTemplatesTable,
    })
      .from(whatsappTriggerMappingsTable)
      .innerJoin(whatsappTemplatesTable, and(
        eq(whatsappTriggerMappingsTable.templateId, whatsappTemplatesTable.id),
        eq(whatsappTemplatesTable.status, "active"),
      ))
      .where(and(...conditions))
      .orderBy(desc(whatsappTriggerMappingsTable.priority));

    type MappingRow = (typeof allMappings)[0];
    let resolved = allMappings.find((m: MappingRow) => eventId && m.mapping.eventId === eventId);
    if (!resolved) {
      resolved = allMappings.find((m: MappingRow) => !m.mapping.eventId);
    }

    if (!resolved) {
      res.json({ resolved: null });
      return;
    }

    res.json({
      resolved: {
        templateId: resolved.template.id,
        gupshupTemplateId: resolved.template.gupshupTemplateId,
        parameters: resolved.template.parameters,
        parameterMappings: resolved.mapping.parameterMappings,
        bodyPreview: resolved.template.bodyPreview,
      },
    });
  } catch (err) {
    console.error("Failed to resolve trigger mapping:", err);
    res.status(500).json({ error: "Failed to resolve trigger mapping" });
  }
});

router.get("/whatsapp-message-log", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = (page - 1) * limit;
    const statusFilter = req.query.status as string;
    const search = req.query.search as string;

    const conditions = [];
    if (statusFilter && ["sent", "failed", "pending"].includes(statusFilter)) {
      conditions.push(eq(whatsappMessageLogTable.status, statusFilter as "sent" | "failed" | "pending"));
    }
    if (search) {
      conditions.push(
        or(
          like(whatsappMessageLogTable.destination, `%${search}%`),
          like(whatsappMessageLogTable.attendeeName, `%${search}%`),
          like(whatsappMessageLogTable.templateName, `%${search}%`),
        ),
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(whatsappMessageLogTable)
      .where(where);

    const messages = await db
      .select()
      .from(whatsappMessageLogTable)
      .where(where)
      .orderBy(desc(whatsappMessageLogTable.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({
      messages,
      pagination: {
        page,
        limit,
        total: Number(countResult.count),
        totalPages: Math.ceil(Number(countResult.count) / limit),
      },
    });
  } catch (err) {
    console.error("Failed to fetch message log:", err);
    res.status(500).json({ error: "Failed to fetch message log" });
  }
});

router.get("/whatsapp-message-log/stats", requireAuth, requireRole("admin"), async (_req, res) => {
  try {
    const stats = await db
      .select({
        status: whatsappMessageLogTable.status,
        count: sql<number>`count(*)`,
      })
      .from(whatsappMessageLogTable)
      .groupBy(whatsappMessageLogTable.status);

    const result: Record<string, number> = { sent: 0, failed: 0, pending: 0 };
    for (const row of stats) {
      result[row.status] = Number(row.count);
    }
    result.total = result.sent + result.failed + result.pending;

    res.json(result);
  } catch (err) {
    console.error("Failed to fetch message stats:", err);
    res.status(500).json({ error: "Failed to fetch message stats" });
  }
});

router.post("/whatsapp-message-log/:id/resend", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = req.params.id as string;
    const [message] = await db
      .select()
      .from(whatsappMessageLogTable)
      .where(eq(whatsappMessageLogTable.id, id));

    if (!message) {
      res.status(404).json({ error: "Message not found" });
      return;
    }

    const payload = message.payload as Record<string, unknown>;
    if (!payload) {
      res.status(400).json({ error: "No payload available for resend" });
      return;
    }

    const GUPSHUP_API_KEY = process.env.GUPSHUP_API_KEY;
    const GUPSHUP_APP_NAME = process.env.GUPSHUP_APP_NAME;
    const GUPSHUP_SOURCE = process.env.GUPSHUP_SOURCE_NUMBER;

    if (!GUPSHUP_API_KEY || !GUPSHUP_APP_NAME || !GUPSHUP_SOURCE) {
      res.status(503).json({ error: "WhatsApp not configured" });
      return;
    }

    let url: string;
    const body = new URLSearchParams();
    body.append("channel", "whatsapp");
    body.append("source", GUPSHUP_SOURCE);
    body.append("destination", message.destination);
    body.append("src.name", GUPSHUP_APP_NAME);

    if (message.messageType === "template") {
      url = "https://api.gupshup.io/wa/api/v1/template/msg";
      const templatePayload = { id: payload.templateId, params: payload.params };
      body.append("template", JSON.stringify(templatePayload));
    } else {
      url = "https://api.gupshup.io/wa/api/v1/msg";
      body.append("message", JSON.stringify(payload));
    }

    const gupshupRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        apikey: GUPSHUP_API_KEY,
      },
      body: body.toString(),
    });

    const responseText = await gupshupRes.text();
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(responseText); } catch {}

    const success = gupshupRes.ok && parsed.status !== "error";

    await db.update(whatsappMessageLogTable)
      .set({
        status: success ? "sent" : "failed",
        errorMessage: success ? null : (parsed.message as string || responseText),
        retryCount: sql`${whatsappMessageLogTable.retryCount} + 1`,
        gupshupMessageId: success ? (parsed.messageId as string || null) : message.gupshupMessageId,
        updatedAt: new Date(),
      })
      .where(eq(whatsappMessageLogTable.id, id));

    if (success) {
      res.json({ success: true, messageId: parsed.messageId });
    } else {
      res.status(502).json({ success: false, error: parsed.message || responseText });
    }
  } catch (err) {
    console.error("Failed to resend message:", err);
    res.status(500).json({ error: "Failed to resend message" });
  }
});

// ── Event Reminder Schedules ──────────────────────────────────────────────────

router.get("/whatsapp-reminder-schedules", requireAuth, requireRole("admin"), async (req, res) => {
  const { eventId } = req.query as { eventId?: string };
  if (!eventId) { res.status(400).json({ error: "eventId query param required" }); return; }
  const isGlobal = eventId === "global";
  const { rows } = await pool.query(`
    SELECT s.id, s.event_id, s.days_before, s.template_mapping_id, s.template_id,
           s.param_mappings, s.enabled, s.sent_at, s.created_at, s.updated_at,
           COALESCE(t2.name, t1.name) AS template_name,
           COALESCE(t2.gupshup_template_id, t1.gupshup_template_id) AS gupshup_template_id
    FROM event_reminder_schedules s
    LEFT JOIN whatsapp_trigger_mappings m ON m.id = s.template_mapping_id
    LEFT JOIN whatsapp_templates t1 ON t1.id = m.template_id
    LEFT JOIN whatsapp_templates t2 ON t2.id = s.template_id
    WHERE ${isGlobal ? "s.event_id IS NULL" : "s.event_id = $1"}
    ORDER BY s.days_before ASC
  `, isGlobal ? [] : [eventId]);
  res.json({ schedules: rows });
});

const paramMappingSchema = z.array(z.object({ position: z.number().int().min(1), field: z.string().min(1) }));

const upsertScheduleSchema = z.object({
  eventId: z.string().nullable().optional(),
  daysBefore: z.number().int().min(0).max(365),
  templateId: z.string().nullable().optional(),
  paramMappings: paramMappingSchema.nullable().optional(),
  enabled: z.boolean().optional(),
});

router.post("/whatsapp-reminder-schedules", requireAuth, requireRole("admin"), async (req, res) => {
  const parsed = upsertScheduleSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { eventId, daysBefore, templateId, paramMappings, enabled } = parsed.data;
  const resolvedEventId = (!eventId || eventId === "global") ? null : eventId;
  const { rows } = await pool.query<{ id: string }>(`
    INSERT INTO event_reminder_schedules (event_id, days_before, template_id, param_mappings, enabled)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id
  `, [resolvedEventId, daysBefore, templateId ?? null, paramMappings ? JSON.stringify(paramMappings) : null, enabled ?? true]);
  res.json({ id: rows[0].id });
});

router.patch("/whatsapp-reminder-schedules/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const { id } = req.params as { id: string };
  const schema = z.object({
    templateId: z.string().nullable().optional(),
    paramMappings: paramMappingSchema.nullable().optional(),
    enabled: z.boolean().optional(),
    resetSentAt: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { templateId, paramMappings, enabled, resetSentAt } = parsed.data;
  const setClauses: string[] = ["updated_at = now()"];
  const values: unknown[] = [];
  if (templateId !== undefined) { values.push(templateId); setClauses.push(`template_id = $${values.length}`); }
  if (paramMappings !== undefined) { values.push(paramMappings ? JSON.stringify(paramMappings) : null); setClauses.push(`param_mappings = $${values.length}`); }
  if (enabled !== undefined) { values.push(enabled); setClauses.push(`enabled = $${values.length}`); }
  if (resetSentAt) setClauses.push("sent_at = NULL");
  values.push(id);
  await pool.query(`UPDATE event_reminder_schedules SET ${setClauses.join(", ")} WHERE id = $${values.length}`, values);
  res.json({ ok: true });
});

router.delete("/whatsapp-reminder-schedules/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const { id } = req.params as { id: string };
  await pool.query(`DELETE FROM event_reminder_schedules WHERE id = $1`, [id]);
  res.json({ ok: true });
});

router.post("/whatsapp-reminder-schedules/:id/test", requireAuth, requireRole("admin"), async (req, res) => {
  const { id } = req.params as { id: string };
  const { phone, attendeeName, eventId: testEventId } = req.body as { phone?: string; attendeeName?: string; eventId?: string };
  if (!phone) { res.status(400).json({ error: "phone is required" }); return; }

  const GUPSHUP_API_KEY = process.env.GUPSHUP_API_KEY;
  const GUPSHUP_APP_NAME = process.env.GUPSHUP_APP_NAME;
  const GUPSHUP_SOURCE = process.env.GUPSHUP_SOURCE_NUMBER;
  if (!GUPSHUP_API_KEY || !GUPSHUP_APP_NAME || !GUPSHUP_SOURCE) {
    res.status(503).json({ error: "WhatsApp not configured" });
    return;
  }

  try {
    // Fetch schedule + associated event
    const { rows } = await pool.query<{
      template_id: string | null;
      template_mapping_id: string | null;
      param_mappings: Array<{ position: number; field: string }> | null;
      days_before: number;
      event_name: string | null;
      venue_address: string | null;
      latitude: string | null;
      longitude: string | null;
      event_starts_at: string | null;
    }>(`
      SELECT s.template_id, s.template_mapping_id, s.param_mappings, s.days_before,
             e.name AS event_name, e.venue_address, e.latitude, e.longitude, e.starts_at AS event_starts_at
      FROM event_reminder_schedules s
      LEFT JOIN events e ON e.id = s.event_id
      WHERE s.id = $1
    `, [id]);

    if (!rows[0]) { res.status(404).json({ error: "Schedule not found" }); return; }
    const sched = rows[0];

    // Resolve template
    let gupshupTemplateId: string | null = null;
    let resolvedTemplateId: string | null = sched.template_id;
    let paramMappings: Array<{ position: number; field: string }> = [];
    let bodyParamCount = 0;
    let templateButtons: Array<{ type: string; text: string }> = [];

    if (sched.template_id) {
      const { rows: tplRows } = await pool.query<{
        gupshup_template_id: string;
        parameters: Array<{ name: string }> | null;
        buttons: Array<{ type: string; text: string }> | null;
      }>(`SELECT gupshup_template_id, parameters, buttons FROM whatsapp_templates WHERE id = $1 AND status = 'active'`, [sched.template_id]);
      if (tplRows[0]) {
        gupshupTemplateId = tplRows[0].gupshup_template_id;
        paramMappings = sched.param_mappings ?? [];
        bodyParamCount = tplRows[0].parameters?.length ?? 0;
        templateButtons = tplRows[0].buttons ?? [];
      }
    } else if (sched.template_mapping_id) {
      const { rows: mRows } = await pool.query<{
        gupshup_template_id: string;
        template_id: string;
        parameter_mappings: Array<{ position: number; field: string }>;
        parameters: Array<{ name: string }> | null;
        buttons: Array<{ type: string; text: string }> | null;
      }>(`
        SELECT t.gupshup_template_id, t.id AS template_id, m.parameter_mappings, t.parameters, t.buttons
        FROM whatsapp_trigger_mappings m
        JOIN whatsapp_templates t ON t.id = m.template_id
        WHERE m.id = $1 AND m.active = true AND t.status = 'active'
      `, [sched.template_mapping_id]);
      if (mRows[0]) {
        gupshupTemplateId = mRows[0].gupshup_template_id;
        resolvedTemplateId = mRows[0].template_id;
        paramMappings = mRows[0].parameter_mappings ?? [];
        bodyParamCount = mRows[0].parameters?.length ?? 0;
        templateButtons = mRows[0].buttons ?? [];
      }
    }

    if (!gupshupTemplateId) { res.status(400).json({ error: "No active template configured for this schedule" }); return; }

    // If a specific event was requested for the test, fetch its data
    let eventName = sched.event_name;
    let venueAddress = sched.venue_address;
    let latitude = sched.latitude;
    let longitude = sched.longitude;
    let eventStartsAt = sched.event_starts_at;

    if (testEventId) {
      const { rows: evRows } = await pool.query<{
        name: string; venue_address: string | null; latitude: string | null; longitude: string | null; starts_at: string;
      }>(`SELECT name, venue_address, latitude, longitude, starts_at FROM events WHERE id = $1`, [testEventId]);
      if (evRows[0]) {
        eventName = evRows[0].name;
        venueAddress = evRows[0].venue_address;
        latitude = evRows[0].latitude;
        longitude = evRows[0].longitude;
        eventStartsAt = evRows[0].starts_at;
      }
    }

    // Build context
    const eventDate = eventStartsAt
      ? new Date(eventStartsAt).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Bogota" })
      : "Fecha del evento";
    const daysRemainingText = sched.days_before === 0 ? "HOY" : `en ${sched.days_before} día${sched.days_before > 1 ? "s" : ""}`;
    const venueMapUrl = latitude && longitude
      ? `?q=${latitude},${longitude}`
      : venueAddress ? `?q=${encodeURIComponent(venueAddress)}` : "";

    const context: Record<string, string> = {
      attendeeName: attendeeName || "Test",
      eventName: eventName ?? "Nombre del evento",
      venueName: venueAddress ?? "Lugar del evento",
      venueAddress: venueAddress ?? "Dirección del evento",
      venueMapUrl,
      eventDate,
      daysRemainingText,
    };

    const bodyMappings = templateButtons.length > 0 ? paramMappings.filter((m) => m.position <= bodyParamCount) : paramMappings;
    const buttonMappings = templateButtons.length > 0 ? paramMappings.filter((m) => m.position > bodyParamCount) : [];
    const maxBodyPos = bodyMappings.length > 0 ? Math.max(...bodyMappings.map((m) => m.position)) : 0;
    const params: string[] = Array(maxBodyPos).fill("");
    for (const mapping of bodyMappings) params[mapping.position - 1] = context[mapping.field] ?? "";
    let ctaButtons = buttonMappings
      .map((m, i) => ({ type: templateButtons[i]?.type ?? "url", parameter: context[m.field] ?? "" }))
      .filter((b) => b.parameter);

    // Fallback: if the template has URL buttons but no explicit button mapping was
    // configured (or all button params resolved to empty), auto-include venueMapUrl
    // as the URL button suffix so the Google Maps CTA always works.
    if (ctaButtons.length === 0 && venueMapUrl) {
      const btnType = templateButtons.find((b) => b.type === "url") ? "url" : null;
      if (btnType || templateButtons.length === 0) {
        ctaButtons = [{ type: "url", parameter: venueMapUrl }];
        console.log("[WA test] Auto-injecting venueMapUrl as CTA button (no explicit button mapping found)");
      }
    }

    // Normalize phone
    let dest = phone.replace(/[\s\-()]/g, "");
    if (/^\d{10}$/.test(dest)) dest = `57${dest}`;
    dest = dest.replace(/^\+/, "");

    const templatePayload: Record<string, unknown> = { id: gupshupTemplateId, params };
    if (ctaButtons.length > 0) templatePayload.buttons = ctaButtons;

    const formBody = new URLSearchParams();
    formBody.append("channel", "whatsapp");
    formBody.append("source", GUPSHUP_SOURCE);
    formBody.append("destination", dest);
    formBody.append("src.name", GUPSHUP_APP_NAME);
    formBody.append("template", JSON.stringify(templatePayload));
    if (latitude && longitude) {
      formBody.append("message", JSON.stringify({
        type: "location",
        location: { latitude, longitude, name: eventName ?? "", address: venueAddress ?? undefined },
      }));
    }

    console.log("[WA test] dest=%s template=%s params=%j buttons=%j", dest, gupshupTemplateId, params, ctaButtons);

    const gupshupRes = await fetch("https://api.gupshup.io/wa/api/v1/template/msg", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", apikey: GUPSHUP_API_KEY },
      body: formBody.toString(),
    });
    const responseText = await gupshupRes.text();
    console.log("[WA test] Gupshup HTTP %d: %s", gupshupRes.status, responseText);

    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(responseText); } catch {}
    const success = gupshupRes.ok && parsed.status !== "error";

    // Always log to message log so failures are visible in the admin UI
    await pool.query(`
      INSERT INTO whatsapp_message_log
        (destination, message_type, template_id, template_name, trigger_type, status, payload, attendee_name, error_message, gupshup_message_id)
      VALUES ($1, 'template', $2, $3, 'custom', $4, $5, $6, $7, $8)
    `, [
      dest,
      resolvedTemplateId,
      gupshupTemplateId,
      success ? "sent" : "failed",
      JSON.stringify({ templateId: gupshupTemplateId, params, buttons: ctaButtons, test: true }),
      attendeeName || "Test",
      success ? null : (parsed.message as string || responseText),
      success ? (parsed.messageId as string || null) : null,
    ]);

    if (success) {
      res.json({ ok: true, messageId: parsed.messageId, gupshupStatus: parsed.status, dest });
    } else {
      res.status(502).json({ ok: false, error: parsed.message as string || responseText, gupshupStatus: parsed.status, dest });
    }
  } catch (err) {
    console.error("[WA test] Unexpected error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
});

export default router;
