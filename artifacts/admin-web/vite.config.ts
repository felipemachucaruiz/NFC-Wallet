import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import https from "https";
import { URL } from "url";

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

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
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
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
