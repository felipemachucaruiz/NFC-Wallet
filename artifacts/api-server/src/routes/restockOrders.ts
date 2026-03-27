import { Router, type IRouter, type Request, type Response } from "express";
import { db, restockOrdersTable, locationsTable, merchantsTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireRole } from "../middlewares/requireRole";
import { z } from "zod";
import { getEventInventoryMode } from "./events";

async function resolveEventId(user: { eventId?: string | null; merchantId?: string | null; role: string }): Promise<string | null> {
  if (user.eventId) return user.eventId;
  if (user.merchantId) {
    const [merchant] = await db
      .select({ eventId: merchantsTable.eventId })
      .from(merchantsTable)
      .where(eq(merchantsTable.id, user.merchantId));
    return merchant?.eventId ?? null;
  }
  return null;
}

async function getMerchantType(merchantId: string): Promise<"event_managed" | "external" | null> {
  const [merchant] = await db
    .select({ merchantType: merchantsTable.merchantType })
    .from(merchantsTable)
    .where(eq(merchantsTable.id, merchantId));
  return (merchant?.merchantType as "event_managed" | "external") ?? null;
}

const router: IRouter = Router();

router.get(
  "/restock-orders",
  requireRole("admin", "warehouse_admin", "merchant_admin"),
  async (req: Request, res: Response) => {
    const { status, locationId } = req.query as { status?: string; locationId?: string };
    const user = req.user!;

    if (user.role === "merchant_admin") {
      if (!user.merchantId) {
        res.json({ orders: [] });
        return;
      }
      // External merchants do not participate in warehouse/restock flows
      const merchantType = await getMerchantType(user.merchantId);
      if (merchantType === "external") {
        res.json({ orders: [], isExternalMerchant: true });
        return;
      }
    }

    if (user.role !== "admin") {
      const eventId = await resolveEventId(user);
      if (eventId) {
        const inventoryMode = await getEventInventoryMode(eventId);
        if (inventoryMode === "location_based") {
          res.status(409).json({ error: "Restock orders are not available in location-based inventory mode" });
          return;
        }
      }
    }

    const conditions = [];

    if (status) conditions.push(eq(restockOrdersTable.status, status as "pending" | "approved" | "dispatched" | "rejected"));

    if (user.role === "merchant_admin") {
      const merchantLocations = await db
        .select({ id: locationsTable.id })
        .from(locationsTable)
        .where(eq(locationsTable.merchantId, user.merchantId!));

      if (merchantLocations.length === 0) {
        res.json({ orders: [] });
        return;
      }

      const locationIds = merchantLocations.map((l) => l.id);

      if (locationId) {
        if (!locationIds.includes(locationId)) {
          res.status(403).json({ error: "Access denied: location does not belong to your merchant" });
          return;
        }
        conditions.push(eq(restockOrdersTable.locationId, locationId));
      } else {
        conditions.push(inArray(restockOrdersTable.locationId, locationIds));
      }
    } else {
      if (locationId) conditions.push(eq(restockOrdersTable.locationId, locationId));
    }

    const orders = await db
      .select()
      .from(restockOrdersTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    res.json({ orders });
  },
);

router.post(
  "/restock-orders",
  requireRole("admin", "event_admin", "merchant_admin"),
  async (req: Request, res: Response) => {
    const schema = z.object({
      locationId: z.string().min(1),
      productId: z.string().min(1),
      requestedQty: z.number().int().positive(),
      notes: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { locationId, productId, requestedQty, notes } = parsed.data;

    const [location] = await db
      .select({ eventId: locationsTable.eventId, merchantId: locationsTable.merchantId })
      .from(locationsTable)
      .where(eq(locationsTable.id, locationId));

    if (!location) {
      res.status(404).json({ error: "Location not found" });
      return;
    }

    const user = req.user!;

    if (user.role === "event_admin") {
      const userEventId = user.eventId;
      if (!userEventId || location.eventId !== userEventId) {
        res.status(403).json({ error: "Access denied: location does not belong to your event" });
        return;
      }
    } else if (user.role === "merchant_admin") {
      if (!user.merchantId || location.merchantId !== user.merchantId) {
        res.status(403).json({ error: "Access denied: location does not belong to your merchant" });
        return;
      }
    }

    // Block restock orders for external merchant locations
    if (location.merchantId) {
      const merchantType = await getMerchantType(location.merchantId);
      if (merchantType === "external") {
        res.status(409).json({ error: "Restock orders are not available for external merchants. External merchants manage their own inventory independently." });
        return;
      }
    }

    if (location.eventId) {
      const inventoryMode = await getEventInventoryMode(location.eventId);
      if (inventoryMode === "location_based") {
        res.status(409).json({ error: "Restock orders are not available in location-based inventory mode" });
        return;
      }
    }

    const [order] = await db
      .insert(restockOrdersTable)
      .values({ locationId, productId, requestedQty, notes })
      .returning();

    res.status(201).json(order);
  },
);

router.patch(
  "/restock-orders/:orderId",
  requireRole("admin", "warehouse_admin"),
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const schema = z.object({
      status: z.enum(["approved", "dispatched", "rejected"]),
      notes: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [existingOrder] = await db
      .select({ locationId: restockOrdersTable.locationId })
      .from(restockOrdersTable)
      .where(eq(restockOrdersTable.id, req.params.orderId as string));

    if (existingOrder) {
      const [location] = await db
        .select({ eventId: locationsTable.eventId, merchantId: locationsTable.merchantId })
        .from(locationsTable)
        .where(eq(locationsTable.id, existingOrder.locationId));

      if (location) {
        // Block warehouse operations targeting external merchant locations
        if (location.merchantId) {
          const merchantType = await getMerchantType(location.merchantId);
          if (merchantType === "external") {
            res.status(409).json({ error: "Cannot process warehouse operations for external merchant locations." });
            return;
          }
        }
        const inventoryMode = await getEventInventoryMode(location.eventId);
        if (inventoryMode === "location_based") {
          res.status(409).json({ error: "Restock order approval is not available in location-based inventory mode. Switch the event to Centralized Warehouse mode to use this feature." });
          return;
        }
      }
    }

    const { status, notes } = parsed.data;
    const now = new Date();

    const updates: Record<string, unknown> = { status, notes };
    if (status === "approved") {
      updates.approvedByUserId = req.user.id;
      updates.approvedAt = now;
    } else if (status === "dispatched") {
      updates.dispatchedAt = now;
    } else if (status === "rejected") {
      updates.rejectedAt = now;
    }

    const [order] = await db
      .update(restockOrdersTable)
      .set(updates)
      .where(eq(restockOrdersTable.id, req.params.orderId as string))
      .returning();

    if (!order) {
      res.status(404).json({ error: "Restock order not found" });
      return;
    }

    res.json(order);
  },
);

export default router;
