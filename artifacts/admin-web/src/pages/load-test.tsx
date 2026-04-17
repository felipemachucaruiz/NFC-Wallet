import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/use-toast";
import { AUTH_TOKEN_KEY } from "@/pages/login";
import {
  Activity,
  Zap,
  ShieldCheck,
  TrendingUp,
  Server,
  Play,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from "lucide-react";

const API = import.meta.env.PROD
  ? (import.meta.env.VITE_API_URL || "https://prod.tapee.app")
  : `${import.meta.env.BASE_URL}_srv`;

function getToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY) ?? "";
}

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${API}/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

const TEST_TYPES = [
  { value: "health_check",       label: "Health Check",         icon: Activity,    description: "Verifica latencia de endpoints críticos (10 rondas × 3 endpoints)" },
  { value: "load_test",          label: "Prueba de Carga",       icon: Zap,         description: "Simula N cajeros haciendo cobros simultáneos durante X segundos" },
  { value: "balance_integrity",  label: "Integridad de Saldo",   icon: ShieldCheck, description: "Cobros concurrentes sobre una pulsera — verifica que no haya race conditions" },
  { value: "breaking_point",     label: "Punto de Quiebre",      icon: TrendingUp,  description: "Sube carga de 2 → 40 cajeros hasta detectar degradación de performance" },
];

function scoreColor(score: number) {
  if (score >= 85) return "text-green-500";
  if (score >= 65) return "text-yellow-500";
  return "text-red-500";
}

function scoreBadgeVariant(score: number): "default" | "secondary" | "destructive" {
  if (score >= 85) return "default";
  if (score >= 65) return "secondary";
  return "destructive";
}

function formatTs(ts: string) {
  return new Date(ts).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
}

type RunRow = {
  id: string;
  event_id: string;
  event_name?: string;
  test_type: string;
  status: "running" | "completed" | "failed";
  score: number | null;
  results: Record<string, unknown> | null;
  created_at: string;
  completed_at: string | null;
};

type ServiceStatus = {
  services: Record<string, number>;
  servicesMeta: Record<string, { id: string; label: string }>;
};

type ProgressEvent = { phase: string; progress: number; message: string };
type MetricEvent = Record<string, unknown>;

