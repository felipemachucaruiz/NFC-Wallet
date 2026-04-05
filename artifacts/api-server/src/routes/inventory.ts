import { Router, type IRouter, type Request, type Response } from "express";
import { db, warehousesTable, warehouseInventoryTable, locationInventoryTable, productsTable, stockMovementsTable, locationsTable, merchantsTable, inventoryAuditsTable, inventoryAuditItemsTable, damagedGoodsTable } from "@workspace/db";
import { eq, and, sql, gte, desc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireRole";
import { assertLocationAccess, isMerchantScoped } from "../lib/ownershipGuards";
import { z } from "zod";
import { notifyLowStock } from "../lib/pushNotifications";

const router: IRouter = Router();

// ── Warehouses ────────────────────────────────────────────────────────────────

router.get("/warehouses", requireAuth, async (req: Request, res: Response) => {
  const { eventId } = req.query as { eventId?: string };
  const user = req.user!;

  // event_admin: always scope to their event
  if (user.role === "event_admin") {
    if (!user.eventId) {
      res.json({ warehouses: [] });
      return;
    }
    const warehouses = await db
      .select()
      .from(warehousesTable)
      .where(eq(warehousesTable.eventId, user.eventId));
    res.json({ warehouses });
    return;
  }

  const warehouses = await db
    .select()
    .from(warehousesTable)
    .where(eventId ? eq(warehousesTable.eventId, eventId) : undefined);
  res.json({ warehouses });
});

router.post(
  "/warehouses",
  requireRole("admin", "warehouse_admin", "event_admin"),
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

    const user = req.user!;
    if (user.role === "event_admin") {
      if (!user.eventId || parsed.data.eventId !== user.eventId) {
        res.status(403).json({ error: "You can only create warehouses for your event" });
        return;
      }
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
  requireRole("admin", "warehouse_admin", "event_admin"),
  async (req: Request, res: Response) => {
    const user = req.user!;
    const { warehouseId } = req.params as { warehouseId: string };

    // event_admin: verify warehouse belongs to their event
    if (user.role === "event_admin") {
      if (!user.eventId) {
        res.json({ inventory: [] });
        return;
      }
      const [warehouse] = await db
        .select({ id: warehousesTable.id, eventId: warehousesTable.eventId })
        .from(warehousesTable)
        .where(eq(warehousesTable.id, warehouseId));
      if (!warehouse || warehouse.eventId !== user.eventId) {
        res.status(403).json({ error: "Warehouse does not belong to your event" });
        return;
      }
    }

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
      .where(eq(warehouseInventoryTable.warehouseId, warehouseId));
    res.json({ inventory: items });
  },
);

router.patch(
  "/inventory/warehouses/:warehouseId",
  requireRole("admin", "warehouse_admin", "event_admin"),
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
    const user = req.user!;

    // event_admin: verify warehouse belongs to their event
    if (user.role === "event_admin") {
      if (!user.eventId) {
        res.status(403).json({ error: "No event associated with your account" });
        return;
      }
      const [warehouse] = await db
        .select({ id: warehousesTable.id, eventId: warehousesTable.eventId })
        .from(warehousesTable)
        .where(eq(warehousesTable.id, warehouseId));
      if (!warehouse || warehouse.eventId !== user.eventId) {
        res.status(403).json({ error: "Warehouse does not belong to your event" });
        return;
      }
    }

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
        // Atomic increment/decrement — the DB-level CHECK constraint rejects negative results
        const updated = await tx
          .update(warehouseInventoryTable)
          .set({ quantityOnHand: sql`quantity_on_hand + ${quantityDelta}`, updatedAt: new Date() })
          .where(
            quantityDelta < 0
              ? and(
                  eq(warehouseInventoryTable.id, existing[0].id),
                  gte(warehouseInventoryTable.quantityOnHand, -quantityDelta),
                )
              : eq(warehouseInventoryTable.id, existing[0].id),
          )
          .returning();
        if (updated.length === 0) throw new Error("Insufficient warehouse inventory");
        [item] = updated;
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

    // event_admin: verify location belongs to their event
    if (user.role === "event_admin") {
      if (!user.eventId) {
        res.json({ inventory: [] });
        return;
      }
      const [location] = await db
        .select({ id: locationsTable.id, eventId: locationsTable.eventId })
        .from(locationsTable)
        .where(eq(locationsTable.id, locationId));
      if (!location || location.eventId !== user.eventId) {
        res.status(403).json({ error: "Location does not belong to your event" });
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
  requireRole("admin", "merchant_admin", "warehouse_admin", "event_admin"),
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

    // event_admin: verify location belongs to their event
    if (user.role === "event_admin") {
      if (!user.eventId) {
        res.status(403).json({ error: "No event associated with your account" });
        return;
      }
      const [location] = await db
        .select({ id: locationsTable.id, eventId: locationsTable.eventId })
        .from(locationsTable)
        .where(eq(locationsTable.id, locationId));
      if (!location || location.eventId !== user.eventId) {
        res.status(403).json({ error: "Location does not belong to your event" });
        return;
      }
    }

    let txResult: { item: typeof locationInventoryTable.$inferSelect; prevQty: number } | undefined;
    try {
      txResult = await db.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(locationInventoryTable)
        .where(
          and(
            eq(locationInventoryTable.locationId, locationId),
            eq(locationInventoryTable.productId, productId),
          ),
        );

      let item: typeof locationInventoryTable.$inferSelect;
      let prevQty = 0;
      if (existing.length === 0) {
        if (quantityAdjustment !== undefined && quantityAdjustment < 0) {
          throw new Error("Cannot subtract from non-existent inventory");
        }
        [item] = await tx
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
        prevQty = existing[0].quantityOnHand;
        const updates: Record<string, unknown> = { updatedAt: new Date() };
        if (restockTrigger !== undefined) updates.restockTrigger = restockTrigger;
        if (restockTargetQty !== undefined) updates.restockTargetQty = restockTargetQty;
        if (quantityAdjustment !== undefined) {
          // Use atomic SQL expression to avoid read-then-write race conditions.
          // The DB-level CHECK constraint (quantity_on_hand >= 0) will reject negative results.
          updates.quantityOnHand = sql`quantity_on_hand + ${quantityAdjustment}`;
        }
        [item] = await tx
          .update(locationInventoryTable)
          .set(updates)
          .where(eq(locationInventoryTable.id, existing[0].id))
          .returning();
      }

      if (quantityAdjustment !== undefined && quantityAdjustment !== 0) {
        await tx.insert(stockMovementsTable).values({
          movementType: "manual_adjustment",
          productId,
          quantity: quantityAdjustment,
          toLocationId: locationId,
          performedByUserId: user.id,
        });
      }

        return { item, prevQty };
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Cannot subtract from non-existent inventory") || msg.includes("location_inventory_qty_non_negative")) {
        res.status(400).json({ error: "Insufficient inventory: quantity would go negative" });
        return;
      }
      throw err;
    }

    // Fire low-stock push alert only when crossing from above to at/below the restock threshold
    if (txResult && quantityAdjustment !== undefined && quantityAdjustment < 0) {
      const { item, prevQty } = txResult;
      const currentQty = item.quantityOnHand;
      const trigger = item.restockTrigger;
      if (prevQty > trigger && currentQty <= trigger) {
        const [loc] = await db
          .select({ eventId: locationsTable.eventId })
          .from(locationsTable)
          .where(eq(locationsTable.id, locationId));
        if (loc?.eventId) {
          void notifyLowStock({
            eventId: loc.eventId,
            productId,
            locationId,
            currentQty,
            restockTrigger: trigger,
          });
        }
      }
    }

    res.json(txResult?.item);
  },
);

/**
 * POST /merchants/:merchantId/locations/:locationId/stock/initialize
 * Initialize or upsert stock quantities for a merchant location.
 * Each product gets an initial_load stock movement record.
 * Accessible by merchant_admin (own merchant), admin, and event_admin.
 */
router.post(
  "/merchants/:merchantId/locations/:locationId/stock/initialize",
  requireRole("admin", "event_admin", "merchant_admin"),
  async (req: Request, res: Response) => {
    const { merchantId, locationId } = req.params as { merchantId: string; locationId: string };
    const user = req.user!;

    const schema = z.object({
      items: z.array(z.object({
        productId: z.string().min(1),
        quantity: z.number().int().min(0),
      })).min(1),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    // Verify merchant exists
    const [merchant] = await db
      .select()
      .from(merchantsTable)
      .where(eq(merchantsTable.id, merchantId));

    if (!merchant) {
      res.status(404).json({ error: "Merchant not found" });
      return;
    }

    // merchant_admin: can only initialize their own merchant's locations
    if (user.role === "merchant_admin") {
      if (!user.merchantId || user.merchantId !== merchantId) {
        res.status(403).json({ error: "Access denied: location does not belong to your merchant" });
        return;
      }
    }

    // event_admin: can only initialize locations for their event
    if (user.role === "event_admin") {
      if (!user.eventId || merchant.eventId !== user.eventId) {
        res.status(403).json({ error: "Access denied: merchant does not belong to your event" });
        return;
      }
    }

    // Verify location exists and belongs to this merchant
    const [location] = await db
      .select()
      .from(locationsTable)
      .where(and(eq(locationsTable.id, locationId), eq(locationsTable.merchantId, merchantId)));

    if (!location) {
      res.status(404).json({ error: "Location not found or does not belong to this merchant" });
      return;
    }

    const results = await db.transaction(async (tx) => {
      const initialized = [];
      for (const item of parsed.data.items) {
        // Verify product belongs to this merchant
        const [product] = await tx
          .select({ id: productsTable.id, name: productsTable.name })
          .from(productsTable)
          .where(and(eq(productsTable.id, item.productId), eq(productsTable.merchantId, merchantId)));

        if (!product) {
          throw Object.assign(new Error(`Product ${item.productId} not found or does not belong to this merchant`), { httpStatus: 404 });
        }

        // Upsert location_inventory
        const existing = await tx
          .select()
          .from(locationInventoryTable)
          .where(and(
            eq(locationInventoryTable.locationId, locationId),
            eq(locationInventoryTable.productId, item.productId),
          ));

        let inventoryRow;
        if (existing.length === 0) {
          const [inserted] = await tx
            .insert(locationInventoryTable)
            .values({
              locationId,
              productId: item.productId,
              quantityOnHand: item.quantity,
            })
            .returning();
          inventoryRow = inserted;
        } else {
          const [updated] = await tx
            .update(locationInventoryTable)
            .set({ quantityOnHand: item.quantity, updatedAt: new Date() })
            .where(eq(locationInventoryTable.id, existing[0].id))
            .returning();
          inventoryRow = updated;
        }

        // Log initial_load stock movement
        await tx.insert(stockMovementsTable).values({
          movementType: "initial_load",
          productId: item.productId,
          quantity: item.quantity,
          toLocationId: locationId,
          performedByUserId: user.id,
          notes: `Stock initialization for ${product.name}`,
        });

        initialized.push({ productId: item.productId, quantity: item.quantity, inventoryId: inventoryRow.id });
      }
      return initialized;
    }).catch((err: Error & { httpStatus?: number }) => {
      throw err;
    });

    res.status(200).json({ initialized: results });
  },
);

// ── Inventory Audits ──────────────────────────────────────────────────────────

/**
 * POST /inventory/audits
 * Create an inventory audit for a warehouse or location.
 * Accepts physical counts per product, records delta, and adjusts stock.
 */
router.post(
  "/inventory/audits",
  requireRole("admin", "warehouse_admin", "event_admin"),
  async (req: Request, res: Response) => {
    const schema = z.object({
      warehouseId: z.string().min(1).optional(),
      locationId: z.string().min(1).optional(),
      notes: z.string().optional(),
      items: z.array(z.object({
        productId: z.string().min(1),
        physicalCount: z.number().int().min(0),
      })).min(1),
    }).refine((d) => d.warehouseId || d.locationId, {
      message: "Either warehouseId or locationId is required",
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { warehouseId, locationId, notes, items } = parsed.data;
    const user = req.user!;

    try {
      const result = await db.transaction(async (tx) => {
        const [audit] = await tx
          .insert(inventoryAuditsTable)
          .values({
            warehouseId: warehouseId ?? null,
            locationId: locationId ?? null,
            performedByUserId: user.id,
            notes: notes ?? null,
          })
          .returning();

        const auditItems = [];
        for (const item of items) {
          let systemCount = 0;

          if (warehouseId) {
            const [inv] = await tx
              .select({ quantityOnHand: warehouseInventoryTable.quantityOnHand })
              .from(warehouseInventoryTable)
              .where(
                and(
                  eq(warehouseInventoryTable.warehouseId, warehouseId),
                  eq(warehouseInventoryTable.productId, item.productId),
                ),
              );
            systemCount = inv?.quantityOnHand ?? 0;
          } else if (locationId) {
            const [inv] = await tx
              .select({ quantityOnHand: locationInventoryTable.quantityOnHand })
              .from(locationInventoryTable)
              .where(
                and(
                  eq(locationInventoryTable.locationId, locationId),
                  eq(locationInventoryTable.productId, item.productId),
                ),
              );
            systemCount = inv?.quantityOnHand ?? 0;
          }

          const delta = item.physicalCount - systemCount;

          const [auditItem] = await tx
            .insert(inventoryAuditItemsTable)
            .values({
              auditId: audit.id,
              productId: item.productId,
              systemCount,
              physicalCount: item.physicalCount,
              delta,
            })
            .returning();

          auditItems.push(auditItem);

          if (delta !== 0) {
            if (warehouseId) {
              const existing = await tx
                .select()
                .from(warehouseInventoryTable)
                .where(
                  and(
                    eq(warehouseInventoryTable.warehouseId, warehouseId),
                    eq(warehouseInventoryTable.productId, item.productId),
                  ),
                );

              if (existing.length === 0 && delta > 0) {
                await tx.insert(warehouseInventoryTable).values({
                  warehouseId,
                  productId: item.productId,
                  quantityOnHand: delta,
                });
              } else if (existing.length > 0) {
                await tx
                  .update(warehouseInventoryTable)
                  .set({
                    quantityOnHand: sql`quantity_on_hand + ${delta}`,
                    updatedAt: new Date(),
                  })
                  .where(eq(warehouseInventoryTable.id, existing[0].id));
              }
            } else if (locationId) {
              const existing = await tx
                .select()
                .from(locationInventoryTable)
                .where(
                  and(
                    eq(locationInventoryTable.locationId, locationId),
                    eq(locationInventoryTable.productId, item.productId),
                  ),
                );

              if (existing.length === 0 && delta > 0) {
                await tx.insert(locationInventoryTable).values({
                  locationId,
                  productId: item.productId,
                  quantityOnHand: delta,
                });
              } else if (existing.length > 0) {
                await tx
                  .update(locationInventoryTable)
                  .set({
                    quantityOnHand: sql`quantity_on_hand + ${delta}`,
                    updatedAt: new Date(),
                  })
                  .where(eq(locationInventoryTable.id, existing[0].id));
              }
            }

            await tx.insert(stockMovementsTable).values({
              movementType: "manual_adjustment",
              productId: item.productId,
              quantity: delta,
              toWarehouseId: warehouseId ?? null,
              toLocationId: locationId ?? null,
              performedByUserId: user.id,
              notes: `Inventory audit: physical=${item.physicalCount}, system=${systemCount}`,
            });
          }
        }

        return { audit, items: auditItems };
      });

      res.status(201).json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: msg });
    }
  },
);

/**
 * GET /inventory/audits
 * List inventory audit history (with items and product names).
 */
router.get(
  "/inventory/audits",
  requireRole("admin", "warehouse_admin", "event_admin"),
  async (req: Request, res: Response) => {
    const { warehouseId, locationId } = req.query as { warehouseId?: string; locationId?: string };

    const conditions = [];
    if (warehouseId) conditions.push(eq(inventoryAuditsTable.warehouseId, warehouseId));
    if (locationId) conditions.push(eq(inventoryAuditsTable.locationId, locationId));

    const audits = await db
      .select()
      .from(inventoryAuditsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(inventoryAuditsTable.createdAt))
      .limit(100);

    const auditIds = audits.map((a) => a.id);
    let auditItemsRows: Array<typeof inventoryAuditItemsTable.$inferSelect & { productName?: string | null }> = [];

    if (auditIds.length > 0) {
      const rawItems = await db
        .select({
          id: inventoryAuditItemsTable.id,
          auditId: inventoryAuditItemsTable.auditId,
          productId: inventoryAuditItemsTable.productId,
          systemCount: inventoryAuditItemsTable.systemCount,
          physicalCount: inventoryAuditItemsTable.physicalCount,
          delta: inventoryAuditItemsTable.delta,
          createdAt: inventoryAuditItemsTable.createdAt,
          productName: productsTable.name,
        })
        .from(inventoryAuditItemsTable)
        .leftJoin(productsTable, eq(inventoryAuditItemsTable.productId, productsTable.id))
        .where(eq(inventoryAuditItemsTable.auditId, auditIds[0]));

      if (auditIds.length > 1) {
        for (const auditId of auditIds.slice(1)) {
          const rows = await db
            .select({
              id: inventoryAuditItemsTable.id,
              auditId: inventoryAuditItemsTable.auditId,
              productId: inventoryAuditItemsTable.productId,
              systemCount: inventoryAuditItemsTable.systemCount,
              physicalCount: inventoryAuditItemsTable.physicalCount,
              delta: inventoryAuditItemsTable.delta,
              createdAt: inventoryAuditItemsTable.createdAt,
              productName: productsTable.name,
            })
            .from(inventoryAuditItemsTable)
            .leftJoin(productsTable, eq(inventoryAuditItemsTable.productId, productsTable.id))
            .where(eq(inventoryAuditItemsTable.auditId, auditId));
          rawItems.push(...rows);
        }
      }

      auditItemsRows = rawItems;
    }

    const itemsByAuditId = auditItemsRows.reduce<Record<string, typeof auditItemsRows>>((acc, item) => {
      if (!acc[item.auditId]) acc[item.auditId] = [];
      acc[item.auditId].push(item);
      return acc;
    }, {});

    const result = audits.map((audit) => ({
      ...audit,
      items: itemsByAuditId[audit.id] ?? [],
    }));

    res.json({ audits: result });
  },
);

// ── Damaged Goods ─────────────────────────────────────────────────────────────

/**
 * POST /inventory/damaged-goods
 * Log a damaged/lost/expired goods entry, reducing stock accordingly.
 */
router.post(
  "/inventory/damaged-goods",
  requireRole("admin", "warehouse_admin", "event_admin"),
  async (req: Request, res: Response) => {
    const schema = z.object({
      warehouseId: z.string().min(1).optional(),
      locationId: z.string().min(1).optional(),
      productId: z.string().min(1),
      quantity: z.number().int().min(1),
      reason: z.enum(["damaged", "lost", "expired"]),
      notes: z.string().optional(),
    }).refine((d) => d.warehouseId || d.locationId, {
      message: "Either warehouseId or locationId is required",
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { warehouseId, locationId, productId, quantity, reason, notes } = parsed.data;
    const user = req.user!;

    try {
      const result = await db.transaction(async (tx) => {
        if (warehouseId) {
          const updated = await tx
            .update(warehouseInventoryTable)
            .set({
              quantityOnHand: sql`quantity_on_hand - ${quantity}`,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(warehouseInventoryTable.warehouseId, warehouseId),
                eq(warehouseInventoryTable.productId, productId),
                gte(warehouseInventoryTable.quantityOnHand, quantity),
              ),
            )
            .returning();

          if (updated.length === 0) {
            throw new Error("Insufficient warehouse stock for this product");
          }
        } else if (locationId) {
          const updated = await tx
            .update(locationInventoryTable)
            .set({
              quantityOnHand: sql`quantity_on_hand - ${quantity}`,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(locationInventoryTable.locationId, locationId),
                eq(locationInventoryTable.productId, productId),
                gte(locationInventoryTable.quantityOnHand, quantity),
              ),
            )
            .returning();

          if (updated.length === 0) {
            throw new Error("Insufficient location stock for this product");
          }
        }

        const [entry] = await tx
          .insert(damagedGoodsTable)
          .values({
            warehouseId: warehouseId ?? null,
            locationId: locationId ?? null,
            productId,
            quantity,
            reason,
            notes: notes ?? null,
            performedByUserId: user.id,
          })
          .returning();

        await tx.insert(stockMovementsTable).values({
          movementType: "manual_adjustment",
          productId,
          quantity: -quantity,
          fromWarehouseId: warehouseId ?? null,
          fromLocationId: locationId ?? null,
          performedByUserId: user.id,
          notes: `Damaged goods (${reason}): ${notes ?? ""}`,
        });

        return entry;
      });

      res.status(201).json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: msg });
    }
  },
);

/**
 * GET /inventory/damaged-goods
 * List damaged/lost goods entries.
 */
router.get(
  "/inventory/damaged-goods",
  requireRole("admin", "warehouse_admin", "event_admin"),
  async (req: Request, res: Response) => {
    const { warehouseId, locationId } = req.query as { warehouseId?: string; locationId?: string };

    const conditions = [];
    if (warehouseId) conditions.push(eq(damagedGoodsTable.warehouseId, warehouseId));
    if (locationId) conditions.push(eq(damagedGoodsTable.locationId, locationId));

    const entries = await db
      .select({
        id: damagedGoodsTable.id,
        warehouseId: damagedGoodsTable.warehouseId,
        locationId: damagedGoodsTable.locationId,
        productId: damagedGoodsTable.productId,
        quantity: damagedGoodsTable.quantity,
        reason: damagedGoodsTable.reason,
        notes: damagedGoodsTable.notes,
        performedByUserId: damagedGoodsTable.performedByUserId,
        createdAt: damagedGoodsTable.createdAt,
        productName: productsTable.name,
      })
      .from(damagedGoodsTable)
      .leftJoin(productsTable, eq(damagedGoodsTable.productId, productsTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(damagedGoodsTable.createdAt))
      .limit(100);

    res.json({ entries });
  },
);

export default router;
