/**
 * Production server for the Tapee Admin Portal.
 *
 * Responsibilities:
 *  1. Proxy  /_srv/*  →  prod.tapee.app  (strips Origin/Referer so the
 *     Railway-hosted admin web is not rejected by the API's CORS policy).
 *  2. Serve the Vite-built static files from dist/public.
 *  3. SPA fallback: all unmatched GET routes return index.html.
 *
 * Environment variables:
 *  PORT             - listening port (set automatically by Railway)
 *  VITE_API_TARGET  - API base URL (default: https://prod.tapee.app)
 */

import express from "express";
import https from "https";
import { URL } from "url";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT ?? 3000);
const API_TARGET = process.env.VITE_API_TARGET || "https://prod.tapee.app";
const PROXY_PREFIX = "/_srv";

const app = express();

app.disable("x-powered-by");

app.use((_req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' fonts.googleapis.com",
      "font-src 'self' fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "connect-src 'self' *.sentry.io sentry.io",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
      "upgrade-insecure-requests",
      "block-all-mixed-content",
    ].join("; "),
  );
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), accelerometer=(), gyroscope=()",
  );
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use(PROXY_PREFIX, (req, res) => {
  const target = new URL(API_TARGET);
  const upstreamPath = req.url || "/";

  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (!value) continue;
    const lc = key.toLowerCase();
    if (lc === "origin" || lc === "referer" || lc === "host") continue;
    headers[key] = Array.isArray(value) ? value.join(", ") : value;
  }
  headers["host"] = target.host;

  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    if (body?.length) {
      headers["content-length"] = String(body.length);
    }

    const proxyReq = https.request(
      {
        hostname: target.hostname,
        port: Number(target.port) || 443,
        path: upstreamPath,
        method: req.method,
        headers,
      },
      (proxyRes) => {
        const upstreamHeaders = Object.fromEntries(
          Object.entries(proxyRes.headers).filter(
            ([k]) => k.toLowerCase() !== "x-powered-by",
          ),
        );
        res.writeHead(proxyRes.statusCode ?? 502, upstreamHeaders);
        proxyRes.pipe(res, { end: true });
      },
    );

    proxyReq.on("error", (err) => {
      console.error("[proxy] upstream error:", err.message);
      if (!res.headersSent) {
        res.writeHead(502, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Proxy error" }));
      }
    });

    if (body?.length) proxyReq.write(body);
    proxyReq.end();
  });
});

const staticDir = path.join(__dirname, "../dist/public");
app.use(
  express.static(staticDir, {
    setHeaders(res, filePath) {
      if (path.basename(filePath) === "index.html") {
        res.setHeader("Cache-Control", "no-store, must-revalidate");
      } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  }),
);

// Express 5 uses path-to-regexp v8 which rejects bare "*".
// Use app.use() for the SPA catch-all instead.
app.use((_req, res) => {
  res.setHeader("Cache-Control", "no-store, must-revalidate");
  res.sendFile(path.join(staticDir, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Tapee Admin Portal listening on port ${PORT}`);
  console.log(`Proxying ${PROXY_PREFIX}/* → ${API_TARGET}`);
});
