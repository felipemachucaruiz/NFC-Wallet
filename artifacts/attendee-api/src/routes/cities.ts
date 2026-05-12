import { Router, type IRouter, type Request, type Response } from "express";
import { db, cityCoverPhotosTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";

const STAFF_API_BASE_URL = process.env.STAFF_API_BASE_URL ?? "https://prod.tapee.app";

function resolveUrl(url: string | null): string | null {
  if (!url) return null;
  return url.startsWith("http") ? url : `${STAFF_API_BASE_URL}${url}`;
}

const router: IRouter = Router();

router.get("/public/cities", async (_req: Request, res: Response) => {
  const rows = await db
    .select({
      id: cityCoverPhotosTable.id,
      name: cityCoverPhotosTable.name,
      country: cityCoverPhotosTable.country,
      coverImageUrl: cityCoverPhotosTable.coverImageUrl,
      displayOrder: cityCoverPhotosTable.displayOrder,
    })
    .from(cityCoverPhotosTable)
    .where(eq(cityCoverPhotosTable.isActive, true))
    .orderBy(asc(cityCoverPhotosTable.displayOrder), asc(cityCoverPhotosTable.name));

  const cities = rows.map((c) => ({ ...c, coverImageUrl: resolveUrl(c.coverImageUrl) }));
  res.json({ cities });
});

export default router;
