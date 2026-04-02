import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ATTENDEE_API_BASE_URL, API_BASE_URL } from "@/constants/domain";
import { useAuth } from "@/contexts/AuthContext";
import { pinnedFetch } from "@/utils/pinnedFetch";

function useAuthHeaders() {
  const { token } = useAuth();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch<T>(url: string, headers: Record<string, string>): Promise<T> {
  const res = await pinnedFetch(url, { headers: { ...headers, "Content-Type": "application/json" } });
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
    queryFn: () => apiFetch(`${ATTENDEE_API_BASE_URL}/api/attendee/me/bracelets`, headers),
    enabled: !!headers.Authorization,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}

export function useMyTransactions(cursor?: string) {
  const headers = useAuthHeaders();
  const url = cursor
    ? `${ATTENDEE_API_BASE_URL}/api/attendee/me/transactions?cursor=${encodeURIComponent(cursor)}`
    : `${ATTENDEE_API_BASE_URL}/api/attendee/me/transactions`;
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
    queryFn: () => apiFetch(`${ATTENDEE_API_BASE_URL}/api/attendee/me/refund-requests`, headers),
    enabled: !!headers.Authorization,
  });
}

export function useBlockBracelet() {
  const headers = useAuthHeaders();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ uid, reason }: { uid: string; reason?: string }) => {
      const res = await pinnedFetch(`${ATTENDEE_API_BASE_URL}/api/attendee/me/bracelets/${uid}/block`, {
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
      const res = await pinnedFetch(`${ATTENDEE_API_BASE_URL}/api/attendee/me/refund-request`, {
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
    mutationFn: async ({ uid, attendeeUserId }: { uid: string; attendeeUserId: string }) => {
      const res = await pinnedFetch(`${API_BASE_URL}/api/bank/bracelets/${uid}/link`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ attendeeUserId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? res.statusText);
      }
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["attendee", "bracelets"] });
      void queryClient.invalidateQueries({ queryKey: ["bank"] });
    },
  });
}

export function useBankRefundRequests() {
  const headers = useAuthHeaders();
  return useQuery({
    queryKey: ["bank", "attendeeRefundRequests"],
    queryFn: () => apiFetch(`${API_BASE_URL}/api/bank/attendee-refund-requests`, headers),
    enabled: !!headers.Authorization,
  });
}

export function useProcessRefundRequest() {
  const headers = useAuthHeaders();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: "approved" | "rejected"; notes?: string }) => {
      const res = await pinnedFetch(`${API_BASE_URL}/api/bank/attendee-refund-requests/${id}/process`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ status, notes }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? res.statusText);
      }
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["bank", "attendeeRefundRequests"] });
    },
  });
}

export function useConfirmChipZero() {
  const headers = useAuthHeaders();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await pinnedFetch(`${API_BASE_URL}/api/bank/attendee-refund-requests/${id}/confirm-chip-zero`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? res.statusText);
      }
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["bank", "attendeeRefundRequests"] });
    },
  });
}

export function useTransferBalance() {
  const headers = useAuthHeaders();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ oldUid, newUid }: { oldUid: string; newUid: string }) => {
      const res = await pinnedFetch(`${API_BASE_URL}/api/bank/bracelets/transfer-balance`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ oldUid, newUid }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? res.statusText);
      }
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["bank"] });
    },
  });
}

export function useLinkAndTransfer() {
  const headers = useAuthHeaders();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ oldUid, newUid }: { oldUid: string; newUid: string }) => {
      const res = await pinnedFetch(`${API_BASE_URL}/api/bank/bracelets/link-and-transfer`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ oldUid, newUid }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? res.statusText);
      }
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["bank"] });
      void queryClient.invalidateQueries({ queryKey: ["attendee", "bracelets"] });
    },
  });
}
