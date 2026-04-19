import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { AUTH_TOKEN_KEY } from "@/pages/login";
import {
  Activity, Zap, ShieldCheck, TrendingUp, Server, Play, RefreshCw,
  ChevronUp, ChevronDown, Clock, AlertTriangle, CheckCircle2, XCircle,
  Smartphone, Users, Timer, Cpu,
} from "lucide-react";

const API = import.meta.env.PROD
  ? (import.meta.env.VITE_API_URL || "https://prod.tapee.app")
  : `${import.meta.env.BASE_URL}_srv`;

function getToken() { return localStorage.getItem(AUTH_TOKEN_KEY) ?? ""; }

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${API}/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// ── Phase 1: Event Profile Statistical Model ──────────────────────────────────

// avgTxPerAttendee: expected purchases per person over the whole event
const EVENT_PROFILES = {
  festival:   { label: "Festival",          avgTxPerAttendee: 4.0 },
  concert:    { label: "Concierto",         avgTxPerAttendee: 2.5 },
  nightclub:  { label: "Rumba / Discoteca", avgTxPerAttendee: 5.0 },
  corporate:  { label: "Corporativo",       avgTxPerAttendee: 2.0 },
  sports:     { label: "Deportivo",         avgTxPerAttendee: 3.0 },
} as const;

type ProfileType = keyof typeof EVENT_PROFILES;

// A POS cashier physically serves ~1 customer per minute (approach → tap → confirm).
const POS_CYCLE_SECS = 60;

