import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Markdown from "react-native-markdown-display";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetch as expoFetch } from "expo/fetch";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { API_BASE_URL } from "@/constants/domain";
import { useAuth } from "@/contexts/AuthContext";

type ChatMessage = { role: "user" | "assistant"; content: string };

type StreamEvent =
  | { type: "text"; content: string }
  | { type: "tool"; name: string }
  | { type: "done" }
  | { type: "error"; message: string };

const SUGGESTIONS = [
  "¿Cuánto hemos facturado en total?",
  "¿Qué productos están por agotarse?",
  "¿Cuántas personas han ingresado y cuántas faltan?",
  "¿Qué bares están idle o no han vendido?",
  "Compara la última hora vs la anterior",
];

const TOOL_LABELS: Record<string, string> = {
  get_sales_summary: "Calculando ventas…",
  get_sales_by_merchant: "Buscando por bar…",
  get_sales_by_hour: "Analizando curva horaria…",
  compare_to_previous_hour: "Comparando con la hora anterior…",
  get_top_products: "Buscando top productos…",
  get_payment_method_breakdown: "Desglosando métodos de pago…",
  forecast_stockout: "Proyectando agotamiento…",
  list_low_stock_products: "Buscando productos con poco stock…",
  get_product_performance: "Analizando producto…",
  get_merchant_health: "Revisando salud de bares…",
  get_merchant_performance: "Analizando bar…",
  get_checkin_breakdown: "Contando ingresos…",
  get_event_capacity_status: "Revisando aforo…",
  get_event_revenue_projection: "Proyectando facturación…",
  get_wallet_behavior_snapshot: "Analizando billeteras…",
  get_unclaimed_balances: "Calculando saldos sin gastar…",
  list_flagged_bracelets: "Buscando pulseras marcadas…",
  get_ticket_sales_summary: "Revisando boletería…",
  list_pending_refund_requests: "Buscando reembolsos pendientes…",
};

function storageKey(eventId: string) {
  return `@tapee_ai_chat_${eventId}`;
}

