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

const SENSITIVE_KEYS = /^(password|token|authorization|cookie|secret|card.?number|cvv)$/i;

Sentry.init({
  dsn: process.env.SENTRY_DSN,
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
app.use(compression());

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

app.use("/api", router);

app.get("/debug-sentry", (_req, _res) => {
  throw new Error("My first Sentry error!");
});

Sentry.setupExpressErrorHandler(app);

// Global error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "Unhandled route error");
  res.status(500).json({ error: "Internal server error" });
});

export default app;
