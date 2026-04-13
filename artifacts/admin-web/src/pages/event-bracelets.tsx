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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Search, ShieldOff, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function EventBracelets() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: auth } = useGetCurrentAuthUser();
  const eventId = auth?.user?.eventId ?? "";

  const [flaggedFilter, setFlaggedFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selected, setSelected] = useState<EventBracelet | null>(null);

  const queryParams = flaggedFilter === "flagged" ? { search: search || undefined } : { search: search || undefined };
  const { data, isLoading } = useListEventBracelets(eventId, queryParams, { query: { enabled: !!eventId, queryKey: getListEventBraceletsQueryKey(eventId, queryParams) } });
  const bracelets = data?.bracelets ?? [];
  const filteredBracelets = flaggedFilter === "all" ? bracelets : flaggedFilter === "flagged" ? bracelets.filter((b) => b.flagged) : bracelets.filter((b) => !b.flagged);

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("wristbands.title")}</h1>
        <p className="text-muted-foreground mt-1">{t("wristbands.subtitle")}</p>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input data-testid="input-bracelet-search" placeholder={t("wristbands.searchPlaceholder")} className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={flaggedFilter} onValueChange={setFlaggedFilter}>
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
              <TableHead className="w-24">{t("wristbands.colActions")}</TableHead>
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
          <div className="px-4 py-2 text-xs text-muted-foreground border-t border-border">
            {t("wristbands.showingOf", { showing: filteredBracelets.length, total: data.total })}
          </div>
        )}
      </div>

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
