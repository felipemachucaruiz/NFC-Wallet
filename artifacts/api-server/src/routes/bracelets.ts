import { Router, type IRouter, type Request, type Response } from "express";
import { db, braceletsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireRole";
import { z } from "zod";

const router: IRouter = Router();

const registerBraceletSchema = z.object({
  nfcUid: z.string().min(1),
  eventId: z.string().optional(),
  attendeeName: z.string().optional(),
});

router.post(
  "/bracelets",
  requireRole("bank", "admin"),
  async (req: Request, res: Response) => {
    const parsed = registerBraceletSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { nfcUid, eventId, attendeeName } = parsed.data;

    const existing = await db
      .select()
      .from(braceletsTable)
      .where(eq(braceletsTable.nfcUid, nfcUid));
    if (existing.length > 0) {
      res.status(409).json({ error: "Bracelet already registered" });
      return;
    }

    const [bracelet] = await db
      .insert(braceletsTable)
      .values({ nfcUid, eventId, attendeeName })
      .returning();
    res.status(201).json(bracelet);
  },
);

router.get(
  "/bracelets/:nfcUid",
  requireAuth,
  async (req: Request, res: Response) => {
    const [bracelet] = await db
      .select()
      .from(braceletsTable)
      .where(eq(braceletsTable.nfcUid, req.params.nfcUid as string));
    if (!bracelet) {
      res.status(404).json({ error: "Bracelet not found" });
      return;
    }
    res.json(bracelet);
  },
);

export default router;
