import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { customFetch } from "@workspace/api-client-react";
import { useColorScheme } from "@/hooks/useColorScheme";
import Colors from "@/constants/colors";

type Status = "waiting" | "ready" | "running" | "done" | "error";
type Role = "bank" | "merchant_staff" | "event_admin" | "gate";

const ROLE_META: Record<Role, { label: string; workflow: string; emoji: string }> = {
  bank:           { label: "Cajero recarga",   workflow: "Recarga de saldo en pulsera",        emoji: "💳" },
  merchant_staff: { label: "POS Comerciante",  workflow: "Cobro de producto / servicio",       emoji: "🛒" },
  gate:           { label: "Portería / Acceso",workflow: "Carga de datos del evento (read)",   emoji: "🚪" },
  event_admin:    { label: "Admin evento",     workflow: "Consulta de reportes y analítica",   emoji: "📊" },
};

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

async function runOneIteration(
  role: Role,
  braceletUid: string,
  amountCents: number,
  eventId: string,
): Promise<{ ok: boolean; latencyMs: number }> {
  const t0 = Date.now();
  try {
    if (role === "merchant_staff") {
      const r = await customFetch("/api/load-test/device-test/fire-charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ braceletUid, amountCents, eventId }),
      }) as { ok?: boolean; latencyMs?: number };
      return { ok: r?.ok ?? false, latencyMs: r?.latencyMs ?? (Date.now() - t0) };
    }

    if (role === "bank") {
      const r = await customFetch("/api/load-test/device-test/fire-topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ braceletUid, amountCents }),
      }) as { ok?: boolean; latencyMs?: number };
      return { ok: r?.ok ?? false, latencyMs: r?.latencyMs ?? (Date.now() - t0) };
    }

    if (role === "gate") {
      // Simulate gate startup: health check + load event list
      await customFetch("/api/health");
      await customFetch("/api/events?limit=1");
      return { ok: true, latencyMs: Date.now() - t0 };
    }

    // event_admin: load event details + revenue report
    await customFetch("/api/events?limit=5");
    if (eventId) {
      await customFetch(`/api/events/${eventId}`);
      await customFetch(`/api/reports/revenue?eventId=${eventId}`);
    }
    return { ok: true, latencyMs: Date.now() - t0 };
  } catch {
    return { ok: false, latencyMs: Date.now() - t0 };
  }
}

