import React, { createContext, useContext, useMemo } from "react";
import { useGetEvent } from "@workspace/api-client-react";
import type { InventoryMode } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";

export type NfcChipType = "ntag_21x" | "mifare_classic" | "desfire_ev3" | "mifare_ultralight_c";

interface EventContextValue {
  eventId: string | null | undefined;
  inventoryMode: InventoryMode;
  nfcChipType: NfcChipType;
  allowedNfcTypes: NfcChipType[];
  isLoading: boolean;
  isEventEnded: boolean;
  eventName: string | null;
  eventEndsAt: string | null;
  currencyCode: string;
  refetch: () => void;
}

const EventContext = createContext<EventContextValue>({
  eventId: undefined,
  inventoryMode: "location_based",
  nfcChipType: "ntag_21x",
  allowedNfcTypes: ["ntag_21x"],
  isLoading: false,
  isEventEnded: false,
  eventName: null,
  eventEndsAt: null,
  currencyCode: "COP",
  refetch: () => {},
});

export function EventProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  const { data: eventData, isLoading, refetch } = useGetEvent(
    user?.eventId ?? "",
    { query: { enabled: !!user?.eventId, queryKey: ["event-context", user?.eventId] } },
  );

  const event = eventData as {
    inventoryMode?: InventoryMode;
    nfcChipType?: NfcChipType;
    allowedNfcTypes?: NfcChipType[];
    name?: string;
    endsAt?: string | null;
    active?: boolean;
    currencyCode?: string;
  } | undefined;

  const inventoryMode: InventoryMode = event?.inventoryMode ?? "location_based";
  const nfcChipType: NfcChipType = event?.nfcChipType ?? "ntag_21x";
  const eventName: string | null = event?.name ?? null;
  const eventEndsAt: string | null = event?.endsAt ?? null;
  const currencyCode: string = event?.currencyCode ?? "COP";
  const isEventEnded: boolean =
    !isLoading &&
    !!event &&
    (event.active === false || (!!eventEndsAt && new Date(eventEndsAt) < new Date()));

  // Normalize allowedNfcTypes: the column defaulted to ["ntag_21x"] for all existing events.
  // If nfcChipType is something else but allowedNfcTypes is still the default singleton,
  // the data is inconsistent — trust nfcChipType as the source of truth.
  const rawAllowedTypes = (event?.allowedNfcTypes ?? [nfcChipType]) as NfcChipType[];
  const allowedNfcTypes: NfcChipType[] =
    nfcChipType !== "ntag_21x" &&
    rawAllowedTypes.length === 1 &&
    rawAllowedTypes[0] === "ntag_21x"
      ? [nfcChipType]
      : rawAllowedTypes;

  const contextValue = useMemo(() => ({
    eventId: user?.eventId,
    inventoryMode,
    nfcChipType,
    allowedNfcTypes,
    isLoading,
    isEventEnded,
    eventName,
    eventEndsAt,
    currencyCode,
    refetch,
  }), [user?.eventId, inventoryMode, nfcChipType, allowedNfcTypes, isLoading, isEventEnded, eventName, eventEndsAt, currencyCode, refetch]);

  return (
    <EventContext.Provider value={contextValue}>
      {children}
    </EventContext.Provider>
  );
}

export function useEventContext() {
  return useContext(EventContext);
}
