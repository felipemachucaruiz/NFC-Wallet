import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetFraudAlerts,
  usePatchFraudAlert,
  getGetFraudAlertsQueryKey,
} from "@workspace/api-client-react";
import type { FraudAlert } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ShieldAlert, Eye } from "lucide-react";

const FILTER_STATUSES = ["open", "reviewed", "dismissed"] as const;
type AlertStatus = typeof FILTER_STATUSES[number];

function severityVariant(s?: string | null): "destructive" | "default" | "secondary" | "outline" {
  if (s === "critical" || s === "high") return "destructive";
  if (s === "medium") return "default";
  return "secondary";
}

export default function FraudAlerts() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<AlertStatus>("open");
  const { data, isLoading } = useGetFraudAlerts({ status: statusFilter });
  const alerts = data?.alerts ?? [];

  const [selected, setSelected] = useState<FraudAlert | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<AlertStatus>("open");

  const patchAlert = usePatchFraudAlert();

  const handlePatch = () => {
    if (!selected || !newStatus) return;
    patchAlert.mutate(
      { id: selected.id, data: { status: newStatus } },
      {
        onSuccess: () => {
          toast({ title: "Alert status updated" });
          setDetailOpen(false);
          queryClient.invalidateQueries({ queryKey: getGetFraudAlertsQueryKey() });
        },
        onError: (e: unknown) => toast({ title: "Error", description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  const openDetail = (alert: FraudAlert) => {
    setSelected(alert);
    setNewStatus(alert.status as AlertStatus);
    setDetailOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-destructive flex items-center gap-2">
            <ShieldAlert className="w-7 h-7" /> Fraud Alerts
          </h1>
          <p className="text-muted-foreground mt-1">Triage active security incidents.</p>
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as AlertStatus)}>
          <SelectTrigger className="w-40" data-testid="select-status-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTER_STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="border border-border rounded-lg bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Severity</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8">Loading...</TableCell></TableRow>
            ) : alerts.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No alerts for this status.</TableCell></TableRow>
            ) : (
              alerts.map((alert) => (
                <TableRow key={alert.id} data-testid={`row-alert-${alert.id}`}>
                  <TableCell>
                    <Badge variant={severityVariant(alert.severity)} className="capitalize text-xs">
                      {alert.severity}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium capitalize">{alert.type.replace(/_/g, " ")}</TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    <span className="text-xs uppercase text-muted-foreground mr-1">{alert.entityType}:</span>
                    {alert.entityId.slice(0, 12)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize text-xs">{alert.status}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(alert.createdAt).toLocaleString()}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" data-testid={`button-alert-detail-${alert.id}`} onClick={() => openDetail(alert)}>
                      <Eye className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Alert — {selected?.type?.replace(/_/g, " ")}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Severity</p>
                  <Badge variant={severityVariant(selected.severity)} className="capitalize">{selected.severity}</Badge>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Entity Type</p>
                  <p className="capitalize">{selected.entityType}</p>
                </div>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Entity ID</p>
                <p className="font-mono text-xs">{selected.entityId}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Description</p>
                <p>{selected.description}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Created</p>
                <p>{new Date(selected.createdAt).toLocaleString()}</p>
              </div>
              <div className="space-y-1">
                <Label>Update Status</Label>
                <Select value={newStatus} onValueChange={(v) => setNewStatus(v as AlertStatus)}>
                  <SelectTrigger data-testid="select-alert-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FILTER_STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailOpen(false)}>Cancel</Button>
            <Button data-testid="button-submit-alert-status" onClick={handlePatch} disabled={patchAlert.isPending}>
              {patchAlert.isPending ? "Saving..." : "Update Status"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
