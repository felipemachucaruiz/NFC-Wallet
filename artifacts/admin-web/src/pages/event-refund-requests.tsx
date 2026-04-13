import { fmtDateTime } from "@/lib/date";
import { useState, useEffect } from "react";
import {
  useGetCurrentAuthUser,
  useListRefundRequests,
  useApproveRefundRequest,
  useRejectRefundRequest,
  useListEvents,
} from "@workspace/api-client-react";
import type { AttendeeRefundRequest } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Check, X, Eye, RefreshCcw, Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatCurrency } from "@/lib/currency";

export default function EventRefundRequests() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: auth } = useGetCurrentAuthUser();
  const isGlobalAdmin = auth?.user?.role === "admin";
  const userEventId = auth?.user?.eventId ?? "";

  const { data: eventsData } = useListEvents(isGlobalAdmin ? {} : undefined);
  const events = (eventsData as { events?: { id: string; name: string; currencyCode?: string }[] })?.events ?? [];
  const [selectedEventId, setSelectedEventId] = useState("");

  useEffect(() => {
    if (isGlobalAdmin && !selectedEventId && events.length > 0) {
      setSelectedEventId(events[0].id);
    }
  }, [isGlobalAdmin, selectedEventId, events]);

  const eventId = isGlobalAdmin ? selectedEventId : userEventId;
  const currency = events.find((e) => e.id === eventId)?.currencyCode ?? "COP";
  const fmt = (n: number) => formatCurrency(n, currency);

  const [statusFilter, setStatusFilter] = useState("pending");
  const { data, isLoading } = useListRefundRequests(eventId || null, statusFilter);
  const requests = data?.refundRequests ?? [];

  const [selected, setSelected] = useState<AttendeeRefundRequest | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const approve = useApproveRefundRequest();
  const reject = useRejectRefundRequest();

  const handleApprove = (id: string) => {
    approve.mutate(id, {
      onSuccess: () => toast({ title: t("refunds.approved") }),
      onError: (e: unknown) => toast({ title: t("common.error"), description: (e as { message?: string }).message, variant: "destructive" }),
    });
  };

  const handleReject = () => {
    if (!selected) return;
    reject.mutate(
      { id: selected.id, reason: rejectReason || undefined },
      {
        onSuccess: () => { toast({ title: t("refunds.rejected") }); setRejectOpen(false); setRejectReason(""); },
        onError: (e: unknown) => toast({ title: t("common.error"), description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  function statusBadge(status: string) {
    if (status === "approved") return <Badge variant="default" className="text-xs">{t("refunds.statusApproved")}</Badge>;
    if (status === "rejected") return <Badge variant="destructive" className="text-xs">{t("refunds.statusRejected")}</Badge>;
    return <Badge variant="outline" className="text-xs text-yellow-500 border-yellow-500">{t("refunds.statusPending")}</Badge>;
  }

  const handleExportCsv = () => {
    if (requests.length === 0) return;
    const escCsv = (val: string | number | boolean | null | undefined) => {
      if (val == null) return "";
      const s = String(val);
      if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const headers = [
      "ID",
      t("refunds.colBracelet"),
      t("refunds.colAttendee"),
      t("refunds.labelEmail"),
      t("refunds.colAmount"),
      t("refunds.colMethod"),
      t("refunds.colStatus"),
      t("refunds.labelAccountDetails"),
      t("refunds.labelNotes"),
      t("refunds.labelChipZeroed"),
      t("refunds.colRequested"),
      t("refunds.labelProcessed"),
    ];
    const rows = requests.map((r) => [
      escCsv(r.id),
      escCsv(r.braceletUid),
      escCsv([r.attendeeFirstName, r.attendeeLastName].filter(Boolean).join(" ")),
      escCsv(r.attendeeEmail),
      escCsv(r.amount),
      escCsv(r.refundMethod),
      escCsv(r.status),
      escCsv(r.accountDetails),
      escCsv(r.notes),
      escCsv(r.chipZeroed ? t("common.yes") : t("common.no")),
      escCsv(r.createdAt ? fmtDateTime(r.createdAt) : ""),
      escCsv(r.processedAt ? fmtDateTime(r.processedAt) : ""),
    ]);
    const bom = "\uFEFF";
    const csv = bom + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const eventName = events.find((e) => e.id === eventId)?.name ?? "reembolsos";
    a.download = `reembolsos_${eventName.replace(/\s+/g, "_")}_${statusFilter}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <RefreshCcw className="w-7 h-7" /> {t("refunds.title")}
          </h1>
          <p className="text-muted-foreground mt-1">{t("refunds.subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          {isGlobalAdmin && (
            <Select value={selectedEventId} onValueChange={setSelectedEventId}>
              <SelectTrigger className="w-60" data-testid="select-refund-event">
                <SelectValue placeholder={t("refunds.selectEvent")} />
              </SelectTrigger>
              <SelectContent>
                {events.map((ev) => (
                  <SelectItem key={ev.id} value={ev.id}>{ev.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40" data-testid="select-refund-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">{t("refunds.statusPending")}</SelectItem>
              <SelectItem value="approved">{t("refunds.statusApproved")}</SelectItem>
              <SelectItem value="rejected">{t("refunds.statusRejected")}</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            disabled={requests.length === 0}
            data-testid="button-export-csv"
          >
            <Download className="w-4 h-4 mr-2" />
            {t("refunds.exportCsv")}
          </Button>
        </div>
      </div>

      <div className="border border-border rounded-lg bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("refunds.colBracelet")}</TableHead>
              <TableHead>{t("refunds.colAttendee")}</TableHead>
              <TableHead className="text-right">{t("refunds.colAmount")}</TableHead>
              <TableHead>{t("refunds.colMethod")}</TableHead>
              <TableHead>{t("refunds.colStatus")}</TableHead>
              <TableHead>{t("refunds.colRequested")}</TableHead>
              <TableHead className="w-32">{t("refunds.colActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8">{t("common.loading")}</TableCell></TableRow>
            ) : !eventId ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">{t("refunds.noEvent")}</TableCell></TableRow>
            ) : requests.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">{t("refunds.noRequests")}</TableCell></TableRow>
            ) : (
              requests.map((req) => (
                <TableRow key={req.id} data-testid={`row-refund-${req.id}`}>
                  <TableCell className="font-mono text-sm">{req.braceletUid}</TableCell>
                  <TableCell className="text-sm">
                    <div>
                      {(req.attendeeFirstName || req.attendeeLastName) && (
                        <div className="font-medium">{[req.attendeeFirstName, req.attendeeLastName].filter(Boolean).join(" ")}</div>
                      )}
                      {req.attendeeEmail && (
                        <div className="text-muted-foreground text-xs">{req.attendeeEmail}</div>
                      )}
                      {!req.attendeeFirstName && !req.attendeeLastName && !req.attendeeEmail && (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">{fmt(req.amount)}</TableCell>
                  <TableCell className="text-sm capitalize">{req.refundMethod}</TableCell>
                  <TableCell>{statusBadge(req.status)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmtDateTime(req.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => { setSelected(req); setDetailOpen(true); }}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      {req.status === "pending" && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => handleApprove(req.id)} disabled={approve.isPending}>
                            <Check className="w-4 h-4 text-green-500" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => { setSelected(req); setRejectOpen(true); }}>
                            <X className="w-4 h-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("refunds.detailTitle")}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              {(selected.attendeeFirstName || selected.attendeeLastName || selected.attendeeEmail) && (
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">{t("refunds.colAttendee")}</p>
                  {(selected.attendeeFirstName || selected.attendeeLastName) && (
                    <p className="font-medium">{[selected.attendeeFirstName, selected.attendeeLastName].filter(Boolean).join(" ")}</p>
                  )}
                  {selected.attendeeEmail && (
                    <p className="text-muted-foreground text-xs">{selected.attendeeEmail}</p>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">{t("refunds.labelBracelet")}</p>
                  <p className="font-mono">{selected.braceletUid}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">{t("refunds.labelAmount")}</p>
                  <p className="font-mono font-bold">{fmt(selected.amount)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">{t("refunds.labelMethod")}</p>
                  <p className="capitalize">{selected.refundMethod}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">{t("refunds.labelStatus")}</p>
                  {statusBadge(selected.status)}
                </div>
              </div>
              {selected.accountDetails && (
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">{t("refunds.labelAccountDetails")}</p>
                  {selected.accountDetails.includes(" | ") ? (
                    <div className="space-y-1.5 bg-muted/50 rounded-lg p-3">
                      {selected.accountDetails.split(" | ").map((field, i) => {
                        const [label, ...rest] = field.split(": ");
                        const value = rest.join(": ");
                        return (
                          <div key={i} className="flex justify-between gap-2">
                            <span className="text-muted-foreground text-xs">{label}:</span>
                            <span className="font-medium text-right">{value}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p>{selected.accountDetails}</p>
                  )}
                </div>
              )}
              {selected.notes && (
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">{t("refunds.labelNotes")}</p>
                  <p>{selected.notes}</p>
                </div>
              )}
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">{t("refunds.labelChipZeroed")}</p>
                <Badge variant={selected.chipZeroed ? "default" : "outline"}>{selected.chipZeroed ? t("common.yes") : t("common.no")}</Badge>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">{t("refunds.labelRequested")}</p>
                <p>{fmtDateTime(selected.createdAt)}</p>
              </div>
              {selected.processedAt && (
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">{t("refunds.labelProcessed")}</p>
                  <p>{fmtDateTime(selected.processedAt)}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setDetailOpen(false)}>{t("refunds.close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("refunds.rejectTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("refunds.rejectDesc", { amount: selected?.amount.toLocaleString(), bracelet: selected?.braceletUid, currency: events.find((e) => e.id === eventId)?.currencyCode ?? "COP" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6 pb-2">
            <Label>{t("refunds.rejectReason")}</Label>
            <Input data-testid="input-reject-reason" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder={t("refunds.rejectPlaceholder")} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleReject} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {reject.isPending ? t("refunds.rejecting") : t("refunds.reject")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
