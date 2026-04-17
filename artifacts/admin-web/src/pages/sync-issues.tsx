import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch, ApiError } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, AlertTriangle, CheckCircle2, Trash2, Ban } from "lucide-react";
import { useTranslation } from "react-i18next";

interface SyncIssue {
  id: string;
  local_id: string;
  nfc_uid: string;
  type: "charge" | "topup";
  amount: number;
  fail_reason: string | null;
  fail_count: number;
  occurred_at: string | null;
  reported_at: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  event_name: string | null;
}

function fmtCOP(amount: number): string {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(amount);
}

function fmtDate(ts: string | null): string {
  if (!ts) return "—";
  try { return new Date(ts).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" }); }
  catch { return ts; }
}

function translateFailReason(reason: string | null): string {
  if (!reason) return "Error desconocido";
  const r = reason.toLowerCase();
  if (r === "forbidden") return "Dispositivo no autorizado (attestation)";
  if (r.includes("flagged")) return "Pulsera bloqueada por admin";
  if (r.includes("not registered")) return "Pulsera no registrada";
  if (r.includes("counter replay") || r === "counter") return "Contador repetido (sincronización cruzada)";
  if (r.includes("insufficient") && r.includes("balance")) return "Saldo insuficiente";
  if (r.includes("location not found")) return "Punto de venta no encontrado";
  if (r.includes("access denied") || r.includes("not assigned")) return "Sin acceso al punto de venta";
  if (r.includes("merchant not found")) return "Comercio no encontrado";
  if (r.includes("network") || r.includes("fetch") || r.includes("connection")) return "Error de red";
  return reason;
}

export default function SyncIssues() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dismissAllOpen, setDismissAllOpen] = useState(false);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<{ issues: SyncIssue[] }, ApiError>({
    queryKey: ["sync-issues"],
    queryFn: () => customFetch<{ issues: SyncIssue[] }>("/api/sync-issues/admin"),
    refetchInterval: 30_000,
  });

  const issues = data?.issues ?? [];

  const dismissMutation = useMutation({
    mutationFn: (id: string) => customFetch(`/api/sync-issues/${id}/dismiss`, { method: "PATCH" }),
    onSuccess: () => {
      toast({ title: "Descartado correctamente" });
      queryClient.invalidateQueries({ queryKey: ["sync-issues"] });
    },
    onError: () => toast({ title: t("common.error"), description: "No se pudo descartar el issue", variant: "destructive" }),
  });

  const dismissAllMutation = useMutation({
    mutationFn: () => customFetch<{ ok: boolean; dismissed: number }>("/api/sync-issues/dismiss-all", { method: "POST" }),
    onSuccess: (data) => {
      const d = data as { dismissed?: number };
      toast({ title: `${d.dismissed ?? 0} issues descartados` });
      queryClient.invalidateQueries({ queryKey: ["sync-issues"] });
      setDismissAllOpen(false);
    },
    onError: () => toast({ title: t("common.error"), description: "No se pudo descartar todos", variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Errores de Sincronización POS</h1>
          <p className="text-muted-foreground mt-1">
            Transacciones offline bloqueadas en dispositivos de cajeros. Descartarlas las elimina del dispositivo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            {t("devices.refresh")}
          </Button>
          {issues.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDismissAllOpen(true)}
              disabled={dismissAllMutation.isPending}
            >
              <Ban className="w-4 h-4 mr-2" />
              Descartar todos ({issues.length})
            </Button>
          )}
        </div>
      </div>

      {isError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">
            {(error instanceof ApiError ? error.message : null) ?? "Error cargando los issues"}
          </p>
        </div>
      )}

      <div className="border border-border rounded-lg bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cajero</TableHead>
              <TableHead>Evento</TableHead>
              <TableHead>Pulsera (NFC)</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Monto</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead>Intentos</TableHead>
              <TableHead>Reportado</TableHead>
              <TableHead className="text-right">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">{t("common.loading")}</TableCell>
              </TableRow>
            ) : issues.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-14">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <CheckCircle2 className="w-8 h-8 text-green-500" />
                    <p className="text-sm font-medium">Sin errores de sincronización</p>
                    <p className="text-xs">Todos los dispositivos están sincronizados correctamente.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              issues.map((issue) => (
                <TableRow key={issue.id}>
                  <TableCell>
                    <p className="font-medium text-sm">
                      {[issue.first_name, issue.last_name].filter(Boolean).join(" ") || "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">{issue.email}</p>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {issue.event_name ?? "—"}
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs">{issue.nfc_uid}</span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={issue.type === "charge"
                        ? "bg-red-100 text-red-800 border-red-200"
                        : "bg-yellow-100 text-yellow-800 border-yellow-200"}
                    >
                      {issue.type === "charge" ? "Cobro" : "Recarga"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    {fmtCOP(issue.amount)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-start gap-1.5 max-w-[220px]">
                      <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                      <span className="text-xs text-destructive leading-snug">
                        {translateFailReason(issue.fail_reason)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground text-center">
                    {issue.fail_count}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {fmtDate(issue.reported_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => dismissMutation.mutate(issue.id)}
                        disabled={dismissMutation.isPending}
                        title="Descartar — se eliminará del dispositivo en el próximo poll"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {issues.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Al descartar un issue, el dispositivo lo eliminará automáticamente en el próximo ciclo de polling (máx. 2 min).
        </p>
      )}

      <AlertDialog open={dismissAllOpen} onOpenChange={setDismissAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar todos los errores</AlertDialogTitle>
            <AlertDialogDescription>
              Se descartarán {issues.length} errores de sincronización. Los dispositivos los eliminarán automáticamente.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => dismissAllMutation.mutate()}
            >
              Descartar todos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
