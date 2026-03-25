import { Router, type IRouter, type Request, type Response } from "express";
import { db, productsTable, merchantsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireRole";
import { assertProductAccess, isMerchantScoped } from "../lib/ownershipGuards";
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

    const [product] = await db
      .update(productsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(productsTable.id, productId))
      .returning();
    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    res.json(product);
  },
);

export default router;
