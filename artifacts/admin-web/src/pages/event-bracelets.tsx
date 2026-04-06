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

export default function EventBracelets() {
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
        onSuccess: () => { toast({ title: "Bracelet unflagged" }); invalidate(); },
        onError: (e: unknown) => toast({ title: "Error", description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  const handleDelete = () => {
    if (!selected) return;
    deleteB.mutate(
      { nfcUid: selected.nfcUid },
      {
        onSuccess: () => { toast({ title: "Bracelet deleted" }); setDeleteOpen(false); invalidate(); },
        onError: (e: unknown) => toast({ title: "Error", description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Wristbands</h1>
        <p className="text-muted-foreground mt-1">Browse and manage event wristbands.</p>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input data-testid="input-bracelet-search" placeholder="Search NFC UID or attendee name..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={flaggedFilter} onValueChange={setFlaggedFilter}>
          <SelectTrigger className="w-36" data-testid="select-bracelet-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="flagged">Flagged</SelectItem>
            <SelectItem value="ok">OK</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border border-border rounded-lg bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>NFC UID</TableHead>
              <TableHead>Attendee</TableHead>
              <TableHead className="text-right">Balance (COP)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Registered</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8">Loading...</TableCell></TableRow>
            ) : !eventId ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No event assigned to your account.</TableCell></TableRow>
            ) : filteredBracelets.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No wristbands found.</TableCell></TableRow>
            ) : (
              filteredBracelets.map((bracelet) => (
                <TableRow key={bracelet.id} data-testid={`row-bracelet-${bracelet.id}`}>
                  <TableCell className="font-mono text-sm">{bracelet.nfcUid}</TableCell>
                  <TableCell>{bracelet.attendeeName ?? <span className="text-muted-foreground italic">unnamed</span>}</TableCell>
                  <TableCell className="text-right font-mono">{(bracelet.lastKnownBalanceCop ?? 0).toLocaleString()}</TableCell>
                  <TableCell>
                    {bracelet.flagged ? (
                      <Badge variant="destructive" className="text-xs">Flagged</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-green-500 border-green-500">OK</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(bracelet.createdAt).toLocaleDateString()}</TableCell>
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
            Showing {filteredBracelets.length} of {data.total} wristbands
          </div>
        )}
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Wristband</AlertDialogTitle>
            <AlertDialogDescription>
              Delete wristband {selected?.nfcUid}? This will permanently remove it and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction data-testid="button-confirm-delete-bracelet" onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteB.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
