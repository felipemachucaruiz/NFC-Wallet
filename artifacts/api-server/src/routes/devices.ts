import { Router, type IRouter, type Request, type Response as ExpressResponse } from "express";
import { requireRole } from "../middlewares/requireRole";

const SCALEFUSION_BASE = "https://api.scalefusion.com";

function scalefusionHeaders(): Record<string, string> {
  const apiKey = process.env.SCALEFUSION_API_KEY ?? "";
  return {
    Authorization: `Token ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function scalefusionFetch(path: string, options: RequestInit = {}) {
  const url = `${SCALEFUSION_BASE}${path}`;
  return fetch(url, {
    ...options,
    headers: {
      ...scalefusionHeaders(),
      ...(options.headers as Record<string, string> | undefined),
    },
  });
}

function toFloat(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  const n = parseFloat(String(val));
  return isNaN(n) ? null : n;
}

function sanitizeUnknown(val: unknown): string | null {
  if (!val || val === "unknown" || val === "N/A" || val === "Not Available") return null;
  return String(val);
}

function mapDevice(raw: Record<string, unknown>) {
  const device = (raw.device ?? raw) as Record<string, unknown>;
  const location = device.location as Record<string, unknown> | null | undefined;
  const mgmt = device.management_details as Record<string, unknown> | null | undefined;
  const storage = device.storage_info as Record<string, unknown> | null | undefined;
  const group = (device.group ?? device.device_group) as Record<string, unknown> | null | undefined;
  const profile = (device.profile ?? device.device_profile) as Record<string, unknown> | null | undefined;
  const connStatus = String(device.connection_status ?? "").toLowerCase();
  const ramUsage = toFloat(device.ram_usage ?? null);
  const totalRam = toFloat(device.total_ram_size ?? null);
  return {
    id: device.id,
    name: device.name ?? "Unknown",
    status: connStatus === "online" ? "online" : "offline",
    batteryLevel: device.battery_status ?? null,
    batteryCharging: device.battery_charging ?? device.charging ?? false,
    batteryHealth: device.battery_health ?? null,
    batteryTempCelsius: device.battery_temp_in_celsius ?? null,
    lastSeenAt: device.last_connected_at ?? device.last_seen_on ?? null,
    model: device.model_name ?? device.model ?? null,
    make: sanitizeUnknown(device.make),
    osVersion: device.os_version ?? null,
    buildVersion: device.build_version ?? null,
    serialNumber: device.serial_no !== "unknown" ? (device.serial_no ?? null) : null,
    androidId: sanitizeUnknown(device.android_id),
    locked: device.locked ?? false,
    licenseStatus: device.status ?? null,
    inTrial: device.in_trial ?? false,
    enrollmentDate: device.enrollment_date ?? null,
    simNetwork: device.sim_network ?? null,
    sim1NetworkType: device.sim1_network_type ?? null,
    simSignalStrength: device.sim_signal_strength ?? null,
    ipAddress: sanitizeUnknown(device.ip_address),
    publicIp: sanitizeUnknown(device.public_ip),
    ramUsageMb: ramUsage,
    totalRamMb: totalRam,
    ramUsagePct: ramUsage !== null && totalRam !== null && totalRam > 0
      ? Math.round((ramUsage / totalRam) * 100)
      : null,
    storageAvailMb: toFloat(storage?.total_internal_storage_avbl ?? null),
    storageTotalMb: toFloat(storage?.total_internal_storage ?? null),
    managementMode: mgmt?.management_mode ?? null,
    enrollmentMode: mgmt?.enrollment_mode ?? null,
    enrollmentMethod: mgmt?.enrollment_method ?? null,
    managementState: mgmt?.management_state ?? null,
    groupName: group?.name ?? null,
    profileName: profile?.name ?? null,
    lat: toFloat(location?.lat ?? null),
    lng: toFloat(location?.lng ?? null),
    locationAddress: location?.address ?? null,
  };
}

const router: IRouter = Router();

router.get("/devices", requireRole("admin"), async (_req: Request, res: ExpressResponse) => {
  if (!process.env.SCALEFUSION_API_KEY) {
    res.status(503).json({ error: "Scalefusion API key not configured" });
    return;
  }

  try {
    const sfRes = await scalefusionFetch("/api/v2/devices.json?per_page=500");
    if (!sfRes.ok) {
      const body = await sfRes.text();
      res.status(502).json({ error: `Scalefusion error: ${body}` });
      return;
    }
    const data = await sfRes.json() as { devices?: unknown[]; data?: unknown[]; results?: unknown[]; device_profiles?: unknown[]; [key: string]: unknown };
    const rawDevices: unknown[] = Array.isArray(data.devices)
      ? data.devices
      : Array.isArray(data.data)
        ? data.data
        : Array.isArray(data.results)
          ? data.results
          : Array.isArray(data.device_profiles)
            ? data.device_profiles
            : Array.isArray(data)
              ? (data as unknown as unknown[])
              : [];

    const devices = rawDevices.map((d) => mapDevice(d as Record<string, unknown>));

    // The `location` field in the device list is a slow-sync cache that ignores the
    // MDM location-tracking policy interval. Fetch today's real location history in
    // parallel for every device and override with the most recent ping.
    const today = new Date().toISOString().slice(0, 10);
    await Promise.all(devices.map(async (device) => {
      try {
        const locRes = await scalefusionFetch(`/api/v1/devices/${device.id}/locations.json?date=${today}`);
        if (!locRes.ok) return;
        const pings = await locRes.json() as Array<{ latitude?: number; longitude?: number; address?: string; accuracy?: number; created_at_tz?: string }>;
        const latest = Array.isArray(pings) && pings.length > 0 ? pings[pings.length - 1] : null;
        if (latest) {
          device.lat = toFloat(latest.latitude ?? null);
          device.lng = toFloat(latest.longitude ?? null);
          device.locationAddress = latest.address ?? device.locationAddress;
        }
      } catch { /* keep stale location on error */ }
    }));

    res.json({ devices });
  } catch {
    res.status(502).json({ error: "Failed to reach Scalefusion API" });
  }
});

router.get("/devices/:deviceId", requireRole("admin"), async (req: Request, res: ExpressResponse) => {
  if (!process.env.SCALEFUSION_API_KEY) {
    res.status(503).json({ error: "Scalefusion API key not configured" });
    return;
  }

  const { deviceId } = req.params;

  try {
    const sfRes = await scalefusionFetch(`/api/v2/devices/${deviceId}.json`);
    if (!sfRes.ok) {
      const body = await sfRes.text();
      res.status(502).json({ error: `Scalefusion error: ${body}` });
      return;
    }
    const data = await sfRes.json() as Record<string, unknown>;
    const device = (data.device ?? data) as Record<string, unknown>;
    res.json({ device: mapDevice(device) });
  } catch {
    res.status(502).json({ error: "Failed to reach Scalefusion API" });
  }
});

const ACTION_TYPE_MAP: Record<string, string> = {
  lock: "screen_lock",
  reboot: "reboot",
  wipe: "factory_reset",
};

router.post("/devices/:deviceId/actions", requireRole("admin"), async (req: Request, res: ExpressResponse) => {
  if (!process.env.SCALEFUSION_API_KEY) {
    res.status(503).json({ error: "Scalefusion API key not configured" });
    return;
  }

  const { deviceId } = req.params;
  const { action } = req.body as { action?: string };

  if (!action || !ACTION_TYPE_MAP[action]) {
    res.status(400).json({ error: "Invalid action. Must be one of: lock, reboot, wipe" });
    return;
  }

  try {
    const sfRes = await scalefusionFetch(`/api/v2/devices/actions.json?device_ids=${encodeURIComponent(deviceId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ action_type: ACTION_TYPE_MAP[action] }).toString(),
    });

    if (!sfRes.ok) {
      const body = await sfRes.text();
      res.status(502).json({ error: `Scalefusion error: ${body}` });
      return;
    }

    const data = await sfRes.json() as { status?: string; not_supported?: number[]; not_supported_message?: string };
    if (data.not_supported && data.not_supported.length > 0) {
      res.status(422).json({ error: data.not_supported_message ?? "Device does not support this action" });
      return;
    }

    res.json({ success: true, action });
  } catch {
    res.status(502).json({ error: "Failed to reach Scalefusion API" });
  }
});

