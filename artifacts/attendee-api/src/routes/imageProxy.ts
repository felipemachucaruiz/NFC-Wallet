import { Router } from "express";
import sharp from "sharp";

const router = Router();

const ALLOWED_HOST = "prod.tapee.app";
const MAX_CACHE = 100;
const cache = new Map<string, { data: Buffer; contentType: string }>();

function cacheKey(url: string, w: number, q: number) {
  return `${url}:${w}:${q}`;
}

function evictIfNeeded() {
  if (cache.size >= MAX_CACHE) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
}

router.get("/public/image", async (req, res) => {
  const { url, w, q } = req.query;

  if (typeof url !== "string" || !url) {
    res.status(400).json({ error: "url required" });
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    res.status(400).json({ error: "invalid url" });
    return;
  }

  if (parsed.hostname !== ALLOWED_HOST) {
    res.status(403).json({ error: "url not allowed" });
    return;
  }

  const width = Math.min(Math.max(parseInt(String(w ?? "1200"), 10) || 1200, 50), 2400);
  const quality = Math.min(Math.max(parseInt(String(q ?? "88"), 10) || 88, 10), 100);

  const key = cacheKey(url, width, quality);
  const cached = cache.get(key);
  if (cached) {
    res.setHeader("Content-Type", cached.contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("X-Cache", "HIT");
    res.send(cached.data);
    return;
  }

  try {
    const upstream = await fetch(url);
    if (!upstream.ok) {
      res.redirect(302, url);
      return;
    }
    const inputBuffer = Buffer.from(await upstream.arrayBuffer());

    const output = await sharp(inputBuffer)
      .resize(width, undefined, { withoutEnlargement: true, kernel: sharp.kernel.lanczos3 })
      .webp({ quality, effort: 6, smartSubsample: true })
      .toBuffer();

    evictIfNeeded();
    cache.set(key, { data: output, contentType: "image/webp" });

    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("X-Cache", "MISS");
    res.send(output);
  } catch {
    res.redirect(302, url);
  }
});

export default router;
