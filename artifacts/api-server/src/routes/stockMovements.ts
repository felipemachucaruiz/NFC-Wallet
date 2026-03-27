import { Router, type IRouter, type Request, type Response } from "express";
import { db, stockMovementsTable, warehouseInventoryTable, locationInventoryTable, restockOrdersTable, locationsTable, warehousesTable, merchantsTable } from "@workspace/db";
import { eq, and, gte, lte, or, inArray } from "drizzle-orm";
import { requireRole } from "../middlewares/requireRole";
import { assertLocationAccess } from "../lib/ownershipGuards";
import { z } from "zod";
import { getEventInventoryMode } from "./events";

const router: IRouter = Router();

router.get(
  "/stock-movements",
  requireRole("admin", "warehouse_admin", "merchant_admin"),
  async (req: Request, res: Response) => {
    const { productId, locationId, warehouseId, from, to } = req.query as Record<string, string | undefined>;
    const user = req.user!;
    const conditions = [];

    if (productId) conditions.push(eq(stockMovementsTable.productId, productId));
    if (from) conditions.push(gte(stockMovementsTable.createdAt, new Date(from)));
    if (to) conditions.push(lte(stockMovementsTable.createdAt, new Date(to)));

    if (user.role === "merchant_admin") {
      if (!user.merchantId) {
        res.json({ movements: [] });
        return;
      }
      const merchantLocations = await db
        .select({ id: locationsTable.id })
        .from(locationsTable)
        .where(eq(locationsTable.merchantId, user.merchantId));

      if (merchantLocations.length === 0) {
        res.json({ movements: [] });
        return;
      }

      const locationIds = merchantLocations.map((l) => l.id);

      if (locationId) {
        if (!locationIds.includes(locationId)) {
          res.status(403).json({ error: "Access denied: location does not belong to your merchant" });
          return;
        }
        conditions.push(
          or(
            eq(stockMovementsTable.fromLocationId, locationId),
            eq(stockMovementsTable.toLocationId, locationId),
          )!,
        );
      } else {
        conditions.push(
          or(
            inArray(stockMovementsTable.fromLocationId, locationIds),
            inArray(stockMovementsTable.toLocationId, locationIds),
          )!,
        );
      }
    } else {
      if (locationId) {
        conditions.push(
          or(
            eq(stockMovementsTable.fromLocationId, locationId),
            eq(stockMovementsTable.toLocationId, locationId),
          )!,
        );
      }
      if (warehouseId) {
        conditions.push(
          or(
            eq(stockMovementsTable.fromWarehouseId, warehouseId),
            eq(stockMovementsTable.toWarehouseId, warehouseId),
          )!,
        );
      }
    }

    const movements = await db
      .select()
      .from(stockMovementsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    res.json({ movements });
  },
);

router.post(
  "/stock-movements/warehouse-dispatch",
  requireRole("admin", "warehouse_admin"),
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const schema = z.object({
      warehouseId: z.string().min(1),
      locationId: z.string().min(1),
      productId: z.string().min(1),
      quantity: z.number().int().min(1),
      restockOrderId: z.string().optional(),
      notes: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { warehouseId, locationId, productId, quantity, restockOrderId, notes } = parsed.data;

    const [warehouse] = await db
      .select({ eventId: warehousesTable.eventId })
      .from(warehousesTable)
      .where(eq(warehousesTable.id, warehouseId));
    if (!warehouse) {
      res.status(404).json({ error: "Warehouse not found" });
      return;
    }
    const inventoryMode = await getEventInventoryMode(warehouse.eventId);
    if (inventoryMode === "location_based") {
      res.status(409).json({ error: "Warehouse dispatch is not available in location-based inventory mode. Switch the event to Centralized Warehouse mode to use this feature." });
      return;
    }

    // Block warehouse dispatch to external merchant locations
    const [destLocation] = await db
      .select({ merchantId: locationsTable.merchantId })
      .from(locationsTable)
      .where(eq(locationsTable.id, locationId));
    if (destLocation?.merchantId) {
      const [destMerchant] = await db
        .select({ merchantType: merchantsTable.merchantType })
        .from(merchantsTable)
        .where(eq(merchantsTable.id, destLocation.merchantId));
      if (destMerchant?.merchantType === "external") {
        res.status(409).json({ error: "Cannot dispatch from warehouse to an external merchant location. External merchants manage their own inventory independently." });
        return;
      }
    }

    const movement = await db.transaction(async (tx) => {
      const [whInv] = await tx
        .select()
        .from(warehouseInventoryTable)
        .where(
          and(
            eq(warehouseInventoryTable.warehouseId, warehouseId),
            eq(warehouseInventoryTable.productId, productId),
          ),
        );

      if (!whInv || whInv.quantityOnHand < quantity) {
        throw new Error("Insufficient warehouse inventory");
      }

      await tx
        .update(warehouseInventoryTable)
        .set({ quantityOnHand: whInv.quantityOnHand - quantity, updatedAt: new Date() })
        .where(eq(warehouseInventoryTable.id, whInv.id));

      const locInvRows = await tx
        .select()
        .from(locationInventoryTable)
        .where(
          and(
            eq(locationInventoryTable.locationId, locationId),
            eq(locationInventoryTable.productId, productId),
          ),
        );

      if (locInvRows.length === 0) {
        await tx.insert(locationInventoryTable).values({
          locationId,
          productId,
          quantityOnHand: quantity,
        });
      } else {
        await tx
          .update(locationInventoryTable)
          .set({ quantityOnHand: locInvRows[0].quantityOnHand + quantity, updatedAt: new Date() })
          .where(eq(locationInventoryTable.id, locInvRows[0].id));
      }

      if (restockOrderId) {
        await tx
          .update(restockOrdersTable)
          .set({ status: "dispatched", dispatchedAt: new Date() })
          .where(eq(restockOrdersTable.id, restockOrderId));
      }

      const [mov] = await tx
        .insert(stockMovementsTable)
        .values({
          movementType: "warehouse_dispatch",
          productId,
          quantity,
          fromWarehouseId: warehouseId,
          toLocationId: locationId,
          performedByUserId: req.user.id,
          restockOrderId,
          notes,
        })
        .returning();

      return mov;
    }).catch((err: Error) => {
      if (err.message === "Insufficient warehouse inventory") return null;
      throw err;
    });

    if (!movement) {
      res.status(400).json({ error: "Insufficient warehouse inventory" });
      return;
    }

    res.status(201).json(movement);
  },
);

router.post(
  "/stock-movements/location-transfer",
  requireRole("admin", "warehouse_admin", "merchant_admin"),
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const schema = z.object({
      fromLocationId: z.string().min(1),
      toLocationId: z.string().min(1),
      productId: z.string().min(1),
      quantity: z.number().int().min(1),
      notes: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { fromLocationId, toLocationId, productId, quantity, notes } = parsed.data;
    const user = req.user!;

    if (user.role === "merchant_admin") {
      const fromAccess = await assertLocationAccess(fromLocationId, user);
      if ("error" in fromAccess) {
        res.status(fromAccess.status).json({ error: fromAccess.error });
        return;
      }
      const toAccess = await assertLocationAccess(toLocationId, user);
      if ("error" in toAccess) {
        res.status(toAccess.status).json({ error: toAccess.error });
        return;
      }
    }

    const result = await db.transaction(async (tx) => {
      const [fromInv] = await tx
        .select()
        .from(locationInventoryTable)
        .where(
          and(
            eq(locationInventoryTable.locationId, fromLocationId),
            eq(locationInventoryTable.productId, productId),
          ),
        );

      if (!fromInv || fromInv.quantityOnHand < quantity) {
        throw new Error("Insufficient inventory at source location");
      }

      await tx
        .update(locationInventoryTable)
        .set({ quantityOnHand: fromInv.quantityOnHand - quantity, updatedAt: new Date() })
        .where(eq(locationInventoryTable.id, fromInv.id));

      const [toInv] = await tx
        .select()
        .from(locationInventoryTable)
        .where(
          and(
            eq(locationInventoryTable.locationId, toLocationId),
            eq(locationInventoryTable.productId, productId),
          ),
        );

      if (!toInv) {
        await tx.insert(locationInventoryTable).values({
          locationId: toLocationId,
          productId,
          quantityOnHand: quantity,
        });
      } else {
        await tx
          .update(locationInventoryTable)
          .set({ quantityOnHand: toInv.quantityOnHand + quantity, updatedAt: new Date() })
          .where(eq(locationInventoryTable.id, toInv.id));
      }

      const [outMovement] = await tx
        .insert(stockMovementsTable)
        .values({
          movementType: "location_transfer_out",
          productId,
          quantity,
          fromLocationId,
          toLocationId,
          performedByUserId: req.user.id,
          notes,
        })
        .returning();

      const [inMovement] = await tx
        .insert(stockMovementsTable)
        .values({
          movementType: "location_transfer_in",
          productId,
          quantity,
          fromLocationId,
          toLocationId,
          performedByUserId: req.user.id,
          notes,
        })
        .returning();

      return { outMovement, inMovement };
    }).catch((err: Error) => {
      if (err.message === "Insufficient inventory at source location") return null;
      throw err;
    });

    if (!result) {
      res.status(400).json({ error: "Insufficient inventory at source location" });
      return;
    }

    res.status(201).json(result);
  },
);

export default router;
