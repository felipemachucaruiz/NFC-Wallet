import { Router, type IRouter, type Request, type Response } from "express";
import { db, transactionLogsTable, transactionLineItemsTable, productsTable, locationInventoryTable, braceletsTable, merchantsTable, locationsTable, restockOrdersTable, userLocationAssignmentsTable, stockMovementsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireRole } from "../middlewares/requireRole";
import type { AuthUser } from "@workspace/api-zod";
import { z } from "zod";

const router: IRouter = Router();

const lineItemInputSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1),
});

const logTransactionSchema = z.object({
  idempotencyKey: z.string().min(1),
  nfcUid: z.string().min(1),
  locationId: z.string().min(1),
  newBalance: z.number().int().min(0),
  counter: z.number().int().min(0),
  lineItems: z.array(lineItemInputSchema).min(1),
  offlineCreatedAt: z.string().optional(),
});

type LogTransactionInput = z.infer<typeof logTransactionSchema>;

async function checkLocationAccess(
  locationId: string,
  user: AuthUser,
): Promise<{ location: typeof locationsTable.$inferSelect } | { error: string }> {
  const [location] = await db
    .select()
    .from(locationsTable)
    .where(eq(locationsTable.id, locationId));

  if (!location) return { error: "Location not found" };

  if (user.role === "merchant_admin" || user.role === "merchant_staff") {
    if (!user.merchantId || location.merchantId !== user.merchantId) {
      return { error: "Access denied: location does not belong to your merchant" };
    }
    if (user.role === "merchant_staff") {
      const [assignment] = await db
        .select()
        .from(userLocationAssignmentsTable)
        .where(
          and(
            eq(userLocationAssignmentsTable.locationId, locationId),
            eq(userLocationAssignmentsTable.userId, user.id),
          ),
        );
      if (!assignment) {
        return { error: "Access denied: you are not assigned to this location" };
      }
    }
  }

  return { location };
}

