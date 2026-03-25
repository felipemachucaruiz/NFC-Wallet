import { Router, type IRouter, type Request, type Response } from "express";
import { db, warehousesTable, warehouseInventoryTable, locationInventoryTable, productsTable, stockMovementsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireRole";
import { assertLocationAccess, isMerchantScoped } from "../lib/ownershipGuards";
import { z } from "zod";

const router: IRouter = Router();

// ── Warehouses ────────────────────────────────────────────────────────────────

router.get("/warehouses", requireAuth, async (req: Request, res: Response) => {
  const { eventId } = req.query as { eventId?: string };
  const warehouses = await db
    .select()
    .from(warehousesTable)
    .where(eventId ? eq(warehousesTable.eventId, eventId) : undefined);
  res.json({ warehouses });
});

router.post(
  "/warehouses",
  requireRole("admin", "warehouse_admin"),
  async (req: Request, res: Response) => {
    const schema = z.object({
      eventId: z.string().min(1),
      name: z.string().min(1),
      notes: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [warehouse] = await db
      .insert(warehousesTable)
      .values(parsed.data)
      .returning();
    res.status(201).json(warehouse);
  },
);

// ── Warehouse Inventory ───────────────────────────────────────────────────────

router.get(
  "/inventory/warehouses/:warehouseId",
  requireRole("admin", "warehouse_admin"),
  async (req: Request, res: Response) => {
    const items = await db
      .select({
        id: warehouseInventoryTable.id,
        warehouseId: warehouseInventoryTable.warehouseId,
        productId: warehouseInventoryTable.productId,
        quantityOnHand: warehouseInventoryTable.quantityOnHand,
        product: productsTable,
      })
      .from(warehouseInventoryTable)
      .leftJoin(productsTable, eq(warehouseInventoryTable.productId, productsTable.id))
      .where(eq(warehouseInventoryTable.warehouseId, req.params.warehouseId as string));
    res.json({ inventory: items });
  },
);

router.patch(
  "/inventory/warehouses/:warehouseId",
  requireRole("admin", "warehouse_admin"),
  async (req: Request, res: Response) => {
    const schema = z.object({
      productId: z.string().min(1),
      quantityDelta: z.number().int(),
      notes: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { productId, quantityDelta, notes } = parsed.data;
    const { warehouseId } = req.params as { warehouseId: string };

    const result = await db.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(warehouseInventoryTable)
        .where(
          and(
            eq(warehouseInventoryTable.warehouseId, warehouseId),
            eq(warehouseInventoryTable.productId, productId),
          ),
        );

      let item;
      if (existing.length === 0) {
        if (quantityDelta < 0) throw new Error("Cannot subtract from non-existent inventory");
        [item] = await tx
          .insert(warehouseInventoryTable)
          .values({ warehouseId, productId, quantityOnHand: quantityDelta })
          .returning();
      } else {
        const newQty = existing[0].quantityOnHand + quantityDelta;
        if (newQty < 0) throw new Error("Insufficient warehouse inventory");
        [item] = await tx
          .update(warehouseInventoryTable)
          .set({ quantityOnHand: newQty, updatedAt: new Date() })
          .where(eq(warehouseInventoryTable.id, existing[0].id))
          .returning();
      }

      await tx.insert(stockMovementsTable).values({
        movementType: "warehouse_load",
        productId,
        quantity: quantityDelta,
        toWarehouseId: warehouseId,
        performedByUserId: req.user?.id,
        notes,
      });

      return item;
    }).catch((err: Error) => {
      const knownErrors = ["Cannot subtract from non-existent inventory", "Insufficient warehouse inventory"];
      if (knownErrors.includes(err.message)) return { __error: err.message };
      throw err;
    });

    if (result && "__error" in result) {
      res.status(400).json({ error: result.__error });
      return;
    }

    res.json(result);
  },
);

// ── Location Inventory ────────────────────────────────────────────────────────

router.get(
  "/inventory/locations/:locationId",
  requireAuth,
  async (req: Request, res: Response) => {
    const locationId = req.params.locationId as string;
    const user = req.user!;

    if (isMerchantScoped(user)) {
      const access = await assertLocationAccess(locationId, user);
      if ("error" in access) {
        res.status(access.status).json({ error: access.error });
        return;
      }
    }

    const items = await db
      .select({
        id: locationInventoryTable.id,
        locationId: locationInventoryTable.locationId,
        productId: locationInventoryTable.productId,
        quantityOnHand: locationInventoryTable.quantityOnHand,
        restockTrigger: locationInventoryTable.restockTrigger,
        restockTargetQty: locationInventoryTable.restockTargetQty,
        product: productsTable,
      })
      .from(locationInventoryTable)
      .leftJoin(productsTable, eq(locationInventoryTable.productId, productsTable.id))
      .where(eq(locationInventoryTable.locationId, locationId));
    res.json({ inventory: items });
  },
);

router.patch(
  "/inventory/locations/:locationId",
  requireRole("admin", "merchant_admin", "warehouse_admin"),
  async (req: Request, res: Response) => {
    const schema = z.object({
      productId: z.string().min(1),
      restockTrigger: z.number().int().min(0).optional(),
      restockTargetQty: z.number().int().min(0).optional(),
      quantityAdjustment: z.number().int().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { productId, restockTrigger, restockTargetQty, quantityAdjustment } = parsed.data;
    const { locationId } = req.params as { locationId: string };
    const user = req.user!;

    if (user.role === "merchant_admin") {
      const access = await assertLocationAccess(locationId, user);
      if ("error" in access) {
        res.status(access.status).json({ error: access.error });
        return;
      }
    }

    const existing = await db
      .select()
      .from(locationInventoryTable)
      .where(
        and(
          eq(locationInventoryTable.locationId, locationId),
          eq(locationInventoryTable.productId, productId),
        ),
      );

    let item;
    if (existing.length === 0) {
      [item] = await db
        .insert(locationInventoryTable)
        .values({
          locationId,
          productId,
          quantityOnHand: quantityAdjustment ?? 0,
          restockTrigger: restockTrigger ?? 10,
          restockTargetQty: restockTargetQty ?? 50,
        })
        .returning();
    } else {
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (restockTrigger !== undefined) updates.restockTrigger = restockTrigger;
      if (restockTargetQty !== undefined) updates.restockTargetQty = restockTargetQty;
      if (quantityAdjustment !== undefined) {
        updates.quantityOnHand = Math.max(0, existing[0].quantityOnHand + quantityAdjustment);
      }
      [item] = await db
        .update(locationInventoryTable)
        .set(updates)
        .where(eq(locationInventoryTable.id, existing[0].id))
        .returning();
    }

    res.json(item);
  },
);

export default router;