export default function DeviceTestScreen() {
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const s = styles(C);

  const params = useLocalSearchParams<{
    runId?: string;
    eventId?: string;
    braceletUid?: string;
    numCharges?: string;
    chargeAmountCents?: string;
    deviceRole?: string;
    deviceLabel?: string;
  }>();

  const [runId, setRunId]             = useState(params.runId ?? "");
  const [eventId]                     = useState(params.eventId ?? "");
  const [braceletUid, setBraceletUid] = useState(params.braceletUid ?? "");
  const [numCharges]                  = useState(Number(params.numCharges ?? 10));
  const [chargeAmountCents]           = useState(Number(params.chargeAmountCents ?? 5000));
  const role                          = (params.deviceRole ?? "merchant_staff") as Role;
  const roleMeta                      = ROLE_META[role] ?? ROLE_META.merchant_staff;

  const [status, setStatus]           = useState<Status>(params.runId ? "ready" : "waiting");
  const [progress, setProgress]       = useState(0);
  const [message, setMessage]         = useState(
    params.runId ? "Prueba recibida. Listo para iniciar." : "Esperando prueba del administrador...",
  );
  const [latencies, setLatencies]     = useState<number[]>([]);
  const [successCount, setSuccess]    = useState(0);
  const [errorCount, setErrors]       = useState(0);
  const cancelledRef                  = useRef(false);

  // Long-poll fallback when no params passed (manual navigation)
  useEffect(() => {
    if (params.runId) return;
    cancelledRef.current = false;

    async function poll() {
      while (!cancelledRef.current) {
        try {
          const result = await customFetch("/api/load-test/device-test/pending") as {
            run?: { id: string; config: Record<string, unknown> };
          };
          if (result?.run) {
            const cfg = result.run.config;
            setRunId(result.run.id);
            setBraceletUid(String(cfg.braceletUid ?? ""));
            setStatus("ready");
            setMessage("Prueba disponible. Listo para iniciar.");
            return;
          }
        } catch { /* ignore */ }
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    poll();
    return () => { cancelledRef.current = true; };
  }, []);

  async function startTest() {
    setStatus("running");
    setProgress(0);
    const lats: number[] = [];
    let ok = 0;
    let err = 0;

    for (let i = 0; i < numCharges; i++) {
      if (cancelledRef.current) break;
      const result = await runOneIteration(role, braceletUid, chargeAmountCents, eventId);
      lats.push(result.latencyMs);
      if (result.ok) ok++; else err++;
      setProgress(Math.round(((i + 1) / numCharges) * 100));
      setLatencies([...lats]);
      setSuccess(ok);
      setErrors(err);
    }

    const deviceName = `${roleMeta.label} (${Platform.OS})`;
    try {
      await customFetch("/api/load-test/device-test/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, deviceName, latencies: lats, successCount: ok, errorCount: err }),
      });
      await customFetch("/api/load-test/device-test/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId }),
      });
      setStatus("done");
      setMessage(`Completado — ${ok} éxitos, ${err} errores.`);
    } catch {
      setStatus("error");
      setMessage("No se pudo reportar resultados al servidor.");
    }
  }

  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.background }} contentContainerStyle={s.container}>
      {/* Header */}
      <Text style={s.title}>Prueba de Dispositivo</Text>
      <View style={s.roleRow}>
        <Text style={s.roleEmoji}>{roleMeta.emoji}</Text>
        <View>
          <Text style={s.roleLabel}>{roleMeta.label}</Text>
          <Text style={s.roleWorkflow}>{roleMeta.workflow}</Text>
        </View>
      </View>

      {/* Status card */}
      <View style={[s.card, status === "done" && s.cardSuccess, status === "error" && s.cardError]}>
        <Text style={s.cardLabel}>Estado</Text>
        <Text style={[s.cardValue, status === "done" && { color: C.success }, status === "error" && { color: C.danger }]}>
          {status === "waiting" && "⏳ Esperando prueba..."}
          {status === "ready"   && `✅ Listo — ${numCharges} iteraciones`}
          {status === "running" && `⚡ Ejecutando (${progress}%)`}
          {status === "done"    && "✅ Completado"}
          {status === "error"   && "❌ Error"}
        </Text>
        <Text style={s.message}>{message}</Text>
      </View>

      {/* Progress bar */}
      {status === "running" && (
        <View style={s.progressOuter}>
          <View style={[s.progressInner, { width: `${progress}%` as any }]} />
        </View>
      )}

      {/* Live metrics */}
      {(status === "running" || status === "done") && latencies.length > 0 && (
        <View style={s.metricsRow}>
          <MetricBox label="P50" value={`${p50}ms`} C={C} />
          <MetricBox label="P95" value={`${p95}ms`} highlight={p95 > 800} C={C} />
          <MetricBox label="✅" value={String(successCount)} C={C} />
          <MetricBox label="❌" value={String(errorCount)} highlight={errorCount > 0} C={C} />
        </View>
      )}

      {/* Waiting spinner */}
      {status === "waiting" && (
        <ActivityIndicator color={C.primary} size="large" style={{ marginTop: 24 }} />
      )}

      {/* Action buttons */}
      <View style={s.actions}>
        {status === "ready" && (
          <Pressable style={[s.btn, { backgroundColor: C.primary }]} onPress={startTest}>
            <Text style={[s.btnText, { color: C.primaryText }]}>
              Iniciar — {numCharges}× {roleMeta.workflow}
            </Text>
          </Pressable>
        )}
        {(status === "done" || status === "error") && (
          <Pressable style={[s.btn, { backgroundColor: C.card, borderWidth: 1, borderColor: C.border }]} onPress={() => router.back()}>
            <Text style={[s.btnText, { color: C.text }]}>Volver</Text>
          </Pressable>
        )}
        {(status === "waiting" || status === "ready") && (
          <Pressable style={s.btnSecondary} onPress={() => { cancelledRef.current = true; router.back(); }}>
            <Text style={[s.btnText, { color: C.textSecondary }]}>Cancelar</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

function MetricBox({ label, value, highlight, C }: {
  label: string; value: string; highlight?: boolean; C: typeof Colors.light;
}) {
  return (
    <View style={{
      flex: 1, alignItems: "center", padding: 10, borderRadius: 8,
      backgroundColor: highlight ? C.dangerLight : C.cardSecondary,
      marginHorizontal: 3,
    }}>
      <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: highlight ? C.danger : C.text }}>{value}</Text>
      <Text style={{ fontSize: 11, color: C.textSecondary, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

const styles = (C: typeof Colors.light) => StyleSheet.create({
  container:    { padding: 20, paddingTop: 56 },
  title:        { fontSize: 22, fontFamily: "Inter_700Bold", color: C.text, marginBottom: 12 },
  roleRow:      { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16, padding: 14, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border },
  roleEmoji:    { fontSize: 28 },
  roleLabel:    { fontSize: 15, fontFamily: "Inter_600SemiBold", color: C.text },
  roleWorkflow: { fontSize: 12, color: C.textSecondary, marginTop: 2 },
  card:         { backgroundColor: C.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.border, marginBottom: 16 },
  cardSuccess:  { borderColor: C.success },
  cardError:    { borderColor: C.danger },
  cardLabel:    { fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  cardValue:    { fontSize: 18, fontFamily: "Inter_600SemiBold", color: C.text },
  message:      { fontSize: 13, color: C.textSecondary, marginTop: 6 },
  progressOuter:{ height: 8, backgroundColor: C.border, borderRadius: 4, overflow: "hidden", marginBottom: 16 },
  progressInner:{ height: 8, backgroundColor: C.primary, borderRadius: 4 },
  metricsRow:   { flexDirection: "row", marginBottom: 16 },
  actions:      { gap: 10, marginTop: 8 },
  btn:          { borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  btnSecondary: { paddingVertical: 12, alignItems: "center" },
  btnText:      { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
