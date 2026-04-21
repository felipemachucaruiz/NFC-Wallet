import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch, ApiError } from "@workspace/api-client-react";
import { DatePicker } from "@/components/ui/date-picker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Lock, RotateCcw, Trash2, RefreshCw, Wifi, WifiOff, List, Map, AlertTriangle, KeyRound, Info, Battery, Cpu, Signal, MapPin, Settings, HardDrive, Server } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GoogleMap, Marker, InfoWindow, useJsApiLoader } from "@react-google-maps/api";
import { GOOGLE_MAPS_API_KEY, MAPS_LIBRARIES, DEFAULT_CENTER, TAPEE_MAP_STYLES } from "@/lib/maps";

interface Device {
  id: string | number;
  name: string;
  status: string;
  batteryLevel: number | null;
  batteryCharging: boolean;
  batteryHealth: string | null;
  batteryTempCelsius: number | null;
  lastSeenAt: string | null;
  model: string | null;
  make: string | null;
  osVersion: string | null;
  buildVersion: string | null;
  serialNumber: string | null;
  androidId: string | null;
  locked: boolean;
  licenseStatus: string | null;
  inTrial: boolean;
  enrollmentDate: string | null;
  simNetwork: string | null;
  sim1NetworkType: string | null;
  simSignalStrength: number | null;
  ipAddress: string | null;
  publicIp: string | null;
  ramUsageMb: number | null;
  totalRamMb: number | null;
  ramUsagePct: number | null;
  storageAvailMb: number | null;
  storageTotalMb: number | null;
  managementMode: string | null;
  enrollmentMode: string | null;
  enrollmentMethod: string | null;
  managementState: string | null;
  groupName: string | null;
  profileName: string | null;
  lat: number | null;
  lng: number | null;
  locationAddress: string | null;
}

function isOnline(status: string): boolean {
  return status === "online";
}

function BatteryDisplay({ level, charging, health, tempC }: { level: number | null; charging?: boolean; health?: string | null; tempC?: number | null }) {
  if (level === null || level === undefined) return <span className="text-muted-foreground text-sm">—</span>;
  const color = level > 50 ? "text-green-600" : level > 20 ? "text-yellow-600" : "text-red-600";
  return (
    <div className="space-y-0.5">
      <span className={`text-sm font-medium ${color}`}>
        {level}%{charging ? " ⚡" : ""}
      </span>
      {(health || tempC !== null && tempC !== undefined) && (
        <p className="text-xs text-muted-foreground">
          {health}{health && tempC != null ? " · " : ""}{tempC != null ? `${tempC}°C` : ""}
        </p>
      )}
    </div>
  );
}

function fmtLastSeen(ts: string | null): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-xs text-muted-foreground shrink-0 w-36">{label}</span>
      <span className="text-xs text-right font-medium break-all">{value}</span>
    </div>
  );
}

function SignalDots({ strength }: { strength: number | null }) {
  if (strength === null) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span className="flex items-end gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`inline-block w-1 rounded-sm ${i <= strength ? "bg-green-500" : "bg-muted"}`}
          style={{ height: `${i * 3 + 4}px` }}
        />
      ))}
    </span>
  );
}

