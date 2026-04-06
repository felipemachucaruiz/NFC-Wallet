import { useState } from "react";
import {
  useGetCurrentAuthUser,
  useListRefundRequests,
  useApproveRefundRequest,
  useRejectRefundRequest,
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
import { Check, X, Eye, RefreshCcw } from "lucide-react";

export default function EventRefundRequests() {
  const { toast } = useToast();
  const { data: auth } = useGetCurrentAuthUser();
  const eventId = auth?.user?.eventId ?? "";

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
      onSuccess: () => toast({ title: "Refund approved" }),
      onError: (e: unknown) => toast({ title: "Error", description: (e as { message?: string }).message, variant: "destructive" }),
    });
  };

  const handleReject = () => {
    if (!selected) return;
    reject.mutate(
      { id: selected.id, reason: rejectReason || undefined },
      {
        onSuccess: () => { toast({ title: "Refund rejected" }); setRejectOpen(false); setRejectReason(""); },
        onError: (e: unknown) => toast({ title: "Error", description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  function statusBadge(status: string) {
    if (status === "approved") return <Badge variant="default" className="text-xs">Approved</Badge>;
    if (status === "rejected") return <Badge variant="destructive" className="text-xs">Rejected</Badge>;
    return <Badge variant="outline" className="text-xs text-yellow-500 border-yellow-500">Pending</Badge>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <RefreshCcw className="w-7 h-7" /> Refund Requests
          </h1>
          <p className="text-muted-foreground mt-1">Review and process attendee refund requests.</p>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40" data-testid="select-refund-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border border-border rounded-lg bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bracelet UID</TableHead>
              <TableHead className="text-right">Amount (COP)</TableHead>
              <TableHead>Refund Method</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Requested</TableHead>
              <TableHead className="w-32">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8">Loading...</TableCell></TableRow>
            ) : !eventId ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No event assigned.</TableCell></TableRow>
            ) : requests.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No refund requests.</TableCell></TableRow>
            ) : (
              requests.map((req) => (
                <TableRow key={req.id} data-testid={`row-refund-${req.id}`}>
                  <TableCell className="font-mono text-sm">{req.braceletUid}</TableCell>
                  <TableCell className="text-right font-mono">${req.amountCop.toLocaleString()}</TableCell>
                  <TableCell className="text-sm capitalize">{req.refundMethod}</TableCell>
                  <TableCell>{statusBadge(req.status)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(req.createdAt).toLocaleString()}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => { setSelected(req); setDetailOpen(true); }} title="View details">
                        <Eye className="w-4 h-4" />
                      </Button>
                      {req.status === "pending" && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => handleApprove(req.id)} title="Approve" disabled={approve.isPending}>
                            <Check className="w-4 h-4 text-green-500" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => { setSelected(req); setRejectOpen(true); }} title="Reject">
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
          <DialogHeader><DialogTitle>Refund Request Detail</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Bracelet UID</p>
                  <p className="font-mono">{selected.braceletUid}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Amount</p>
                  <p className="font-mono font-bold">${selected.amountCop.toLocaleString()} COP</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Refund Method</p>
                  <p className="capitalize">{selected.refundMethod}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Status</p>
                  {statusBadge(selected.status)}
                </div>
              </div>
              {selected.accountDetails && (
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Account Details</p>
                  <p>{selected.accountDetails}</p>
                </div>
              )}
              {selected.notes && (
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Notes</p>
                  <p>{selected.notes}</p>
                </div>
              )}
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Chip Zeroed</p>
                <Badge variant={selected.chipZeroed ? "default" : "outline"}>{selected.chipZeroed ? "Yes" : "No"}</Badge>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Requested</p>
                <p>{new Date(selected.createdAt).toLocaleString()}</p>
              </div>
              {selected.processedAt && (
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Processed</p>
                  <p>{new Date(selected.processedAt).toLocaleString()}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setDetailOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Refund</AlertDialogTitle>
            <AlertDialogDescription>
              Reject refund of ${selected?.amountCop.toLocaleString()} COP for bracelet {selected?.braceletUid}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6 pb-2">
            <Label>Reason (optional)</Label>
            <Input data-testid="input-reject-reason" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason for rejection" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReject} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {reject.isPending ? "Rejecting..." : "Reject"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
