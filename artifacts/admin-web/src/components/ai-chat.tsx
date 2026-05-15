import { useState, useRef, useEffect, useCallback } from "react";
import { Sparkles, X, Send, Loader2, Trash2, Wrench } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AUTH_TOKEN_KEY } from "@/pages/login";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useEventContext } from "@/contexts/event-context";
import { useGetCurrentAuthUser } from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type StreamEvent =
  | { type: "text"; content: string }
  | { type: "tool"; name: string }
  | { type: "done" }
  | { type: "error"; message: string };

const TOOL_KEYS: Record<string, string> = {
  get_sales_summary: "aiChat.tools.get_sales_summary",
  get_sales_by_merchant: "aiChat.tools.get_sales_by_merchant",
  get_sales_by_hour: "aiChat.tools.get_sales_by_hour",
  compare_to_previous_hour: "aiChat.tools.compare_to_previous_hour",
  get_top_products: "aiChat.tools.get_top_products",
  get_payment_method_breakdown: "aiChat.tools.get_payment_method_breakdown",
  forecast_stockout: "aiChat.tools.forecast_stockout",
  list_low_stock_products: "aiChat.tools.list_low_stock_products",
  get_product_performance: "aiChat.tools.get_product_performance",
  get_merchant_health: "aiChat.tools.get_merchant_health",
  get_merchant_performance: "aiChat.tools.get_merchant_performance",
  get_checkin_breakdown: "aiChat.tools.get_checkin_breakdown",
  get_event_capacity_status: "aiChat.tools.get_event_capacity_status",
  get_event_revenue_projection: "aiChat.tools.get_event_revenue_projection",
  get_wallet_behavior_snapshot: "aiChat.tools.get_wallet_behavior_snapshot",
  get_unclaimed_balances: "aiChat.tools.get_unclaimed_balances",
  list_flagged_bracelets: "aiChat.tools.list_flagged_bracelets",
  get_ticket_sales_summary: "aiChat.tools.get_ticket_sales_summary",
  list_pending_refund_requests: "aiChat.tools.list_pending_refund_requests",
};

function storageKey(eventId: string) {
  return `tapee_ai_chat_${eventId}`;
}

