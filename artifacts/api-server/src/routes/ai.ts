import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import OpenAI from "openai";
import { db, eventsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireRole } from "../middlewares/requireRole";
import { aiRateLimit } from "../ai/rateLimit";
import { buildEventSnapshot, formatSnapshotForPrompt } from "../ai/snapshot";
import { TOOL_DEFINITIONS, executeTool } from "../ai/tools";

const router: IRouter = Router();

const chatBodySchema = z.object({
  eventId: z.string().optional(),
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(10_000),
  })).min(1).max(40),
});

const SYSTEM_PROMPT = `Eres el Asistente Tapee — un copiloto de datos para administradores de eventos en vivo en Colombia.

Tu rol:
- Responder preguntas sobre ventas, inventario, asistencia, salud operativa y métricas del evento del usuario.
- Ser conciso. Da números concretos (ej. "Has facturado $12.450.000 con 348 transacciones") en lugar de respuestas largas.
- Usa formato Markdown: negritas para cifras clave, listas con viñetas cuando hay múltiples ítems.
- Habla en español colombiano, informal pero profesional.
- Formatea moneda con separadores de miles (1.000.000) e incluye COP cuando aplique.

Cuándo usar herramientas:
- Si la respuesta está en el SNAPSHOT del evento que recibes al inicio, responde directo SIN llamar tools.
- Llama tools SOLO cuando necesites datos que no están en el snapshot (proyecciones, breakdowns específicos, deep dives de un producto/bar).
- Nunca inventes números. Si no tienes el dato, di que no lo tienes o llama el tool apropiado.

Recomendaciones / sugerencias de negocio:
- Cuando el admin pregunte "¿qué recomiendas para vender más?" o similar, basa las recomendaciones en datos REALES del snapshot/tools: bares idle, productos top, horas de pico, etc.
- Sé directo y accionable: "El Tigre lleva 45 min sin vender — verifica que esté abierto" en lugar de "podrías revisar a El Tigre".

Limitaciones:
- No tienes acceso a información personal de asistentes (nombres, correos, teléfonos). Si te lo piden, declina educadamente.
- No puedes ejecutar acciones (aprobar reembolsos, cerrar bares, etc.) — solo consultar y recomendar.`;

function writeSSE(res: Response, payload: Record<string, unknown>) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

router.post(
  "/ai/chat",
  requireRole("admin", "event_admin"),
  aiRateLimit,
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const parsed = chatBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const user = req.user;

    // Resolve event scope
    let eventId: string | undefined;
    if (user.role === "event_admin") {
      eventId = user.eventId ?? undefined;
    } else if (user.role === "admin") {
      eventId = parsed.data.eventId;
    }
    if (!eventId) {
      res.status(400).json({ error: "eventId requerido (admin global). Selecciona un evento primero." });
      return;
    }

    const [eventExists] = await db.select({ id: eventsTable.id }).from(eventsTable).where(eq(eventsTable.id, eventId));
    if (!eventExists) {
      res.status(404).json({ error: "Evento no encontrado" });
      return;
    }

    // Set up SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    try {
      // Build snapshot (1 SQL roundtrip set, ~150ms)
      const snapshot = await buildEventSnapshot(eventId);
      const snapshotPrompt = formatSnapshotForPrompt(snapshot);

      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        // Mock mode — no key configured yet
        await streamMockResponse(res, snapshot);
        return;
      }

      const openai = new OpenAI({ apiKey });
      const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

      // Conversation messages
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: "system", content: `${SYSTEM_PROMPT}\n\n${snapshotPrompt}` },
        ...parsed.data.messages.map((m) => ({ role: m.role, content: m.content } as OpenAI.Chat.ChatCompletionMessageParam)),
      ];

      // Tool-call loop (max 4 iterations to bound cost)
      const MAX_TOOL_ITERATIONS = 4;
      for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
        const stream = await openai.chat.completions.create({
          model,
          messages,
          tools: TOOL_DEFINITIONS,
          tool_choice: "auto",
          stream: true,
          temperature: 0.3,
          max_tokens: 1500,
        });

        const assistantMessage: OpenAI.Chat.ChatCompletionMessageParam = {
          role: "assistant",
          content: "",
        };
        const toolCalls: Array<{
          id: string;
          type: "function";
          function: { name: string; arguments: string };
        }> = [];

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta;
          if (!delta) continue;
          if (delta.content) {
            assistantMessage.content = (assistantMessage.content ?? "") + delta.content;
            writeSSE(res, { type: "text", content: delta.content });
          }
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index;
              if (!toolCalls[idx]) {
                toolCalls[idx] = {
                  id: tc.id ?? "",
                  type: "function",
                  function: { name: tc.function?.name ?? "", arguments: "" },
                };
              }
              const cur = toolCalls[idx];
              if (tc.id) cur.id = tc.id;
              if (tc.function?.name) cur.function.name = tc.function.name;
              if (tc.function?.arguments) cur.function.arguments += tc.function.arguments;
            }
          }
        }

        if (toolCalls.length === 0) {
          // Plain text answer — done
          break;
        }

        // Attach tool calls to the assistant message
        const finalAssistantMessage: OpenAI.Chat.ChatCompletionMessageParam = {
          role: "assistant",
          content: assistantMessage.content || null,
          tool_calls: toolCalls.map((t) => ({
            id: t.id,
            type: "function",
            function: { name: t.function.name, arguments: t.function.arguments },
          })),
        };
        messages.push(finalAssistantMessage);

        // Execute each tool call
        for (const tc of toolCalls) {
          writeSSE(res, { type: "tool", name: tc.function.name });
          let parsedArgs: Record<string, unknown> = {};
          try { parsedArgs = JSON.parse(tc.function.arguments || "{}"); } catch { /* leave empty */ }
          const result = await executeTool(tc.function.name, parsedArgs, eventId);
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(result),
          } as OpenAI.Chat.ChatCompletionMessageParam);
        }
        // Loop continues with the tool results in context
      }

      writeSSE(res, { type: "done" });
      res.end();
    } catch (err) {
      console.error("ai/chat error", err);
      writeSSE(res, { type: "error", message: err instanceof Error ? err.message : "Error desconocido" });
      res.end();
    }
  },
);

async function streamMockResponse(res: Response, snapshot: Awaited<ReturnType<typeof buildEventSnapshot>>) {
  const text = `**Modo demo activado** — la integración con OpenAI aún no está configurada (\`OPENAI_API_KEY\` no está seteada en Railway).

Snapshot actual del evento **${snapshot.event.name}**:
- Total facturado (cashless): ${snapshot.event.currencyCode} ${snapshot.sales.grossTotal.toLocaleString("es-CO")}
- Transacciones: ${snapshot.sales.transactionCount}
- Últimos 30 min: ${snapshot.sales.last30MinCount} ventas
- Pulseras NFC activas: ${snapshot.bracelets.total}
${snapshot.ticketing.enabled ? `- Boletas vendidas: ${snapshot.ticketing.ticketsSold} · Check-ins: ${snapshot.ticketing.ticketsCheckedIn}` : "- Sin boletería"}

Una vez configures la API key, podré responder cualquier pregunta sobre el evento con análisis e IA.`;

  // Simulate streaming by chunking
  const chunks = text.match(/.{1,40}/gs) ?? [text];
  for (const chunk of chunks) {
    writeSSE(res, { type: "text", content: chunk });
    await new Promise((r) => setTimeout(r, 30));
  }
  writeSSE(res, { type: "done" });
  res.end();
}

export default router;
