import * as Sentry from "@sentry/node";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import compression from "compression";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middlewares/authMiddleware";
import { ipAllowlistMiddleware } from "./middlewares/ipAllowlist";
import { authLimiter } from "./middlewares/rateLimiter";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import yaml from "js-yaml";
import swaggerUi from "swagger-ui-express";

const SENSITIVE_KEYS = /^(password|token|authorization|cookie|secret|card.?number|cvv)$/i;

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? "https://268ea43667b8ae4ce31e982fe22c870b@o4511219507265536.ingest.us.sentry.io/4511219527909376",
  environment: process.env.NODE_ENV ?? "development",
  tracesSampleRate: 0.1,
  profilesSampleRate: 0.1,
  attachStacktrace: true,
  enabled: process.env.NODE_ENV === "production" && !!process.env.SENTRY_DSN,
  beforeSend(event, hint) {
    if (event.request?.data && typeof event.request.data === "object") {
      const data = event.request.data as Record<string, unknown>;
      for (const key of Object.keys(data)) {
        if (SENSITIVE_KEYS.test(key)) data[key] = "[Filtered]";
      }
    }
    if (event.request?.headers) {
      for (const key of Object.keys(event.request.headers)) {
        if (SENSITIVE_KEYS.test(key)) event.request.headers[key] = "[Filtered]";
      }
    }
    if (hint?.data && typeof hint.data === "object") {
      const hintData = hint.data as Record<string, unknown>;
      for (const key of Object.keys(hintData)) {
        if (SENSITIVE_KEYS.test(key)) hintData[key] = "[Filtered]";
      }
    }
    return event;
  },
});

const app: Express = express();
app.disable("x-powered-by");
app.use(compression());

app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  // Swagger UI needs scripts, styles, and fetch — relax CSP only for /api/docs
  if (req.path.startsWith("/api/docs")) {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'",
    );
  } else {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; frame-ancestors 'none'; form-action 'none'",
    );
  }
  next();
});

// Only trust proxy headers when explicitly enabled (TRUSTED_PROXY=true).
// The IP allowlist middleware uses raw socket address by default to prevent
// X-Forwarded-For spoofing. Set TRUSTED_PROXY=true in production when behind
// Replit's mTLS proxy or another trusted reverse proxy.
if (process.env.TRUSTED_PROXY === "true") {
  app.set("trust proxy", 1);
}

const rawCorsOrigin = process.env.CORS_ORIGIN ?? "";
const allowedOrigins = rawCorsOrigin
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    credentials: true,
    origin: (origin, callback) => {
      // In development, allow all origins (Replit preview proxy, localhost, etc.)
      if (process.env.NODE_ENV !== "production") {
        callback(null, true);
        return;
      }
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
  }),
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(ipAllowlistMiddleware);

const AUTH_RATE_LIMITED_PATHS = [
  "/api/auth/login",
  "/api/auth/setup",
];
app.use(AUTH_RATE_LIMITED_PATHS, authLimiter);

app.use(authMiddleware);

if (process.env.DOCS_ENABLED === "true") {
  const docsUsername = process.env.DOCS_USERNAME;
  const docsPassword = process.env.DOCS_PASSWORD;

  const swaggerBasicAuth = (req: Request, res: Response, next: NextFunction) => {
    if (!docsUsername || !docsPassword) {
      res.status(503).send("Swagger UI is disabled: DOCS_USERNAME and DOCS_PASSWORD env vars must be set.");
      return;
    }
    const authHeader = req.headers.authorization ?? "";
    if (!authHeader.startsWith("Basic ")) {
      res.setHeader("WWW-Authenticate", 'Basic realm="Swagger UI"');
      res.status(401).send("Authentication required");
      return;
    }
    const encoded = authHeader.slice("Basic ".length);
    const decoded = Buffer.from(encoded, "base64").toString("utf-8");
    const colonIdx = decoded.indexOf(":");
    if (colonIdx < 0) {
      res.setHeader("WWW-Authenticate", 'Basic realm="Swagger UI"');
      res.status(401).send("Invalid credentials");
      return;
    }
    const user = decoded.slice(0, colonIdx);
    const pass = decoded.slice(colonIdx + 1);
    const userMatch = user.length === docsUsername.length &&
      crypto.timingSafeEqual(Buffer.from(user), Buffer.from(docsUsername));
    const passMatch = pass.length === docsPassword.length &&
      crypto.timingSafeEqual(Buffer.from(pass), Buffer.from(docsPassword));
    if (!userMatch || !passMatch) {
      res.setHeader("WWW-Authenticate", 'Basic realm="Swagger UI"');
      res.status(401).send("Invalid credentials");
      return;
    }
    next();
  };

  try {
    const openapiPath = path.resolve(__dirname, "openapi.yaml");
    const openapiDocument = yaml.load(fs.readFileSync(openapiPath, "utf-8")) as object;
    // Serve raw spec so Swagger UI can show the download link
    app.get("/api/docs/openapi.json", swaggerBasicAuth, (_req, res) => {
      res.json(openapiDocument);
    });
    app.use(
      "/api/docs",
      swaggerBasicAuth,
      swaggerUi.serve,
      swaggerUi.setup(undefined, { swaggerOptions: { url: "/api/docs/openapi.json" } }),
    );
  } catch (err) {
    logger.warn({ err }, "Could not load openapi.yaml for Swagger UI");
  }
}

app.use("/api", router);

app.get("/debug-sentry", (_req, _res) => {
  throw new Error("My first Sentry error!");
});

Sentry.setupExpressErrorHandler(app);

// Global error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "Unhandled route error");
  res.status(500).json({ error: "An unexpected error occurred" });
});

export default app;
