import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { whatsappTemplatesTable, whatsappTriggerMappingsTable, whatsappMessageLogTable } from "@workspace/db/schema";
import { eq, and, desc, asc, isNull, sql, like, or } from "drizzle-orm";
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

    let resolved = allMappings.find(m => eventId && m.mapping.eventId === eventId);
    if (!resolved) {
      resolved = allMappings.find(m => !m.mapping.eventId);
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

export default router;