export default function LoadTestPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  // Config
  const [testType, setTestType] = useState("health_check");
  const [eventId, setEventId] = useState("");
  const [concurrency, setConcurrency] = useState(5);
  const [duration, setDuration] = useState(30);

  // SSE state
  const [running, setRunning] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [liveMetrics, setLiveMetrics] = useState<MetricEvent | null>(null);
  const [lastResult, setLastResult] = useState<{ runId: string; score: number; results: Record<string, unknown> } | null>(null);
  const [sseError, setSseError] = useState<string | null>(null);
  const sseRef = useRef<AbortController | null>(null);

  // Runs history
  const { data: runsData, refetch: refetchRuns } = useQuery<{ runs: RunRow[] }>({
    queryKey: ["load-test-runs"],
    queryFn: () => apiFetch("/load-test/runs"),
    refetchInterval: running ? 5000 : false,
  });

  // Railway status
  const { data: railwayStatus, refetch: refetchRailway } = useQuery<ServiceStatus>({
    queryKey: ["railway-status"],
    queryFn: () => apiFetch("/load-test/railway/status"),
  });

  // Events for selector
  const { data: eventsData } = useQuery<{ events: Array<{ id: string; name: string }> }>({
    queryKey: ["events-list"],
    queryFn: () => apiFetch("/events?limit=100"),
  });

  // Railway scale mutation
  const scaleMutation = useMutation({
    mutationFn: ({ service, replicas }: { service: string; replicas: number }) =>
      apiFetch("/load-test/railway/scale", { method: "POST", body: JSON.stringify({ service, replicas }) }),
    onSuccess: (_, vars) => {
      toast({ title: `Escalado a ${vars.replicas} réplica(s)`, description: vars.service });
      refetchRailway();
    },
    onError: (e) => toast({ title: "Error al escalar", description: String(e), variant: "destructive" }),
  });

  useEffect(() => {
    return () => { sseRef.current?.abort(); };
  }, []);

  async function startTest() {
    if (!eventId) { toast({ title: "Selecciona un evento", variant: "destructive" }); return; }
    sseRef.current?.abort();
    const ctrl = new AbortController();
    sseRef.current = ctrl;

    setRunning(true);
    setProgressPct(0);
    setProgressMsg("Conectando...");
    setLiveMetrics(null);
    setLastResult(null);
    setSseError(null);

    try {
      const res = await fetch(`${API}/api/load-test/runs`, {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ testType, eventId, concurrency, durationSeconds: duration }),
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

        let eventType = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) { eventType = line.slice(7); }
          else if (line.startsWith("data: ")) {
            const payload = JSON.parse(line.slice(6));
            if (eventType === "progress") {
              const p = payload as ProgressEvent;
              setProgressPct(p.progress ?? 0);
              setProgressMsg(p.message ?? "");
            } else if (eventType === "metric") {
              setLiveMetrics(payload as MetricEvent);
            } else if (eventType === "complete") {
              setLastResult(payload);
              setProgressPct(100);
              setProgressMsg("¡Prueba completada!");
              refetchRuns();
            } else if (eventType === "error") {
              setSseError(payload.error);
              refetchRuns();
            }
          }
        }
      }
    } catch (e: unknown) {
      if ((e as Error).name !== "AbortError") setSseError(String(e));
    } finally {
      setRunning(false);
    }
  }

  function stopTest() {
    sseRef.current?.abort();
    setRunning(false);
    setProgressMsg("Prueba cancelada.");
  }

  const selectedTestMeta = TEST_TYPES.find((t) => t.value === testType);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Simulador Pre-Evento</h1>
        <p className="text-muted-foreground text-sm mt-1">Pruebas de carga, integridad y punto de quiebre antes de cada evento.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Config panel */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Configuración</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Tipo de prueba</label>
                <Select value={testType} onValueChange={setTestType} disabled={running}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TEST_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        <div className="flex items-center gap-2">
                          <t.icon className="h-4 w-4" />
                          {t.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedTestMeta && (
                  <p className="text-xs text-muted-foreground mt-1">{selectedTestMeta.description}</p>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Evento</label>
                <Select value={eventId} onValueChange={setEventId} disabled={running}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar evento..." /></SelectTrigger>
                  <SelectContent>
                    {eventsData?.events?.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(testType === "load_test" || testType === "balance_integrity") && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Cajeros simultáneos: {concurrency}</label>
                  <input
                    type="range" min={1} max={20} value={concurrency}
                    onChange={(e) => setConcurrency(Number(e.target.value))}
                    disabled={running}
                    className="w-full accent-primary"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground"><span>1</span><span>20</span></div>
                </div>
              )}

              {testType === "load_test" && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Duración: {duration}s</label>
                  <input
                    type="range" min={10} max={120} step={5} value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    disabled={running}
                    className="w-full accent-primary"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground"><span>10s</span><span>120s</span></div>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button className="flex-1" onClick={startTest} disabled={running}>
                  <Play className="mr-2 h-4 w-4" />
                  {running ? "Ejecutando..." : "Iniciar"}
                </Button>
                {running && (
                  <Button variant="outline" onClick={stopTest}>
                    <XCircle className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Railway scaling */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Server className="h-4 w-4" />
                Réplicas Railway
                <Button variant="ghost" size="sm" className="ml-auto h-6 w-6 p-0" onClick={() => refetchRailway()}>
                  <RefreshCw className="h-3 w-3" />
                </Button>
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
                    <Button
                      variant="outline" size="sm" className="h-7 w-7 p-0"
                      disabled={count <= 1 || scaleMutation.isPending}
                      onClick={() => scaleMutation.mutate({ service: key, replicas: count - 1 })}
                    >
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                    <span className="w-5 text-center text-sm font-bold">{count}</span>
                    <Button
                      variant="outline" size="sm" className="h-7 w-7 p-0"
                      disabled={count >= 10 || scaleMutation.isPending}
                      onClick={() => scaleMutation.mutate({ service: key, replicas: count + 1 })}
                    >
                      <ChevronUp className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )) : (
                <p className="text-xs text-muted-foreground">Cargando estado...</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right panel: progress + results */}
        <div className="lg:col-span-2 space-y-4">
          {/* Progress */}
          {(running || progressMsg) && (
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4 animate-pulse" />En progreso</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Progress value={progressPct} className="h-2" />
                <p className="text-sm text-muted-foreground">{progressMsg}</p>
                {liveMetrics && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                    {liveMetrics.txCount !== undefined && (
                      <MetricTile label="Transacciones" value={String(liveMetrics.txCount)} />
                    )}
                    {liveMetrics.throughput !== undefined && (
                      <MetricTile label="Throughput" value={`${liveMetrics.throughput} tx/s`} />
                    )}
                    {liveMetrics.p95 !== undefined && (
                      <MetricTile label="P95" value={`${liveMetrics.p95}ms`} highlight={Number(liveMetrics.p95) > 800} />
                    )}
                    {liveMetrics.errors !== undefined && (
                      <MetricTile label="Errores" value={String(liveMetrics.errors)} highlight={Number(liveMetrics.errors) > 0} />
                    )}
                    {liveMetrics.concurrency !== undefined && (
                      <MetricTile label="Cajeros" value={String(liveMetrics.concurrency)} />
                    )}
                    {liveMetrics.errorRate !== undefined && (
                      <MetricTile label="Error %" value={`${liveMetrics.errorRate}%`} highlight={Number(liveMetrics.errorRate) > 5} />
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {sseError && (
            <Card className="border-destructive">
              <CardContent className="pt-4 flex items-start gap-2 text-destructive">
                <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <p className="text-sm">{sseError}</p>
              </CardContent>
            </Card>
          )}

          {/* Last result */}
          {lastResult && <ResultCard result={lastResult.results} score={lastResult.score} />}

          {/* Run history */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Historial
                <Button variant="ghost" size="sm" className="ml-auto h-6 w-6 p-0" onClick={() => refetchRuns()}>
                  <RefreshCw className="h-3 w-3" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!runsData?.runs?.length ? (
                <p className="text-sm text-muted-foreground text-center py-4">Sin pruebas previas.</p>
              ) : (
                <div className="space-y-2">
                  {runsData.runs.map((run) => (
                    <RunRow key={run.id} run={run} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

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
          {result.breakingPoint !== undefined && result.breakingPoint !== null && (
            <MetricTile label="Breaking point" value={`${result.breakingPoint} cajeros`} highlight />
          )}
          {result.recommendedReplicas !== undefined && (
            <MetricTile label="Réplicas sugeridas" value={String(result.recommendedReplicas)} />
          )}
          {result.balanceMatch !== undefined && (
            <div className={`rounded-lg border p-3 text-center ${result.balanceMatch ? "border-green-500/30 bg-green-500/5" : "border-destructive/50 bg-destructive/5"}`}>
              <div className="flex justify-center mb-1">{result.balanceMatch ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <XCircle className="h-5 w-5 text-destructive" />}</div>
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
  const testMeta = TEST_TYPES.find((t) => t.value === run.test_type);
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2 min-w-0">
          {testMeta && <testMeta.icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{testMeta?.label ?? run.test_type}</p>
            <p className="text-xs text-muted-foreground">{run.event_name ?? run.event_id} · {formatTs(run.created_at)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {run.status === "running" && <Badge variant="secondary" className="text-xs">Ejecutando</Badge>}
          {run.status === "failed" && <Badge variant="destructive" className="text-xs">Fallido</Badge>}
          {run.status === "completed" && run.score !== null && (
            <Badge variant={scoreBadgeVariant(run.score)} className="text-xs">{run.score}/100</Badge>
          )}
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>
      {expanded && run.results && (
        <ResultCard result={run.results} score={run.score ?? 0} />
      )}
    </div>
  );
}
