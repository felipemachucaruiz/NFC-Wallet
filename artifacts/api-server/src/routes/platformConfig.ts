import { Router, type IRouter, type Request, type Response } from "express";
import { db, platformConfigTable, ALL_WOMPI_PAYMENT_METHODS } from "@workspace/db";
import { requireRole } from "../middlewares/requireRole";
import { z } from "zod";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

async function getOrCreateConfig() {
  const [config] = await db.select().from(platformConfigTable).limit(1);
  if (config) return config;
  const [created] = await db.insert(platformConfigTable).values({}).returning();
  return created;
}

router.get(
  "/platform-config/payment-methods",
  requireRole("admin"),
  async (_req: Request, res: Response) => {
    const config = await getOrCreateConfig();
    res.json({ enabledPaymentMethods: config.enabledPaymentMethods });
  },
);

const updateSchema = z.object({
  enabledPaymentMethods: z.array(z.enum(ALL_WOMPI_PAYMENT_METHODS)).min(1, "At least one payment method must be enabled"),
});

router.put(
  "/platform-config/payment-methods",
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid request" });
      return;
    }
    const config = await getOrCreateConfig();
    const [updated] = await db
      .update(platformConfigTable)
      .set({ enabledPaymentMethods: parsed.data.enabledPaymentMethods })
      .where(eq(platformConfigTable.id, config.id))
      .returning();
    res.json({ enabledPaymentMethods: updated.enabledPaymentMethods });
  },
);

export default router;
