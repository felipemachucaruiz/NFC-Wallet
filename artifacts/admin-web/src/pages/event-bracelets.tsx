import { fmtDate } from "@/lib/date";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetCurrentAuthUser,
  useListEventBracelets,
  useUnflagBracelet,
  useDeleteAdminBracelet,
  getListEventBraceletsQueryKey,
} from "@workspace/api-client-react";
import type { EventBracelet } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Search, ShieldOff, Trash2, DollarSign } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEventContext } from "@/contexts/event-context";
import { CurrencyInput } from "@/components/ui/currency-input";

const _API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_URL || "https://prod.tapee.app").replace(/\/+$/, "")
  : `${import.meta.env.BASE_URL}_srv`;
function apiUrl(path: string): string { return `${_API_BASE}${path}`; }
function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("tapee_admin_token");
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" };
}

export default function EventBracelets() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: auth } = useGetCurrentAuthUser();
  const { eventId } = useEventContext();

  const [flaggedFilter, setFlaggedFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selected, setSelected] = useState<EventBracelet | null>(null);

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState<EventBracelet | null>(null);
  const [adjustBalance, setAdjustBalance] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjusting, setAdjusting] = useState(false);

  const LIMIT = 100;
  const queryParams = { search: search || undefined, page, limit: LIMIT };
  const { data, isLoading } = useListEventBracelets(eventId, queryParams, { query: { enabled: !!eventId, queryKey: getListEventBraceletsQueryKey(eventId, queryParams) } });
  const bracelets = data?.bracelets ?? [];
  const filteredBracelets = flaggedFilter === "all" ? bracelets : flaggedFilter === "flagged" ? bracelets.filter((b) => b.flagged) : bracelets.filter((b) => !b.flagged);
  const totalPages = data ? Math.ceil(data.total / LIMIT) : 1;

  const unflag = useUnflagBracelet();
  const deleteB = useDeleteAdminBracelet();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListEventBraceletsQueryKey(eventId) });

  const handleUnflag = (bracelet: EventBracelet) => {
    unflag.mutate(
      { nfcUid: bracelet.nfcUid },
      {
        onSuccess: () => { toast({ title: t("wristbands.unflagged") }); invalidate(); },
        onError: (e: unknown) => toast({ title: t("common.error"), description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  const handleDelete = () => {
    if (!selected) return;
    deleteB.mutate(
      { nfcUid: selected.nfcUid },
      {
        onSuccess: () => { toast({ title: t("wristbands.deleted") }); setDeleteOpen(false); invalidate(); },
        onError: (e: unknown) => toast({ title: t("common.error"), description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  const openAdjust = (bracelet: EventBracelet) => {
    setAdjustTarget(bracelet);
    setAdjustBalance(String(bracelet.lastKnownBalance ?? 0));
    setAdjustReason("");
    setAdjustOpen(true);
  };

  const handleAdjustBalance = async () => {
    if (!adjustTarget) return;
    const newBalance = parseInt(adjustBalance.replace(/\D/g, ""), 10);
    if (isNaN(newBalance) || newBalance < 0) {
      toast({ title: "Saldo inválido", description: "Ingresa un número positivo.", variant: "destructive" });
      return;
    }
    setAdjusting(true);
    try {
      const res = await fetch(apiUrl(`/api/admin/bracelets/${encodeURIComponent(adjustTarget.nfcUid)}/set-balance`), {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ balance: newBalance, reason: adjustReason || undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error desconocido" }));
        throw new Error((err as { error?: string }).error ?? "Error ajustando saldo");
      }
      const result = await res.json() as { previousBalance: number; newBalance: number; delta: number };
      toast({
        title: "Saldo ajustado",
        description: `${adjustTarget.nfcUid}: $${result.previousBalance.toLocaleString()} → $${result.newBalance.toLocaleString()} (${result.delta >= 0 ? "+" : ""}${result.delta.toLocaleString()})`,
      });
      setAdjustOpen(false);
      invalidate();
    } catch (e: unknown) {
      toast({ title: t("common.error"), description: (e as { message?: string }).message, variant: "destructive" });
    } finally {
      setAdjusting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("wristbands.title")}</h1>
        <p className="text-muted-foreground mt-1">{t("wristbands.subtitle")}</p>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input data-testid="input-bracelet-search" placeholder={t("wristbands.searchPlaceholder")} className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Select value={flaggedFilter} onValueChange={(v) => { setFlaggedFilter(v); setPage(1); }}>
          <SelectTrigger className="w-36" data-testid="select-bracelet-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("wristbands.all")}</SelectItem>
            <SelectItem value="flagged">{t("wristbands.flagged")}</SelectItem>
            <SelectItem value="ok">{t("wristbands.ok")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border border-border rounded-lg bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("wristbands.colNfcUid")}</TableHead>
              <TableHead>{t("wristbands.colAttendee")}</TableHead>
              <TableHead className="text-right">{t("wristbands.colBalance")}</TableHead>
              <TableHead>{t("wristbands.colStatus")}</TableHead>
              <TableHead>{t("wristbands.colRegistered")}</TableHead>
              <TableHead className="w-32">{t("wristbands.colActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8">{t("common.loading")}</TableCell></TableRow>
            ) : !eventId ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{t("wristbands.noEvent")}</TableCell></TableRow>
            ) : filteredBracelets.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{t("wristbands.noWristbands")}</TableCell></TableRow>
            ) : (
              filteredBracelets.map((bracelet) => (
                <TableRow key={bracelet.id} data-testid={`row-bracelet-${bracelet.id}`}>
                  <TableCell className="font-mono text-sm">{bracelet.nfcUid}</TableCell>
                  <TableCell>{bracelet.attendeeName ?? <span className="text-muted-foreground italic">{t("wristbands.unnamed")}</span>}</TableCell>
                  <TableCell className="text-right font-mono">{(bracelet.lastKnownBalance ?? 0).toLocaleString()}</TableCell>
                  <TableCell>
                    {bracelet.flagged ? (
                      <Badge variant="destructive" className="text-xs">{t("wristbands.statusFlagged")}</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-green-500 border-green-500">{t("wristbands.ok")}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmtDate(bracelet.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openAdjust(bracelet)} title="Ajustar saldo" data-testid={`button-adjust-${bracelet.id}`}>
                        <DollarSign className="w-4 h-4 text-blue-500" />
                      </Button>
                      {bracelet.flagged && (
                        <Button variant="ghost" size="icon" data-testid={`button-unflag-${bracelet.id}`} onClick={() => handleUnflag(bracelet)} title="Unflag">
                          <ShieldOff className="w-4 h-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" data-testid={`button-delete-bracelet-${bracelet.id}`} onClick={() => { setSelected(bracelet); setDeleteOpen(true); }} title="Delete">
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {data && (
          <div className="px-4 py-2 text-xs text-muted-foreground border-t border-border flex justify-between items-center">
            <span>{t("wristbands.showingOf", { showing: filteredBracelets.length, total: data.total })}</span>
            {totalPages > 1 && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{t("common.prev")}</Button>
                <span className="flex items-center text-xs px-2">{page} / {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>{t("common.next")}</Button>
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ajustar saldo de pulsera</DialogTitle>
            <DialogDescription>
              Corrige el saldo en el servidor cuando el chip y la base de datos están desincronizados. Esta acción se registra en el log del servidor.
            </DialogDescription>
          </DialogHeader>
          {adjustTarget && (
            <div className="space-y-4 py-2">
              <div className="rounded-md bg-muted px-3 py-2 text-sm font-mono text-muted-foreground">
                {adjustTarget.nfcUid}
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Saldo actual (servidor):</span>
                  <span className="ml-2 font-bold">${(adjustTarget.lastKnownBalance ?? 0).toLocaleString()}</span>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="adjust-balance">Nuevo saldo (COP)</Label>
                <CurrencyInput
                  id="adjust-balance"
                  value={adjustBalance}
                  onValueChange={setAdjustBalance}
                  placeholder="250000"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="adjust-reason">Motivo (opcional)</Label>
                <Input
                  id="adjust-reason"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="Ej: Recarga en efectivo no sincronizada"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(false)} disabled={adjusting}>
              Cancelar
            </Button>
            <Button onClick={handleAdjustBalance} disabled={adjusting}>
              {adjusting ? "Aplicando..." : "Aplicar ajuste"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("wristbands.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("wristbands.deleteDesc", { uid: selected?.nfcUid })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction data-testid="button-confirm-delete-bracelet" onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteB.isPending ? t("wristbands.deleting") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
