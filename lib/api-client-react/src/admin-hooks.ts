import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

export interface AttendeeRefundRequest {
  id: string;
  attendeeUserId: string;
  braceletUid: string;
  eventId: string;
  amountCop: number;
  refundMethod: "cash" | "nequi" | "bancolombia" | "other";
  accountDetails: string | null;
  notes: string | null;
  status: "pending" | "approved" | "rejected";
  chipZeroed: boolean;
  processedByUserId: string | null;
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function useListRefundRequests(eventId: string | null, status?: string) {
  return useQuery({
    queryKey: ["refund-requests", eventId, status],
    queryFn: async () => {
      if (!eventId) return { refundRequests: [] as AttendeeRefundRequest[] };
      const url = status
        ? `/api/events/${eventId}/refund-requests?status=${status}`
        : `/api/events/${eventId}/refund-requests`;
      return customFetch<{ refundRequests: AttendeeRefundRequest[] }>(url);
    },
    enabled: !!eventId,
    staleTime: 30_000,
  });
}

export function useApproveRefundRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return customFetch<{ refundRequest: AttendeeRefundRequest }>(`/api/refund-requests/${id}/approve`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["refund-requests"] });
    },
  });
}

export function useRejectRefundRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      return customFetch<{ refundRequest: AttendeeRefundRequest }>(`/api/refund-requests/${id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["refund-requests"] });
    },
  });
}

export function useGetSettlementReport(eventId: string | null) {
  return useQuery({
    queryKey: ["settlement-report", eventId],
    queryFn: async () => {
      if (!eventId) return null;
      return customFetch<{
        eventId: string;
        eventName: string;
        eventClosed: boolean;
        generatedAt: string;
        merchants: {
          merchantId: string;
          merchantName: string;
          commissionRatePercent: string;
          grossSalesCop: number;
          tipsCop: number;
          commissionsCop: number;
          netPayoutCop: number;
          transactionCount: number;
        }[];
        totals: {
          grossSalesCop: number;
          tipsCop: number;
          commissionsCop: number;
          netPayoutCop: number;
          transactionCount: number;
        };
      }>(`/api/events/${eventId}/settlement-report`);
    },
    enabled: !!eventId,
    staleTime: 60_000,
  });
}

export function useFlagBracelet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ nfcUid, reason }: { nfcUid: string; reason?: string }) => {
      return customFetch<unknown>(`/api/admin/bracelets/${nfcUid}/flag`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/events"] });
    },
  });
}

