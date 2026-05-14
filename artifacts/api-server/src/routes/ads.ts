import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { db, adsTable } from "@workspace/db";
import { eq, asc, and, lte, gte, or, isNull } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireRole";
import { uploadObject, isBucketConfigured } from "../lib/objectStorage";
import { z } from "zod";

const router: IRouter = Router();

const adUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const AdSchema = z.object({
  title: z.string().min(1).max(255),
  linkUrl: z.string().url().optional().or(z.literal("")),
  isActive: z.coerce.boolean().optional(),
  displayOrder: z.coerce.number().int().optional(),
  startsAt: z.string().datetime({ offset: true }).optional().or(z.literal("")),
  endsAt: z.string().datetime({ offset: true }).optional().or(z.literal("")),
});

router.get("/ads", requireAuth, requireRole("admin", "super_admin"), async (req: Request, res: Response) => {
  const ads = await db.select().from(adsTable).orderBy(asc(adsTable.displayOrder), asc(adsTable.createdAt));
  res.json({ ads });
});

router.post("/ads", requireAuth, requireRole("admin", "super_admin"), adUpload.single("image"), async (req: Request, res: Response) => {
  const parsed = AdSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: "Image file is required" });
    return;
  }

  let imageUrl: string;
  try {
    const objectName = `ads/${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    if (isBucketConfigured()) {
      imageUrl = await uploadObject(objectName, req.file.buffer, req.file.mimetype);
    } else {
      imageUrl = `/api/storage/objects/${objectName}`;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Failed to upload image: ${msg}` });
    return;
  }

  const { title, linkUrl, isActive, displayOrder, startsAt, endsAt } = parsed.data;
  const [ad] = await db.insert(adsTable).values({
    title,
    imageUrl,
    linkUrl: linkUrl || null,
    isActive: isActive ?? true,
    displayOrder: displayOrder ?? 0,
    startsAt: startsAt ? new Date(startsAt) : null,
    endsAt: endsAt ? new Date(endsAt) : null,
  }).returning();

  res.status(201).json({ ad });
});

router.put("/ads/:id", requireAuth, requireRole("admin", "super_admin"), adUpload.single("image"), async (req: Request, res: Response) => {
  const { id } = req.params;
  const parsed = AdSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }

  const [existing] = await db.select().from(adsTable).where(eq(adsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Ad not found" });
    return;
  }

  let imageUrl = existing.imageUrl;
  if (req.file) {
    try {
      const objectName = `ads/${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      if (isBucketConfigured()) {
        imageUrl = await uploadObject(objectName, req.file.buffer, req.file.mimetype);
      } else {
        imageUrl = `/api/storage/objects/${objectName}`;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: `Failed to upload image: ${msg}` });
      return;
    }
  }

  const { title, linkUrl, isActive, displayOrder, startsAt, endsAt } = parsed.data;
  const [ad] = await db.update(adsTable).set({
    title,
    imageUrl,
    linkUrl: linkUrl || null,
    isActive: isActive ?? existing.isActive,
    displayOrder: displayOrder ?? existing.displayOrder,
    startsAt: startsAt ? new Date(startsAt) : (startsAt === "" ? null : existing.startsAt),
    endsAt: endsAt ? new Date(endsAt) : (endsAt === "" ? null : existing.endsAt),
    updatedAt: new Date(),
  }).where(eq(adsTable.id, id)).returning();

  res.json({ ad });
});

router.patch("/ads/:id/toggle", requireAuth, requireRole("admin", "super_admin"), async (req: Request, res: Response) => {
  const { id } = req.params;
  const [existing] = await db.select().from(adsTable).where(eq(adsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Ad not found" });
    return;
  }
  const [ad] = await db.update(adsTable).set({ isActive: !existing.isActive, updatedAt: new Date() }).where(eq(adsTable.id, id)).returning();
  res.json({ ad });
});

router.delete("/ads/:id", requireAuth, requireRole("admin", "super_admin"), async (req: Request, res: Response) => {
  const { id } = req.params;
  const [existing] = await db.select().from(adsTable).where(eq(adsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Ad not found" });
    return;
  }
  await db.delete(adsTable).where(eq(adsTable.id, id));
  res.json({ ok: true });
});

export default router;
