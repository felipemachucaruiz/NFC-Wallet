import { Router, type IRouter, type Request, type Response } from "express";
import { db, cityCoverPhotosTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/public/cities", async (_req: Request, res: Response) => {
  const cities = await db
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

  res.json({ cities });
});

export default router;
