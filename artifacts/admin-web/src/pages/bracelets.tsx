import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListEvents,
  useListEventBracelets,
  useUnflagBracelet,
  useDeleteAdminBracelet,
  getListEventBraceletsQueryKey,
  useFlagBracelet,
} from "@workspace/api-client-react";
import type { EventBracelet } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Search, ShieldOff, ShieldAlert, Trash2, Ticket } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function Bracelets() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: eventsData, isLoading: eventsLoading } = useListEvents();
  const events = eventsData?.events ?? [];

  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [flaggedFilter, setFlaggedFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [freezeOpen, setFreezeOpen] = useState(false);
  const [selected, setSelected] = useState<EventBracelet | null>(null);

  const queryParams = { search: search || undefined };
  const { data, isLoading: braceletsLoading } = useListEventBracelets(
    selectedEventId,
    queryParams,
    {
      query: {
        enabled: !!selectedEventId,
        queryKey: getListEventBraceletsQueryKey(selectedEventId, queryParams),
      },
    }
  );

  const bracelets = data?.bracelets ?? [];
  const filteredBracelets =
    flaggedFilter === "flagged"
      ? bracelets.filter((b) => b.flagged)
      : flaggedFilter === "ok"
      ? bracelets.filter((b) => !b.flagged)
      : bracelets;

  const unflag = useUnflagBracelet();
  const flagB = useFlagBracelet();
  const deleteB = useDeleteAdminBracelet();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListEventBraceletsQueryKey(selectedEventId) });

  const handleUnflag = (bracelet: EventBracelet) => {
    unflag.mutate(
      { nfcUid: bracelet.nfcUid },
      {
        onSuccess: () => { toast({ title: t("wristbands.unflagged") }); invalidate(); },
        onError: (e: unknown) =>
          toast({ title: t("common.error"), description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  const handleFreeze = () => {
    if (!selected) return;
    flagB.mutate(
      { nfcUid: selected.nfcUid },
      {
        onSuccess: () => { toast({ title: t("wristbands.frozen") }); setFreezeOpen(false); invalidate(); },
        onError: (e: unknown) =>
          toast({ title: t("common.error"), description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  const handleDelete = () => {
    if (!selected) return;
    deleteB.mutate(
      { nfcUid: selected.nfcUid },
      {
        onSuccess: () => { toast({ title: t("wristbands.deleted") }); setDeleteOpen(false); invalidate(); },
        onError: (e: unknown) =>
          toast({ title: t("common.error"), description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  const selectedEvent = events.find((e) => e.id === selectedEventId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("wristbands.title")}</h1>
        <p className="text-muted-foreground mt-1">
          {t("wristbands.adminSubtitle")}
        </p>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Select
          value={selectedEventId}
          onValueChange={(v) => {
            setSelectedEventId(v);
            setSearch("");
            setFlaggedFilter("all");
          }}
        >
          <SelectTrigger className="w-64" data-testid="select-event-filter">
            <SelectValue placeholder={eventsLoading ? t("common.loading") : t("eventsMap.selectAnEvent")} />
          </SelectTrigger>
          <SelectContent>
            {events.map((event) => (
              <SelectItem key={event.id} value={event.id}>
                <span className="flex items-center gap-2">
                  <span
                    className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                      event.active ? "bg-primary" : "bg-muted-foreground"
                    }`}
                  />
                  {event.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedEventId && (
          <>
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                data-testid="input-bracelet-search"
                placeholder={t("wristbands.searchPlaceholder")}
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
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
          </>
        )}
      </div>

      {!selectedEventId ? (
        <div className="border border-border rounded-lg bg-card flex flex-col items-center justify-center py-20 text-center gap-3">
          <Ticket className="w-10 h-10 text-muted-foreground/40" />
          <div>
            <p className="font-medium text-foreground">{t("eventsMap.selectAnEvent")}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {t("eventsMap.chooseEvent")}
            </p>
          </div>
        </div>
      ) : (
        <div className="border border-border rounded-lg bg-card">
          {selectedEvent && (
            <div className="px-4 py-2.5 border-b border-border flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{selectedEvent.name}</span>
              <Badge variant={selectedEvent.active ? "default" : "secondary"} className="text-xs">
                {selectedEvent.active ? t("common.active") : t("common.inactive")}
              </Badge>
              {selectedEvent.venueAddress && (
                <span className="truncate max-w-xs">{selectedEvent.venueAddress}</span>
              )}
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("wristbands.colNfcUid")}</TableHead>
                <TableHead>{t("wristbands.colOwner")}</TableHead>
                <TableHead>{t("wristbands.colBalance")}</TableHead>
                <TableHead>{t("wristbands.colStatus")}</TableHead>
                <TableHead>{t("wristbands.colRegistered")}</TableHead>
                <TableHead className="w-24">{t("wristbands.colActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {braceletsLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    {t("common.loading")}
                  </TableCell>
                </TableRow>
              ) : filteredBracelets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    {t("wristbands.noBracelets")}
                  </TableCell>
                </TableRow>
              ) : (
                filteredBracelets.map((bracelet) => (
                  <TableRow key={bracelet.id} data-testid={`row-bracelet-${bracelet.id}`}>
                    <TableCell className="font-mono text-sm">{bracelet.nfcUid}</TableCell>
                    <TableCell className="text-sm">
                      <div>
                        {bracelet.attendeeName && (
                          <div className="font-medium">{bracelet.attendeeName}</div>
                        )}
                        {bracelet.phone && (
                          <div className="text-muted-foreground text-xs">{bracelet.phone}</div>
                        )}
                        {!bracelet.attendeeName && !bracelet.phone && (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {(bracelet.lastKnownBalance ?? 0).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {bracelet.flagged ? (
                        <Badge variant="destructive" className="text-xs">
                          {t("wristbands.statusFlagged")}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-green-500 border-green-500">
                          {t("wristbands.ok")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(bracelet.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {bracelet.flagged ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            data-testid={`button-unflag-${bracelet.id}`}
                            onClick={() => handleUnflag(bracelet)}
                            title={t("wristbands.unflag")}
                          >
                            <ShieldOff className="w-4 h-4" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            data-testid={`button-freeze-${bracelet.id}`}
                            onClick={() => { setSelected(bracelet); setFreezeOpen(true); }}
                            title={t("wristbands.freeze")}
                          >
                            <ShieldAlert className="w-4 h-4 text-amber-500" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          data-testid={`button-delete-bracelet-${bracelet.id}`}
                          onClick={() => { setSelected(bracelet); setDeleteOpen(true); }}
                          title={t("common.delete")}
                        >
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
      )}

      <AlertDialog open={freezeOpen} onOpenChange={setFreezeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("wristbands.freezeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("wristbands.freezeDesc", { uid: selected?.nfcUid })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-freeze-bracelet"
              onClick={handleFreeze}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              {flagB.isPending ? t("wristbands.freezing") : t("wristbands.freeze")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
            <AlertDialogAction
              data-testid="button-confirm-delete-bracelet"
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteB.isPending ? t("wristbands.deleting") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
