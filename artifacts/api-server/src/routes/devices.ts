import { Router, type IRouter, type Request, type Response as ExpressResponse } from "express";
import { requireRole } from "../middlewares/requireRole";

const SCALEFUSION_BASE = "https://app.scalefusion.com/api/v1";

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

function normalizeStatus(raw: unknown): "online" | "offline" {
  if (raw === true || raw === 1 || raw === "1" || raw === "online" || raw === "Online") return "online";
  return "offline";
}

function toFloat(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  const n = parseFloat(String(val));
  return isNaN(n) ? null : n;
}

function mapDevice(device: Record<string, unknown>) {
  return {
    id: device.id ?? device.device_id,
    name: device.name ?? device.device_name ?? "Unknown",
    status: normalizeStatus(device.online_status ?? device.status),
    batteryLevel: device.battery_level ?? device.battery ?? null,
    lastSeenAt: device.last_seen_at ?? device.last_seen ?? null,
    model: device.model ?? null,
    osVersion: device.os_version ?? null,
    serialNumber: device.serial_number ?? null,
    lat: toFloat(device.latitude ?? device.location_latitude ?? device.lat ?? null),
    lng: toFloat(device.longitude ?? device.location_longitude ?? device.lng ?? null),
  };
}

const router: IRouter = Router();

router.get("/devices", requireRole("admin"), async (_req: Request, res: ExpressResponse) => {
  if (!process.env.SCALEFUSION_API_KEY) {
    res.status(503).json({ error: "Scalefusion API key not configured" });
    return;
  }

  try {
    const sfRes = await scalefusionFetch("/devices.json?per_page=500");
    if (!sfRes.ok) {
      const body = await sfRes.text();
      res.status(sfRes.status).json({ error: `Scalefusion error: ${body}` });
      return;
    }
    const data = await sfRes.json() as { devices?: unknown[]; [key: string]: unknown };
    const rawDevices: unknown[] = Array.isArray(data.devices)
      ? data.devices
      : Array.isArray(data)
        ? (data as unknown as unknown[])
        : [];

    const devices = rawDevices.map((d) => mapDevice(d as Record<string, unknown>));
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
    const sfRes = await scalefusionFetch(`/devices/${deviceId}.json`);
    if (!sfRes.ok) {
      const body = await sfRes.text();
      res.status(sfRes.status).json({ error: `Scalefusion error: ${body}` });
      return;
    }
    const data = await sfRes.json() as Record<string, unknown>;
    const device = (data.device ?? data) as Record<string, unknown>;
    res.json({ device: mapDevice(device) });
  } catch {
    res.status(502).json({ error: "Failed to reach Scalefusion API" });
  }
});

router.post("/devices/:deviceId/actions", requireRole("admin"), async (req: Request, res: ExpressResponse) => {
  if (!process.env.SCALEFUSION_API_KEY) {
    res.status(503).json({ error: "Scalefusion API key not configured" });
    return;
  }

  const { deviceId } = req.params;
  const { action } = req.body as { action?: string };

  if (!action || !["lock", "reboot", "wipe"].includes(action)) {
    res.status(400).json({ error: "Invalid action. Must be one of: lock, reboot, wipe" });
    return;
  }

  try {
    const sfRes = await scalefusionFetch(`/devices/${deviceId}/${action}.json`, {
      method: "POST",
      body: JSON.stringify({}),
    });

    if (!sfRes.ok) {
      const body = await sfRes.text();
      res.status(sfRes.status).json({ error: `Scalefusion error: ${body}` });
      return;
    }

    res.json({ success: true, action });
  } catch {
    res.status(502).json({ error: "Failed to reach Scalefusion API" });
  }
});

export default router;
