import type { Request, Response, NextFunction } from "express";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS = 30;

function gcBuckets(now: number) {
  if (buckets.size < 1000) return;
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
}

export function aiRateLimit(req: Request, res: Response, next: NextFunction) {
  const user = req.user;
  if (!user || !user.id) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const key = user.id;
  const now = Date.now();
  gcBuckets(now);
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, bucket);
  }
  if (bucket.count >= MAX_REQUESTS) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
    res.setHeader("Retry-After", String(retryAfter));
    res.status(429).json({
      error: `Has alcanzado el límite de ${MAX_REQUESTS} preguntas por hora. Intenta de nuevo en ${Math.ceil(retryAfter / 60)} minutos.`,
    });
    return;
  }
  bucket.count += 1;
  next();
}
