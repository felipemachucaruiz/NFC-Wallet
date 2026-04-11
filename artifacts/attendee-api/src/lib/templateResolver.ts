import { db } from "@workspace/db";
import { whatsappTemplatesTable, whatsappTriggerMappingsTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { sendWhatsAppTemplate, type TemplateParam } from "./whatsapp";
import { logger } from "./logger";

export type TriggerType = "ticket_purchased" | "otp_verification" | "event_reminder" | "ticket_refund" | "welcome_message" | "custom";

export interface ResolvedTemplate {
  templateId: string;
  gupshupTemplateId: string;
  parameters: Array<{ name: string; description: string; example?: string }>;
  bodyPreview: string | null;
}

export async function resolveTemplate(triggerType: TriggerType, eventId?: string): Promise<ResolvedTemplate | null> {
  try {
    const allMappings = await db
      .select({
        mapping: whatsappTriggerMappingsTable,
        template: whatsappTemplatesTable,
      })
      .from(whatsappTriggerMappingsTable)
      .innerJoin(
        whatsappTemplatesTable,
        and(
          eq(whatsappTriggerMappingsTable.templateId, whatsappTemplatesTable.id),
          eq(whatsappTemplatesTable.status, "active"),
        ),
      )
      .where(
        and(
          eq(whatsappTriggerMappingsTable.active, true),
          eq(whatsappTriggerMappingsTable.triggerType, triggerType),
        ),
      )
      .orderBy(desc(whatsappTriggerMappingsTable.priority));

    let resolved = eventId
      ? allMappings.find((m) => m.mapping.eventId === eventId)
      : undefined;

    if (!resolved) {
      resolved = allMappings.find((m) => !m.mapping.eventId);
    }

    if (!resolved) return null;

    return {
      templateId: resolved.template.id,
      gupshupTemplateId: resolved.template.gupshupTemplateId,
      parameters: (resolved.template.parameters as any) || [],
      bodyPreview: resolved.template.bodyPreview,
    };
  } catch (err) {
    logger.error({ err, triggerType, eventId }, "Failed to resolve WhatsApp template");
    return null;
  }
}

export async function sendWithTemplate(
  destination: string,
  triggerType: TriggerType,
  paramValues: string[],
  eventId?: string,
): Promise<{ sent: boolean; usedTemplate: boolean }> {
  const template = await resolveTemplate(triggerType, eventId);
  if (!template) {
    return { sent: false, usedTemplate: false };
  }

  const params: TemplateParam[] = paramValues.map((text) => ({ type: "text", text }));
  const sent = await sendWhatsAppTemplate(destination, template.gupshupTemplateId, params);
  return { sent, usedTemplate: true };
}
