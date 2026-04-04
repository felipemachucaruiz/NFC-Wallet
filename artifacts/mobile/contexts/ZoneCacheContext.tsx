import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL } from "@/constants/domain";
import { useAuth } from "@/contexts/AuthContext";

export interface AccessZone {
  id: string;
  eventId: string;
  name: string;
  colorHex: string;
  rank: number;
  upgradePriceCop: number | null;
  description?: string | null;
}

interface ZoneCacheContextValue {
  zones: AccessZone[];
  isLoading: boolean;
  refresh: () => Promise<void>;
  getZoneById: (id: string) => AccessZone | undefined;
  getZonesByIds: (ids: string[]) => AccessZone[];
}

const ZoneCacheContext = createContext<ZoneCacheContextValue | null>(null);

function cacheKey(eventId: string) {
  return `tapee_zones_${eventId}`;
}

export function ZoneCacheProvider({ children }: { children: React.ReactNode }) {
  const { user, token } = useAuth();
  const [zones, setZones] = useState<AccessZone[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const loadFromCache = useCallback(async (eventId: string) => {
    try {
      const raw = await AsyncStorage.getItem(cacheKey(eventId));
      if (raw) {
        const parsed = JSON.parse(raw) as AccessZone[];
        if (isMounted.current) setZones(parsed);
      }
    } catch {}
  }, []);

  const fetchFromServer = useCallback(async (eventId: string, t: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/access-zones?eventId=${eventId}`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (!res.ok) return;
      const body = await res.json() as { zones: AccessZone[] };
      if (!isMounted.current) return;
      setZones(body.zones);
      await AsyncStorage.setItem(cacheKey(eventId), JSON.stringify(body.zones));
    } catch {}
  }, []);

  useEffect(() => {
    if (!user?.eventId || !token) {
      setZones([]);
      return;
    }
    const eventId = user.eventId;

    // Load from cache immediately, then refresh in background
    setIsLoading(true);
    loadFromCache(eventId)
      .then(() => fetchFromServer(eventId, token))
      .finally(() => { if (isMounted.current) setIsLoading(false); });
  }, [user?.eventId, token]);

  const refresh = useCallback(async () => {
    if (!user?.eventId || !token) return;
    setIsLoading(true);
    await fetchFromServer(user.eventId, token);
    if (isMounted.current) setIsLoading(false);
  }, [user?.eventId, token, fetchFromServer]);

  const getZoneById = useCallback(
    (id: string) => zones.find((z) => z.id === id),
    [zones],
  );

  const getZonesByIds = useCallback(
    (ids: string[]) => zones.filter((z) => ids.includes(z.id)),
    [zones],
  );

  return (
    <ZoneCacheContext.Provider value={{ zones, isLoading, refresh, getZoneById, getZonesByIds }}>
      {children}
    </ZoneCacheContext.Provider>
  );
}

export function useZoneCache(): ZoneCacheContextValue {
  const ctx = useContext(ZoneCacheContext);
  if (!ctx) throw new Error("useZoneCache must be used within ZoneCacheProvider");
  return ctx;
}
