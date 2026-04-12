import { useState, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetCurrentAuthUser } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { DateTimePicker } from "@/components/ui/datetime-picker";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Copy, Loader2, Users, ChevronDown, ChevronUp, Trash2, Pencil, Link2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEventContext } from "@/contexts/event-context";
import {
  apiFetchGuestLists,
  apiCreateGuestList,
  apiUpdateGuestList,
  apiDeleteGuestList,
  apiFetchGuestListEntries,
  apiFetchTicketTypes,
  type GuestListData,
  type GuestListEntryData,
} from "@/lib/api";

const TICKETS_ORIGIN = import.meta.env.VITE_TICKETS_URL || "https://tickets.tapee.app";

function getShareableLink(slug: string): string {
  return `${TICKETS_ORIGIN}/guest-list/${slug}`;
}

export default function EventGuestLists() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: auth } = useGetCurrentAuthUser();
  const { eventId } = useEventContext();
  const resolvedEventId = auth?.user?.role === "admin" ? eventId : (auth?.user?.eventId ?? "");

  const [showDialog, setShowDialog] = useState(false);
  const [editingList, setEditingList] = useState<GuestListData | null>(null);
  const [formName, setFormName] = useState("");
  const [formMaxGuests, setFormMaxGuests] = useState("50");
  const [formIsPublic, setFormIsPublic] = useState(false);
  const [formExpiresAt, setFormExpiresAt] = useState("");
  const [formTicketTypeId, setFormTicketTypeId] = useState<string>("");
  const [expandedListId, setExpandedListId] = useState<string | null>(null);

  const { data: guestLists = [], isLoading } = useQuery({
    queryKey: ["guest-lists", resolvedEventId],
    queryFn: () => apiFetchGuestLists(resolvedEventId),
    enabled: !!resolvedEventId,
  });

  const { data: allTicketTypes = [] } = useQuery({
    queryKey: ["ticketTypes", resolvedEventId],
    queryFn: () => apiFetchTicketTypes(resolvedEventId),
    enabled: !!resolvedEventId,
  });

  const hiddenTicketTypes = allTicketTypes.filter((tt) => tt.isHidden);

  const { data: entries = [], isLoading: entriesLoading } = useQuery({
    queryKey: ["guest-list-entries", resolvedEventId, expandedListId],
    queryFn: () => apiFetchGuestListEntries(resolvedEventId, expandedListId!),
    enabled: !!resolvedEventId && !!expandedListId,
  });

  const createMutation = useMutation({
    mutationFn: (body: { name: string; maxGuests: number; isPublic?: boolean; expiresAt?: string | null; ticketTypeId?: string | null }) =>
      apiCreateGuestList(resolvedEventId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guest-lists"] });
      toast({ title: t("guestLists.created") });
      closeDialog();
    },
    onError: (err: Error) => toast({ title: t("common.error"), description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ listId, body }: { listId: string; body: Record<string, unknown> }) =>
      apiUpdateGuestList(resolvedEventId, listId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guest-lists"] });
      toast({ title: t("guestLists.updated") });
      closeDialog();
    },
    onError: (err: Error) => toast({ title: t("common.error"), description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (listId: string) => apiDeleteGuestList(resolvedEventId, listId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guest-lists"] });
      toast({ title: t("guestLists.deleted") });
    },
    onError: (err: Error) => toast({ title: t("common.error"), description: err.message, variant: "destructive" }),
  });

  function openCreateDialog() {
    setEditingList(null);
    setFormName("");
    setFormMaxGuests("50");
    setFormIsPublic(false);
    setFormExpiresAt("");
    setFormTicketTypeId("");
    setShowDialog(true);
  }

  function openEditDialog(list: GuestListData) {
    setEditingList(list);
    setFormName(list.name);
    setFormMaxGuests(String(list.maxGuests));
    setFormIsPublic(list.isPublic);
    setFormExpiresAt(list.expiresAt ? list.expiresAt.slice(0, 16) : "");
    setFormTicketTypeId(list.ticketTypeId ?? "");
    setShowDialog(true);
  }

  function closeDialog() {
    setShowDialog(false);
    setEditingList(null);
  }

  function handleSubmit() {
    const maxGuests = parseInt(formMaxGuests, 10);
    if (!formName.trim() || isNaN(maxGuests) || maxGuests < 1) return;

    const body = {
      name: formName.trim(),
      maxGuests,
      isPublic: formIsPublic,
      expiresAt: formExpiresAt || null,
      ticketTypeId: formTicketTypeId || null,
    };

    if (editingList) {
      updateMutation.mutate({ listId: editingList.id, body });
    } else {
      createMutation.mutate(body);
    }
  }

  function handleToggleStatus(list: GuestListData) {
    const newStatus = list.status === "active" ? "closed" : "active";
    updateMutation.mutate({ listId: list.id, body: { status: newStatus } });
  }

  function copyLink(slug: string) {
    navigator.clipboard.writeText(getShareableLink(slug));
    toast({ title: t("guestLists.linkCopied") });
  }

  const ticketTypeMap = new Map(allTicketTypes.map((tt) => [tt.id, tt]));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("guestLists.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("guestLists.subtitle")}</p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          {t("guestLists.create")}
        </Button>
      </div>

      {guestLists.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Users className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">{t("guestLists.empty")}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("guestLists.nameCol")}</TableHead>
                  <TableHead>{t("guestLists.capacityCol")}</TableHead>
                  <TableHead>{t("guestLists.signupsCol")}</TableHead>
                  <TableHead>{t("guestLists.zoneCol")}</TableHead>
                  <TableHead>{t("guestLists.visibilityCol")}</TableHead>
                  <TableHead>{t("guestLists.statusCol")}</TableHead>
                  <TableHead>{t("guestLists.expiresCol")}</TableHead>
                  <TableHead className="text-right">{t("guestLists.actionsCol")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {guestLists.map((list) => (
                  <Fragment key={list.id}>
                    <TableRow>
                      <TableCell className="font-medium">{list.name}</TableCell>
                      <TableCell>{list.maxGuests}</TableCell>
                      <TableCell>
                        {list.currentCount} / {list.maxGuests}
                      </TableCell>
                      <TableCell>
                        {list.ticketTypeId && ticketTypeMap.has(list.ticketTypeId) ? (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {ticketTypeMap.get(list.ticketTypeId)!.name}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={list.isPublic ? "default" : "secondary"}>
                          {list.isPublic ? t("guestLists.public") : t("guestLists.private")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={list.status === "active" ? "default" : "destructive"}
                          className="cursor-pointer"
                          onClick={() => handleToggleStatus(list)}
                        >
                          {list.status === "active" ? t("guestLists.active") : t("guestLists.closed")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {list.expiresAt
                          ? new Date(list.expiresAt).toLocaleDateString()
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => copyLink(list.slug)} title={t("guestLists.copyLink")}>
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openEditDialog(list)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setExpandedListId(expandedListId === list.id ? null : list.id)}
                          >
                            {expandedListId === list.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm(t("guestLists.confirmDelete"))) deleteMutation.mutate(list.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedListId === list.id && (
                      <TableRow key={`${list.id}-entries`}>
                        <TableCell colSpan={8} className="bg-muted/50 p-4">
                          <div className="mb-2 flex items-center gap-2">
                            <Link2 className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground font-mono truncate">
                              {getShareableLink(list.slug)}
                            </span>
                            <Button variant="outline" size="sm" onClick={() => copyLink(list.slug)}>
                              <Copy className="h-3 w-3 mr-1" />
                              {t("guestLists.copyLink")}
                            </Button>
                          </div>
                          {entriesLoading ? (
                            <div className="flex justify-center py-4">
                              <Loader2 className="h-5 w-5 animate-spin" />
                            </div>
                          ) : entries.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-2">{t("guestLists.noEntries")}</p>
                          ) : (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>{t("guestLists.entryName")}</TableHead>
                                  <TableHead>{t("guestLists.entryEmail")}</TableHead>
                                  <TableHead>{t("guestLists.entryPhone")}</TableHead>
                                  <TableHead>{t("guestLists.entryDate")}</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {entries.map((entry: GuestListEntryData) => (
                                  <TableRow key={entry.id}>
                                    <TableCell>{entry.name}</TableCell>
                                    <TableCell>{entry.email}</TableCell>
                                    <TableCell>{entry.phone || "—"}</TableCell>
                                    <TableCell>{new Date(entry.createdAt).toLocaleString()}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingList ? t("guestLists.editTitle") : t("guestLists.createTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>{t("guestLists.nameLabel")}</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={t("guestLists.namePlaceholder")}
              />
            </div>
            <div>
              <Label>{t("guestLists.maxGuestsLabel")}</Label>
              <Input
                type="number"
                min="1"
                value={formMaxGuests}
                onChange={(e) => setFormMaxGuests(e.target.value)}
              />
            </div>
            {hiddenTicketTypes.length > 0 && (
              <div className="space-y-1">
                <Label>{t("guestLists.zoneLabel")}</Label>
                <Select value={formTicketTypeId} onValueChange={setFormTicketTypeId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("guestLists.noZone")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{t("guestLists.noZone")}</SelectItem>
                    {hiddenTicketTypes.map((tt) => (
                      <SelectItem key={tt.id} value={tt.id}>{tt.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{t("guestLists.zoneHelper")}</p>
              </div>
            )}
            <div className="flex items-center gap-3">
              <Switch checked={formIsPublic} onCheckedChange={setFormIsPublic} />
              <Label>{t("guestLists.publicLabel")}</Label>
            </div>
            <div>
              <Label>{t("guestLists.expiresAtLabel")}</Label>
              <DateTimePicker
                value={formExpiresAt}
                onChange={setFormExpiresAt}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>{t("common.cancel")}</Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingList ? t("common.save") : t("guestLists.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
