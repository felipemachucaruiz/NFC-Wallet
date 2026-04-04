import React, { createContext, useContext } from "react";
import { useGetEvent } from "@workspace/api-client-react";
import type { InventoryMode } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";

export type NfcChipType = "ntag_21x" | "mifare_classic" | "desfire_ev3" | "mifare_ultralight_c";

interface EventContextValue {
  inventoryMode: InventoryMode;
  nfcChipType: NfcChipType;
  allowedNfcTypes: NfcChipType[];
  isLoading: boolean;
  refetch: () => void;
}

const EventContext = createContext<EventContextValue>({
  inventoryMode: "location_based",
  nfcChipType: "ntag_21x",
  allowedNfcTypes: ["ntag_21x"],
  isLoading: false,
  refetch: () => {},
});

export function EventProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  const { data: eventData, isLoading, refetch } = useGetEvent(
    user?.eventId ?? "",
    { query: { enabled: !!user?.eventId, queryKey: ["event-context", user?.eventId] } },
  );

  const event = eventData as { inventoryMode?: InventoryMode; nfcChipType?: NfcChipType; allowedNfcTypes?: NfcChipType[] } | undefined;
  const inventoryMode: InventoryMode = event?.inventoryMode ?? "location_based";
  const nfcChipType: NfcChipType = event?.nfcChipType ?? "ntag_21x";
  const allowedNfcTypes: NfcChipType[] = event?.allowedNfcTypes ?? [nfcChipType];

  return (
    <EventContext.Provider value={{ inventoryMode, nfcChipType, allowedNfcTypes, isLoading, refetch }}>
      {children}
    </EventContext.Provider>
  );
}

export function useEventContext() {
  return useContext(EventContext);
}
