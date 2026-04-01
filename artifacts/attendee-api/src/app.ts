import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middlewares/authMiddleware";
import { generalLimiter, authLimiter } from "./middlewares/rateLimiter";

const app: Express = express();

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
app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(generalLimiter);

app.use(
  [
    "/api/auth/login",
    "/api/auth/logout",
    "/api/auth/create-account",
    "/api/mobile-auth/token-exchange",
    "/api/mobile-auth/logout",
    "/api/attendee/me/refund-request",
  ],
  authLimiter,
);

app.use(authMiddleware);

app.use("/api", router);

export default app;
