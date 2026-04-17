import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Lock, RotateCcw, Trash2, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Device {
  id: string | number;
  name: string;
  status: string;
  batteryLevel: number | null;
  lastSeenAt: string | null;
  model: string | null;
  osVersion: string | null;
  serialNumber: string | null;
}

function isOnline(status: string): boolean {
  return status === "online";
}

function BatteryDisplay({ level }: { level: number | null }) {
  if (level === null || level === undefined) return <span className="text-muted-foreground text-sm">—</span>;
  const color = level > 50 ? "text-green-600" : level > 20 ? "text-yellow-600" : "text-red-600";
  return <span className={`text-sm font-medium ${color}`}>{level}%</span>;
}

function fmtLastSeen(ts: string | null): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

export default function Devices() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [wipeTarget, setWipeTarget] = useState<Device | null>(null);

  const { data, isLoading, isError, refetch, isFetching } = useQuery<{ devices: Device[] }>({
    queryKey: ["devices"],
    queryFn: () => customFetch<{ devices: Device[] }>("/api/devices"),
    refetchInterval: 30_000,
  });

  const devices = data?.devices ?? [];

  const actionMutation = useMutation({
    mutationFn: ({ deviceId, action }: { deviceId: string | number; action: "lock" | "reboot" | "wipe" }) =>
      customFetch(`/api/devices/${deviceId}/actions`, {
        method: "POST",
        body: JSON.stringify({ action }),
      }),
    onSuccess: (_data, { action }) => {
      const label = action === "lock" ? t("devices.locked") : action === "reboot" ? t("devices.rebooted") : t("devices.wiped");
      toast({ title: label });
      queryClient.invalidateQueries({ queryKey: ["devices"] });
    },
    onError: (err: unknown) => {
      toast({
        title: t("common.error"),
        description: (err as { message?: string }).message,
        variant: "destructive",
      });
    },
  });

  const handleAction = (device: Device, action: "lock" | "reboot" | "wipe") => {
    if (action === "wipe") {
      setWipeTarget(device);
      return;
    }
    actionMutation.mutate({ deviceId: device.id, action });
  };

  const confirmWipe = () => {
    if (!wipeTarget) return;
    actionMutation.mutate({ deviceId: wipeTarget.id, action: "wipe" });
    setWipeTarget(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("devices.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("devices.subtitle")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          {t("devices.refresh")}
        </Button>
      </div>

      {isError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {t("devices.fetchError")}
        </div>
      )}

      <div className="border border-border rounded-lg bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("devices.colName")}</TableHead>
              <TableHead>{t("devices.colStatus")}</TableHead>
              <TableHead>{t("devices.colBattery")}</TableHead>
              <TableHead>{t("devices.colLastSeen")}</TableHead>
              <TableHead>{t("devices.colModel")}</TableHead>
              <TableHead className="text-right">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                  {t("common.loading")}
                </TableCell>
              </TableRow>
            ) : devices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                  {t("devices.noDevices")}
                </TableCell>
              </TableRow>
            ) : (
              devices.map((device) => {
                const online = isOnline(device.status);
                return (
                  <TableRow key={String(device.id)}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{device.name}</p>
                        {device.serialNumber && (
                          <p className="text-xs text-muted-foreground font-mono">{device.serialNumber}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={online ? "default" : "secondary"}
                        className={`flex items-center gap-1 w-fit text-xs ${online ? "bg-green-100 text-green-800 border-green-200" : "bg-gray-100 text-gray-600 border-gray-200"}`}
                      >
                        {online ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                        {online ? t("devices.statusOnline") : t("devices.statusOffline")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <BatteryDisplay level={device.batteryLevel} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {fmtLastSeen(device.lastSeenAt)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {device.model ?? "—"}
                      {device.osVersion && (
                        <span className="block text-xs text-muted-foreground/70">{device.osVersion}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleAction(device, "lock")}
                          disabled={actionMutation.isPending}
                          title={t("devices.lockAction")}
                        >
                          <Lock className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleAction(device, "reboot")}
                          disabled={actionMutation.isPending}
                          title={t("devices.rebootAction")}
                        >
                          <RotateCcw className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleAction(device, "wipe")}
                          disabled={actionMutation.isPending}
                          title={t("devices.wipeAction")}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!wipeTarget} onOpenChange={(open) => { if (!open) setWipeTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("devices.wipeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("devices.wipeDesc", { name: wipeTarget?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmWipe}
            >
              {t("devices.wipeConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
