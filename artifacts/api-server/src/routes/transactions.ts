import { Router, type IRouter, type Request, type Response } from "express";
import { db, transactionLogsTable, transactionLineItemsTable, productsTable, locationInventoryTable, braceletsTable, eventsTable, merchantsTable, locationsTable, restockOrdersTable, userLocationAssignmentsTable, stockMovementsTable } from "@workspace/db";
import { eq, and, count, sql, gte } from "drizzle-orm";
import { requireRole } from "../middlewares/requireRole";
import { requireAttestation } from "../middlewares/requireAttestation";
import type { AuthUser } from "@workspace/api-zod";
import { z } from "zod";
import { getEventInventoryMode } from "./events";
import { runFraudDetection, runSyncFraudDetection } from "../lib/fraudDetection";
import { deriveEventKey, verifyBraceletHmac } from "../lib/kdf";
import { notifyLowStock } from "../lib/pushNotifications";

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
  tipAmount: z.number().int().min(0).optional().default(0),
  offlineCreatedAt: z.string().optional(),
  hmac: z.string().optional(),
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
      const [{ value: totalAssignments }] = await db
        .select({ value: count() })
        .from(userLocationAssignmentsTable)
        .where(eq(userLocationAssignmentsTable.userId, user.id));
      if (totalAssignments > 0) {
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
  }

  return { location };
}

const BALANCE_DISCREPANCY_THRESHOLD = 50000; // COP 50,000 tolerance