function calcEventProfile(attendees: number, _eventHours: number, merchants: number, type: ProfileType) {
  const p = EVENT_PROFILES[type];
  const totalTx = Math.round(attendees * p.avgTxPerAttendee);
  // Realistic peak: every POS is busy, each serving 1 customer/minute
  const peakTPS = Math.round((merchants / POS_CYCLE_SECS) * 100) / 100;
  const suggestedConcurrency = Math.min(merchants, 20);
  return { totalTx, peakTPS, suggestedConcurrency, suggestedDuration: 120 };
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

const TEST_TYPES = [
  { value: "health_check",      label: "Health Check",        icon: Activity,    description: "Latencia de endpoints críticos (10 rondas × 3 endpoints)" },
  { value: "load_test",         label: "Prueba de Carga",      icon: Zap,         description: "N cajeros virtuales por X segundos" },
  { value: "balance_integrity", label: "Integridad de Saldo",  icon: ShieldCheck, description: "Cobros concurrentes — verifica sin race conditions" },
  { value: "breaking_point",    label: "Punto de Quiebre",     icon: TrendingUp,  description: "Ramp 2 → 40 cajeros hasta detectar degradación" },
];

function scoreColor(s: number) { return s >= 85 ? "text-green-500" : s >= 65 ? "text-yellow-500" : "text-red-500"; }
function scoreBadgeVariant(s: number): "default" | "secondary" | "destructive" {
  return s >= 85 ? "default" : s >= 65 ? "secondary" : "destructive";
}
function fmt(ts: string) {
  return new Date(ts).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
}

type RunRow = {
  id: string; event_id: string; event_name?: string; test_type: string;
  status: "running" | "completed" | "failed"; score: number | null;
  results: Record<string, unknown> | null; created_at: string; completed_at: string | null;
};
type ServiceStatus = {
  services: Record<string, number>;
  servicesMeta: Record<string, { id: string; label: string }>;
};
type DeviceRun = {
  id: string; event_id: string; event_name?: string; status: string;
  config: { numCharges: number; chargeAmountCents: number };
  created_at: string; completed_at: string | null;
  device_results: Array<{ userId: string; deviceName: string; p50: number; p95: number; successCount: number; errorCount: number; completedAt: string }>;
};
type ProgressEvt = { phase: string; progress: number; message: string };
type MetricEvt   = Record<string, unknown>;

// ══════════════════════════════════════════════════════════════════════════════
export default function LoadTestPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  // Server test config
  const [testType,   setTestType]   = useState("health_check");
  const [eventId,    setEventId]    = useState("");
  const [concurrency, setConcurrency] = useState(5);
  const [duration,   setDuration]   = useState(30);
  const [targetTPS,  setTargetTPS]  = useState<number | null>(null);

  // Phase 1 — event profile
  const [attendees,     setAttendees]     = useState(2000);
  const [eventHours] = useState(6);
  const [numMerchants,  setNumMerchants]  = useState(10);
  const [profileType,   setProfileType]   = useState<ProfileType>("festival");
  const profile = useMemo(
    () => calcEventProfile(attendees, eventHours, numMerchants, profileType),
    [attendees, eventHours, numMerchants, profileType],
  );

  // SSE state
  const [running,       setRunning]       = useState(false);
  const [progressPct,   setProgressPct]   = useState(0);
  const [progressMsg,   setProgressMsg]   = useState("");
  const [liveMetrics,   setLiveMetrics]   = useState<MetricEvt | null>(null);
  const [lastResult,    setLastResult]    = useState<{ runId: string; score: number; results: Record<string, unknown> } | null>(null);
  const [sseError,      setSseError]      = useState<string | null>(null);
  const sseRef = useRef<AbortController | null>(null);

  // Phase 2 — device groups config
  const [dtStarting, setDtStarting] = useState(false);

  type DeviceGroup = {
    role: "bank" | "merchant_staff" | "event_admin" | "gate";
    label: string;
    count: number;
    numCharges: number;
    amountCents: number;
    enabled: boolean;
  };
  const [deviceGroups, setDeviceGroups] = useState<DeviceGroup[]>([
    { role: "bank",           label: "Cajeros recarga",    count: 5,  numCharges: 10, amountCents: 50000, enabled: true  },
    { role: "merchant_staff", label: "POS Comerciantes",   count: 10, numCharges: 15, amountCents: 10000, enabled: true  },
    { role: "event_admin",    label: "Admin evento",        count: 2,  numCharges: 5,  amountCents: 5000,  enabled: false },
    { role: "gate",           label: "Portería / Acceso",  count: 3,  numCharges: 5,  amountCents: 1000,  enabled: false },
  ]);

  function updateGroup(idx: number, patch: Partial<DeviceGroup>) {
    setDeviceGroups((prev) => prev.map((g, i) => i === idx ? { ...g, ...patch } : g));
  }

  const { data: runsData,    refetch: refetchRuns }    = useQuery<{ runs: RunRow[] }>({
    queryKey: ["load-test-runs"],
    queryFn: () => apiFetch("/load-test/runs"),
    refetchInterval: running ? 4000 : false,
  });
  const { data: railwayStatus, refetch: refetchRailway, isFetching: railwayFetching } = useQuery<ServiceStatus>({
    queryKey: ["railway-status"],
    queryFn: () => apiFetch("/load-test/railway/status"),
    refetchInterval: 30_000,
    staleTime: 20_000,
  });
  const { data: eventsData } = useQuery<{ events: Array<{ id: string; name: string }> }>({
    queryKey: ["events-list"],
    queryFn: () => apiFetch("/events?limit=100"),
  });
  const { data: deviceRunsData, refetch: refetchDeviceRuns } = useQuery<{ runs: DeviceRun[] }>({
    queryKey: ["device-test-runs"],
    queryFn: () => apiFetch("/load-test/device-test/runs"),
    refetchInterval: dtStarting ? 3000 : false,
  });
  const { data: devicesData } = useQuery<{ devices: Array<{ id: string; name: string; status: string; ramUsagePct: number | null; batteryLevel: number | null }> }>({
    queryKey: ["scalefusion-devices"],
    queryFn: () => apiFetch("/devices"),
  });

  const scaleMutation = useMutation({
    mutationFn: ({ service, replicas }: { service: string; replicas: number }) =>
      apiFetch("/load-test/railway/scale", { method: "POST", body: JSON.stringify({ service, replicas }) }),
    onSuccess: (_, v) => { toast({ title: `Escalado a ${v.replicas} réplica(s)` }); refetchRailway(); },
    onError: (e) => toast({ title: "Error al escalar", description: String(e), variant: "destructive" }),
  });

  useEffect(() => { return () => { sseRef.current?.abort(); }; }, []);

  // Auto-sync server test config whenever the event profile changes
  useEffect(() => {
    setConcurrency(profile.suggestedConcurrency);
    setDuration(profile.suggestedDuration);
    setTargetTPS(profile.peakTPS);
  }, [profile.suggestedConcurrency, profile.suggestedDuration, profile.peakTPS]);

  // Auto-sync device groups from profile so tx counts respond to attendees and POS count
  useEffect(() => {
    const merchantCharges = Math.max(5, Math.min(50, Math.round(profile.totalTx / Math.max(numMerchants, 1) / 15)));
    setDeviceGroups((prev) => prev.map((g) => {
      if (g.role === "merchant_staff") return { ...g, count: numMerchants, numCharges: merchantCharges };
      if (g.role === "bank") return { ...g, count: Math.max(2, Math.ceil(numMerchants / 2)) };
      return g;
    }));
  }, [profile.totalTx, numMerchants]);

  async function startServerTest() {
    if (!eventId) { toast({ title: "Selecciona un evento", variant: "destructive" }); return; }
    sseRef.current?.abort();
    const ctrl = new AbortController();
    sseRef.current = ctrl;
    setRunning(true); setProgressPct(0); setProgressMsg("Conectando...");
    setLiveMetrics(null); setLastResult(null); setSseError(null);

    try {
      const res = await fetch(`${API}/api/load-test/runs`, {
        method: "POST", signal: ctrl.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ testType, eventId, concurrency, durationSeconds: duration, ...(targetTPS !== null ? { targetTPS } : {}) }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        let evType = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) evType = line.slice(7);
          else if (line.startsWith("data: ")) {
            const payload = JSON.parse(line.slice(6));
            if (evType === "progress") { setProgressPct((payload as ProgressEvt).progress); setProgressMsg((payload as ProgressEvt).message); }
            else if (evType === "metric")   setLiveMetrics(payload as MetricEvt);
            else if (evType === "complete") { setLastResult(payload); setProgressPct(100); setProgressMsg("¡Completado!"); refetchRuns(); }
            else if (evType === "error")    { setSseError(payload.error); refetchRuns(); }
          }
        }
      }
    } catch (e: unknown) {
      if ((e as Error).name !== "AbortError") setSseError(String(e));
    } finally { setRunning(false); }
  }

  async function startDeviceTest() {
    if (!eventId) { toast({ title: "Selecciona un evento", variant: "destructive" }); return; }
    setDtStarting(true);
    try {
      const result = await apiFetch("/load-test/device-test/start", {
        method: "POST",
        body: JSON.stringify({ eventId, deviceGroups: deviceGroups.filter((g) => g.enabled) }),
      }) as { runId: string; devicesNotified: number; groups: number };
      toast({ title: `Prueba iniciada`, description: `${result.devicesNotified} dispositivo(s) en ${result.groups} grupo(s)` });
      refetchDeviceRuns();
    } catch (e) {
      toast({ title: "Error al iniciar", description: String(e), variant: "destructive" });
      setDtStarting(false);
    }
  }

  const selectedTestMeta = TEST_TYPES.find((t) => t.value === testType);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Simulador Pre-Evento</h1>
        <p className="text-muted-foreground text-sm mt-1">Pruebas de servidor, dispositivos y análisis de capacidad.</p>
      </div>

      <Tabs defaultValue="server">
        <TabsList>
          <TabsTrigger value="server"><Server className="h-4 w-4 mr-1.5" />Servidor</TabsTrigger>
          <TabsTrigger value="devices"><Smartphone className="h-4 w-4 mr-1.5" />Dispositivos</TabsTrigger>
        </TabsList>

        {/* ── Server Test Tab ── */}
        <TabsContent value="server" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: config */}
            <div className="lg:col-span-1 space-y-4">

              {/* Phase 1: Event profile */}
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" />Perfil del evento</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1">Asistentes</label>
                      <Input type="number" min={100} max={100000} value={attendees} onChange={(e) => setAttendees(Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1">POS / Comerciantes</label>
                      <Input type="number" min={1} max={100} value={numMerchants} onChange={(e) => setNumMerchants(Number(e.target.value))} />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs font-medium text-muted-foreground block mb-1">Tipo de evento</label>
                      <Select value={profileType} onValueChange={(v) => setProfileType(v as ProfileType)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(EVENT_PROFILES).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Estimates */}
                  <div className="rounded-lg bg-muted/40 border border-border p-3 space-y-1.5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Estimación</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                      <span className="text-muted-foreground">Total tx evento:</span>
                      <span className="font-semibold">{profile.totalTx.toLocaleString()}</span>
                      <span className="text-muted-foreground">Carga pico real:</span>
                      <span className="font-semibold">{Math.round(numMerchants)} cobros/min ({profile.peakTPS} tx/s)</span>
                      <span className="text-muted-foreground">POS simultáneos:</span>
                      <span className="font-semibold">{profile.suggestedConcurrency}</span>
                      <span className="text-muted-foreground flex items-center gap-1"><Timer className="h-3 w-3" />Tx en prueba (120s):</span>
                      <span className="font-semibold">~{profile.suggestedConcurrency * 2} transacciones</span>
                    </div>
                  </div>

                </CardContent>
              </Card>

              {/* Test config */}
              <Card>
                <CardHeader><CardTitle className="text-base">Configuración de prueba</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Tipo de prueba</label>
                    <Select value={testType} onValueChange={setTestType} disabled={running}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TEST_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            <div className="flex items-center gap-2"><t.icon className="h-4 w-4" />{t.label}</div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedTestMeta && <p className="text-xs text-muted-foreground mt-1">{selectedTestMeta.description}</p>}
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Evento</label>
                    <Select value={eventId} onValueChange={setEventId} disabled={running}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                      <SelectContent>{eventsData?.events?.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  {(testType === "load_test" || testType === "balance_integrity") && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Cajeros: {concurrency}</label>
                      <input type="range" min={1} max={20} value={concurrency} onChange={(e) => setConcurrency(Number(e.target.value))} disabled={running} className="w-full accent-primary" />
                      <div className="flex justify-between text-xs text-muted-foreground"><span>1</span><span>20</span></div>
                    </div>
                  )}
                  {testType === "load_test" && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Duración: {duration}s</label>
                      <input type="range" min={10} max={120} step={5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} disabled={running} className="w-full accent-primary" />
                      <div className="flex justify-between text-xs text-muted-foreground"><span>10s</span><span>120s</span></div>
                    </div>
                  )}
                  {testType === "load_test" && (
                    <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs space-y-0.5">
                      {(() => {
                        const minCycleMs = 60_000;
                        const rawPauseMs = targetTPS && targetTPS > 0
                          ? Math.round((concurrency * 1000) / targetTPS)
                          : minCycleMs;
                        const pauseMs = Math.max(minCycleMs, rawPauseMs);
                        const cycleS = Math.round(pauseMs / 1000);
                        const expectedTx = Math.floor(concurrency * (duration * 1000 / pauseMs));
                        return (
                          <>
                            <p className="font-medium text-foreground">~{expectedTx} tx esperadas en {duration}s</p>
                            <p className="text-muted-foreground">Cada POS: 1 cobro cada {cycleS}s · {concurrency} POS en paralelo</p>
                            {targetTPS !== null && rawPauseMs < minCycleMs && (
                              <p className="text-amber-500">Perfil sugiere {targetTPS} tx/s — limitado al mínimo realista (1 tx/min por POS)</p>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button className="flex-1" onClick={startServerTest} disabled={running}>
                      <Play className="mr-2 h-4 w-4" />{running ? "Ejecutando..." : "Iniciar"}
                    </Button>
                    {running && <Button variant="outline" onClick={() => { sseRef.current?.abort(); setRunning(false); }}><XCircle className="h-4 w-4" /></Button>}
                  </div>
                </CardContent>
              </Card>

              {/* Railway scaling */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Server className="h-4 w-4" />Réplicas Railway
                    <Button variant="ghost" size="sm" className="ml-auto h-6 w-6 p-0" onClick={() => refetchRailway()} disabled={railwayFetching}><RefreshCw className={`h-3 w-3 ${railwayFetching ? "animate-spin" : ""}`} /></Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {railwayStatus ? Object.entries(railwayStatus.services).map(([key, count]) => (
                    <div key={key} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{railwayStatus.servicesMeta[key]?.label ?? key}</p>
                        <p className="text-xs text-muted-foreground">{count} réplica{count !== 1 ? "s" : ""}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={count <= 1 || scaleMutation.isPending} onClick={() => scaleMutation.mutate({ service: key, replicas: count - 1 })}><ChevronDown className="h-3 w-3" /></Button>
                        <span className="w-5 text-center text-sm font-bold">{count}</span>
                        <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={count >= 10 || scaleMutation.isPending} onClick={() => scaleMutation.mutate({ service: key, replicas: count + 1 })}><ChevronUp className="h-3 w-3" /></Button>
                      </div>
                    </div>
                  )) : <p className="text-xs text-muted-foreground">Cargando...</p>}
                </CardContent>
              </Card>
            </div>

            {/* Right: results */}
            <div className="lg:col-span-2 space-y-4">
              {(running || progressMsg) && (
                <Card>
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4 animate-pulse" />En progreso</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <Progress value={progressPct} className="h-2" />
                    <p className="text-sm text-muted-foreground">{progressMsg}</p>
                    {liveMetrics && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                        {liveMetrics.txCount !== undefined && <MetricTile label="Transacciones" value={String(liveMetrics.txCount)} />}
                        {liveMetrics.throughput !== undefined && <MetricTile label="Throughput" value={`${liveMetrics.throughput} tx/s`} />}
                        {liveMetrics.p95 !== undefined && <MetricTile label="P95" value={`${liveMetrics.p95}ms`} highlight={Number(liveMetrics.p95) > 800} />}
                        {liveMetrics.errors !== undefined && <MetricTile label="Errores" value={String(liveMetrics.errors)} highlight={Number(liveMetrics.errors) > 0} />}
                        {liveMetrics.concurrency !== undefined && <MetricTile label="Cajeros" value={String(liveMetrics.concurrency)} />}
                        {liveMetrics.errorRate !== undefined && <MetricTile label="Error %" value={`${liveMetrics.errorRate}%`} highlight={Number(liveMetrics.errorRate) > 5} />}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
              {sseError && (
                <Card className="border-destructive">
                  <CardContent className="pt-4 flex items-start gap-2 text-destructive">
                    <XCircle className="h-4 w-4 mt-0.5 shrink-0" /><p className="text-sm">{sseError}</p>
                  </CardContent>
                </Card>
              )}
              {lastResult && <ResultCard result={lastResult.results} score={lastResult.score} />}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="h-4 w-4" />Historial
                    <Button variant="ghost" size="sm" className="ml-auto h-6 w-6 p-0" onClick={() => refetchRuns()}><RefreshCw className="h-3 w-3" /></Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {!runsData?.runs?.length ? <p className="text-sm text-muted-foreground text-center py-4">Sin pruebas previas.</p> : (
                    <div className="space-y-2">{runsData.runs.map((r) => <RunRow key={r.id} run={r} />)}</div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ── Device Test Tab ── */}
        <TabsContent value="devices" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-4">
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><Smartphone className="h-4 w-4" />Prueba de dispositivos</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-xs text-muted-foreground">Envía una notificación push a todos los dispositivos del evento para que ejecuten cobros reales y midan su latencia real desde el venue.</p>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Evento</label>
                    <Select value={eventId} onValueChange={setEventId}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                      <SelectContent>{eventsData?.events?.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  {/* Device groups table */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Grupos de dispositivos</p>
                    <div className="rounded-md border border-border overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/40">
                          <tr>
                            <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Tipo</th>
                            <th className="text-center px-2 py-1.5 font-medium text-muted-foreground w-14">Cant.</th>
                            <th className="text-center px-2 py-1.5 font-medium text-muted-foreground w-14">Cobros</th>
                            <th className="text-center px-2 py-1.5 font-medium text-muted-foreground w-20">COP ¢</th>
                            <th className="w-8" />
                          </tr>
                        </thead>
                        <tbody>
                          {deviceGroups.map((g, i) => (
                            <tr key={g.role} className={`border-t border-border ${!g.enabled ? "opacity-40" : ""}`}>
                              <td className="px-2 py-1.5 font-medium">{g.label}</td>
                              <td className="px-1 py-1">
                                <Input type="number" min={0} max={50} value={g.count}
                                  onChange={(e) => updateGroup(i, { count: Number(e.target.value) })}
                                  disabled={!g.enabled}
                                  className="h-6 text-xs text-center px-1" />
                              </td>
                              <td className="px-1 py-1">
                                <Input type="number" min={1} max={50} value={g.numCharges}
                                  onChange={(e) => updateGroup(i, { numCharges: Number(e.target.value) })}
                                  disabled={!g.enabled}
                                  className="h-6 text-xs text-center px-1" />
                              </td>
                              <td className="px-1 py-1">
                                <Input type="number" min={0} value={g.amountCents}
                                  onChange={(e) => updateGroup(i, { amountCents: Number(e.target.value) })}
                                  disabled={!g.enabled}
                                  className="h-6 text-xs text-center px-1" />
                              </td>
                              <td className="px-2 text-center">
                                <input type="checkbox" checked={g.enabled}
                                  onChange={(e) => updateGroup(i, { enabled: e.target.checked })}
                                  className="accent-primary" />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Total estimado: {deviceGroups.filter(g => g.enabled).reduce((s, g) => s + g.count * g.numCharges, 0)} cobros
                      · {deviceGroups.filter(g => g.enabled).reduce((s, g) => s + g.count, 0)} dispositivos
                    </p>
                  </div>
                  <Button className="w-full" onClick={startDeviceTest} disabled={dtStarting}>
                    <Play className="mr-2 h-4 w-4" />Iniciar prueba en dispositivos
                  </Button>
                </CardContent>
              </Card>

              {/* ScaleFusion device health */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Cpu className="h-4 w-4" />Estado ScaleFusion
                    <Button variant="ghost" size="sm" className="ml-auto h-6 w-6 p-0" onClick={() => qc.invalidateQueries({ queryKey: ["scalefusion-devices"] })}><RefreshCw className="h-3 w-3" /></Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {!devicesData?.devices?.length ? (
                    <p className="text-xs text-muted-foreground">Sin dispositivos o API key no configurada.</p>
                  ) : (
                    <div className="space-y-2">
                      {devicesData.devices.filter((d) => d.status === "online").slice(0, 8).map((d) => (
                        <div key={d.id} className="flex items-center justify-between text-sm">
                          <div className="min-w-0">
                            <p className="font-medium truncate">{d.name}</p>
                            <p className="text-xs text-muted-foreground">{d.status}</p>
                          </div>
                          <div className="flex gap-3 text-xs text-right shrink-0">
                            {d.ramUsagePct !== null && <span className={d.ramUsagePct > 80 ? "text-red-500 font-semibold" : "text-muted-foreground"}>RAM {d.ramUsagePct}%</span>}
                            {d.batteryLevel !== null && <span className="text-muted-foreground">🔋{d.batteryLevel}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Device test results */}
            <div className="lg:col-span-2 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="h-4 w-4" />Resultados por dispositivo
                    <Button variant="ghost" size="sm" className="ml-auto h-6 w-6 p-0" onClick={() => refetchDeviceRuns()}><RefreshCw className="h-3 w-3" /></Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {!deviceRunsData?.runs?.length ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Sin pruebas de dispositivos aún.</p>
                  ) : (
                    <div className="space-y-3">
                      {deviceRunsData.runs.map((run) => <DeviceRunCard key={run.id} run={run} />)}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function MetricTile({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 text-center ${highlight ? "border-destructive/50 bg-destructive/5" : "border-border"}`}>
      <p className={`text-lg font-bold ${highlight ? "text-destructive" : ""}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function ResultCard({ result, score }: { result: Record<string, unknown>; score: number }) {
  const recs = (result.recommendations as string[]) ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span>Resultado</span>
          <div className="flex items-center gap-2">
            <span className={`text-3xl font-black ${scoreColor(score)}`}>{score}</span>
            <Badge variant={scoreBadgeVariant(score)}>/100</Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {result.p50 !== undefined && <MetricTile label="P50" value={`${Math.round(result.p50 as number)}ms`} />}
          {result.p95 !== undefined && <MetricTile label="P95" value={`${Math.round(result.p95 as number)}ms`} highlight={(result.p95 as number) > 800} />}
          {result.errorRate !== undefined && <MetricTile label="Error rate" value={`${((result.errorRate as number) * 100).toFixed(1)}%`} highlight={(result.errorRate as number) > 0.05} />}
          {result.throughput !== undefined && <MetricTile label="Throughput" value={`${(result.throughput as number).toFixed(1)} tx/s`} />}
          {result.txCount !== undefined && <MetricTile label="Transacciones" value={String(result.txCount)} />}
          {result.breakingPoint !== undefined && result.breakingPoint !== null && <MetricTile label="Breaking point" value={`${result.breakingPoint} cajeros`} highlight />}
          {result.recommendedReplicas !== undefined && <MetricTile label="Réplicas sugeridas" value={String(result.recommendedReplicas)} />}
          {result.balanceMatch !== undefined && (
            <div className={`rounded-lg border p-3 text-center ${result.balanceMatch ? "border-green-500/30 bg-green-500/5" : "border-destructive/50 bg-destructive/5"}`}>
              <div className="flex justify-center mb-1">
                {result.balanceMatch ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <XCircle className="h-5 w-5 text-destructive" />}
              </div>
              <p className="text-xs text-muted-foreground">Integridad</p>
            </div>
          )}
        </div>
        {recs.length > 0 && (
          <>
            <Separator />
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recomendaciones</p>
              {recs.map((r, i) => (
                <p key={i} className="text-sm flex items-start gap-1">
                  {r.startsWith("✅") ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" /> :
                   r.startsWith("❌") ? <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" /> :
                   <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />}
                  <span>{r.replace(/^[✅❌⚠️📊🔧]\s*/, "")}</span>
                </p>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function RunRow({ run }: { run: RunRow }) {
  const meta = TEST_TYPES.find((t) => t.value === run.test_type);
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2 min-w-0">
          {meta && <meta.icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{meta?.label ?? run.test_type}</p>
            <p className="text-xs text-muted-foreground">{run.event_name ?? run.event_id} · {fmt(run.created_at)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {run.status === "running" && <Badge variant="secondary" className="text-xs">Ejecutando</Badge>}
          {run.status === "failed"  && <Badge variant="destructive" className="text-xs">Fallido</Badge>}
          {run.status === "completed" && run.score !== null && <Badge variant={scoreBadgeVariant(run.score)} className="text-xs">{run.score}/100</Badge>}
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>
      {expanded && run.results && <ResultCard result={run.results} score={run.score ?? 0} />}
    </div>
  );
}

function DeviceRunCard({ run }: { run: DeviceRun }) {
  const [expanded, setExpanded] = useState(false);
  const deviceCount = run.device_results?.length ?? 0;
  const avgP95 = deviceCount > 0
    ? Math.round(run.device_results.reduce((a, d) => a + (d.p95 ?? 0), 0) / deviceCount)
    : null;
  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="min-w-0">
          <p className="text-sm font-medium">{run.event_name ?? run.event_id}</p>
          <p className="text-xs text-muted-foreground">
            {fmt(run.created_at)} · {run.config.numCharges} cobros · {deviceCount} device(s)
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {run.status === "pending"   && <Badge variant="secondary" className="text-xs">Esperando</Badge>}
          {run.status === "running"   && <Badge variant="secondary" className="text-xs">Ejecutando</Badge>}
          {run.status === "completed" && <Badge variant="default"   className="text-xs">Completado</Badge>}
          {avgP95 !== null && <span className={`text-xs font-mono ${avgP95 > 800 ? "text-red-500" : "text-muted-foreground"}`}>P95 ~{avgP95}ms</span>}
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>
      {expanded && (
        <div className="space-y-2 pt-1">
          {deviceCount === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-2">Sin resultados aún — dispositivos notificados.</p>
          ) : (
            run.device_results.map((d, i) => (
              <div key={i} className="rounded-md bg-muted/30 border border-border p-2.5 flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium">{d.deviceName ?? `Device ${i + 1}`}</p>
                  <p className="text-xs text-muted-foreground">{d.successCount} éxitos · {d.errorCount} errores</p>
                </div>
                <div className="text-right text-xs space-y-0.5">
                  <p className="font-mono">P50 <span className="font-semibold">{Math.round(d.p50 ?? 0)}ms</span></p>
                  <p className={`font-mono ${(d.p95 ?? 0) > 800 ? "text-red-500 font-semibold" : ""}`}>P95 <span className="font-semibold">{Math.round(d.p95 ?? 0)}ms</span></p>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
