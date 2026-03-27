import { useAuth } from "@/contexts/AuthContext";

/**
 * Returns convenience flags derived from the authenticated user's merchantType.
 *
 * isExternal     — merchant manages its own inventory; skips all warehouse/restock flows
 * isEventManaged — merchant is wired into the event warehouse; respects event inventoryMode
 */
export function useMerchantType() {
  const { user } = useAuth();
  const merchantType = user?.merchantType ?? null;
  return {
    merchantType,
    isExternal: merchantType === "external",
    isEventManaged: merchantType === "event_managed" || merchantType === null,
  };
}