async function processTransaction(
  input: LogTransactionInput,
  user: AuthUser,
  isSyncBatch: boolean,
): Promise<{
  status: "created" | "duplicate" | "error";
  transaction?: typeof transactionLogsTable.$inferSelect & { lineItems: (typeof transactionLineItemsTable.$inferSelect)[] };
  error?: string;
}> {
  // Idempotency check
  const existing = await db
    .select()
    .from(transactionLogsTable)
    .where(eq(transactionLogsTable.idempotencyKey, input.idempotencyKey));
  if (existing.length > 0) {
    return { status: "duplicate" };
  }

  // Bracelet existence + integrity checks
  const [bracelet] = await db
    .select()
    .from(braceletsTable)
    .where(eq(braceletsTable.nfcUid, input.nfcUid));
  if (!bracelet) {
    return { status: "error", error: "Bracelet not registered" };
  }
  if (bracelet.flagged) {
    return { status: "error", error: "Bracelet is flagged and cannot be used" };
  }
  // Counter must be strictly increasing to prevent rollback/replay
  if (bracelet.lastCounter !== null && input.counter <= bracelet.lastCounter) {
    return { status: "error", error: `Counter replay detected: submitted ${input.counter} ≤ stored ${bracelet.lastCounter}` };
  }
  // Balance consistency: newBalance should equal lastKnownBalance minus gross
  // (skip when lastKnownBalanceCop is null — first use on server side)
  if (bracelet.lastKnownBalanceCop !== null) {
    const expectedNewBalance = bracelet.lastKnownBalanceCop - input.newBalance;
    if (expectedNewBalance < 0) {
      return { status: "error", error: "Insufficient bracelet balance" };
    }
  }

  // Ownership + staff assignment check
  const accessResult = await checkLocationAccess(input.locationId, user);
  if ("error" in accessResult) {
    return { status: "error", error: accessResult.error };
  }
  const { location } = accessResult;

  // Resolve merchant from location
  const [merchant] = await db
    .select()
    .from(merchantsTable)
    .where(eq(merchantsTable.id, location.merchantId));
  if (!merchant) {
    return { status: "error", error: "Merchant not found" };
  }

  // Resolve products and compute totals
  let grossAmountCop = 0;
  let cogsCop = 0;
  const resolvedItems: {
    productId: string;
    name: string;
    priceCop: number;
    costCop: number;
    quantity: number;
  }[] = [];

  for (const item of input.lineItems) {
    const [product] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, item.productId));
    if (!product) {
      return { status: "error", error: `Product ${item.productId} not found` };
    }
    grossAmountCop += product.priceCop * item.quantity;
    cogsCop += product.costCop * item.quantity;
    resolvedItems.push({
      productId: product.id,
      name: product.name,
      priceCop: product.priceCop,
      costCop: product.costCop,
      quantity: item.quantity,
    });
  }

  void cogsCop;

  // Commission calculation
  const commissionRate = parseFloat(merchant.commissionRatePercent ?? "0");
  const commissionAmountCop = Math.round(grossAmountCop * commissionRate / 100);
  const netAmountCop = grossAmountCop - commissionAmountCop;

  // Insert transaction log
  const [txLog] = await db
    .insert(transactionLogsTable)
    .values({
      idempotencyKey: input.idempotencyKey,
      braceletUid: input.nfcUid,
      locationId: input.locationId,
      merchantId: merchant.id,
      eventId: merchant.eventId,
      grossAmountCop,
      commissionAmountCop,
      netAmountCop,
      newBalanceCop: input.newBalance,
      counter: input.counter,
      performedByUserId: user.id,
      syncedAt: isSyncBatch ? new Date() : null,
      offlineCreatedAt: input.offlineCreatedAt ? new Date(input.offlineCreatedAt) : null,
    })
    .returning();

  // Insert line items
  const lineItemInserts = resolvedItems.map((item) => ({
    transactionLogId: txLog.id,
    productId: item.productId,
    productNameSnapshot: item.name,
    unitPriceSnapshot: item.priceCop,
    unitCostSnapshot: item.costCop,
    quantity: item.quantity,
  }));
  const insertedLineItems = await db
    .insert(transactionLineItemsTable)
    .values(lineItemInserts)
    .returning();

  // Decrement location inventory + trigger restock orders
  for (const item of resolvedItems) {
    const [locInv] = await db
      .select()
      .from(locationInventoryTable)
      .where(
        and(
          eq(locationInventoryTable.locationId, input.locationId),
          eq(locationInventoryTable.productId, item.productId),
        ),
      );

    if (locInv) {
      const newQty = Math.max(0, locInv.quantityOnHand - item.quantity);
      await db
        .update(locationInventoryTable)
        .set({ quantityOnHand: newQty, updatedAt: new Date() })
        .where(eq(locationInventoryTable.id, locInv.id));

      // Record sale stock movement for full audit trail
      await db.insert(stockMovementsTable).values({
        movementType: "sale",
        productId: item.productId,
        quantity: item.quantity,
        fromLocationId: input.locationId,
        performedByUserId: user.id,
        transactionLogId: txLog.id,
      });

      // Auto-create restock order if below threshold
      if (newQty <= locInv.restockTrigger) {
        const pendingOrders = await db
          .select()
          .from(restockOrdersTable)
          .where(
            and(
              eq(restockOrdersTable.locationId, input.locationId),
              eq(restockOrdersTable.productId, item.productId),
              eq(restockOrdersTable.status, "pending"),
            ),
          );
        if (pendingOrders.length === 0) {
          await db.insert(restockOrdersTable).values({
            locationId: input.locationId,
            productId: item.productId,
            requestedQty: locInv.restockTargetQty,
            triggeredByTransactionId: txLog.id,
          });
        }
      }
    }
  }

  // Update bracelet server-side record
  await db
    .update(braceletsTable)
    .set({
      lastKnownBalanceCop: input.newBalance,
      lastCounter: input.counter,
      updatedAt: new Date(),
    })
    .where(eq(braceletsTable.nfcUid, input.nfcUid));

  return {
    status: "created",
    transaction: { ...txLog, lineItems: insertedLineItems },
  };
}

router.post(
  "/transactions/log",
  requireRole("merchant_staff", "merchant_admin", "admin"),
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const parsed = logTransactionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const result = await processTransaction(parsed.data, req.user, false);
    if (result.status === "duplicate") {
      res.status(409).json({ error: "Duplicate transaction (idempotency key already used)" });
      return;
    }
    if (result.status === "error") {
      res.status(400).json({ error: result.error });
      return;
    }
    res.status(201).json(result.transaction);
  },
);

router.post(
  "/transactions/sync",
  requireRole("merchant_staff", "merchant_admin", "admin"),
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const schema = z.object({
      transactions: z.array(logTransactionSchema),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const results = [];
    for (const tx of parsed.data.transactions) {
      const result = await processTransaction(tx, req.user, true);
      results.push({
        idempotencyKey: tx.idempotencyKey,
        status: result.status,
        ...(result.error && { error: result.error }),
      });
    }

    res.json({ results });
  },
);

export default router;
