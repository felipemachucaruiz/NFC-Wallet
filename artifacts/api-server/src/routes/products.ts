import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { Storage } from "@google-cloud/storage";
import { db, productsTable, merchantsTable } from "@workspace/db";
import { eq, inArray, and } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireRole";
import { assertProductAccess, isMerchantScoped } from "../lib/ownershipGuards";
import { z } from "zod";

const router: IRouter = Router();

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
} as ConstructorParameters<typeof Storage>[0]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

const createProductSchema = z.object({
  merchantId: z.string().min(1),
  name: z.string().min(1),
  category: z.string().optional(),
  barcode: z.string().min(1).optional(),
  priceCop: z.number().int().min(0),
  costCop: z.number().int().min(0).default(0),
  ivaRate: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  ivaExento: z.boolean().optional(),
});

const updateProductSchema = z.object({
  name: z.string().min(1).optional(),
  category: z.string().optional(),
  barcode: z.string().min(1).nullable().optional(),
  priceCop: z.number().int().min(0).optional(),
  costCop: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
  ivaRate: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  ivaExento: z.boolean().optional(),
  imageUrl: z.union([z.string().url(), z.string().startsWith("/api/")]).nullable().optional(),
});

router.get("/products", requireAuth, async (req: Request, res: Response) => {
  const user = req.user!;

  if (isMerchantScoped(user)) {
    if (!user.merchantId) {
      res.json({ products: [] });
      return;
    }
    const products = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.merchantId, user.merchantId));
    res.json({ products });
    return;
  }

  // event_admin: scope to merchants of their event
  if (user.role === "event_admin") {
    if (!user.eventId) {
      res.json({ products: [] });
      return;
    }
    const eventMerchants = await db
      .select({ id: merchantsTable.id })
      .from(merchantsTable)
      .where(eq(merchantsTable.eventId, user.eventId));
    const merchantIds = eventMerchants.map((m) => m.id);
    if (merchantIds.length === 0) {
      res.json({ products: [] });
      return;
    }
    const { merchantId: queryMerchantId } = req.query as { merchantId?: string };
    // If a specific merchantId is requested, validate it belongs to the event
    if (queryMerchantId && !merchantIds.includes(queryMerchantId)) {
      res.status(403).json({ error: "Merchant does not belong to your event" });
      return;
    }
    const products = await db
      .select()
      .from(productsTable)
      .where(
        queryMerchantId
          ? eq(productsTable.merchantId, queryMerchantId)
          : inArray(productsTable.merchantId, merchantIds),
      );
    res.json({ products });
    return;
  }

  const { merchantId } = req.query as { merchantId?: string };
  const products = await db
    .select()
    .from(productsTable)
    .where(merchantId ? eq(productsTable.merchantId, merchantId) : undefined);
  res.json({ products });
});

router.post(
  "/products",
  requireRole("admin", "merchant_admin", "event_admin"),
  async (req: Request, res: Response) => {
    const parsed = createProductSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const user = req.user!;
    if (user.role === "merchant_admin") {
      if (!user.merchantId || parsed.data.merchantId !== user.merchantId) {
        res.status(403).json({ error: "Access denied: can only create products for your own merchant" });
        return;
      }
    }

    // event_admin: verify merchant belongs to their event
    if (user.role === "event_admin") {
      if (!user.eventId) {
        res.status(403).json({ error: "No event associated with your account" });
        return;
      }
      const [merchant] = await db
        .select({ id: merchantsTable.id, eventId: merchantsTable.eventId })
        .from(merchantsTable)
        .where(eq(merchantsTable.id, parsed.data.merchantId));
      if (!merchant || merchant.eventId !== user.eventId) {
        res.status(403).json({ error: "Merchant does not belong to your event" });
        return;
      }
    }

    const [product] = await db
      .insert(productsTable)
      .values(parsed.data)
      .returning();
    res.status(201).json(product);
  },
);

router.get("/products/by-barcode/:barcode", requireAuth, async (req: Request, res: Response) => {
  const user = req.user!;
  const barcode = req.params.barcode as string;

  if (isMerchantScoped(user)) {
    if (!user.merchantId) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    const [product] = await db
      .select()
      .from(productsTable)
      .where(and(eq(productsTable.merchantId, user.merchantId), eq(productsTable.barcode, barcode)));
    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    res.json(product);
    return;
  }

  // event_admin: scope to merchants of their event
  if (user.role === "event_admin") {
    if (!user.eventId) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    const eventMerchants = await db
      .select({ id: merchantsTable.id })
      .from(merchantsTable)
      .where(eq(merchantsTable.eventId, user.eventId));
    const merchantIds = eventMerchants.map((m) => m.id);
    if (merchantIds.length === 0) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    const [product] = await db
      .select()
      .from(productsTable)
      .where(and(inArray(productsTable.merchantId, merchantIds), eq(productsTable.barcode, barcode)));
    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    res.json(product);
    return;
  }

  // admin: global lookup
  const [product] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.barcode, barcode));
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  res.json(product);
});

router.get("/products/:productId", requireAuth, async (req: Request, res: Response) => {
  const user = req.user!;
  const productId = req.params.productId as string;

  if (isMerchantScoped(user)) {
    const result = await assertProductAccess(productId, user);
    if ("error" in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json(result.product);
    return;
  }

  const [product] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, productId));
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  // event_admin: verify product's merchant belongs to their event
  if (user.role === "event_admin") {
    if (!user.eventId) {
      res.status(403).json({ error: "No event associated with your account" });
      return;
    }
    const [merchant] = await db
      .select({ id: merchantsTable.id, eventId: merchantsTable.eventId })
      .from(merchantsTable)
      .where(eq(merchantsTable.id, product.merchantId));
    if (!merchant || merchant.eventId !== user.eventId) {
      res.status(403).json({ error: "Product does not belong to your event" });
      return;
    }
  }

  res.json(product);
});