export function AiChat() {
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const eventId = user?.eventId ?? "";

  const visible = !!eventId && (user?.role === "event_admin" || user?.role === "admin");

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [partial, setPartial] = useState("");
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Track keyboard height — KeyboardAvoidingView inside Modal is unreliable on Android,
  // so we listen to native events directly and translate the input bar up.
  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Load history when event changes
  useEffect(() => {
    if (!eventId) { setMessages([]); return; }
    AsyncStorage.getItem(storageKey(eventId)).then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setMessages(parsed.slice(-40));
      } catch { /* ignore */ }
    });
  }, [eventId]);

  // Persist
  useEffect(() => {
    if (!eventId || messages.length === 0) return;
    AsyncStorage.setItem(storageKey(eventId), JSON.stringify(messages.slice(-40))).catch(() => {});
  }, [eventId, messages]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollToEnd({ animated: true });
  }, [messages, partial, activeTool, open]);

  // Pulse animation for FAB
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.06, duration: 1400, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1400, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

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

    try {
      const res = await expoFetch(`${API_BASE_URL}/api/ai/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        let errMsg = `Error ${res.status}`;
        try {
          const body = await res.json() as { error?: string };
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
      const e = err as { name?: string; message?: string };
      if (e.name !== "AbortError") {
        setMessages((prev) => [...prev, { role: "assistant", content: `⚠️ ${e.message ?? "Error desconocido"}` }]);
      }
    } finally {
      setStreaming(false);
      setPartial("");
      setActiveTool(null);
      abortRef.current = null;
    }
  }, [eventId, messages, streaming, token]);

  const stopStreaming = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  };

  const clearHistory = async () => {
    if (!eventId) return;
    setMessages([]);
    await AsyncStorage.removeItem(storageKey(eventId));
  };

  if (!visible) return null;

  return (
    <>
      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.fabWrap,
          { bottom: insets.bottom + 80, transform: [{ scale: pulseAnim }] },
        ]}
      >
        <Pressable
          onPress={() => setOpen(true)}
          style={({ pressed }) => [
            styles.fab,
            {
              backgroundColor: C.primary,
              shadowColor: C.primary,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
          testID="ai-chat-fab"
          accessibilityLabel="Abrir asistente IA"
        >
          <Feather name="message-circle" size={20} color={C.primaryText} />
          <Text style={[styles.fabLabel, { color: C.primaryText }]}>IA</Text>
        </Pressable>
      </Animated.View>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={[styles.container, { backgroundColor: C.background, paddingTop: insets.top }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: C.border, backgroundColor: C.card }]}>
            <View style={styles.headerLeft}>
              <View style={[styles.iconCircle, { backgroundColor: C.primaryLight }]}>
                <Feather name="message-circle" size={16} color={C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.headerTitle, { color: C.text }]}>Asistente Tapee</Text>
                <Text style={[styles.headerSub, { color: C.textSecondary }]}>Pregunta lo que quieras</Text>
              </View>
            </View>
            <View style={styles.headerActions}>
              <Pressable
                onPress={clearHistory}
                disabled={messages.length === 0}
                style={[styles.iconBtn, { opacity: messages.length === 0 ? 0.35 : 1 }]}
                hitSlop={8}
                accessibilityLabel="Limpiar"
              >
                <Feather name="trash-2" size={18} color={C.textSecondary} />
              </Pressable>
              <Pressable onPress={() => setOpen(false)} style={styles.iconBtn} hitSlop={8} accessibilityLabel="Cerrar">
                <Feather name="x" size={22} color={C.text} />
              </Pressable>
            </View>
          </View>

          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={styles.messagesContent}
            keyboardShouldPersistTaps="handled"
          >
            {messages.length === 0 && !streaming && (
              <View style={{ gap: 12 }}>
                <Text style={{ color: C.textSecondary, fontSize: 14, lineHeight: 20 }}>
                  Hola 👋 Pregúntame sobre ventas, inventario, asistencia o salud del evento. Algunas ideas:
                </Text>
                <View style={{ gap: 8 }}>
                  {SUGGESTIONS.map((s) => (
                    <Pressable
                      key={s}
                      onPress={() => sendMessage(s)}
                      style={[styles.suggestion, { borderColor: C.border, backgroundColor: C.card }]}
                    >
                      <Text style={{ color: C.text, fontSize: 13, flex: 1 }}>{s}</Text>
                      <Feather name="arrow-right" size={14} color={C.primary} />
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {messages.map((m, i) => (
              <MessageBubble key={i} message={m} colors={C} />
            ))}

            {streaming && (
              <View style={{ gap: 8 }}>
                {activeTool ? (
                  <View style={[styles.toolChip, { backgroundColor: C.cardSecondary, borderColor: C.border }]}>
                    <ActivityIndicator size="small" color={C.primary} />
                    <Text style={{ color: C.textSecondary, fontSize: 12 }}>{TOOL_LABELS[activeTool] ?? `Ejecutando ${activeTool}…`}</Text>
                  </View>
                ) : null}
                {partial ? (
                  <MessageBubble message={{ role: "assistant", content: partial }} colors={C} />
                ) : !activeTool ? (
                  <View style={styles.thinking}>
                    <ActivityIndicator size="small" color={C.textSecondary} />
                    <Text style={{ color: C.textSecondary, fontSize: 12 }}>Pensando…</Text>
                  </View>
                ) : null}
              </View>
            )}
          </ScrollView>

          {/* Input — paddingBottom adapts to keyboard so it never gets covered */}
          <View
            style={[
              styles.inputBar,
              {
                borderTopColor: C.border,
                backgroundColor: C.card,
                paddingBottom: keyboardHeight > 0
                  ? (Platform.OS === "ios" ? keyboardHeight : 12)
                  : Math.max(insets.bottom, 12),
                marginBottom: Platform.OS === "android" && keyboardHeight > 0 ? keyboardHeight : 0,
              },
            ]}
          >
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Pregunta cualquier cosa…"
              placeholderTextColor={C.textMuted}
              style={[styles.textInput, { color: C.text, backgroundColor: C.inputBg, borderColor: C.border }]}
              multiline
              editable={!streaming}
              testID="ai-chat-input"
            />
            {streaming ? (
              <Pressable onPress={stopStreaming} style={[styles.sendBtn, { backgroundColor: C.danger }]} accessibilityLabel="Detener">
                <View style={{ width: 12, height: 12, backgroundColor: "#fff", borderRadius: 2 }} />
              </Pressable>
            ) : (
              <Pressable
                onPress={() => sendMessage(input)}
                disabled={!input.trim()}
                style={[styles.sendBtn, { backgroundColor: input.trim() ? C.primary : C.border }]}
                accessibilityLabel="Enviar"
              >
                <Feather name="send" size={18} color={input.trim() ? C.primaryText : C.textMuted} />
              </Pressable>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

function MessageBubble({ message, colors: C }: { message: ChatMessage; colors: typeof Colors.light }) {
  const isUser = message.role === "user";
  return (
    <View style={[styles.bubbleRow, { justifyContent: isUser ? "flex-end" : "flex-start" }]}>
      <View
        style={[
          styles.bubble,
          isUser
            ? { backgroundColor: C.primary, borderBottomRightRadius: 4 }
            : { backgroundColor: C.cardSecondary, borderColor: C.border, borderWidth: 1, borderBottomLeftRadius: 4 },
        ]}
      >
        {isUser ? (
          <Text style={{ color: C.primaryText, fontSize: 14, lineHeight: 20 }}>{message.content}</Text>
        ) : (
          <Markdown
            style={{
              body: { color: C.text, fontSize: 14, lineHeight: 20 },
              paragraph: { marginTop: 2, marginBottom: 2 },
              strong: { color: C.primary, fontWeight: "700" },
              bullet_list: { marginTop: 4, marginBottom: 4 },
              ordered_list: { marginTop: 4, marginBottom: 4 },
              list_item: { marginVertical: 2 },
              code_inline: { backgroundColor: C.background, padding: 2, borderRadius: 4, fontSize: 12 },
              hr: { backgroundColor: C.border, height: 1 },
              link: { color: C.primary },
            }}
          >
            {message.content}
          </Markdown>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fabWrap: { position: "absolute", right: 16, zIndex: 50 },
  fab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 100,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  fabLabel: { fontSize: 13, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 4 },
  iconCircle: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  headerSub: { fontSize: 11, fontFamily: "Inter_400Regular" },
  iconBtn: { padding: 8 },
  messagesContent: { padding: 14, gap: 10, paddingBottom: 32 },
  suggestion: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  bubbleRow: { flexDirection: "row" },
  bubble: { maxWidth: "85%", paddingHorizontal: 12, paddingVertical: 10, borderRadius: 16 },
  toolChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  thinking: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4 },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  textInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    borderRadius: 10,
    borderWidth: 1,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
});
