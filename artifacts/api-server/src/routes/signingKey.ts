import { Router, type IRouter, type Request, type Response } from "express";
import { requireRole } from "../middlewares/requireRole";

const router: IRouter = Router();

router.get(
  "/auth/signing-key",
  requireRole("bank", "merchant_staff", "merchant_admin", "admin"),
  (_req: Request, res: Response) => {
    const hmacSecret = process.env.HMAC_SECRET;
    if (!hmacSecret) {
      res.status(500).json({ error: "HMAC_SECRET not configured" });
      return;
    }
    res.json({ hmacSecret });
  },
);

export default router;
