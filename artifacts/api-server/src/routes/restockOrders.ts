import { Router, type IRouter, type Request, type Response } from "express";
import { db, restockOrdersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireRole } from "../middlewares/requireRole";
import { z } from "zod";

const router: IRouter = Router();

router.get(
  "/restock-orders",
  requireRole("admin", "warehouse_admin", "merchant_admin"),
  async (req: Request, res: Response) => {
    const { status, locationId } = req.query as { status?: string; locationId?: string };
    const conditions = [];
    if (status) conditions.push(eq(restockOrdersTable.status, status as "pending" | "approved" | "dispatched" | "rejected"));
    if (locationId) conditions.push(eq(restockOrdersTable.locationId, locationId));

    const orders = await db
      .select()
      .from(restockOrdersTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    res.json({ orders });
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
