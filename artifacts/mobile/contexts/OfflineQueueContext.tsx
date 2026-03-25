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
import { generateId } from "@/utils/hmac";

const QUEUE_KEY = "@offline_queue";
const SYNC_INTERVAL = 30_000;

export interface QueuedTransaction {
  id: string;
  locationId: string;
  braceletUid: string;
  totalCop: number;
  newBalance: number;
  newCounter: number;
  newHmac: string;
  lineItems: Array<{
    productId: string;
    quantity: number;
    unitPriceCop: number;
    unitCostCop: number;
  }>;
  createdAt: string;
  status: "pending" | "syncing" | "failed";
  failCount: number;
}

interface OfflineQueueContextValue {
  queue: QueuedTransaction[];
  isOnline: boolean;
  isSyncing: boolean;
  enqueue: (tx: Omit<QueuedTransaction, "id" | "createdAt" | "status" | "failCount">) => Promise<void>;
  syncNow: () => Promise<void>;
  pendingCount: number;
}

const OfflineQueueContext = createContext<OfflineQueueContextValue | null>(null);

async function loadQueue(): Promise<QueuedTransaction[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveQueue(q: QueuedTransaction[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {}
}

export function OfflineQueueProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<QueuedTransaction[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const queueRef = useRef<QueuedTransaction[]>([]);

  useEffect(() => {
    loadQueue().then((q) => {
      queueRef.current = q;
      setQueue(q);
    });
  }, []);

  const updateQueue = useCallback(async (q: QueuedTransaction[]) => {
    queueRef.current = q;
    setQueue([...q]);
    await saveQueue(q);
  }, []);

  const enqueue = useCallback(
    async (tx: Omit<QueuedTransaction, "id" | "createdAt" | "status" | "failCount">) => {
      const item: QueuedTransaction = {
        ...tx,
        id: generateId(),
        createdAt: new Date().toISOString(),
        status: "pending",
        failCount: 0,
      };
      const q = [...queueRef.current, item];
      await updateQueue(q);
    },
    [updateQueue]
  );

  const syncNow = useCallback(async () => {
    const pending = queueRef.current.filter((t) => t.status === "pending");
    if (pending.length === 0) return;
    setIsSyncing(true);

    let q = [...queueRef.current];
    q = q.map((t) =>
      t.status === "pending" ? { ...t, status: "syncing" as const } : t
    );
    await updateQueue(q);

    try {
      await syncTransactions({
        transactions: pending.map((t) => ({
          localId: t.id,
          locationId: t.locationId,
          braceletUid: t.braceletUid,
          totalAmountCop: t.totalCop,
          newBalance: t.newBalance,
          newCounter: t.newCounter,
          newHmac: t.newHmac,
          lineItems: t.lineItems.map((li) => ({
            productId: li.productId,
            quantity: li.quantity,
            unitPriceCop: li.unitPriceCop,
            unitCostCop: li.unitCostCop,
          })),
          occurredAt: t.createdAt,
        })),
      });
      q = queueRef.current.filter((t) => !pending.find((p) => p.id === t.id));
      await updateQueue(q);
      setIsOnline(true);
    } catch {
      setIsOnline(false);
      q = queueRef.current.map((t) => {
        if (t.status === "syncing") {
          return {
            ...t,
            status: "pending" as const,
            failCount: t.failCount + 1,
          };
        }
        return t;
      });
      await updateQueue(q);
    } finally {
      setIsSyncing(false);
    }
  }, [updateQueue]);

  useEffect(() => {
    const interval = setInterval(syncNow, SYNC_INTERVAL);
    return () => clearInterval(interval);
  }, [syncNow]);

  const pendingCount = queue.filter((t) => t.status === "pending").length;

  return (
    <OfflineQueueContext.Provider
      value={{ queue, isOnline, isSyncing, enqueue, syncNow, pendingCount }}
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
