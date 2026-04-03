import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { API_BASE_URL } from "@/constants/domain";
import { useAuth } from "@/contexts/AuthContext";
import { pinnedFetch } from "@/utils/pinnedFetch";

function useAuthHeaders() {
  const { token } = useAuth();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch<T>(url: string, headers: Record<string, string>): Promise<T> {
  const res = await pinnedFetch(url, {
    headers: { ...headers, "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export function useMyBracelets() {
  const headers = useAuthHeaders();
  return useQuery({
    queryKey: ["attendee", "bracelets"],
    queryFn: () => apiFetch(`${API_BASE_URL}/api/attendee/me/bracelets`, headers),
    enabled: !!headers.Authorization,
    staleTime: 30_000,
  });
}

export function useMyTransactions(cursor?: string) {
  const headers = useAuthHeaders();
  const url = cursor
    ? `${API_BASE_URL}/api/attendee/me/transactions?cursor=${encodeURIComponent(cursor)}`
    : `${API_BASE_URL}/api/attendee/me/transactions`;
  return useQuery({
    queryKey: ["attendee", "transactions", cursor ?? "initial"],
    queryFn: () => apiFetch<{ transactions: unknown[]; nextCursor: string | null }>(url, headers),
    enabled: !!headers.Authorization,
  });
}

export function useMyRefundRequests() {
  const headers = useAuthHeaders();
  return useQuery({
    queryKey: ["attendee", "refundRequests"],
    queryFn: () => apiFetch(`${API_BASE_URL}/api/attendee/me/refund-requests`, headers),
    enabled: !!headers.Authorization,
  });
}

export function useBlockBracelet() {
  const headers = useAuthHeaders();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ uid, reason }: { uid: string; reason?: string }) => {
      const res = await pinnedFetch(`${API_BASE_URL}/api/attendee/me/bracelets/${uid}/block`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? res.statusText);
      }
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["attendee", "bracelets"] });
    },
  });
}

export function useSubmitRefundRequest() {
  const headers = useAuthHeaders();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      braceletUid: string;
      refundMethod: "cash" | "nequi" | "bancolombia" | "other";
      accountDetails?: string;
      notes?: string;
    }) => {
      const res = await pinnedFetch(`${API_BASE_URL}/api/attendee/me/refund-request`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? res.statusText);
      }
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["attendee", "refundRequests"] });
    },
  });
}

export function useLinkBracelet() {
  const headers = useAuthHeaders();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ uid, attendeeName }: { uid: string; attendeeName?: string }) => {
      const res = await pinnedFetch(`${API_BASE_URL}/api/attendee/me/bracelets/link`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ uid, attendeeName }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? res.statusText);
      }
      return res.json() as Promise<{ uid: string; balanceCop: number; attendeeName?: string | null }>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["attendee", "bracelets"] });
    },
  });
}

export function useInitiateTopUp() {
  const headers = useAuthHeaders();
  return useMutation({
    mutationFn: async (data: {
      braceletUid: string;
      amountCop: number;
      paymentMethod: "nequi" | "pse";
      phoneNumber?: string;
      bankCode?: string;
    }) => {
      const res = await pinnedFetch(`${API_BASE_URL}/api/payments/initiate`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? res.statusText);
      }
      return res.json() as Promise<{ intentId: string; status: string; redirectUrl?: string | null }>;
    },
  });
}

export function usePaymentStatus(intentId: string) {
  const headers = useAuthHeaders();
  return useQuery({
    queryKey: ["payment", "status", intentId],
    queryFn: () => apiFetch<{ status: string }>(`${API_BASE_URL}/api/payments/${intentId}/status`, headers),
    enabled: !!intentId && !!headers.Authorization,
    refetchInterval: false,
  });
}

export function useRegisterPushToken() {
  const headers = useAuthHeaders();
  return useMutation({
    mutationFn: async (token: string) => {
      const res = await pinnedFetch(`${API_BASE_URL}/api/attendee/me/push-token`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) return;
      return res.json();
    },
  });
}