function StorageBar({ avail, total }: { avail: number | null; total: number | null }) {
  if (!avail || !total) return null;
  const used = total - avail;
  const pct = Math.round((used / total) * 100);
  const color = pct > 85 ? "bg-red-500" : pct > 60 ? "bg-yellow-500" : "bg-green-500";
  return (
    <div className="space-y-1">
      <div className="w-full bg-muted rounded-full h-1.5">
        <div className={`${color} h-1.5 rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">{Math.round(used / 1024)} GB used of {Math.round(total / 1024)} GB</p>
    </div>
  );
}

function DeviceDetailDialog({ deviceId, onClose }: { deviceId: string | number | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery<{ device: Device }>({
    queryKey: ["device-detail", deviceId],
    queryFn: () => customFetch<{ device: Device }>(`/api/devices/${deviceId}`),
    enabled: !!deviceId,
  });
  const d = data?.device;

  return (
    <Dialog open={!!deviceId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg w-full p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            {d ? (
              <>
                {d.name}
                <Badge
                  className={`text-xs ${isOnline(d.status) ? "bg-green-100 text-green-800 border-green-200" : "bg-gray-100 text-gray-600 border-gray-200"}`}
                  variant="secondary"
                >
                  {isOnline(d.status) ? t("devices.statusOnline") : t("devices.statusOffline")}
                </Badge>
              </>
            ) : t("common.loading")}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh]">
          <div className="px-6 py-4">
            {isLoading && (
              <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                {t("common.loading")}
              </div>
            )}

            {d && (
              <div className="space-y-5">
                {/* Device */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Settings className="w-3.5 h-3.5 text-muted-foreground" />
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dispositivo</p>
                  </div>
                  <DetailRow label="Modelo" value={d.model} />
                  <DetailRow label="Fabricante" value={d.make} />
                  <DetailRow label="Android" value={d.osVersion ? `Android ${d.osVersion}` : null} />
                  <DetailRow label="Build" value={d.buildVersion} />
                  <DetailRow label="Serial" value={d.serialNumber} />
                  <DetailRow label="Android ID" value={d.androidId} />
                  <DetailRow label="Grupo" value={d.groupName} />
                  <DetailRow label="Perfil" value={d.profileName} />
                </div>

                <Separator />

                {/* Battery */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Battery className="w-3.5 h-3.5 text-muted-foreground" />
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Batería</p>
                  </div>
                  <DetailRow label="Nivel" value={d.batteryLevel !== null ? `${d.batteryLevel}%` : null} />
                  <DetailRow label="Estado" value={d.batteryCharging ? "⚡ Cargando" : "No cargando"} />
                  <DetailRow label="Salud" value={d.batteryHealth} />
                  <DetailRow label="Temperatura" value={d.batteryTempCelsius !== null ? `${d.batteryTempCelsius}°C` : null} />
                </div>

                <Separator />

                {/* RAM & Storage */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Cpu className="w-3.5 h-3.5 text-muted-foreground" />
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Memoria</p>
                  </div>
                  {d.ramUsagePct !== null && (
                    <DetailRow
                      label="RAM"
                      value={`${d.ramUsagePct}% (${Math.round((d.ramUsageMb ?? 0) / 1024 * 10) / 10} / ${Math.round((d.totalRamMb ?? 0) / 1024 * 10) / 10} GB)`}
                    />
                  )}
                  {d.storageTotalMb && (
                    <div className="py-1.5">
                      <span className="text-xs text-muted-foreground">Almacenamiento interno</span>
                      <div className="mt-1.5">
                        <StorageBar avail={d.storageAvailMb} total={d.storageTotalMb} />
                      </div>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Network */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Signal className="w-3.5 h-3.5 text-muted-foreground" />
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Red</p>
                  </div>
                  <DetailRow label="Operador" value={d.simNetwork} />
                  <DetailRow label="Tipo red" value={d.sim1NetworkType} />
                  <DetailRow
                    label="Señal"
                    value={d.simSignalStrength !== null ? <SignalDots strength={d.simSignalStrength} /> : null}
                  />
                  <DetailRow label="IP local" value={d.ipAddress} />
                  <DetailRow label="IP pública" value={d.publicIp} />
                </div>

                <Separator />

                {/* Location */}
                {d.locationAddress && (
                  <>
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ubicación</p>
                      </div>
                      <p className="text-xs leading-relaxed">{d.locationAddress}</p>
                      {d.lat && d.lng && (
                        <p className="text-xs text-muted-foreground mt-1">{d.lat.toFixed(6)}, {d.lng.toFixed(6)}</p>
                      )}
                    </div>
                    <Separator />
                  </>
                )}

                {/* Management */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <HardDrive className="w-3.5 h-3.5 text-muted-foreground" />
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Gestión</p>
                  </div>
                  <DetailRow label="Modo" value={d.managementMode} />
                  <DetailRow label="Tipo inscripción" value={d.enrollmentMode} />
                  <DetailRow label="Método" value={d.enrollmentMethod} />
                  <DetailRow label="Estado" value={d.managementState} />
                  <DetailRow label="Licencia" value={d.licenseStatus} />
                  <DetailRow label="Trial" value={d.inTrial ? "Sí" : "No"} />
                  <DetailRow label="Bloqueado" value={d.locked ? "Sí" : "No"} />
                  <DetailRow label="Fecha inscripción" value={d.enrollmentDate ? fmtLastSeen(String(d.enrollmentDate)) : null} />
                  <DetailRow label="Última conexión" value={fmtLastSeen(d.lastSeenAt)} />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

interface LocationPoint {
  lat: number | null;
  lng: number | null;
  address: string | null;
  accuracy: number | null;
  timestamp: string | null;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function DeviceMap({ devices }: { devices: Device[] }) {
  const { t } = useTranslation();
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: MAPS_LIBRARIES,
  });

  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [historyDate, setHistoryDate] = useState<string>(todayDate());

  const locatedDevices = devices.filter((d) => d.lat !== null && d.lng !== null);

  const { data: historyData } = useQuery<{ locations: LocationPoint[] }>({
    queryKey: ["device-locations", selectedId, historyDate],
    queryFn: () => customFetch<{ locations: LocationPoint[] }>(`/api/devices/${selectedId}/locations?date=${historyDate}`),
    enabled: !!selectedId,
  });
  const trail = (historyData?.locations ?? []).filter((p) => p.lat !== null && p.lng !== null);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    if (locatedDevices.length === 0) return;
    if (locatedDevices.length === 1) {
      map.setCenter({ lat: locatedDevices[0].lat!, lng: locatedDevices[0].lng! });
      map.setZoom(14);
      return;
    }
    const bounds = new window.google.maps.LatLngBounds();
    locatedDevices.forEach((d) => bounds.extend({ lat: d.lat!, lng: d.lng! }));
    map.fitBounds(bounds, 60);
  }, [locatedDevices]);

  if (!isLoaded) {
    return (
      <div className="h-[500px] flex items-center justify-center text-muted-foreground text-sm">
        {t("common.loading")}
      </div>
    );
  }

  const selectedDevice = locatedDevices.find((d) => d.id === selectedId) ?? null;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {selectedId && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/30 text-sm text-muted-foreground">
          <span>{t("devices.locationHistoryDate", "Historial:")}</span>
          <DatePicker
            value={historyDate}
            onChange={(v) => setHistoryDate(v ?? "")}
          />
          <span className="text-xs">({trail.length} {t("devices.locationPoints", "puntos")})</span>
        </div>
      )}
      <div className="relative">
        <GoogleMap
          mapContainerStyle={{ width: "100%", height: "500px" }}
          center={locatedDevices.length > 0 ? { lat: locatedDevices[0].lat!, lng: locatedDevices[0].lng! } : DEFAULT_CENTER}
          zoom={locatedDevices.length > 0 ? 14 : 6}
          onLoad={onMapLoad}
          options={{
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: true,
            styles: TAPEE_MAP_STYLES,
          }}
        >
          {locatedDevices.map((device) => (
            <Marker
              key={String(device.id)}
              position={{ lat: device.lat!, lng: device.lng! }}
              title={device.name}
              icon={{
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: 9,
                fillColor: isOnline(device.status) ? "#22c55e" : "#6b7280",
                fillOpacity: 1,
                strokeColor: "#ffffff",
                strokeWeight: 2,
              }}
              onClick={() => setSelectedId(device.id)}
            />
          ))}

          {trail.map((p, i) => (
            <Marker
              key={i}
              position={{ lat: p.lat!, lng: p.lng! }}
              title={p.timestamp ? new Date(p.timestamp).toLocaleTimeString() : undefined}
              icon={{
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: i === trail.length - 1 ? 7 : 4,
                fillColor: i === trail.length - 1 ? "#3b82f6" : "#93c5fd",
                fillOpacity: 0.85,
                strokeColor: "#ffffff",
                strokeWeight: 1.5,
              }}
            />
          ))}

          {selectedDevice && (
            <InfoWindow
              position={{ lat: selectedDevice.lat!, lng: selectedDevice.lng! }}
              onCloseClick={() => setSelectedId(null)}
            >
              <div className="text-sm min-w-[160px] space-y-1.5 p-0.5">
                <p className="font-semibold text-gray-900">{selectedDevice.name}</p>
                {selectedDevice.serialNumber && (
                  <p className="text-xs text-gray-500 font-mono">{selectedDevice.serialNumber}</p>
                )}
                <div className="flex items-center gap-1.5">
                  {isOnline(selectedDevice.status) ? (
                    <span className="inline-flex items-center gap-1 text-green-700 font-medium">
                      <Wifi className="w-3 h-3" />
                      {t("devices.statusOnline")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-gray-500">
                      <WifiOff className="w-3 h-3" />
                      {t("devices.statusOffline")}
                    </span>
                  )}
                </div>
                {selectedDevice.batteryLevel !== null && (
                  <p className="text-xs text-gray-600">
                    {t("devices.colBattery")}: {selectedDevice.batteryLevel}%
                  </p>
                )}
                {selectedDevice.lastSeenAt && (
                  <p className="text-xs text-gray-400">{fmtLastSeen(selectedDevice.lastSeenAt)}</p>
                )}
              </div>
            </InfoWindow>
          )}
        </GoogleMap>
        {locatedDevices.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-card/90 backdrop-blur-sm border border-border rounded-lg px-4 py-3 text-sm text-muted-foreground shadow-lg">
              {t("devices.mapNoLocation")}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface LocalServer {
  server_id: string;
  cpu_load_percent: number | null;
  memory_used_mb: number | null;
  memory_total_mb: number | null;
  process_uptime_s: number | null;
  events_loaded: number | null;
  bracelets_loaded: number | null;
  merchants_loaded: number | null;
  users_loaded: number | null;
  railway_latency_ms: number | null;
  railway_connected: boolean | null;
  last_seed_at: string | null;
  last_balance_sync_at: string | null;
  reported_at: string;
}

function UsageBar({ used, total, label }: { used: number | null; total: number | null; label: string }) {
  if (!used || !total) return <span className="text-xs text-muted-foreground">—</span>;
  const pct = Math.min(100, Math.round((used / total) * 100));
  const color = pct > 85 ? "bg-red-500" : pct > 60 ? "bg-yellow-500" : "bg-green-500";
  return (
    <div className="space-y-1 min-w-[120px]">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div className="w-full bg-muted rounded-full h-1.5">
        <div className={`${color} h-1.5 rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">{used} / {total} MB</p>
    </div>
  );
}

function fmtUptime(s: number | null): string {
  if (s === null) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function LocalServersPanel() {
  const { data, isLoading, refetch, isFetching } = useQuery<{ servers: LocalServer[] }>({
    queryKey: ["local-servers"],
    queryFn: () => customFetch<{ servers: LocalServer[] }>("/api/local-servers"),
    refetchInterval: 30_000,
  });

  const servers = data?.servers ?? [];
  const now = Date.now();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-xl font-semibold">Servidores Locales</h2>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      {isLoading ? (
        <div className="border border-border rounded-lg bg-card h-24 flex items-center justify-center text-muted-foreground text-sm">
          Cargando…
        </div>
      ) : servers.length === 0 ? (
        <div className="border border-border rounded-lg bg-card p-6 flex flex-col items-center justify-center gap-2 text-muted-foreground text-sm text-center">
          <span>No hay servidores locales activos.</span>
          <span>Asegúrate de que el servidor local esté corriendo con <code className="mx-1 text-xs bg-muted px-1 rounded">RAILWAY_SYNC_URL</code> configurado y actualizado a la última versión:</span>
          <code className="text-xs bg-muted px-2 py-1 rounded">docker compose pull &amp;&amp; docker compose up -d</code>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {servers.map((s) => {
            const seenMs = new Date(s.reported_at).getTime();
            const staleMin = Math.floor((now - seenMs) / 60_000);
            const online = staleMin < 2;
            const cpuColor = (s.cpu_load_percent ?? 0) > 80 ? "text-red-600" : (s.cpu_load_percent ?? 0) > 50 ? "text-yellow-600" : "text-green-600";
            return (
              <div key={s.server_id} className="border border-border rounded-lg bg-card p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-sm leading-tight break-all">{s.server_id}</p>
                  <Badge
                    variant="secondary"
                    className={`shrink-0 text-xs ${online ? "bg-green-100 text-green-800 border-green-200" : "bg-gray-100 text-gray-500 border-gray-200"}`}
                  >
                    {online ? (
                      <><Wifi className="w-3 h-3 mr-1" />En línea</>
                    ) : (
                      <><WifiOff className="w-3 h-3 mr-1" />Offline {staleMin}m</>
                    )}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <span className="text-muted-foreground">CPU</span>
                  <span className={`font-medium ${cpuColor}`}>{s.cpu_load_percent !== null ? `${s.cpu_load_percent}%` : "—"}</span>

                  <span className="text-muted-foreground">RAM</span>
                  <span className="font-medium">{s.memory_used_mb !== null && s.memory_total_mb !== null ? `${s.memory_used_mb} / ${s.memory_total_mb} MB` : "—"}</span>

                  <span className="text-muted-foreground">Uptime</span>
                  <span className="font-medium">{fmtUptime(s.process_uptime_s)}</span>

                  <span className="text-muted-foreground">Latencia Railway</span>
                  <span className="font-medium">{s.railway_latency_ms !== null ? `${s.railway_latency_ms} ms` : "—"}</span>
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <span className="text-muted-foreground">Eventos</span>
                  <span className="font-medium">{s.events_loaded ?? "—"}</span>

                  <span className="text-muted-foreground">Pulseras</span>
                  <span className="font-medium">{s.bracelets_loaded ?? "—"}</span>

                  <span className="text-muted-foreground">Comerciantes</span>
                  <span className="font-medium">{s.merchants_loaded ?? "—"}</span>

                  <span className="text-muted-foreground">Usuarios</span>
                  <span className="font-medium">{s.users_loaded ?? "—"}</span>
                </div>

                <p className="text-xs text-muted-foreground">
                  Último reporte: {fmtLastSeen(s.reported_at)}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Devices() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [view, setView] = useState<"table" | "map">("table");
  const [wipeTarget, setWipeTarget] = useState<Device | null>(null);
  const [detailDeviceId, setDetailDeviceId] = useState<string | number | null>(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<{ devices: Device[] }, ApiError>({
    queryKey: ["devices"],
    queryFn: () => customFetch<{ devices: Device[] }>("/api/devices"),
    refetchInterval: 30_000,
  });

  const errorStatus = isError && error instanceof ApiError ? error.status : null;

  const devices = data?.devices ?? [];

  const actionMutation = useMutation({
    mutationFn: ({ deviceId, action }: { deviceId: string | number; action: "lock" | "reboot" | "wipe" }) =>
      customFetch(`/api/devices/${deviceId}/actions`, {
        method: "POST",
        body: JSON.stringify({ action }),
      }),
    onSuccess: (_data, { action }) => {
      const label = action === "lock" ? t("devices.locked") : action === "reboot" ? t("devices.rebooted") : t("devices.wiped");
      toast({ title: label });
      queryClient.invalidateQueries({ queryKey: ["devices"] });
    },
    onError: (err: unknown) => {
      toast({
        title: t("common.error"),
        description: (err as { message?: string }).message,
        variant: "destructive",
      });
    },
  });

  const handleAction = (device: Device, action: "lock" | "reboot" | "wipe") => {
    if (action === "wipe") {
      setWipeTarget(device);
      return;
    }
    actionMutation.mutate({ deviceId: device.id, action });
  };

  const confirmWipe = () => {
    if (!wipeTarget) return;
    actionMutation.mutate({ deviceId: wipeTarget.id, action: "wipe" });
    setWipeTarget(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("devices.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("devices.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-border rounded-md overflow-hidden">
            <Button
              variant={view === "table" ? "default" : "ghost"}
              size="sm"
              className="rounded-none border-0"
              onClick={() => setView("table")}
              title={t("devices.viewTable")}
            >
              <List className="w-4 h-4 mr-1.5" />
              {t("devices.viewTable")}
            </Button>
            <Button
              variant={view === "map" ? "default" : "ghost"}
              size="sm"
              className="rounded-none border-0 border-l border-border"
              onClick={() => setView("map")}
              title={t("devices.viewMap")}
            >
              <Map className="w-4 h-4 mr-1.5" />
              {t("devices.viewMap")}
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            {t("devices.refresh")}
          </Button>
        </div>
      </div>

      {isError && (
        <div className={`rounded-md border p-4 flex gap-3 ${errorStatus === 503 ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30" : "border-destructive/50 bg-destructive/10"}`}>
          <div className="shrink-0 mt-0.5">
            {errorStatus === 503
              ? <KeyRound className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              : <AlertTriangle className="w-5 h-5 text-destructive" />
            }
          </div>
          <div className="space-y-1">
            <p className={`text-sm font-medium ${errorStatus === 503 ? "text-amber-800 dark:text-amber-300" : "text-destructive"}`}>
              {errorStatus === 503 ? t("devices.fetchErrorNoKeyTitle") : t("devices.fetchErrorUnreachableTitle")}
            </p>
            <p className={`text-sm ${errorStatus === 503 ? "text-amber-700 dark:text-amber-400" : "text-destructive/80"}`}>
              {errorStatus === 503 ? t("devices.fetchErrorNoKeyDesc") : t("devices.fetchErrorUnreachableDesc")}
            </p>
          </div>
        </div>
      )}

      {view === "table" ? (
        <div className="border border-border rounded-lg bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("devices.colName")}</TableHead>
                <TableHead>{t("devices.colStatus")}</TableHead>
                <TableHead>{t("devices.colBattery")}</TableHead>
                <TableHead>{t("devices.colLastSeen")}</TableHead>
                <TableHead>{t("devices.colModel")}</TableHead>
                <TableHead className="text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                    {t("common.loading")}
                  </TableCell>
                </TableRow>
              ) : devices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                    {t("devices.noDevices")}
                  </TableCell>
                </TableRow>
              ) : (
                devices.map((device) => {
                  const online = isOnline(device.status);
                  return (
                    <TableRow key={String(device.id)}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{device.name}</p>
                          {device.serialNumber && (
                            <p className="text-xs text-muted-foreground font-mono">{device.serialNumber}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={online ? "default" : "secondary"}
                          className={`flex items-center gap-1 w-fit text-xs ${online ? "bg-green-100 text-green-800 border-green-200" : "bg-gray-100 text-gray-600 border-gray-200"}`}
                        >
                          {online ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                          {online ? t("devices.statusOnline") : t("devices.statusOffline")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <BatteryDisplay
                          level={device.batteryLevel}
                          charging={device.batteryCharging}
                          health={device.batteryHealth}
                          tempC={device.batteryTempCelsius}
                        />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {fmtLastSeen(device.lastSeenAt)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <div>
                          {device.model ?? "—"}
                          {device.osVersion && (
                            <span className="block text-xs text-muted-foreground/70">Android {device.osVersion}</span>
                          )}
                          {device.simNetwork && (
                            <span className="block text-xs text-muted-foreground/70">
                              {device.simNetwork}{device.sim1NetworkType ? ` · ${device.sim1NetworkType}` : ""}
                            </span>
                          )}
                          {device.ramUsagePct !== null && (
                            <span className="block text-xs text-muted-foreground/70">RAM {device.ramUsagePct}%</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDetailDeviceId(device.id)}
                            title="Ver detalles"
                          >
                            <Info className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleAction(device, "lock")}
                            disabled={actionMutation.isPending}
                            title={t("devices.lockAction")}
                          >
                            <Lock className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleAction(device, "reboot")}
                            disabled={actionMutation.isPending}
                            title={t("devices.rebootAction")}
                          >
                            <RotateCcw className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleAction(device, "wipe")}
                            disabled={actionMutation.isPending}
                            title={t("devices.wipeAction")}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      ) : (
        isLoading ? (
          <div className="border border-border rounded-lg bg-card h-[500px] flex items-center justify-center text-muted-foreground text-sm">
            {t("common.loading")}
          </div>
        ) : (
          <DeviceMap devices={devices} />
        )
      )}

      <DeviceDetailDialog deviceId={detailDeviceId} onClose={() => setDetailDeviceId(null)} />

      <AlertDialog open={!!wipeTarget} onOpenChange={(open) => { if (!open) setWipeTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("devices.wipeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("devices.wipeDesc", { name: wipeTarget?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmWipe}
            >
              {t("devices.wipeConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Separator />

      <LocalServersPanel />
    </div>
  );
}
