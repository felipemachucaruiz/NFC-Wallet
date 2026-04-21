import { Router, type IRouter, type Request, type Response } from "express";
import { db, adsTable } from "@workspace/db";
import { eq, asc, and, lte, gte, or, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/public/ads", async (req: Request, res: Response) => {
  const now = new Date();

  const ads = await db
    .select()
    .from(adsTable)
    .where(
      and(
        eq(adsTable.isActive, true),
        or(isNull(adsTable.startsAt), lte(adsTable.startsAt, now)),
        or(isNull(adsTable.endsAt), gte(adsTable.endsAt, now)),
      )
    )
    .orderBy(asc(adsTable.displayOrder), asc(adsTable.createdAt));

  res.json({ ads });
});

export default router;
