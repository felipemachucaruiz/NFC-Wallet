import { Router, type IRouter, type Request, type Response } from "express";
import { db, productsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireRole";
import { z } from "zod";

const router: IRouter = Router();

const createProductSchema = z.object({
  merchantId: z.string().min(1),
  name: z.string().min(1),
  category: z.string().optional(),
  priceCop: z.number().int().min(0),
  costCop: z.number().int().min(0).default(0),
});

const updateProductSchema = z.object({
  name: z.string().min(1).optional(),
  category: z.string().optional(),
  priceCop: z.number().int().min(0).optional(),
  costCop: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
});

router.get("/products", requireAuth, async (req: Request, res: Response) => {
  const { merchantId } = req.query as { merchantId?: string };
  const products = await db
    .select()
    .from(productsTable)
    .where(merchantId ? eq(productsTable.merchantId, merchantId) : undefined);
  res.json({ products });
});

router.post(
  "/products",
  requireRole("admin", "merchant_admin"),
  async (req: Request, res: Response) => {
    const parsed = createProductSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [product] = await db
      .insert(productsTable)
      .values(parsed.data)
      .returning();
    res.status(201).json(product);
  },
);

router.get("/products/:productId", requireAuth, async (req: Request, res: Response) => {
  const [product] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, req.params.productId as string));
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  res.json(product);
});

router.patch(
  "/products/:productId",
  requireRole("admin", "merchant_admin"),
  async (req: Request, res: Response) => {
    const parsed = updateProductSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [product] = await db
      .update(productsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(productsTable.id, req.params.productId as string))
      .returning();
    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    res.json(product);
  },
);

export default router;
