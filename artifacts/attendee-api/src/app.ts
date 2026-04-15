import * as Sentry from "@sentry/node";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import compression from "compression";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import staticRouter from "./routes/static";
import notificationsRouter from "./routes/notifications";
import whatsappWebhookRouter from "./routes/whatsappWebhook";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middlewares/authMiddleware";
import { generalLimiter, authLimiter, braceletLookupLimiter } from "./middlewares/rateLimiter";

const SENSITIVE_KEYS = /^(password|token|authorization|cookie|secret|card.?number|cvv)$/i;

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? "https://d3bff6b9eb2c975f13e05eae9ec4e157@o4511219507265536.ingest.us.sentry.io/4511219551240192",
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

// Disable ETags — prevents Replit proxy from caching GET responses and returning stale 304s
app.set("etag", false);
app.use(compression());

// Only trust proxy headers when explicitly enabled in production (TRUSTED_PROXY=true).
// Rate limiting uses raw socket address by default to prevent X-Forwarded-For spoofing.
if (process.env.TRUSTED_PROXY === "true") {
  app.set("trust proxy", 1);
}

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
const rawCorsOrigin = process.env.CORS_ORIGIN ?? "";
const allowedOrigins = rawCorsOrigin
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  if (
    req.path.includes("/public/") ||
    req.path.includes("/auth/") ||
    req.path.includes("/tickets/") ||
    req.path.includes("/guest-lists/") ||
    req.path.includes("/self-service/") ||
    req.path.includes("/whatsapp/")
  ) {
    cors({ origin: true, credentials: true })(req, res, next);
  } else {
    cors({
      credentials: true,
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error("Not allowed by CORS"));
        }
      },
    })(req, res, next);
  }
});
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mount WhatsApp webhook BEFORE rate limiters so Gupshup is never rate-blocked
app.use("/api", whatsappWebhookRouter);
app.use("/attendee-api/api", whatsappWebhookRouter);

app.use(generalLimiter);

const RATE_LIMITED_PATHS = [
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/create-account",
  "/api/auth/google",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/resend-verification",
  "/api/mobile-auth/token-exchange",
  "/api/mobile-auth/logout",
  "/api/attendee/me/refund-request",
  "/api/auth/whatsapp-otp/send",
  "/api/auth/whatsapp-otp/verify",
];

// Also apply rate limits via proxy prefix (Replit path-based routing doesn't strip prefix)
app.use(
  [...RATE_LIMITED_PATHS, ...RATE_LIMITED_PATHS.map((p) => `/attendee-api${p}`)],
  authLimiter,
);

app.use("/api", staticRouter);
app.use("/attendee-api/api", staticRouter);

app.use(authMiddleware);

// Prevent proxy / browser caching of all API responses
app.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  next();
});

// Tighter rate limit on the public bracelet-lookup endpoint to prevent UID enumeration
const BRACELET_LOOKUP_PATHS = [
  "/api/public/bracelet-lookup",
  "/attendee-api/api/public/bracelet-lookup",
];
app.use(BRACELET_LOOKUP_PATHS, braceletLookupLimiter);

// Mount at /api (direct localhost access) and /attendee-api/api (Replit proxy)
app.use("/api", router);
app.use("/attendee-api/api", router);
app.use("/api", notificationsRouter);
app.use("/attendee-api/api", notificationsRouter);

Sentry.setupExpressErrorHandler(app);

// Global error handler — catches any unhandled async route errors and returns
// a clean JSON 500 instead of hanging the request or crashing the process.
// Must be registered AFTER all routes (4-arg signature required by Express).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "Unhandled route error");
  res.status(500).json({ error: "Internal server error" });
});

export default app;
