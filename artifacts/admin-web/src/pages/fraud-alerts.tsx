import { fmtDateTime } from "@/lib/date";
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
import { useTranslation } from "react-i18next";

const FILTER_STATUSES = ["open", "reviewed", "dismissed"] as const;
type AlertStatus = typeof FILTER_STATUSES[number];

function severityVariant(severity: string) {
  if (severity === "critical") return "destructive";
  if (severity === "high") return "destructive";
  if (severity === "medium") return "secondary";
  return "outline";
}

export default function FraudAlerts() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState<AlertStatus>("open");
  const { data, isLoading } = useGetFraudAlerts({ status: statusFilter });
  const alerts = data?.alerts ?? [];

  const [selected, setSelected] = useState<FraudAlert | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<AlertStatus>("reviewed");

  const patchAlert = usePatchFraudAlert();

  const handleUpdateStatus = () => {
    if (!selected) return;
    patchAlert.mutate(
      { id: selected.id, data: { status: newStatus } },
      {
        onSuccess: () => {
          toast({ title: t("fraudAlerts.updated") });
          setDetailOpen(false);
          queryClient.invalidateQueries({ queryKey: getGetFraudAlertsQueryKey() });
        },
        onError: (e: unknown) => toast({ title: t("common.error"), description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <ShieldAlert className="w-7 h-7" /> {t("fraudAlerts.title")}
          </h1>
          <p className="text-muted-foreground mt-1">{t("fraudAlerts.subtitle")}</p>
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as AlertStatus)}>
          <SelectTrigger className="w-40" data-testid="select-fraud-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTER_STATUSES.map((s) => (
              <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="border border-border rounded-lg bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("fraudAlerts.colSeverity")}</TableHead>
              <TableHead>{t("fraudAlerts.colType")}</TableHead>
              <TableHead>{t("fraudAlerts.colEntity")}</TableHead>
              <TableHead>{t("fraudAlerts.colStatus")}</TableHead>
              <TableHead>{t("fraudAlerts.colCreated")}</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8">{t("common.loading")}</TableCell></TableRow>
            ) : alerts.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{t("fraudAlerts.noAlerts")}</TableCell></TableRow>
            ) : (
              alerts.map((alert) => (
                <TableRow key={alert.id} data-testid={`row-alert-${alert.id}`}>
                  <TableCell>
                    <Badge variant={severityVariant(alert.severity)} className="text-xs capitalize">{alert.severity}</Badge>
                  </TableCell>
                  <TableCell className="text-sm capitalize">{alert.type.replace(/_/g, " ")}</TableCell>
                  <TableCell className="font-mono text-xs">{alert.entityId.slice(0, 16)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs capitalize">{alert.status}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmtDateTime(alert.createdAt)}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      data-testid={`button-view-alert-${alert.id}`}
                      onClick={() => { setSelected(alert); setNewStatus("reviewed"); setDetailOpen(true); }}
                    >
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
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5" /> {t("fraudAlerts.detailTitle")}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">{t("fraudAlerts.labelSeverity")}</p>
                  <Badge variant={severityVariant(selected.severity)} className="capitalize">{selected.severity}</Badge>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">{t("fraudAlerts.colStatus")}</p>
                  <Badge variant="outline" className="capitalize">{selected.status}</Badge>
                </div>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">{t("fraudAlerts.labelEntityType")}</p>
                <p className="capitalize">{selected.entityType.replace(/_/g, " ")}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">{t("fraudAlerts.labelEntityId")}</p>
                <p className="font-mono text-xs break-all">{selected.entityId}</p>
              </div>
              {selected.description && (
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">{t("fraudAlerts.labelDescription")}</p>
                  <p className="text-sm">{selected.description}</p>
                </div>
              )}
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">{t("fraudAlerts.labelCreated")}</p>
                <p>{fmtDateTime(selected.createdAt)}</p>
              </div>
              <div className="space-y-1">
                <Label>{t("fraudAlerts.updateStatus")}</Label>
                <Select value={newStatus} onValueChange={(v) => setNewStatus(v as AlertStatus)}>
                  <SelectTrigger data-testid="select-new-alert-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FILTER_STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailOpen(false)}>{t("fraudAlerts.cancel")}</Button>
            <Button data-testid="button-update-alert-status" onClick={handleUpdateStatus} disabled={patchAlert.isPending}>
              {patchAlert.isPending ? t("fraudAlerts.updating") : t("fraudAlerts.updateStatus")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
