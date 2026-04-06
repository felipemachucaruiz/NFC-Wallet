import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import https from "https";
import { URL } from "url";

const isReplit = !!process.env.REPL_ID;

// PORT is only used by the dev/preview server — not during `vite build`.
// Default to 3000 so CI / Railway build steps don't fail without this var.
const rawPort = process.env.PORT;
const port = Number(rawPort || "3000");
if (rawPort && (Number.isNaN(port) || port <= 0)) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// In Railway production the app is served at the root path.
// Locally in Replit, BASE_PATH is injected as "/admin-web/".
const basePath = process.env.BASE_PATH || "/";

const API_TARGET = process.env.VITE_API_TARGET || "https://prod.tapee.app";
const proxyPrefix = `${basePath}_srv`;

function apiProxyPlugin(): Plugin {
  return {
    name: "api-proxy",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith(proxyPrefix)) return next();

        const targetUrl = new URL(API_TARGET);
        const upstreamPath = req.url.slice(proxyPrefix.length) || "/";

        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(req.headers)) {
          if (!value) continue;
          const lc = key.toLowerCase();
          if (lc === "origin" || lc === "referer" || lc === "host") continue;
          headers[key] = Array.isArray(value) ? value.join(", ") : value;
        }
        headers["host"] = targetUrl.host;

        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("end", () => {
          const body = chunks.length ? Buffer.concat(chunks) : undefined;
          if (body?.length) {
            headers["content-length"] = String(body.length);
          }

          const proxyReq = https.request(
            {
              hostname: targetUrl.hostname,
              port: targetUrl.port || 443,
              path: upstreamPath,
              method: req.method,
              headers,
            },
            (proxyRes) => {
              res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers as Record<string, string>);
              proxyRes.pipe(res, { end: true });
            },
          );

          proxyReq.on("error", (err) => {
            console.error("[api-proxy] upstream error:", err.message);
            if (!res.headersSent) {
              res.writeHead(502, { "content-type": "application/json" });
              res.end(JSON.stringify({ error: "Proxy error" }));
            }
          });

          if (body?.length) {
            proxyReq.write(body);
          }
          proxyReq.end();
        });
      });
    },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [
    apiProxyPlugin(),
    react(),
    tailwindcss(),
    ...(isReplit
      ? [
          (
            await import("@replit/vite-plugin-runtime-error-modal")
          ).default(),
        ]
      : []),
    ...(process.env.NODE_ENV !== "production" && isReplit
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
