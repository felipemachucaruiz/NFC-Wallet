import { useListLocations, useGetEvent } from "@workspace/api-client-react";
import type { InventoryMode } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";

type Location = { id: string; eventId: string };

export function useInventoryMode(): { inventoryMode: InventoryMode; isLoading: boolean } {
  const { user } = useAuth();

  const eventIdFromUser = user?.eventId ?? null;
  const isMerchantUser = user?.role === "merchant_admin" || user?.role === "merchant_staff";

  const { data: locData, isLoading: locLoading } = useListLocations(
    {},
    {
      query: {
        enabled: !eventIdFromUser && isMerchantUser,
        queryKey: ["locations-for-inventory-mode"],
      },
    }
  );

  const locations = (locData as { locations?: Location[] } | undefined)?.locations ?? [];
  const eventIdFromLocations = locations[0]?.eventId ?? null;

  const eventId = eventIdFromUser ?? eventIdFromLocations;

  const { data: eventData, isLoading: eventLoading } = useGetEvent(
    eventId ?? "",
    {
      query: {
        enabled: !!eventId,
        queryKey: ["event-inventory-mode", eventId],
      },
    }
  );

  const event = eventData as { inventoryMode?: InventoryMode } | undefined;
  const inventoryMode: InventoryMode = event?.inventoryMode ?? "location_based";

  return {
    inventoryMode,
    isLoading: locLoading || eventLoading,
  };
}
