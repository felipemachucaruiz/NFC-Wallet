import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { API_BASE_URL } from "@/constants/domain";
import { useAuth } from "@/contexts/AuthContext";
import { fetchWithTimeout } from "@/utils/fetchWithTimeout";

function useAuthHeaders(): Record<string, string> {
  const { token } = useAuth();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Shared request helper used by all query and mutation functions.
 * On a 401 response it calls handleUnauthorized() to attempt a silent token
 * refresh, then retries the original request once with the new token.
 * If the refresh also fails the request throws so React Query surfaces the
 * error, and the session-expired overlay (rendered by _layout.tsx) is shown
 * because handleUnauthorized() sets sessionExpired=true.
 */
function useApiFetch() {
  const { handleUnauthorized } = useAuth();

  return async function apiFetch<T>(
    url: string,
    headers: Record<string, string>,
    options?: RequestInit,
  ): Promise<T> {
    const res = await fetchWithTimeout(url, {
      ...options,
      headers: { ...headers, "Content-Type": "application/json", ...options?.headers },
      cache: "no-store",
    });

    if (res.status === 401) {
      const newToken = await handleUnauthorized();
      if (newToken) {
        const retryRes = await fetchWithTimeout(url, {
          ...options,
          headers: {
            ...headers,
            "Content-Type": "application/json",
            ...options?.headers,
            Authorization: `Bearer ${newToken}`,
          },
          cache: "no-store",
        });
        if (!retryRes.ok) {
          const body = await retryRes.json().catch(() => ({}));
          const msg = (body as { error?: string }).error || retryRes.statusText || `HTTP ${retryRes.status}`;
          throw new Error(msg);
        }
        return retryRes.json() as Promise<T>;
      }
      throw new Error("Sesión expirada");
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg = (body as { error?: string }).error || res.statusText || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return res.json() as Promise<T>;
  };
}

export function useMyBracelets() {
  const headers = useAuthHeaders();
  const apiFetch = useApiFetch();
  return useQuery({
    queryKey: ["attendee", "bracelets"],
    queryFn: () => apiFetch(`${API_BASE_URL}/api/attendee/me/bracelets`, headers),
    enabled: !!headers.Authorization,
    staleTime: 30_000,
  });
}

export function useMyTransactions(cursor?: string) {
  const headers = useAuthHeaders();
  const apiFetch = useApiFetch();
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
  const apiFetch = useApiFetch();
  return useQuery({
    queryKey: ["attendee", "refundRequests"],
    queryFn: () => apiFetch(`${API_BASE_URL}/api/attendee/me/refund-requests`, headers),
    enabled: !!headers.Authorization,
  });
}

export function useBlockBracelet() {
  const headers = useAuthHeaders();
  const apiFetch = useApiFetch();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ uid, reason }: { uid: string; reason?: string }) =>
      apiFetch(`${API_BASE_URL}/api/attendee/me/bracelets/${uid}/block`, headers, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["attendee", "bracelets"] });
    },
  });
}

export function useUnlinkBracelet() {
  const headers = useAuthHeaders();
  const apiFetch = useApiFetch();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ uid }: { uid: string }) =>
      apiFetch<{ success: boolean; uid: string; balance: number }>(
        `${API_BASE_URL}/api/attendee/me/bracelets/${encodeURIComponent(uid)}`,
        headers,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["attendee", "bracelets"] });
    },
  });
}

export function useSubmitRefundRequest() {
  const headers = useAuthHeaders();
  const apiFetch = useApiFetch();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      braceletUid: string;
      refundMethod: "cash" | "nequi" | "bancolombia" | "bank_transfer" | "other";
      accountDetails?: string;
      notes?: string;
    }) =>
      apiFetch(`${API_BASE_URL}/api/attendee/me/refund-request`, headers, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["attendee", "refundRequests"] });
      void queryClient.invalidateQueries({ queryKey: ["attendee", "bracelets"] });
    },
  });
}

export function useLinkBracelet() {
  const headers = useAuthHeaders();
  const apiFetch = useApiFetch();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ uid, attendeeName }: { uid: string; attendeeName?: string }) =>
      apiFetch<{ uid: string; balance: number; attendeeName?: string | null }>(
        `${API_BASE_URL}/api/attendee/me/bracelets/link`,
        headers,
        { method: "POST", body: JSON.stringify({ uid, attendeeName }) },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["attendee", "bracelets"] });
    },
    onError: (err) => {
      console.error("[Tapee] bracelet link error:", err);
    },
  });
}

export function useInitiateTopUp() {
  const headers = useAuthHeaders();
  const apiFetch = useApiFetch();
  return useMutation({
    mutationFn: (data: {
      braceletUid?: string;
      amount: number;
      paymentMethod: "nequi" | "pse" | "card" | "bancolombia_transfer" | "daviplata" | "puntoscolombia";
      phoneNumber?: string;
      bankCode?: string;
      pseUserType?: 0 | 1;
      pseEmail?: string;
      userLegalIdType?: string;
      userLegalId?: string;
      cardToken?: string;
      savedCardId?: string;
      installments?: number;
      browserInfo?: {
        browser_color_depth: string;
        browser_screen_height: string;
        browser_screen_width: string;
        browser_language: string;
        browser_user_agent: string;
        browser_tz: string;
      };
    }) =>
      apiFetch<{ intentId: string; status: string; purposeType?: string; redirectUrl?: string | null }>(
        `${API_BASE_URL}/api/payments/initiate`,
        headers,
        { method: "POST", body: JSON.stringify(data) },
      ),
  });
}

