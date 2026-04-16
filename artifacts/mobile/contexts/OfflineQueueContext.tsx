import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { syncTransactions } from "@workspace/api-client-react";
import { customFetch } from "@workspace/api-client-react";
import { generateId } from "@/utils/hmac";
import { cacheSigningKey, getCachedSigningKey } from "@/utils/signingKeyCache";
import { extractErrorMessage } from "@/utils/errorMessage";
import { useAttestationContext } from "@/contexts/AttestationContext";

const QUEUE_KEY = "@offline_queue";
const TOPUP_QUEUE_KEY = "@offline_topup_queue";
const UNSYNC_SPEND_KEY = "@unsync_spend_cop";
const SYNC_INTERVAL = 30_000;

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
    unitPrice: number;
    unitCost: number;
  }>;
  grossAmount: number;
  tipAmount?: number;
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
  amount: number;
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

export interface FailedItemEdit {
  newBalance?: number;
  grossAmount?: number;
  tipAmount?: number;
  amount?: number;
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
  retryFailedItem: (id: string, itemType: "charge" | "topup", edits: FailedItemEdit) => Promise<void>;
  pendingCount: number;
  cachedHmacSecret: string;
  offlineSyncLimit: number;
  unsyncedSpend: number;
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

async function loadQueue(): Promise<QueuedTransaction[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedTransaction[];
    return parsed.map((t) => ({ ...t, type: "charge" as const, grossAmount: t.grossAmount ?? 0 }));
  } catch {
    return [];
  }
}

