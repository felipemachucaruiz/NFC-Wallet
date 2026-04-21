import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL } from "@/constants/domain";
import { useAuth } from "@/contexts/AuthContext";

export interface BannedBracelet {
  nfcUid: string;
  flagReason: string | null;
  attendeeName: string | null;
  updatedAt: string;
}

interface BannedBraceletsContextValue {
  bannedUids: Set<string>;
  getBannedInfo: (uid: string) => BannedBracelet | undefined;
  isLoading: boolean;
  refresh: () => Promise<void>;
  lastRefreshedAt: number | null;
}

const BannedBraceletsContext = createContext<BannedBraceletsContextValue | null>(null);

function cacheKey(eventId: string) {
  return `tapee_banned_bracelets_${eventId}`;
}

export function BannedBraceletsProvider({ children }: { children: React.ReactNode }) {
  const { user, token } = useAuth();
  const [banned, setBanned] = useState<BannedBracelet[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const fetchFromServer = useCallback(async (eventId: string, authToken: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/bracelets/banned?eventId=${encodeURIComponent(eventId)}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) return;
      const body = await res.json() as { banned: BannedBracelet[] };
      if (!isMounted.current) return;
      setBanned(body.banned);
      setLastRefreshedAt(Date.now());
      await AsyncStorage.setItem(cacheKey(eventId), JSON.stringify(body.banned));
    } catch {}
  }, []);

  const loadFromCache = useCallback(async (eventId: string) => {
    try {
      const raw = await AsyncStorage.getItem(cacheKey(eventId));
      if (raw) {
        const parsed = JSON.parse(raw) as BannedBracelet[];
        if (isMounted.current) setBanned(parsed);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (user?.role !== "gate" || !user?.eventId || !token) {
      setBanned([]);
      return;
    }
    const eventId = user.eventId;
    setIsLoading(true);
    loadFromCache(eventId)
      .then(() => fetchFromServer(eventId, token))
      .finally(() => { if (isMounted.current) setIsLoading(false); });
  }, [user?.role, user?.eventId, token]);

  const refresh = useCallback(async () => {
    if (user?.role !== "gate" || !user?.eventId || !token) return;
    setIsLoading(true);
    await fetchFromServer(user.eventId, token);
    if (isMounted.current) setIsLoading(false);
  }, [user?.role, user?.eventId, token, fetchFromServer]);

  const bannedUids = useMemo(() => new Set(banned.map((b) => b.nfcUid)), [banned]);

  const getBannedInfo = useCallback(
    (uid: string) => banned.find((b) => b.nfcUid === uid),
    [banned]
  );

  const contextValue = useMemo(
    () => ({ bannedUids, getBannedInfo, isLoading, refresh, lastRefreshedAt }),
    [bannedUids, getBannedInfo, isLoading, refresh, lastRefreshedAt]
  );

  return (
    <BannedBraceletsContext.Provider value={contextValue}>
      {children}
    </BannedBraceletsContext.Provider>
  );
}

export function useBannedBracelets(): BannedBraceletsContextValue {
  const ctx = useContext(BannedBraceletsContext);
  if (!ctx) throw new Error("useBannedBracelets must be used within BannedBraceletsProvider");
  return ctx;
}
