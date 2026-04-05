import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SQLite from "expo-sqlite";
import { syncTransactions } from "@workspace/api-client-react";
import { customFetch } from "@workspace/api-client-react";
import { generateId } from "@/utils/hmac";
import { cacheSigningKey, getCachedSigningKey } from "@/utils/signingKeyCache";

const QUEUE_KEY = "@offline_queue";
const TOPUP_QUEUE_KEY = "@offline_topup_queue";
const UNSYNC_SPEND_KEY = "@unsync_spend_cop";
const SYNC_INTERVAL = 30_000;
const DB_NAME = "offline_queue.db";

const DEFAULT_OFFLINE_SYNC_LIMIT = 500_000;

export interface QueuedTransaction {
  id: string;
  type: "charge";
  locationId: string;
  nfcUid: string;
  newBalance: number;
  counter: number;
  lineItems: Array<{
    productId: string;
    quantity: number;
    unitPriceCop: number;
    unitCostCop: number;
  }>;
  grossAmountCop: number;
  tipAmountCop?: number;
  hmac?: string;
  createdAt: string;
  status: "pending" | "syncing" | "failed";
  failCount: number;
  failReason?: string;
}

export interface QueuedTopUp {
  id: string;
  type: "topup";
  nfcUid: string;
  amountCop: number;
  paymentMethod: string;
  newBalance: number;
  newCounter: number;
  hmac?: string;
  createdAt: string;
  status: "pending" | "syncing" | "failed";
  failCount: number;
  failReason?: string;
}

export type QueuedItem = QueuedTransaction | QueuedTopUp;

interface TopUpSyncResult {
  results?: Array<{ idempotencyKey: string; status: string; error?: string }>;
}

interface OfflineQueueContextValue {
  queue: QueuedTransaction[];
  topUpQueue: QueuedTopUp[];
  allFailedItems: QueuedItem[];
  isOnline: boolean;
  isSyncing: boolean;
  enqueue: (tx: Omit<QueuedTransaction, "id" | "createdAt" | "status" | "failCount" | "type">) => Promise<void>;
  enqueueTopUp: (topup: Omit<QueuedTopUp, "id" | "createdAt" | "status" | "failCount" | "type">) => Promise<void>;
  syncNow: () => Promise<void>;
  dismissFailedItem: (id: string, itemType: "charge" | "topup") => Promise<void>;
  pendingCount: number;
  cachedHmacSecret: string;
  offlineSyncLimit: number;
  unsyncedSpendCop: number;
  isOfflineLimitReached: boolean;
  updateCachedHmacSecret: (secret: string) => Promise<void>;
  updateOfflineLimits: (syncLimit: number) => Promise<void>;
  clearCachedHmacSecret: () => void;
}

const OfflineQueueContext = createContext<OfflineQueueContextValue | null>(null);

// Module-level callback so AuthContext can clear the in-memory key on logout
// without requiring hook access
let _clearCachedHmacSecretCallback: (() => void) | null = null;
export function clearInMemoryCachedHmacSecret(): void {
  _clearCachedHmacSecretCallback?.();
}

function getCounterForItem(item: QueuedItem): number {
  return item.type === "charge" ? item.counter : item.newCounter;
}

// ─── SQLite helpers ──────────────────────────────────────────────────────────

