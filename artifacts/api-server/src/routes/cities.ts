import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { db, cityCoverPhotosTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireRole";
import { uploadObject, isBucketConfigured } from "../lib/objectStorage";
import { z } from "zod";

const router: IRouter = Router();

const cityUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const CitySchema = z.object({
  name: z.string().min(1).max(255),
  country: z.string().min(1).max(255).optional(),
  displayOrder: z.coerce.number().int().optional(),
  isActive: z.coerce.boolean().optional(),
});

router.get("/cities", requireAuth, requireRole("admin"), async (_req: Request, res: Response) => {
  const cities = await db
    .select()
    .from(cityCoverPhotosTable)
    .orderBy(asc(cityCoverPhotosTable.displayOrder), asc(cityCoverPhotosTable.name));
  res.json({ cities });
});

router.post(
  "/cities",
  requireAuth,
  requireRole("admin"),
  cityUpload.single("image"),
  async (req: Request, res: Response) => {
    const parsed = CitySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    let coverImageUrl: string | null = null;
    if (req.file) {
      try {
        const objectName = `city-images/${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        if (isBucketConfigured()) {
          coverImageUrl = await uploadObject(objectName, req.file.buffer, req.file.mimetype);
        } else {
          coverImageUrl = `/api/storage/objects/${objectName}`;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: `Failed to upload image: ${msg}` });
        return;
      }
    }

    const { name, country, displayOrder, isActive } = parsed.data;
    const [city] = await db.insert(cityCoverPhotosTable).values({
      name,
      country: country ?? "Colombia",
      coverImageUrl,
      displayOrder: displayOrder ?? 0,
      isActive: isActive ?? true,
    }).returning();

    res.status(201).json({ city });
  },
);

router.put(
  "/cities/:id",
  requireAuth,
  requireRole("admin"),
  cityUpload.single("image"),
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const parsed = CitySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    const [existing] = await db.select().from(cityCoverPhotosTable).where(eq(cityCoverPhotosTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "City not found" });
      return;
    }

    let coverImageUrl: string | null = existing.coverImageUrl;
    if (req.file) {
      try {
        const objectName = `city-images/${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        if (isBucketConfigured()) {
          coverImageUrl = await uploadObject(objectName, req.file.buffer, req.file.mimetype);
        } else {
          coverImageUrl = `/api/storage/objects/${objectName}`;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: `Failed to upload image: ${msg}` });
        return;
      }
    }

    const { name, country, displayOrder, isActive } = parsed.data;
    const [city] = await db
      .update(cityCoverPhotosTable)
      .set({
        name,
        country: country ?? existing.country,
        coverImageUrl,
        displayOrder: displayOrder ?? existing.displayOrder,
        isActive: isActive ?? existing.isActive,
        updatedAt: new Date(),
      })
      .where(eq(cityCoverPhotosTable.id, id))
      .returning();

    res.json({ city });
  },
);

router.patch("/cities/:id/toggle", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const { id } = req.params;
  const [existing] = await db.select().from(cityCoverPhotosTable).where(eq(cityCoverPhotosTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "City not found" });
    return;
  }
  const [city] = await db
    .update(cityCoverPhotosTable)
    .set({ isActive: !existing.isActive, updatedAt: new Date() })
    .where(eq(cityCoverPhotosTable.id, id))
    .returning();
  res.json({ city });
});

router.delete("/cities/:id", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const { id } = req.params;
  const [existing] = await db.select().from(cityCoverPhotosTable).where(eq(cityCoverPhotosTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "City not found" });
    return;
  }
  await db.delete(cityCoverPhotosTable).where(eq(cityCoverPhotosTable.id, id));
  res.status(204).send();
});

export default router;
