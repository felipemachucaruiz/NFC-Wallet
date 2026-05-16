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

router.get("/whatsapp-templates/wati", requireAuth, requireRole("admin"), async (_req, res) => {
  const apiKey = process.env.WATI_API_KEY;
  const rawApiUrl = process.env.WATI_API_URL;

  if (!apiKey || !rawApiUrl) {
    res.status(503).json({ error: "WATI not configured", templates: [] });
    return;
  }

  const apiUrl = rawApiUrl.replace(/\/$/, ""); // strip trailing slash

  try {
    const watiRes = await fetch(
      `${apiUrl}/api/v1/getMessageTemplates?pageSize=100&pageIndex=0`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );

    const responseText = await watiRes.text();

    if (!watiRes.ok) {
      console.error("WATI template list error:", watiRes.status, responseText);
      res.status(502).json({ error: "Failed to fetch from WATI", detail: responseText.slice(0, 300) });
      return;
    }

    let data: Record<string, unknown> = {};
    try { data = JSON.parse(responseText); } catch {}

    console.log("[WATI templates] raw keys:", Object.keys(data), "count:", data.count);

    // Handle both possible response shapes
    const rawList = (
      (data.messageTemplates as Array<Record<string, unknown>> | undefined) ??
      (data.templates as Array<Record<string, unknown>> | undefined) ??
      []
    );

    // WATI sometimes returns enum-like fields as {key, value, text} objects instead of strings
    function watiStr(v: unknown): string {
      if (typeof v === "string") return v;
      if (v && typeof v === "object") {
        const o = v as Record<string, unknown>;
        return String(o.key ?? o.value ?? o.text ?? "");
      }
      return v == null ? "" : String(v);
    }

    const templates = rawList.map((t: Record<string, unknown>) => ({
      id: watiStr(t.id) || watiStr(t.elementName),
      elementName: watiStr(t.elementName),
      category: watiStr(t.category),
      languageCode: watiStr(t.language ?? t.languageCode),
      status: watiStr(t.status),
      templateType: watiStr(t.templateType),
      data: watiStr(t.body ?? t.data),
      meta: t.meta,
    }));

    res.json({ templates });
  } catch (err) {
    console.error("Failed to fetch WATI templates:", err);
    res.status(502).json({ error: "Failed to fetch from WATI" });
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

    const WATI_API_KEY = process.env.WATI_API_KEY;
    const WATI_API_URL = process.env.WATI_API_URL?.replace(/\/$/, "");

    if (!WATI_API_KEY || !WATI_API_URL) {
      res.status(503).json({ error: "WhatsApp not configured" });
      return;
    }

    let watiRes: Response;

    if (message.messageType === "template") {
      // Normalise params: old messages stored string[], new ones store {name,value}[]
      const rawParams = payload.params as Array<string | { name: string; value: string }> | undefined;
      const parameters: Array<{ name: string; value: string }> = (rawParams ?? []).map((p, i) =>
        typeof p === "string" ? { name: String(i + 1), value: p } : p,
      );
      const templateName = (payload.templateName as string) || (payload.templateId as string) || "";

      watiRes = await fetch(
        `${WATI_API_URL}/api/v1/sendTemplateMessage?whatsappNumber=${message.destination}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${WATI_API_KEY}` },
          body: JSON.stringify({ template_name: templateName, broadcast_name: templateName, parameters }),
        },
      );
    } else {
      const text = (payload.text as string) || JSON.stringify(payload);
      const formData = new FormData();
      formData.append("messageText", text);
      watiRes = await fetch(
        `${WATI_API_URL}/api/v1/sendSessionMessage/${message.destination}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${WATI_API_KEY}` },
          body: formData,
        },
      );
    }

    const responseText = await watiRes.text();
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(responseText); } catch {}

    const success = watiRes.ok && parsed.result !== false;

    await db.update(whatsappMessageLogTable)
      .set({
        status: success ? "sent" : "failed",
        errorMessage: success ? null : ((parsed.info as string) || responseText),
        retryCount: sql`${whatsappMessageLogTable.retryCount} + 1`,
        gupshupMessageId: success ? ((parsed.id as string) || null) : message.gupshupMessageId,
        updatedAt: new Date(),
      })
      .where(eq(whatsappMessageLogTable.id, id));

    if (success) {
      res.json({ success: true, messageId: parsed.id });
    } else {
      res.status(502).json({ success: false, error: (parsed.info as string) || responseText });
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

  const WATI_API_KEY = process.env.WATI_API_KEY;
  const WATI_API_URL = process.env.WATI_API_URL?.replace(/\/$/, "");
  if (!WATI_API_KEY || !WATI_API_URL) {
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

    // Resolve template — gupshup_template_id column now stores the WATI template_name
    let watiTemplateName: string | null = null;
    let resolvedTemplateId: string | null = sched.template_id;
    let paramMappings: Array<{ position: number; field: string }> = [];

    if (sched.template_id) {
      const { rows: tplRows } = await pool.query<{
        gupshup_template_id: string;
        parameters: Array<{ name: string }> | null;
      }>(`SELECT gupshup_template_id, parameters FROM whatsapp_templates WHERE id = $1 AND status = 'active'`, [sched.template_id]);
      if (tplRows[0]) {
        watiTemplateName = tplRows[0].gupshup_template_id;
        paramMappings = sched.param_mappings ?? [];
      }
    } else if (sched.template_mapping_id) {
      const { rows: mRows } = await pool.query<{
        gupshup_template_id: string;
        template_id: string;
        parameter_mappings: Array<{ position: number; field: string }>;
      }>(`
        SELECT t.gupshup_template_id, t.id AS template_id, m.parameter_mappings
        FROM whatsapp_trigger_mappings m
        JOIN whatsapp_templates t ON t.id = m.template_id
        WHERE m.id = $1 AND m.active = true AND t.status = 'active'
      `, [sched.template_mapping_id]);
      if (mRows[0]) {
        watiTemplateName = mRows[0].gupshup_template_id;
        resolvedTemplateId = mRows[0].template_id;
        paramMappings = mRows[0].parameter_mappings ?? [];
      }
    }

    if (!watiTemplateName) { res.status(400).json({ error: "No active template configured for this schedule" }); return; }

    // Optionally override event data for the test
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
      ? `https://maps.google.com/?q=${latitude},${longitude}`
      : venueAddress ? `https://maps.google.com/?q=${encodeURIComponent(venueAddress)}` : "";

    const context: Record<string, string> = {
      attendeeName: attendeeName || "Test",
      eventName: eventName ?? "Nombre del evento",
      venueName: venueAddress ?? "Lugar del evento",
      venueAddress: venueAddress ?? "Dirección del evento",
      venueMapUrl,
      eventDate,
      daysRemainingText,
    };

    // Build positional params for WATI
    const maxPos = paramMappings.length > 0 ? Math.max(...paramMappings.map((m) => m.position)) : 0;
    const paramValues: string[] = Array(maxPos).fill("");
    for (const mapping of paramMappings) paramValues[mapping.position - 1] = context[mapping.field] ?? "";
    const parameters = paramValues.map((value, i) => ({ name: String(i + 1), value }));

    // Normalize phone
    let dest = phone.replace(/[\s\-()]/g, "");
    if (/^\d{10}$/.test(dest)) dest = `57${dest}`;
    dest = dest.replace(/^\+/, "");

    console.log("[WA test] dest=%s template=%s params=%j", dest, watiTemplateName, parameters);

    const watiRes = await fetch(
      `${WATI_API_URL}/api/v1/sendTemplateMessage?whatsappNumber=${dest}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${WATI_API_KEY}` },
        body: JSON.stringify({ template_name: watiTemplateName, broadcast_name: watiTemplateName, parameters }),
      },
    );
    const responseText = await watiRes.text();
    console.log("[WA test] WATI HTTP %d: %s", watiRes.status, responseText);

    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(responseText); } catch {}
    const success = watiRes.ok && parsed.result !== false;

    await pool.query(`
      INSERT INTO whatsapp_message_log
        (destination, message_type, template_id, template_name, trigger_type, status, payload, attendee_name, error_message, gupshup_message_id)
      VALUES ($1, 'template', $2, $3, 'custom', $4, $5, $6, $7, $8)
    `, [
      dest,
      resolvedTemplateId,
      watiTemplateName,
      success ? "sent" : "failed",
      JSON.stringify({ templateName: watiTemplateName, params: parameters, test: true }),
      attendeeName || "Test",
      success ? null : ((parsed.info as string) || responseText),
      success ? ((parsed.id as string) || null) : null,
    ]);

    if (success) {
      res.json({ ok: true, messageId: parsed.id, dest });
    } else {
      res.status(502).json({ ok: false, error: (parsed.info as string) || responseText, dest });
    }
  } catch (err) {
    console.error("[WA test] Unexpected error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
});

export default router;