async function saveQueue(q: QueuedTransaction[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {}
}

async function loadTopUpQueue(): Promise<QueuedTopUp[]> {
  try {
    const raw = await AsyncStorage.getItem(TOPUP_QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as QueuedTopUp[];
  } catch {
    return [];
  }
}

async function saveTopUpQueue(q: QueuedTopUp[]): Promise<void> {
  try {
    await AsyncStorage.setItem(TOPUP_QUEUE_KEY, JSON.stringify(q));
  } catch {}
}

async function loadUnsyncedSpend(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(UNSYNC_SPEND_KEY);
    return raw ? parseInt(raw, 10) : 0;
  } catch {
    return 0;
  }
}

async function saveUnsyncedSpend(amount: number): Promise<void> {
  try {
    await AsyncStorage.setItem(UNSYNC_SPEND_KEY, String(amount));
  } catch {}
}

export function OfflineQueueProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<QueuedTransaction[]>([]);
  const [topUpQueue, setTopUpQueue] = useState<QueuedTopUp[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [cachedHmacSecret, setCachedHmacSecret] = useState<string>("");
  const [offlineSyncLimit, setOfflineSyncLimit] = useState<number>(DEFAULT_OFFLINE_SYNC_LIMIT);
  const [unsyncedSpend, setUnsyncedSpendCop] = useState<number>(0);
  const queueRef = useRef<QueuedTransaction[]>([]);
  const topUpQueueRef = useRef<QueuedTopUp[]>([]);
  const unsyncedSpendRef = useRef<number>(0);

  const { retryAttestation } = useAttestationContext();
  const retryAttestationRef = useRef(retryAttestation);
  useEffect(() => { retryAttestationRef.current = retryAttestation; }, [retryAttestation]);

  useEffect(() => {
    loadQueue().then((q) => {
      queueRef.current = q;
      setQueue(q);
    });
    loadTopUpQueue().then((q) => {
      topUpQueueRef.current = q;
      setTopUpQueue(q);
    });
    getCachedSigningKey().then((key) => {
      if (key) setCachedHmacSecret(key);
    });
    loadUnsyncedSpend().then((amount) => {
      unsyncedSpendRef.current = amount;
      setUnsyncedSpendCop(amount);
    });
  }, []);

  const updateQueue = useCallback(async (q: QueuedTransaction[]) => {
    queueRef.current = q;
    setQueue([...q]);
    await saveQueue(q);
  }, []);

  const updateTopUpQueue = useCallback(async (q: QueuedTopUp[]) => {
    topUpQueueRef.current = q;
    setTopUpQueue([...q]);
    await saveTopUpQueue(q);
  }, []);

  const updateUnsyncedSpend = useCallback(async (amount: number) => {
    unsyncedSpendRef.current = amount;
    setUnsyncedSpendCop(amount);
    await saveUnsyncedSpend(amount);
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
      await updateQueue(q);
      // Accumulate unsynced spend using total charged amount (items + tip)
      const newSpend = unsyncedSpendRef.current + tx.grossAmount + (tx.tipAmount ?? 0);
      await updateUnsyncedSpend(newSpend);
    },
    [updateQueue, updateUnsyncedSpend]
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
      await updateTopUpQueue(q);
    },
    [updateTopUpQueue]
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
    await updateQueue(q);
    await updateTopUpQueue(tq);

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
                ...(item.tipAmount ? { tipAmount: item.tipAmount } : {}),
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
          // Permanent rejections the merchant cannot resolve — auto-dismiss silently:
          //   "flagged"           → bracelet quarantined by admin, already tracked server-side
          //   "counter replay"    → another device already synced a higher counter (offline race)
          //   "insufficient"      → double-spend from two offline devices, goods already given
          const isPermanentRejection =
            r.includes("flagged") ||
            r.includes("counter replay") ||
            (r.includes("insufficient") && r.includes("balance"));
          if (!syncResult || syncResult.status === "created" || syncResult.status === "duplicate" || isPermanentRejection) {
            q = queueRef.current.filter((t) => t.id !== item.id);
            if (!isPermanentRejection) syncedSpend += item.grossAmount + (item.tipAmount ?? 0);
          } else {
            q = queueRef.current.map((t) =>
              t.id === item.id
                ? {
                    ...t,
                    status: "failed" as const,
                    failCount: t.failCount + 1,
                    failReason: failReason || "Unknown error",
                  }
                : t
            );
            anyError = true;
          }
          await updateQueue(q);
          anySuccess = true;
        } catch (err: unknown) {
          const httpErr = err as { status?: number };
          // 403 attestation error → re-attest and retry once before giving up
          if (httpErr.status === 403) {
            try {
              await retryAttestationRef.current();
              await syncTransactions({
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
                    ...(item.tipAmount ? { tipAmount: item.tipAmount } : {}),
                    offlineCreatedAt: item.createdAt,
                    ...(item.hmac ? { hmac: item.hmac } : {}),
                  },
                ],
              });
              q = queueRef.current.filter((t) => t.id !== item.id);
              await updateQueue(q);
              anySuccess = true;
              continue;
            } catch {
              // fall through to normal error handling below
            }
          }
          anyError = true;
          if (!httpErr.status) hasNetworkError = true;
          const msg = extractErrorMessage(err, "Network error");
          q = queueRef.current.map((t) =>
            t.id === item.id
              ? {
                  ...t,
                  status: "pending" as const,
                  failCount: t.failCount + 1,
                  failReason: msg,
                }
              : t
          );
          await updateQueue(q);
        }
      } else {
        // Top-ups go via the offline sync endpoint
        try {
          await customFetch("/api/topups/sync", {
            method: "POST",
            body: JSON.stringify({
              id: item.id,
              nfcUid: item.nfcUid,
              amount: item.amount,
              paymentMethod: item.paymentMethod,
              newBalance: item.newBalance,
              newCounter: item.newCounter,
              offlineCreatedAt: item.createdAt,
              ...(item.hmac ? { hmac: item.hmac } : {}),
            }),
          });
          tq = topUpQueueRef.current.filter((t) => t.id !== item.id);
          await updateTopUpQueue(tq);
          anySuccess = true;
        } catch (err: unknown) {
          const httpErr = err as { status?: number; data?: { error?: string } };
          // 403 attestation error → re-attest and retry once before giving up
          if (httpErr.status === 403) {
            try {
              await retryAttestationRef.current();
              await customFetch("/api/topups/sync", {
                method: "POST",
                body: JSON.stringify({
                  id: item.id,
                  nfcUid: item.nfcUid,
                  amount: item.amount,
                  paymentMethod: item.paymentMethod,
                  newBalance: item.newBalance,
                  newCounter: item.newCounter,
                  offlineCreatedAt: item.createdAt,
                  ...(item.hmac ? { hmac: item.hmac } : {}),
                }),
              });
              tq = topUpQueueRef.current.filter((t) => t.id !== item.id);
              await updateTopUpQueue(tq);
              anySuccess = true;
              continue;
            } catch {
              // fall through to normal error handling below
            }
          }
          const msg = extractErrorMessage(err, "Network error");
          const reason = (httpErr.data?.error ?? msg).toLowerCase();
          const isTopUpPermanent =
            reason.includes("flagged") ||
            reason.includes("counter replay") ||
            (reason.includes("insufficient") && reason.includes("balance"));
          if (httpErr.status === 409 || isTopUpPermanent) {
            // Duplicate or permanent rejection — auto-dismiss silently
            tq = topUpQueueRef.current.filter((t) => t.id !== item.id);
            await updateTopUpQueue(tq);
            anySuccess = true;
          } else {
            anyError = true;
            if (!httpErr.status) hasNetworkError = true;
            tq = topUpQueueRef.current.map((t) =>
              t.id === item.id
                ? {
                    ...t,
                    status: "failed" as const,
                    failCount: t.failCount + 1,
                    failReason: reason,
                  }
                : t
            );
            await updateTopUpQueue(tq);
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
  }, [updateQueue, updateTopUpQueue, updateUnsyncedSpend]);

  useEffect(() => {
    const interval = setInterval(syncNow, SYNC_INTERVAL);
    return () => clearInterval(interval);
  }, [syncNow]);

  const dismissFailedItem = useCallback(
    async (id: string, itemType: "charge" | "topup") => {
      if (itemType === "charge") {
        const item = queueRef.current.find((t) => t.id === id);
        const updated = queueRef.current.filter((t) => t.id !== id);
        await updateQueue(updated);
        // Reduce unsynced spend when dismissing a failed item
        if (item) {
          const newSpend = Math.max(0, unsyncedSpendRef.current - (item.grossAmount + (item.tipAmount ?? 0)));
          await updateUnsyncedSpend(newSpend);
        }
      } else {
        const updated = topUpQueueRef.current.filter((t) => t.id !== id);
        await updateTopUpQueue(updated);
      }
    },
    [updateQueue, updateTopUpQueue, updateUnsyncedSpend]
  );

  /**
   * Applies edits to a failed item and re-queues it as pending so it will be
   * picked up on the next sync.  Also adjusts the unsynced-spend tracker when
   * a charge amount changes so the available-balance estimate stays accurate.
   */
  const retryFailedItem = useCallback(
    async (id: string, itemType: "charge" | "topup", edits: FailedItemEdit) => {
      if (itemType === "charge") {
        const item = queueRef.current.find((t) => t.id === id);
        if (!item) return;

        const oldSpend = item.grossAmount + (item.tipAmount ?? 0);
        const newGross = edits.grossAmount ?? item.grossAmount;
        const newTip = edits.tipAmount ?? item.tipAmount ?? 0;
        const newSpendDelta = (newGross + newTip) - oldSpend;

        const updated = queueRef.current.map((t) =>
          t.id === id
            ? {
                ...t,
                ...(edits.newBalance !== undefined ? { newBalance: edits.newBalance } : {}),
                ...(edits.grossAmount !== undefined ? { grossAmount: edits.grossAmount } : {}),
                ...(edits.tipAmount !== undefined ? { tipAmount: edits.tipAmount } : {}),
                status: "pending" as const,
                failCount: 0,
                failReason: undefined,
              }
            : t
        );
        await updateQueue(updated);

        if (newSpendDelta !== 0) {
          const newSpend = Math.max(0, unsyncedSpendRef.current + newSpendDelta);
          await updateUnsyncedSpend(newSpend);
        }
      } else {
        const item = topUpQueueRef.current.find((t) => t.id === id);
        if (!item) return;
        const updated = topUpQueueRef.current.map((t) =>
          t.id === id
            ? {
                ...t,
                ...(edits.amount !== undefined ? { amount: edits.amount } : {}),
                status: "pending" as const,
                failCount: 0,
                failReason: undefined,
              }
            : t
        );
        await updateTopUpQueue(updated);
      }
      // Trigger an immediate sync attempt
      void syncNow();
    },
    [updateQueue, updateTopUpQueue, updateUnsyncedSpend, syncNow]
  );

  const pendingCount =
    queue.filter((t) => t.status === "pending" || t.status === "syncing").length +
    topUpQueue.filter((t) => t.status === "pending" || t.status === "syncing").length;

  const allFailedItems: QueuedItem[] = [
    ...queue.filter((t) => t.status === "failed"),
    ...topUpQueue.filter((t) => t.status === "failed"),
  ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const isOfflineLimitReached = unsyncedSpend >= offlineSyncLimit;

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
        retryFailedItem,
        pendingCount,
        cachedHmacSecret,
        offlineSyncLimit,
        unsyncedSpend,
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
