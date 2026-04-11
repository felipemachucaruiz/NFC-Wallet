import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { whatsappTemplatesTable, whatsappTriggerMappingsTable } from "@workspace/db/schema";
import { eq, and, desc, asc, isNull } from "drizzle-orm";
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
  })).default([]),
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
    const parsed = updateTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }
    const [template] = await db.update(whatsappTemplatesTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(whatsappTemplatesTable.id, req.params.id))
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
    const [deleted] = await db.delete(whatsappTemplatesTable)
      .where(eq(whatsappTemplatesTable.id, req.params.id))
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
    const parsed = updateMappingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }
    const [mapping] = await db.update(whatsappTriggerMappingsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(whatsappTriggerMappingsTable.id, req.params.id))
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
    const [deleted] = await db.delete(whatsappTriggerMappingsTable)
      .where(eq(whatsappTriggerMappingsTable.id, req.params.id))
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
        bodyPreview: resolved.template.bodyPreview,
      },
    });
  } catch (err) {
    console.error("Failed to resolve trigger mapping:", err);
    res.status(500).json({ error: "Failed to resolve trigger mapping" });
  }
});

export default router;