let _db: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync(DB_NAME);
  await _db.execAsync(`
    CREATE TABLE IF NOT EXISTS charge_queue (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS topup_queue (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS kv_store (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return _db;
}

async function dbLoadChargeQueue(): Promise<QueuedTransaction[]> {
  try {
    const db = await getDb();
    const rows = await db.getAllAsync<{ id: string; data: string }>(
      "SELECT id, data FROM charge_queue ORDER BY rowid ASC"
    );
    return rows.map((r) => {
      const parsed = JSON.parse(r.data) as QueuedTransaction;
      return { ...parsed, type: "charge" as const, grossAmountCop: parsed.grossAmountCop ?? 0 };
    });
  } catch {
    return [];
  }
}

async function dbSaveChargeItem(item: QueuedTransaction): Promise<void> {
  try {
    const db = await getDb();
    await db.runAsync(
      "INSERT OR REPLACE INTO charge_queue (id, data) VALUES (?, ?)",
      item.id,
      JSON.stringify(item)
    );
  } catch {}
}

async function dbUpdateChargeItem(item: QueuedTransaction): Promise<void> {
  try {
    const db = await getDb();
    await db.runAsync(
      "UPDATE charge_queue SET data = ? WHERE id = ?",
      JSON.stringify(item),
      item.id
    );
  } catch {}
}

async function dbDeleteChargeItem(id: string): Promise<void> {
  try {
    const db = await getDb();
    await db.runAsync("DELETE FROM charge_queue WHERE id = ?", id);
  } catch {}
}

async function dbReplaceChargeQueue(items: QueuedTransaction[]): Promise<void> {
  try {
    const db = await getDb();
    await db.withTransactionAsync(async () => {
      await db.runAsync("DELETE FROM charge_queue");
      for (const item of items) {
        await db.runAsync(
          "INSERT INTO charge_queue (id, data) VALUES (?, ?)",
          item.id,
          JSON.stringify(item)
        );
      }
    });
  } catch {}
}

async function dbLoadTopUpQueue(): Promise<QueuedTopUp[]> {
  try {
    const db = await getDb();
    const rows = await db.getAllAsync<{ id: string; data: string }>(
      "SELECT id, data FROM topup_queue ORDER BY rowid ASC"
    );
    return rows.map((r) => JSON.parse(r.data) as QueuedTopUp);
  } catch {
    return [];
  }
}

async function dbSaveTopUpItem(item: QueuedTopUp): Promise<void> {
  try {
    const db = await getDb();
    await db.runAsync(
      "INSERT OR REPLACE INTO topup_queue (id, data) VALUES (?, ?)",
      item.id,
      JSON.stringify(item)
    );
  } catch {}
}

async function dbUpdateTopUpItem(item: QueuedTopUp): Promise<void> {
  try {
    const db = await getDb();
    await db.runAsync(
      "UPDATE topup_queue SET data = ? WHERE id = ?",
      JSON.stringify(item),
      item.id
    );
  } catch {}
}

async function dbDeleteTopUpItem(id: string): Promise<void> {
  try {
    const db = await getDb();
    await db.runAsync("DELETE FROM topup_queue WHERE id = ?", id);
  } catch {}
}

async function dbReplaceTopUpQueue(items: QueuedTopUp[]): Promise<void> {
  try {
    const db = await getDb();
    await db.withTransactionAsync(async () => {
      await db.runAsync("DELETE FROM topup_queue");
      for (const item of items) {
        await db.runAsync(
          "INSERT INTO topup_queue (id, data) VALUES (?, ?)",
          item.id,
          JSON.stringify(item)
        );
      }
    });
  } catch {}
}

async function dbGetKv(key: string): Promise<string | null> {
  try {
    const db = await getDb();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM kv_store WHERE key = ?",
      key
    );
    return row?.value ?? null;
  } catch {
    return null;
  }
}

async function dbSetKv(key: string, value: string): Promise<void> {
  try {
    const db = await getDb();
    await db.runAsync(
      "INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)",
      key,
      value
    );
  } catch {}
}

// ─── Migration from AsyncStorage on first launch ─────────────────────────────

async function migrateFromAsyncStorageIfNeeded(): Promise<{
  chargeItems: QueuedTransaction[];
  topUpItems: QueuedTopUp[];
  unsyncedSpend: number;
}> {
  const db = await getDb();
  const migrated = await dbGetKv("migrated_from_async_storage");
  if (migrated === "1") {
    return {
      chargeItems: await dbLoadChargeQueue(),
      topUpItems: await dbLoadTopUpQueue(),
      unsyncedSpend: parseInt((await dbGetKv(UNSYNC_SPEND_KEY)) ?? "0", 10) || 0,
    };
  }

  // Attempt to read from AsyncStorage
  let chargeItems: QueuedTransaction[] = [];
  let topUpItems: QueuedTopUp[] = [];
  let unsyncedSpend = 0;

  try {
    const rawQueue = await AsyncStorage.getItem(QUEUE_KEY);
    if (rawQueue) {
      const parsed = JSON.parse(rawQueue) as QueuedTransaction[];
      chargeItems = parsed.map((t) => ({ ...t, type: "charge" as const, grossAmountCop: t.grossAmountCop ?? 0 }));
    }
  } catch {}

  try {
    const rawTopUp = await AsyncStorage.getItem(TOPUP_QUEUE_KEY);
    if (rawTopUp) {
      topUpItems = JSON.parse(rawTopUp) as QueuedTopUp[];
    }
  } catch {}

  try {
    const rawSpend = await AsyncStorage.getItem(UNSYNC_SPEND_KEY);
    if (rawSpend) {
      unsyncedSpend = parseInt(rawSpend, 10) || 0;
    }
  } catch {}

  // Write migrated data into SQLite
  await db.withTransactionAsync(async () => {
    for (const item of chargeItems) {
      await db.runAsync(
        "INSERT OR IGNORE INTO charge_queue (id, data) VALUES (?, ?)",
        item.id,
        JSON.stringify(item)
      );
    }
    for (const item of topUpItems) {
      await db.runAsync(
        "INSERT OR IGNORE INTO topup_queue (id, data) VALUES (?, ?)",
        item.id,
        JSON.stringify(item)
      );
    }
    await db.runAsync(
      "INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)",
      UNSYNC_SPEND_KEY,
      String(unsyncedSpend)
    );
    await db.runAsync(
      "INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)",
      "migrated_from_async_storage",
      "1"
    );
  });

  // Clear AsyncStorage keys after successful migration
  try {
    await AsyncStorage.multiRemove([QUEUE_KEY, TOPUP_QUEUE_KEY, UNSYNC_SPEND_KEY]);
  } catch {}

  return { chargeItems, topUpItems, unsyncedSpend };
}

export function OfflineQueueProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<QueuedTransaction[]>([]);
  const [topUpQueue, setTopUpQueue] = useState<QueuedTopUp[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [cachedHmacSecret, setCachedHmacSecret] = useState<string>("");
  const [offlineSyncLimit, setOfflineSyncLimit] = useState<number>(DEFAULT_OFFLINE_SYNC_LIMIT);
  const [unsyncedSpendCop, setUnsyncedSpendCop] = useState<number>(0);
  const queueRef = useRef<QueuedTransaction[]>([]);
  const topUpQueueRef = useRef<QueuedTopUp[]>([]);
  const unsyncedSpendRef = useRef<number>(0);

  useEffect(() => {
    migrateFromAsyncStorageIfNeeded().then(({ chargeItems, topUpItems, unsyncedSpend }) => {
      queueRef.current = chargeItems;
      setQueue(chargeItems);
      topUpQueueRef.current = topUpItems;
      setTopUpQueue(topUpItems);
      unsyncedSpendRef.current = unsyncedSpend;
      setUnsyncedSpendCop(unsyncedSpend);
    });
    getCachedSigningKey().then((key) => {
      if (key) setCachedHmacSecret(key);
    });
  }, []);

  const updateQueue = useCallback(async (q: QueuedTransaction[]) => {
    queueRef.current = q;
    setQueue([...q]);
    await dbReplaceChargeQueue(q);
  }, []);

  const updateTopUpQueue = useCallback(async (q: QueuedTopUp[]) => {
    topUpQueueRef.current = q;
    setTopUpQueue([...q]);
    await dbReplaceTopUpQueue(q);
  }, []);

  const updateUnsyncedSpend = useCallback(async (amount: number) => {
    unsyncedSpendRef.current = amount;
    setUnsyncedSpendCop(amount);
    await dbSetKv(UNSYNC_SPEND_KEY, String(amount));
  }, []);

  const updateCachedHmacSecret = useCallback(async (secret: string) => {
    setCachedHmacSecret(secret);
    await cacheSigningKey(secret);
  }, []);

  const updateOfflineLimits = useCallback(async (syncLimit: number) => {
    setOfflineSyncLimit(syncLimit);
  }, []);

  const clearCachedHmacSecret = useCallback(() => {
    setCachedHmacSecret("");
  }, []);

  // Register module-level callback so AuthContext can call it without hook access
  useEffect(() => {
    _clearCachedHmacSecretCallback = clearCachedHmacSecret;
    return () => {
      _clearCachedHmacSecretCallback = null;
    };
  }, [clearCachedHmacSecret]);

  const enqueue = useCallback(
    async (tx: Omit<QueuedTransaction, "id" | "createdAt" | "status" | "failCount" | "type">) => {
      const item: QueuedTransaction = {
        ...tx,
        type: "charge",
        id: generateId(),
        createdAt: new Date().toISOString(),
        status: "pending",
        failCount: 0,
      };
      const q = [...queueRef.current, item];
      queueRef.current = q;
      setQueue([...q]);
      await dbSaveChargeItem(item);
      // Accumulate unsynced spend using total charged amount (items + tip)
      const newSpend = unsyncedSpendRef.current + tx.grossAmountCop + (tx.tipAmountCop ?? 0);
      await updateUnsyncedSpend(newSpend);
    },
    [updateUnsyncedSpend]
  );

  const enqueueTopUp = useCallback(
    async (topup: Omit<QueuedTopUp, "id" | "createdAt" | "status" | "failCount" | "type">) => {
      const item: QueuedTopUp = {
        ...topup,
        type: "topup",
        id: generateId(),
        createdAt: new Date().toISOString(),
        status: "pending",
        failCount: 0,
      };
      const q = [...topUpQueueRef.current, item];
      topUpQueueRef.current = q;
      setTopUpQueue([...q]);
      await dbSaveTopUpItem(item);
    },
    []
  );

  const syncNow = useCallback(async () => {
    const eligibleCharges = queueRef.current.filter(
      (t) => t.status === "pending" || t.status === "failed"
    );
    const eligibleTopUps = topUpQueueRef.current.filter(
      (t) => t.status === "pending" || t.status === "failed"
    );

    if (eligibleCharges.length === 0 && eligibleTopUps.length === 0) return;
    setIsSyncing(true);

    // Mark all eligible items as syncing
    let q = queueRef.current.map((t) =>
      t.status === "pending" || t.status === "failed"
        ? { ...t, status: "syncing" as const }
        : t
    );
    let tq = topUpQueueRef.current.map((t) =>
      t.status === "pending" || t.status === "failed"
        ? { ...t, status: "syncing" as const }
        : t
    );
    queueRef.current = q;
    setQueue([...q]);
    await dbReplaceChargeQueue(q);
    topUpQueueRef.current = tq;
    setTopUpQueue([...tq]);
    await dbReplaceTopUpQueue(tq);

    // Build a globally sorted list across both item types: by nfcUid, then counter
    const allItems: QueuedItem[] = [
      ...eligibleCharges.map((t) => ({ ...t, status: "syncing" as const })),
      ...eligibleTopUps.map((t) => ({ ...t, status: "syncing" as const })),
    ].sort((a, b) => {
      const uidCmp = a.nfcUid.localeCompare(b.nfcUid);
      if (uidCmp !== 0) return uidCmp;
      return getCounterForItem(a) - getCounterForItem(b);
    });

    let anySuccess = false;
    let anyError = false;
    let hasNetworkError = false;
    let syncedSpend = 0;

    // Dispatch each item in global counter order (one at a time to preserve ordering)
    for (const item of allItems) {
      if (item.type === "charge") {
        // Charges go via syncTransactions (batch of one to maintain order)
        try {
          const result = await syncTransactions({
            transactions: [
              {
                idempotencyKey: item.id,
                nfcUid: item.nfcUid,
                locationId: item.locationId,
                newBalance: item.newBalance,
                counter: item.counter,
                lineItems: item.lineItems.map((li) => ({
                  productId: li.productId,
                  quantity: li.quantity,
                })),
                ...(item.tipAmountCop ? { tipAmountCop: item.tipAmountCop } : {}),
                offlineCreatedAt: item.createdAt,
                ...(item.hmac ? { hmac: item.hmac } : {}),
              },
            ],
          });

          const typedResult = result as TopUpSyncResult;
          const syncResult = (typedResult.results ?? []).find(
            (r) => r.idempotencyKey === item.id
          );

          const failReason = syncResult?.error ?? "";
          const r = failReason.toLowerCase();
          const isPermanentRejection =
            r.includes("flagged") ||
            r.includes("counter replay") ||
            (r.includes("insufficient") && r.includes("balance"));
          if (!syncResult || syncResult.status === "created" || syncResult.status === "duplicate" || isPermanentRejection) {
            q = queueRef.current.filter((t) => t.id !== item.id);
            queueRef.current = q;
            setQueue([...q]);
            await dbDeleteChargeItem(item.id);
            if (!isPermanentRejection) syncedSpend += item.grossAmountCop + (item.tipAmountCop ?? 0);
          } else {
            const updated = queueRef.current.map((t) =>
              t.id === item.id
                ? {
                    ...t,
                    status: "failed" as const,
                    failCount: t.failCount + 1,
                    failReason: failReason || "Unknown error",
                  }
                : t
            );
            q = updated;
            queueRef.current = q;
            setQueue([...q]);
            const updatedItem = q.find((t) => t.id === item.id);
            if (updatedItem) await dbUpdateChargeItem(updatedItem);
            anyError = true;
          }
          anySuccess = true;
        } catch (err: unknown) {
          anyError = true;
          const httpErr = err as { status?: number };
          if (!httpErr.status) hasNetworkError = true;
          const msg = err instanceof Error ? err.message : "Network error";
          const updated = queueRef.current.map((t) =>
            t.id === item.id
              ? {
                  ...t,
                  status: "pending" as const,
                  failCount: t.failCount + 1,
                  failReason: msg,
                }
              : t
          );
          q = updated;
          queueRef.current = q;
          setQueue([...q]);
          const updatedItem = q.find((t) => t.id === item.id);
          if (updatedItem) await dbUpdateChargeItem(updatedItem);
        }
      } else {
        // Top-ups go via the offline sync endpoint
        try {
          await customFetch("/api/topups/sync", {
            method: "POST",
            body: JSON.stringify({
              id: item.id,
              nfcUid: item.nfcUid,
              amountCop: item.amountCop,
              paymentMethod: item.paymentMethod,
              newBalance: item.newBalance,
              newCounter: item.newCounter,
              offlineCreatedAt: item.createdAt,
              ...(item.hmac ? { hmac: item.hmac } : {}),
            }),
          });
          tq = topUpQueueRef.current.filter((t) => t.id !== item.id);
          topUpQueueRef.current = tq;
          setTopUpQueue([...tq]);
          await dbDeleteTopUpItem(item.id);
          anySuccess = true;
        } catch (err: unknown) {
          const httpErr = err as { status?: number; data?: { error?: string } };
          const msg = err instanceof Error ? err.message : "Network error";
          const reason = (httpErr.data?.error ?? msg).toLowerCase();
          const isTopUpPermanent =
            reason.includes("flagged") ||
            reason.includes("counter replay") ||
            (reason.includes("insufficient") && reason.includes("balance"));
          if (httpErr.status === 409 || isTopUpPermanent) {
            // Duplicate or permanent rejection — auto-dismiss silently
            tq = topUpQueueRef.current.filter((t) => t.id !== item.id);
            topUpQueueRef.current = tq;
            setTopUpQueue([...tq]);
            await dbDeleteTopUpItem(item.id);
            anySuccess = true;
          } else {
            anyError = true;
            if (!httpErr.status) hasNetworkError = true;
            const updated = topUpQueueRef.current.map((t) =>
              t.id === item.id
                ? {
                    ...t,
                    status: "failed" as const,
                    failCount: t.failCount + 1,
                    failReason: reason,
                  }
                : t
            );
            tq = updated;
            topUpQueueRef.current = tq;
            setTopUpQueue([...tq]);
            const updatedItem = tq.find((t) => t.id === item.id);
            if (updatedItem) await dbUpdateTopUpItem(updatedItem);
          }
        }
      }
    }

    // Reduce unsynced spend by what was successfully synced
    if (syncedSpend > 0) {
      const newSpend = Math.max(0, unsyncedSpendRef.current - syncedSpend);
      await updateUnsyncedSpend(newSpend);
    }

    if (anySuccess || (anyError && !hasNetworkError)) {
      setIsOnline(true);
    } else if (hasNetworkError && !anySuccess) {
      setIsOnline(false);
    }

    setIsSyncing(false);
  }, [updateUnsyncedSpend]);

  useEffect(() => {
    const interval = setInterval(syncNow, SYNC_INTERVAL);
    return () => clearInterval(interval);
  }, [syncNow]);

  const dismissFailedItem = useCallback(
    async (id: string, itemType: "charge" | "topup") => {
      if (itemType === "charge") {
        const item = queueRef.current.find((t) => t.id === id);
        const updated = queueRef.current.filter((t) => t.id !== id);
        queueRef.current = updated;
        setQueue([...updated]);
        await dbDeleteChargeItem(id);
        // Reduce unsynced spend when dismissing a failed item
        if (item) {
          const newSpend = Math.max(0, unsyncedSpendRef.current - (item.grossAmountCop + (item.tipAmountCop ?? 0)));
          await updateUnsyncedSpend(newSpend);
        }
      } else {
        const updated = topUpQueueRef.current.filter((t) => t.id !== id);
        topUpQueueRef.current = updated;
        setTopUpQueue([...updated]);
        await dbDeleteTopUpItem(id);
      }
    },
    [updateUnsyncedSpend]
  );

  const pendingCount =
    queue.filter((t) => t.status === "pending" || t.status === "syncing").length +
    topUpQueue.filter((t) => t.status === "pending" || t.status === "syncing").length;

  const allFailedItems: QueuedItem[] = [
    ...queue.filter((t) => t.status === "failed"),
    ...topUpQueue.filter((t) => t.status === "failed"),
  ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const isOfflineLimitReached = unsyncedSpendCop >= offlineSyncLimit;

  return (
    <OfflineQueueContext.Provider
      value={{
        queue,
        topUpQueue,
        allFailedItems,
        isOnline,
        isSyncing,
        enqueue,
        enqueueTopUp,
        syncNow,
        dismissFailedItem,
        pendingCount,
        cachedHmacSecret,
        offlineSyncLimit,
        unsyncedSpendCop,
        isOfflineLimitReached,
        updateCachedHmacSecret,
        updateOfflineLimits,
        clearCachedHmacSecret,
      }}
    >
      {children}
    </OfflineQueueContext.Provider>
  );
}

export function useOfflineQueue(): OfflineQueueContextValue {
  const ctx = useContext(OfflineQueueContext);
  if (!ctx) throw new Error("useOfflineQueue must be used within OfflineQueueProvider");
  return ctx;
}