router.get("/devices/:deviceId/locations", requireRole("admin"), async (req: Request, res: ExpressResponse) => {
  if (!process.env.SCALEFUSION_API_KEY) {
    res.status(503).json({ error: "Scalefusion API key not configured" });
    return;
  }

  const { deviceId } = req.params;
  const date = (req.query.date as string | undefined) ?? new Date().toISOString().slice(0, 10);

  try {
    const sfRes = await scalefusionFetch(`/api/v1/devices/${deviceId}/locations.json?date=${encodeURIComponent(date)}`);
    if (!sfRes.ok) {
      const body = await sfRes.text();
      res.status(502).json({ error: `Scalefusion error: ${body}` });
      return;
    }
    const raw = await sfRes.json() as Array<{
      address?: string;
      latitude?: number;
      longitude?: number;
      accuracy?: number;
      date_time?: number;
      created_at_tz?: string;
      location_id?: number;
      device_id?: number;
    }>;
    const locations = (Array.isArray(raw) ? raw : []).map((p) => ({
      lat: p.latitude ?? null,
      lng: p.longitude ?? null,
      address: p.address ?? null,
      accuracy: p.accuracy ?? null,
      timestamp: p.created_at_tz ?? null,
    }));
    res.json({ locations });
  } catch {
    res.status(502).json({ error: "Failed to reach Scalefusion API" });
  }
});

export default router;
