import { Router, type IRouter, type Request, type Response } from "express";
import { requireRole } from "../middlewares/requireRole";

const router: IRouter = Router();

router.get(
  "/auth/signing-key",
  requireRole("bank", "merchant_staff", "merchant_admin", "admin"),
  (req: Request, res: Response) => {
    const proto = req.headers["x-forwarded-proto"] ?? (req.secure ? "https" : "http");
    const isHttps = proto === "https" || (Array.isArray(proto) && proto[0] === "https");
    if (!isHttps && process.env.NODE_ENV === "production") {
      res.status(403).json({ error: "HTTPS required to access signing key" });
      return;
    }

    const hmacSecret = process.env.HMAC_SECRET;
    if (!hmacSecret) {
      res.status(500).json({ error: "HMAC_SECRET not configured" });
      return;
    }
    res.json({ hmacSecret });
  },
);

export default router;