async function processTransaction(
  input: LogTransactionInput,
  user: AuthUser,
  isSyncBatch: boolean,
): Promise<{
  status: "created" | "duplicate" | "error";
  transaction?: typeof transactionLogsTable.$inferSelect & { lineItems: (typeof transactionLineItemsTable.$inferSelect)[] };
  error?: string;
  flagged?: boolean;
}> {
  // Idempotency check
  const existing = await db
    .select()
    .from(transactionLogsTable)
    .where(eq(transactionLogsTable.idempotencyKey, input.idempotencyKey));
  if (existing.length > 0) {
    return { status: "duplicate" };
  }

  // Resolve merchant early so we can check event scoping and auto-register
  const accessResult = await checkLocationAccess(input.locationId, user);
  if ("error" in accessResult) {
    return { status: "error", error: accessResult.error };
  }
  const { location: locationForEventCheck } = accessResult;
  const [merchantForEventCheck] = await db
    .select()
    .from(merchantsTable)
    .where(eq(merchantsTable.id, locationForEventCheck.merchantId));
  if (!merchantForEventCheck) {
    return { status: "error", error: "Merchant not found" };
  }

  // Bracelet existence + integrity checks
  let [bracelet] = await db
    .select()
    .from(braceletsTable)
    .where(eq(braceletsTable.nfcUid, input.nfcUid));

  if (!bracelet) {
    return { status: "error", error: "BRACELET_NOT_ACTIVATED: Esta pulsera no tiene saldo. Dirígete a un punto de recarga para activarla." };
  }

  if (bracelet.flagged) {
    return { status: "error", error: "Bracelet is flagged and cannot be used" };
  }

  // Event-scoping guard: when the merchant station is event-scoped, the bracelet must
  // belong to the exact same event. A bracelet with eventId=null is a new/unassigned
  // bracelet — adopt it into this event. Only reject if it is already tied to a
  // different event (true cross-event fraud).
  if (merchantForEventCheck.eventId) {
    if (!bracelet.eventId) {
      // Backfill: assign this bracelet to the station's event on first use
      await db
        .update(braceletsTable)
        .set({ eventId: merchantForEventCheck.eventId })
        .where(eq(braceletsTable.nfcUid, bracelet.nfcUid));
      bracelet = { ...bracelet, eventId: merchantForEventCheck.eventId };
    } else if (bracelet.eventId !== merchantForEventCheck.eventId) {
      return { status: "error", error: "BRACELET_WRONG_EVENT: Esta pulsera pertenece a otro evento" };
    }
  }

  // Closed-event guard: reject if the bracelet's event is inactive or past its end date
  const eventIdForCheck = bracelet.eventId ?? merchantForEventCheck.eventId;
  if (eventIdForCheck) {
    const [braceletEvent] = await db
      .select({ active: eventsTable.active, endsAt: eventsTable.endsAt })
      .from(eventsTable)
      .where(eq(eventsTable.id, eventIdForCheck));
    if (braceletEvent && !braceletEvent.active) {
      return { status: "error", error: "BRACELET_WRONG_EVENT: Este evento ha sido cerrado y la pulsera no puede usarse" };
    }
    if (braceletEvent?.endsAt && new Date(braceletEvent.endsAt) < new Date()) {
      return { status: "error", error: "EVENT_ENDED: Este evento ya ha finalizado. No se pueden procesar más transacciones." };
    }
  }

  // Counter must be strictly increasing to prevent rollback/replay
  if (bracelet.lastCounter !== null && input.counter <= bracelet.lastCounter) {
    return { status: "error", error: `Counter replay detected: submitted ${input.counter} ≤ stored ${bracelet.lastCounter}` };
  }
  // Balance consistency: newBalance should equal lastKnownBalance minus gross
  // (skip when lastKnownBalance is null — first use on server side)
  if (bracelet.lastKnownBalance !== null) {
    const expectedNewBalance = bracelet.lastKnownBalance - input.newBalance;
    if (expectedNewBalance < 0) {
      return { status: "error", error: "Insufficient bracelet balance" };
    }
  }

  // Server-side HMAC verification
  // Resolve the event's HMAC configuration regardless of whether the client sent an HMAC
  {
    const eventId = bracelet.eventId ?? null;
    const candidateKeys: string[] = [];
    let useKdf = false;

    if (eventId) {
      const [event] = await db
        .select({ useKdf: eventsTable.useKdf, hmacSecret: eventsTable.hmacSecret })
        .from(eventsTable)
        .where(eq(eventsTable.id, eventId));

      if (event?.useKdf) {
        useKdf = true;
        const masterKey = process.env.HMAC_MASTER_KEY;
        if (!masterKey) {
          return { status: "error", error: "Server configuration error: HMAC_MASTER_KEY not configured" };
        }
        // Primary key: KDF-derived event key
        candidateKeys.push(deriveEventKey(masterKey, eventId));
        // Fallback: pre-KDF per-event key so existing bracelets keep working during migration
        if (event.hmacSecret) candidateKeys.push(event.hmacSecret);
      } else if (event?.hmacSecret) {
        candidateKeys.push(event.hmacSecret);
      }
    }

    // Always include global HMAC_SECRET as the final fallback candidate.
    // This covers: (a) event-null bracelets, (b) events with no per-event key,
    // and (c) KDF events whose bracelets were originally signed with the global
    // secret before a per-event key or KDF was set up.
    const globalSecret = process.env.HMAC_SECRET;
    if (globalSecret && !candidateKeys.includes(globalSecret)) {
      candidateKeys.push(globalSecret);
    }

    if (candidateKeys.length > 0) {
      if (useKdf && !input.hmac) {
        // KDF-enabled events require HMAC for all transactions — no bypass allowed
        return { status: "error", error: "HMAC_REQUIRED: Bracelet signature required for this event" };
      }

      if (input.hmac) {
        // Verify the signature written on the chip.
        // Tries all candidate keys: derived key first (KDF), then pre-KDF legacy key,
        // each with UID-bound payload (new format) and without UID (old format).
        const { valid } = verifyBraceletHmac(
          input.newBalance,
          input.counter,
          input.hmac,
          candidateKeys,
          input.nfcUid,
        );
        if (!valid) {
          return { status: "error", error: "HMAC_UID_MISMATCH: Bracelet signature invalid — possible clone or tamper detected" };
        }
      }
    }
  }

  // Use the already-resolved location and merchant from event-scoping check above
  const location = locationForEventCheck;
  const merchant = merchantForEventCheck;

  // Resolve products and compute totals
  let grossAmount = 0;
  let cogs = 0;
  const resolvedItems: {
    productId: string;
    name: string;
    price: number;
    cost: number;
    quantity: number;
    ivaAmount: number;
    retencionFuenteAmount: number;
    retencionICAAmount: number;
  }[] = [];

  const retencionFuenteRate = parseFloat(merchant.retencionFuenteRate ?? "0");
  const retencionICARate = parseFloat(merchant.retencionICARate ?? "0");

  for (const item of input.lineItems) {
    const [product] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, item.productId));
    if (!product) {
      return { status: "error", error: `Product ${item.productId} not found` };
    }
    const lineGross = product.price * item.quantity;
    grossAmount += lineGross;
    cogs += product.cost * item.quantity;

    const ivaRate = product.ivaExento ? 0 : parseFloat(product.ivaRate ?? "0");
    const ivaAmount = Math.round(lineGross * ivaRate / 100);
    const retencionFuenteAmount = Math.round(lineGross * retencionFuenteRate / 100);
    const retencionICAAmount = Math.round(lineGross * retencionICARate / 100);

    resolvedItems.push({
      productId: product.id,
      name: product.name,
      price: product.price,
      cost: product.cost,
      quantity: item.quantity,
      ivaAmount,
      retencionFuenteAmount,
      retencionICAAmount,
    });
  }

  void cogs;

  // Commission calculation — commission is on items subtotal only, not on tip
  const tipAmount = input.tipAmount ?? 0;
  // Total amount actually deducted from the bracelet (items + tip combined)
  const chargedAmount = grossAmount + tipAmount;
  let commissionRate = parseFloat(merchant.commissionRatePercent ?? "0");
  if (commissionRate === 0 && merchant.eventId) {
    const [ev] = await db
      .select({ platformCommissionRate: eventsTable.platformCommissionRate })
      .from(eventsTable)
      .where(eq(eventsTable.id, merchant.eventId));
    if (ev) {
      commissionRate = parseFloat(ev.platformCommissionRate as unknown as string) || 0;
    }
  }
  const commissionAmount = Math.round(grossAmount * commissionRate / 100);
  // Merchant receives net items amount plus the full tip (tip is not subject to commission)
  const netAmount = grossAmount - commissionAmount + tipAmount;

  // Compute bracelet update fields before entering the transaction so we can
  // determine the final state (flagged vs clean) consistently.
  let wasFlagged = false;
  let braceletUpdate: Record<string, unknown> = {
    lastKnownBalance: input.newBalance,
    lastCounter: input.counter,
    pendingSync: false,
    pendingBalance: 0,
    pendingTopUpAmount: sql`GREATEST(${braceletsTable.pendingTopUpAmount} - ${bracelet.pendingTopUpAmount}, 0)`,
    updatedAt: new Date(),
  };

  if (isSyncBatch && bracelet.lastKnownBalance !== null) {
    if (bracelet.pendingSync && bracelet.pendingTopUpAmount > 0) {
      braceletUpdate = {
        lastKnownBalance: input.newBalance,
        lastCounter: input.counter,
        pendingSync: false,
        pendingBalance: 0,
        pendingTopUpAmount: sql`GREATEST(${braceletsTable.pendingTopUpAmount} - ${bracelet.pendingTopUpAmount}, 0)`,
        updatedAt: new Date(),
      };
    } else {
      const expectedNewBalance = bracelet.lastKnownBalance - chargedAmount;
      const discrepancy = Math.abs(expectedNewBalance - input.newBalance);
      if (discrepancy > BALANCE_DISCREPANCY_THRESHOLD) {
        wasFlagged = true;
      }
    }
  }

  if (!wasFlagged && isSyncBatch && bracelet.maxOfflineSpend !== null && bracelet.maxOfflineSpend !== undefined) {
    if (chargedAmount > bracelet.maxOfflineSpend) {
      wasFlagged = true;
    }
  }

  if (wasFlagged) {
    let flagReason = "";
    if (isSyncBatch && bracelet.lastKnownBalance !== null) {
      const expectedNewBalance = bracelet.lastKnownBalance - chargedAmount;
      const discrepancy = Math.abs(expectedNewBalance - input.newBalance);
      if (discrepancy > BALANCE_DISCREPANCY_THRESHOLD) {
        flagReason = `Balance discrepancy during sync: expected ${expectedNewBalance} COP but device reported ${input.newBalance} COP (diff: ${discrepancy} COP).`;
      }
    }
    if (isSyncBatch && bracelet.maxOfflineSpend !== null && bracelet.maxOfflineSpend !== undefined && chargedAmount > bracelet.maxOfflineSpend) {
      flagReason = flagReason
        ? flagReason + ` Also: single offline transaction amount ${chargedAmount} COP exceeds limit ${bracelet.maxOfflineSpend} COP.`
        : `Single offline transaction amount ${chargedAmount} COP exceeds bracelet max offline spend limit ${bracelet.maxOfflineSpend} COP.`;
    }
    braceletUpdate = {
      flagged: true,
      flagReason,
      lastKnownBalance: input.newBalance,
      lastCounter: input.counter,
      pendingSync: false,
      pendingBalance: 0,
      pendingTopUpAmount: sql`GREATEST(${braceletsTable.pendingTopUpAmount} - ${bracelet.pendingTopUpAmount}, 0)`,
      updatedAt: new Date(),
    };
  }

  // Wrap all DB writes atomically so a crash mid-sale leaves no partial state.
  const eventInventoryMode = await getEventInventoryMode(merchant.eventId);

  const lowStockAlerts: Array<{ productId: string; locationId: string; currentQty: number; restockTrigger: number }> = [];

  let txResult: { txLog: typeof transactionLogsTable.$inferSelect; insertedLineItems: (typeof transactionLineItemsTable.$inferSelect)[] };
  try {
    txResult = await db.transaction(async (tx) => {
    // Insert transaction log
    const [txLog] = await tx
      .insert(transactionLogsTable)
      .values({
        idempotencyKey: input.idempotencyKey,
        braceletUid: input.nfcUid,
        locationId: input.locationId,
        merchantId: merchant.id,
        eventId: merchant.eventId,
        grossAmount,
        tipAmount,
        commissionAmount,
        netAmount,
        newBalance: input.newBalance,
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
      unitPriceSnapshot: item.price,
      unitCostSnapshot: item.cost,
      quantity: item.quantity,
      ivaAmount: item.ivaAmount,
      retencionFuenteAmount: item.retencionFuenteAmount,
      retencionICAAmount: item.retencionICAAmount,
    }));
    const insertedLineItems = await tx
      .insert(transactionLineItemsTable)
      .values(lineItemInserts)
      .returning();

    // Decrement location inventory atomically + trigger restock orders
    for (const item of resolvedItems) {
      const [locInv] = await tx
        .select()
        .from(locationInventoryTable)
        .where(
          and(
            eq(locationInventoryTable.locationId, input.locationId),
            eq(locationInventoryTable.productId, item.productId),
          ),
        );

      if (locInv) {
        // Atomic decrement: reject if insufficient stock rather than clamping to 0
        const decremented = await tx
          .update(locationInventoryTable)
          .set({ quantityOnHand: sql`quantity_on_hand - ${item.quantity}`, updatedAt: new Date() })
          .where(
            and(
              eq(locationInventoryTable.id, locInv.id),
              gte(locationInventoryTable.quantityOnHand, item.quantity),
            ),
          )
          .returning({ newQty: locationInventoryTable.quantityOnHand });

        if (decremented.length === 0) {
          throw new Error(`Insufficient stock for product ${item.productId}`);
        }

        const newQty = decremented[0].newQty;

        // Record sale stock movement for full audit trail
        await tx.insert(stockMovementsTable).values({
          movementType: "sale",
          productId: item.productId,
          quantity: item.quantity,
          fromLocationId: input.locationId,
          performedByUserId: user.id,
          transactionLogId: txLog.id,
        });

        // Collect low-stock alerts to send after the transaction commits.
        // Only alert when crossing from above the threshold to at/below (edge trigger),
        // to avoid spamming admins on every decrement while already low.
        if (locInv.quantityOnHand > locInv.restockTrigger && newQty <= locInv.restockTrigger) {
          lowStockAlerts.push({
            productId: item.productId,
            locationId: input.locationId,
            currentQty: newQty,
            restockTrigger: locInv.restockTrigger,
          });
        }

        if (eventInventoryMode === "centralized_warehouse" && newQty <= locInv.restockTrigger) {
          const pendingOrders = await tx
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
            await tx.insert(restockOrdersTable).values({
              locationId: input.locationId,
              productId: item.productId,
              requestedQty: locInv.restockTargetQty,
              triggeredByTransactionId: txLog.id,
            });
          }
        }
      }
    }

    // Update bracelet record inside the same transaction
    await tx
      .update(braceletsTable)
      .set(braceletUpdate)
      .where(eq(braceletsTable.nfcUid, input.nfcUid));

      return { txLog, insertedLineItems };
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith("Insufficient stock for product")) {
      return { status: "error", error: msg };
    }
    throw err;
  }

  const { txLog, insertedLineItems } = txResult;

  // Async low-stock push alerts (non-blocking) — fire after transaction commits
  if (lowStockAlerts.length > 0 && merchant.eventId) {
    for (const alert of lowStockAlerts) {
      void notifyLowStock({
        eventId: merchant.eventId,
        productId: alert.productId,
        locationId: alert.locationId,
        currentQty: alert.currentQty,
        restockTrigger: alert.restockTrigger,
      });
    }
  }

  // Async fraud detection (non-blocking) — capture previous balance BEFORE update
  void runFraudDetection({
    nfcUid: input.nfcUid,
    locationId: input.locationId,
    eventId: merchant.eventId,
    grossAmount,
    previousBalance: bracelet.lastKnownBalance ?? input.newBalance,
    newBalance: input.newBalance,
    performedByUserId: user.id,
    transactionTime: new Date(),
  });

  return {
    status: "created",
    transaction: { ...txLog, lineItems: insertedLineItems },
    flagged: wasFlagged,
  };
}

router.post(
  "/transactions/log",
  requireRole("merchant_staff", "merchant_admin", "admin"),
  requireAttestation,
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
    const createdByLocation = new Map<string, number>();

    for (const tx of parsed.data.transactions) {
      const result = await processTransaction(tx, req.user, true);
      results.push({
        idempotencyKey: tx.idempotencyKey,
        status: result.status,
        ...(result.error && { error: result.error }),
        ...(result.flagged && { flagged: true }),
      });
      if (result.status === "created") {
        createdByLocation.set(tx.locationId, (createdByLocation.get(tx.locationId) ?? 0) + 1);
      }
    }

    for (const [locationId, count] of createdByLocation.entries()) {
      const [loc] = await db.select({ merchantId: locationsTable.merchantId }).from(locationsTable).where(eq(locationsTable.id, locationId));
      if (loc) {
        const [merch] = await db.select({ eventId: merchantsTable.eventId }).from(merchantsTable).where(eq(merchantsTable.id, loc.merchantId));
        if (merch?.eventId) {
          void runSyncFraudDetection({ locationId, eventId: merch.eventId, syncedCount: count });
        }
      }
    }

    res.json({ results });
  },
);

export default router;
