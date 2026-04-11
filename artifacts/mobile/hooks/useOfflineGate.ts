import { useEffect, useRef, useState, useCallback } from "react";
import NetInfo from "@react-native-community/netinfo";
import { useAuth } from "@/contexts/AuthContext";
import {
  syncEventData,
  getOfflineEventData,
  syncCheckinQueue,
  getQueueCount,
  type OfflineEventData,
} from "@/utils/offlineTickets";

export function useOfflineGate() {
  const { token } = useAuth();
  const [isOnline, setIsOnline] = useState(true);
  const [eventData, setEventData] = useState<OfflineEventData | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncingRef = useRef(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(!!state.isConnected && !!state.isInternetReachable);
    });
    return () => unsubscribe();
  }, []);

  const doSync = useCallback(async () => {
    if (!token || syncingRef.current) return;
    syncingRef.current = true;
    setIsSyncing(true);
    try {
      await syncCheckinQueue(token);
      const data = await syncEventData(token);
      if (data) {
        setEventData(data);
        setLastSyncTime(data.syncedAt);
      }
      const count = await getQueueCount();
      setPendingCount(count);
    } catch {
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
    }
  }, [token]);

  useEffect(() => {
    (async () => {
      const cached = await getOfflineEventData();
      if (cached) {
        setEventData(cached);
        setLastSyncTime(cached.syncedAt);
      }
      const count = await getQueueCount();
      setPendingCount(count);
      if (token) {
        doSync();
      }
    })();
  }, [token]);

  useEffect(() => {
    if (isOnline && token) {
      doSync();
      syncIntervalRef.current = setInterval(doSync, 5 * 60 * 1000);
    }
    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
  }, [isOnline, token, doSync]);

  const refreshPendingCount = useCallback(async () => {
    const count = await getQueueCount();
    setPendingCount(count);
  }, []);

  const refreshEventData = useCallback(async () => {
    const cached = await getOfflineEventData();
    if (cached) setEventData(cached);
  }, []);

  return {
    isOnline,
    eventData,
    isSyncing,
    lastSyncTime,
    pendingCount,
    doSync,
    refreshPendingCount,
    refreshEventData,
  };
}
