import { db } from "@workspace/db";
import { whatsappTemplatesTable, whatsappTriggerMappingsTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { sendWhatsAppTemplate, type TemplateParam, type MessageLogContext } from "./whatsapp";
import { logger } from "./logger";

export type TriggerType = "ticket_purchased" | "otp_verification" | "event_reminder" | "ticket_refund" | "welcome_message" | "custom";

export interface ParameterMapping {
  position: number;
  field: string;
}

export interface ResolvedTemplate {
  templateId: string;
  gupshupTemplateId: string;
  parameters: Array<{ name: string; description: string; example?: string }>;
  parameterMappings: ParameterMapping[];
  bodyPreview: string | null;
  category: string;
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
      parameterMappings: (resolved.mapping.parameterMappings as ParameterMapping[]) || [],
      bodyPreview: resolved.template.bodyPreview,
      category: resolved.template.category,
    };
  } catch (err) {
    logger.error({ err, triggerType, eventId }, "Failed to resolve WhatsApp template");
    return null;
  }
}

export function buildParamsFromMappings(
  mappings: ParameterMapping[],
  context: Record<string, string>,
  fallbackValues: string[],
): string[] {
  if (mappings.length === 0) {
    return fallbackValues;
  }

  const highestMappedPos = Math.max(...mappings.map((m) => m.position), 0);
  const totalPositions = Math.max(fallbackValues.length, highestMappedPos);
  const result: string[] = [];

  for (let pos = 1; pos <= totalPositions; pos++) {
    const mapping = mappings.find((m) => m.position === pos);
    if (mapping && context[mapping.field] !== undefined) {
      result.push(context[mapping.field]);
    } else if (fallbackValues[pos - 1] !== undefined) {
      result.push(fallbackValues[pos - 1]);
    } else {
      result.push("");
    }
  }

  return result;
}

export async function sendWithTemplate(
  destination: string,
  triggerType: TriggerType,
  paramValues: string[],
  eventId?: string,
  context?: Record<string, string>,
  logContext?: MessageLogContext,
): Promise<{ sent: boolean; usedTemplate: boolean }> {
  const template = await resolveTemplate(triggerType, eventId);
  if (!template) {
    return { sent: false, usedTemplate: false };
  }

  const finalValues = context
    ? buildParamsFromMappings(template.parameterMappings, context, paramValues)
    : paramValues;

  const isAuth = template.category === "AUTHENTICATION";
  const params: TemplateParam[] = finalValues.map((text) => ({ type: "text", text }));

  const enrichedLogContext: MessageLogContext = {
    ...logContext,
    triggerType,
    templateName: template.gupshupTemplateId,
    eventId,
  };

  const sent = await sendWhatsAppTemplate(destination, template.gupshupTemplateId, params, isAuth, enrichedLogContext);
  return { sent, usedTemplate: true };
}