function loadHistory(eventId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(storageKey(eventId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.slice(-40);
  } catch { /* ignore */ }
  return [];
}

function saveHistory(eventId: string, messages: ChatMessage[]) {
  try {
    localStorage.setItem(storageKey(eventId), JSON.stringify(messages.slice(-40)));
  } catch { /* ignore */ }
}

export function AiChat() {
  const { t } = useTranslation();
  const { eventId: ctxEventId } = useEventContext();
  const { data: auth } = useGetCurrentAuthUser();
  const role = auth?.user?.role;
  const suggestions = (t("aiChat.suggestions", { returnObjects: true }) as string[]);
  const eventId = role === "admin" ? ctxEventId : (auth?.user?.eventId ?? "");
  const visible = !!eventId && (role === "admin" || role === "event_admin");

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [partial, setPartial] = useState("");
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load history when event changes
  useEffect(() => {
    if (!eventId) { setMessages([]); return; }
    setMessages(loadHistory(eventId));
  }, [eventId]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, partial, activeTool, open]);

  // Persist
  useEffect(() => {
    if (eventId && messages.length > 0) saveHistory(eventId, messages);
  }, [eventId, messages]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || !eventId || streaming) return;
    const userMsg: ChatMessage = { role: "user", content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setStreaming(true);
    setPartial("");
    setActiveTool(null);

    const controller = new AbortController();
    abortRef.current = controller;

    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    const url = `${import.meta.env.BASE_URL}_srv/api/ai/chat`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          eventId,
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        let errMsg = `Error ${res.status}`;
        try {
          const body = await res.json();
          if (body?.error) errMsg = body.error;
        } catch { /* ignore */ }
        setMessages((prev) => [...prev, { role: "assistant", content: `⚠️ ${errMsg}` }]);
        setStreaming(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const json = trimmed.slice(5).trim();
          if (!json) continue;
          try {
            const event: StreamEvent = JSON.parse(json);
            if (event.type === "text") {
              assistantText += event.content;
              setPartial(assistantText);
              setActiveTool(null);
            } else if (event.type === "tool") {
              setActiveTool(event.name);
            } else if (event.type === "done") {
              if (assistantText) {
                setMessages((prev) => [...prev, { role: "assistant", content: assistantText }]);
              }
              setPartial("");
              setActiveTool(null);
            } else if (event.type === "error") {
              setMessages((prev) => [...prev, { role: "assistant", content: `⚠️ ${event.message}` }]);
              setPartial("");
              setActiveTool(null);
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setMessages((prev) => [...prev, { role: "assistant", content: `⚠️ ${(err as Error).message}` }]);
      }
    } finally {
      setStreaming(false);
      setPartial("");
      setActiveTool(null);
      abortRef.current = null;
    }
  }, [eventId, messages, streaming]);

  const stopStreaming = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  };

  const clearHistory = () => {
    if (!eventId) return;
    setMessages([]);
    localStorage.removeItem(storageKey(eventId));
  };

  if (!visible) return null;

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 group flex items-center gap-2 px-4 py-3 rounded-full bg-primary text-primary-foreground shadow-[0_0_24px_rgba(0,241,255,0.4)] hover:shadow-[0_0_32px_rgba(0,241,255,0.6)] transition-all hover:scale-105"
          data-testid="ai-chat-fab"
          aria-label={t("aiChat.buttonLabel")}
        >
          <Sparkles className="h-5 w-5" />
          <span className="text-sm font-semibold pr-1">{t("aiChat.buttonLabel")}</span>
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[400px] max-w-[calc(100vw-3rem)] h-[600px] max-h-[calc(100vh-3rem)] flex flex-col bg-card border border-border rounded-2xl shadow-2xl shadow-primary/10">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold leading-tight">{t("aiChat.title")}</p>
                <p className="text-xs text-muted-foreground leading-tight">{t("aiChat.subtitle")}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={clearHistory} title={t("aiChat.clearTitle")} disabled={messages.length === 0}>
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)} title={t("aiChat.closeTitle")}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && !streaming && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {t("aiChat.greeting")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => sendMessage(s)}
                      className="text-xs px-3 py-1.5 rounded-full border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors text-left"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <MessageBubble key={i} message={m} />
            ))}

            {streaming && (
              <div className="space-y-2">
                {activeTool && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground px-3 py-2 rounded-lg bg-muted/40 border border-border w-fit">
                    <Wrench className="h-3 w-3 text-primary animate-pulse" />
                    {TOOL_KEYS[activeTool] ? t(TOOL_KEYS[activeTool]) : t("aiChat.executingTool", { name: activeTool })}
                  </div>
                )}
                {partial && (
                  <MessageBubble message={{ role: "assistant", content: partial }} streaming />
                )}
                {!partial && !activeTool && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> {t("aiChat.thinking")}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-3 border-t border-border">
            <form
              onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
              className="flex items-end gap-2"
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(input);
                  }
                }}
                placeholder={t("aiChat.placeholder")}
                rows={1}
                className="flex-1 resize-none bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 max-h-28"
                style={{ minHeight: "38px" }}
                disabled={streaming}
                data-testid="ai-chat-input"
              />
              {streaming ? (
                <Button type="button" size="icon" variant="outline" onClick={stopStreaming} title={t("aiChat.stopTitle")}>
                  <span className="h-3 w-3 bg-current rounded-sm" />
                </Button>
              ) : (
                <Button type="submit" size="icon" disabled={!input.trim()} title="Enviar">
                  <Send className="h-4 w-4" />
                </Button>
              )}
            </form>
            <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
              {t("aiChat.disclaimer")}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function MessageBubble({ message, streaming = false }: { message: ChatMessage; streaming?: boolean }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] px-3.5 py-2 rounded-2xl text-sm",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-muted/40 border border-border rounded-bl-md"
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : (
          <div className={cn("prose prose-sm prose-invert max-w-none break-words", streaming && "animate-pulse-subtle")}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children }) => <p className="my-1 leading-relaxed">{children}</p>,
                ul: ({ children }) => <ul className="my-1 ml-4 list-disc space-y-0.5">{children}</ul>,
                ol: ({ children }) => <ol className="my-1 ml-4 list-decimal space-y-0.5">{children}</ol>,
                li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                strong: ({ children }) => <strong className="font-semibold text-primary">{children}</strong>,
                code: ({ children }) => <code className="px-1 py-0.5 rounded bg-background/60 text-xs">{children}</code>,
                table: ({ children }) => <table className="my-2 text-xs border-collapse">{children}</table>,
                th: ({ children }) => <th className="border border-border px-2 py-1 text-left font-semibold">{children}</th>,
                td: ({ children }) => <td className="border border-border px-2 py-1">{children}</td>,
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