router.patch(
  "/products/:productId",
  requireRole("admin", "merchant_admin", "event_admin"),
  async (req: Request, res: Response) => {
    const parsed = updateProductSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const productId = req.params.productId as string;
    const user = req.user!;

    if (user.role === "merchant_admin") {
      const result = await assertProductAccess(productId, user);
      if ("error" in result) {
        res.status(result.status).json({ error: result.error });
        return;
      }
    }

    // event_admin: verify product's merchant belongs to their event
    if (user.role === "event_admin") {
      if (!user.eventId) {
        res.status(403).json({ error: "No event associated with your account" });
        return;
      }
      const [product] = await db
        .select()
        .from(productsTable)
        .where(eq(productsTable.id, productId));
      if (!product) {
        res.status(404).json({ error: "Product not found" });
        return;
      }
      const [merchant] = await db
        .select({ id: merchantsTable.id, eventId: merchantsTable.eventId })
        .from(merchantsTable)
        .where(eq(merchantsTable.id, product.merchantId));
      if (!merchant || merchant.eventId !== user.eventId) {
        res.status(403).json({ error: "Product does not belong to your event" });
        return;
      }
    }

    const { imageUrl, ...restData } = parsed.data;
    const setFields = { ...restData, updatedAt: new Date(), ...(imageUrl !== undefined ? { imageUrl } : {}) };
    const [product] = await db
      .update(productsTable)
      .set(setFields)
      .where(eq(productsTable.id, productId))
      .returning();
    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    res.json(product);
  },
);

router.post(
  "/products/:productId/image",
  requireRole("admin", "merchant_admin", "event_admin"),
  upload.single("image"),
  async (req: Request, res: Response) => {
    const productId = req.params.productId as string;
    const user = req.user!;

    if (!req.file) {
      res.status(400).json({ error: "No image file provided" });
      return;
    }

    if (!req.file.mimetype.startsWith("image/")) {
      res.status(400).json({ error: "Only image files are allowed" });
      return;
    }

    // Access control and pre-upload product existence validation
    if (user.role === "merchant_admin") {
      const result = await assertProductAccess(productId, user);
      if ("error" in result) {
        res.status(result.status).json({ error: result.error });
        return;
      }
    } else if (user.role === "event_admin") {
      if (!user.eventId) {
        res.status(403).json({ error: "No event associated with your account" });
        return;
      }
      const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
      if (!product) { res.status(404).json({ error: "Product not found" }); return; }
      const [merchant] = await db.select({ id: merchantsTable.id, eventId: merchantsTable.eventId }).from(merchantsTable).where(eq(merchantsTable.id, product.merchantId));
      if (!merchant || merchant.eventId !== user.eventId) {
        res.status(403).json({ error: "Product does not belong to your event" });
        return;
      }
    } else {
      // admin role: validate product exists before uploading to storage
      const [product] = await db.select({ id: productsTable.id }).from(productsTable).where(eq(productsTable.id, productId));
      if (!product) { res.status(404).json({ error: "Product not found" }); return; }
    }

    const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
    if (!bucketId) {
      res.status(500).json({ error: "Object storage not configured" });
      return;
    }

    try {
      const objectName = `product-images/${randomUUID()}`;
      const bucket = objectStorageClient.bucket(bucketId);
      const file = bucket.file(objectName);

      await file.save(req.file.buffer, {
        metadata: { contentType: req.file.mimetype },
        resumable: false,
      });

      const imageUrl = `/api/storage/objects/${objectName}`;

      const [updated] = await db
        .update(productsTable)
        .set({ imageUrl, updatedAt: new Date() })
        .where(eq(productsTable.id, productId))
        .returning();

      if (!updated) {
        res.status(404).json({ error: "Product not found" });
        return;
      }

      res.json({ imageUrl });
    } catch (err) {
      res.status(500).json({ error: "Failed to upload image" });
    }
  },
);

router.delete(
  "/products/:productId",
  requireRole("admin", "merchant_admin", "event_admin"),
  async (req: Request, res: Response) => {
    const productId = req.params.productId as string;
    const user = req.user!;

    if (user.role === "merchant_admin") {
      const result = await assertProductAccess(productId, user);
      if ("error" in result) {
        res.status(result.status).json({ error: result.error });
        return;
      }
    }

    if (user.role === "event_admin") {
      if (!user.eventId) {
        res.status(403).json({ error: "No event associated with your account" });
        return;
      }
      const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
      if (!product) { res.status(404).json({ error: "Product not found" }); return; }
      const [merchant] = await db.select({ id: merchantsTable.id, eventId: merchantsTable.eventId }).from(merchantsTable).where(eq(merchantsTable.id, product.merchantId));
      if (!merchant || merchant.eventId !== user.eventId) {
        res.status(403).json({ error: "Product does not belong to your event" });
        return;
      }
    }

    const [deleted] = await db.delete(productsTable).where(eq(productsTable.id, productId)).returning();
    if (!deleted) { res.status(404).json({ error: "Product not found" }); return; }
    res.status(204).send();
  },
);

export default router;