export function usePendingWalletBalance() {
  const headers = useAuthHeaders();
  const apiFetch = useApiFetch();
  return useQuery({
    queryKey: ["wallet", "pending"],
    queryFn: () =>
      apiFetch<{ pendingWalletBalance: number }>(`${API_BASE_URL}/api/user/wallet`, headers),
    staleTime: 30_000,
  });
}

export function usePaymentStatus(intentId: string) {
  const headers = useAuthHeaders();
  const apiFetch = useApiFetch();
  return useQuery({
    queryKey: ["payment", "status", intentId],
    queryFn: () => apiFetch<{ status: string }>(`${API_BASE_URL}/api/payments/${intentId}/status`, headers),
    enabled: !!intentId && !!headers.Authorization,
    refetchInterval: false,
  });
}

export function useRegisterPushToken() {
  const headers = useAuthHeaders();
  const apiFetch = useApiFetch();
  return useMutation({
    mutationFn: (token: string) =>
      apiFetch(`${API_BASE_URL}/api/attendee/me/push-token`, headers, {
        method: "POST",
        body: JSON.stringify({ token }),
      }).catch(() => null),
  });
}

export type PseBank = { financial_institution_code: string; financial_institution_name: string };

export function usePseBanks() {
  const headers = useAuthHeaders();
  const apiFetch = useApiFetch();
  return useQuery<PseBank[]>({
    queryKey: ["pse", "banks"],
    queryFn: () => apiFetch<{ data: PseBank[] }>(`${API_BASE_URL}/api/payments/pse/banks`, headers).then((r) => r.data),
    enabled: !!headers.Authorization,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 2,
  });
}


export function useUpdateProfile() {
  const headers = useAuthHeaders();
  const apiFetch = useApiFetch();
  return useMutation({
    mutationFn: (data: {
      firstName?: string;
      lastName?: string;
      phone?: string | null;
      dateOfBirth?: string | null;
      sex?: string | null;
      idDocument?: string | null;
    }) =>
      apiFetch<{ user: Record<string, unknown> }>(`${API_BASE_URL}/api/auth/profile`, headers, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
  });
}

export type SavedCard = {
  id: string;
  brand: string;
  lastFour: string;
  cardHolderName: string;
  expiryMonth: string;
  expiryYear: string;
  alias: string | null;
  createdAt: string;
};

export function useSavedCards() {
  const headers = useAuthHeaders();
  const apiFetch = useApiFetch();
  return useQuery<{ cards: SavedCard[] }>({
    queryKey: ["savedCards"],
    queryFn: () => apiFetch(`${API_BASE_URL}/api/cards`, headers),
    enabled: !!headers.Authorization,
    staleTime: 30_000,
  });
}

export function useSaveCard() {
  const headers = useAuthHeaders();
  const apiFetch = useApiFetch();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      wompiToken: string;
      brand: string;
      lastFour: string;
      cardHolderName: string;
      expiryMonth: string;
      expiryYear: string;
      alias?: string;
    }) =>
      apiFetch<{ card: SavedCard }>(`${API_BASE_URL}/api/cards`, headers, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["savedCards"] });
    },
  });
}

export function useUpdateCardAlias() {
  const headers = useAuthHeaders();
  const apiFetch = useApiFetch();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, alias }: { id: string; alias: string | null }) =>
      apiFetch<{ card: Partial<SavedCard> }>(`${API_BASE_URL}/api/cards/${id}`, headers, {
        method: "PATCH",
        body: JSON.stringify({ alias }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["savedCards"] });
    },
  });
}

export function useClaimWalletBalance() {
  const headers = useAuthHeaders();
  const apiFetch = useApiFetch();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (uid: string) =>
      apiFetch<{ transferred: number }>(
        `${API_BASE_URL}/api/attendee/me/bracelets/${encodeURIComponent(uid)}/claim-wallet-balance`,
        headers,
        { method: "POST" },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["wallet", "pending"] });
      void queryClient.invalidateQueries({ queryKey: ["attendee", "bracelets"] });
    },
  });
}

export function useDeleteCard() {
  const headers = useAuthHeaders();
  const apiFetch = useApiFetch();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean }>(`${API_BASE_URL}/api/cards/${id}`, headers, {
        method: "DELETE",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["savedCards"] });
    },
  });
}

export function useDeleteAccount() {
  const headers = useAuthHeaders();
  const apiFetch = useApiFetch();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ success: boolean }>(`${API_BASE_URL}/api/attendee/me`, headers, {
        method: "DELETE",
      }),
  });
}
