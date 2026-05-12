import { fmtDate } from "@/lib/date";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListUsers,
  useCreateAccount,
  useUpdateUserRole,
  useDeleteUser,
  useBlockUser,
  useSuspendUser,
  useUnsuspendUser,
  useResetUserPassword,
  useGetCurrentAuthUser,
  useGetEvent,
  useListMerchants,
  getListUsersQueryKey,
} from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { MoreHorizontal, Plus, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEventContext } from "@/contexts/event-context";

const NFC_ROLES = ["bank", "gate", "merchant_staff", "merchant_admin", "warehouse_admin", "event_admin", "box_office"];
const TICKETING_ONLY_ROLES = ["event_admin", "box_office"];

export default function EventUsers() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: auth } = useGetCurrentAuthUser();
  const { eventId } = useEventContext();

  const { data: eventData } = useGetEvent(eventId || "", { query: { enabled: !!eventId } });
  const nfcEnabled = (eventData as Record<string, unknown> | undefined)?.nfcBraceletsEnabled !== false;
  const availableRoles = nfcEnabled ? NFC_ROLES : TICKETING_ONLY_ROLES;

  const { data, isLoading } = useListUsers();
  const allUsers = data?.users ?? [];
  const users = allUsers.filter((u) => u.eventId === eventId && (nfcEnabled ? u.role !== "event_admin" : true));

  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<typeof users[0] | null>(null);

  const defaultRole = nfcEnabled ? "bank" : "event_admin";
  const [newUser, setNewUser] = useState({ firstName: "", lastName: "", username: "", password: "", role: defaultRole, merchantId: "" });
  const [newRole, setNewRole] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const { data: merchantsData } = useListMerchants();
  const merchants = (merchantsData?.merchants ?? []).filter((m: { eventId?: string | null }) => m.eventId === eventId);
  const needsMerchant = newUser.role === "merchant_admin" || newUser.role === "merchant_staff";

  const createAccount = useCreateAccount();
  const updateRole = useUpdateUserRole();
  const deleteUser = useDeleteUser();
  const blockUser = useBlockUser();
  const suspendUser = useSuspendUser();
  const unsuspendUser = useUnsuspendUser();
  const resetPassword = useResetUserPassword();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return (
      (u.firstName ?? "").toLowerCase().includes(q) ||
      (u.lastName ?? "").toLowerCase().includes(q) ||
      (u.username ?? "").toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  });

  function statusBadge(user: typeof users[0]) {
    if (user.isBlocked) return <Badge variant="destructive" className="text-xs">{t("eventUsers.statusBlocked")}</Badge>;
    if (user.isSuspended) return <Badge variant="outline" className="text-xs text-yellow-500 border-yellow-500">{t("eventUsers.statusSuspended")}</Badge>;
    return <Badge variant="outline" className="text-xs text-green-500 border-green-500">{t("eventUsers.statusActive")}</Badge>;
  }

  const handleCreate = () => {
    if (!eventId) return;
    if (needsMerchant && !newUser.merchantId) return;
    createAccount.mutate(
      { data: { firstName: newUser.firstName, lastName: newUser.lastName || undefined, username: newUser.username, password: newUser.password, role: newUser.role as "bank" | "gate" | "merchant_staff" | "merchant_admin" | "warehouse_admin" | "event_admin", eventId, ...(needsMerchant ? { merchantId: newUser.merchantId } : {}) } },
      {
        onSuccess: () => { toast({ title: t("eventUsers.created") }); setCreateOpen(false); setNewUser({ firstName: "", lastName: "", username: "", password: "", role: defaultRole, merchantId: "" }); invalidate(); },
        onError: (e: unknown) => toast({ title: t("common.error"), description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  const handleRoleUpdate = () => {
    if (!selectedUser) return;
    updateRole.mutate(
      { userId: selectedUser.id, data: { role: newRole as "bank" | "gate" | "merchant_staff" | "merchant_admin" | "warehouse_admin" | "event_admin" } },
      {
        onSuccess: () => { toast({ title: t("eventUsers.roleUpdated") }); setRoleOpen(false); invalidate(); },
        onError: (e: unknown) => toast({ title: t("common.error"), description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  const handleResetPassword = () => {
    if (!selectedUser || newPassword.length < 6) return;
    resetPassword.mutate(
      { userId: selectedUser.id, data: { newPassword } },
      {
        onSuccess: () => { toast({ title: t("eventUsers.passwordReset") }); setPasswordOpen(false); setNewPassword(""); },
        onError: (e: unknown) => toast({ title: t("common.error"), description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  const handleDelete = () => {
    if (!selectedUser) return;
    deleteUser.mutate(
      { userId: selectedUser.id },
      {
        onSuccess: () => { toast({ title: t("eventUsers.deleted") }); setDeleteOpen(false); invalidate(); },
        onError: (e: unknown) => toast({ title: t("common.error"), description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("eventUsers.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("eventUsers.subtitle")}</p>
        </div>
        <Button data-testid="button-create-event-user" onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> {t("eventUsers.addStaff")}
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input data-testid="input-user-search" placeholder={t("eventUsers.searchPlaceholder")} className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="border border-border rounded-lg bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("eventUsers.colName")}</TableHead>
              <TableHead>{t("eventUsers.colUsername")}</TableHead>
              <TableHead>{t("eventUsers.colRole")}</TableHead>
              <TableHead>{t("eventUsers.colStatus")}</TableHead>
              <TableHead>{t("eventUsers.colJoined")}</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8">{t("common.loading")}</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{t("eventUsers.noStaff")}</TableCell></TableRow>
            ) : (
              filtered.map((user) => (
                <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                  <TableCell className="font-medium">{user.firstName} {user.lastName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{user.username ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="uppercase text-xs tracking-wider">{user.role}</Badge>
                  </TableCell>
                  <TableCell>{statusBadge(user)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmtDate(user.createdAt)}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" data-testid={`button-user-menu-${user.id}`}><MoreHorizontal className="w-4 h-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setSelectedUser(user); setNewRole(user.role); setRoleOpen(true); }}>
                          {t("eventUsers.changeRole")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setSelectedUser(user); setPasswordOpen(true); }}>
                          {t("eventUsers.resetPassword")}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => blockUser.mutate(
                          { userId: user.id, data: { isBlocked: !user.isBlocked } },
                          { onSuccess: () => { toast({ title: user.isBlocked ? t("eventUsers.unblocked") : t("eventUsers.blocked") }); invalidate(); } }
                        )}>
                          {user.isBlocked ? t("eventUsers.unblock") : t("eventUsers.block")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => {
                          if (user.isSuspended) {
                            unsuspendUser.mutate({ userId: user.id }, { onSuccess: () => { toast({ title: t("eventUsers.reactivated") }); invalidate(); } });
                          } else {
                            suspendUser.mutate({ userId: user.id }, { onSuccess: () => { toast({ title: t("eventUsers.suspended") }); invalidate(); } });
                          }
                        }}>
                          {user.isSuspended ? t("eventUsers.reactivate") : t("eventUsers.suspend")}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive" onClick={() => { setSelectedUser(user); setDeleteOpen(true); }}>
                          {t("common.delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("eventUsers.addStaffTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t("eventUsers.firstName")}</Label>
                <Input data-testid="input-first-name" value={newUser.firstName} onChange={(e) => setNewUser((u) => ({ ...u, firstName: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>{t("eventUsers.lastName")}</Label>
                <Input data-testid="input-last-name" value={newUser.lastName} onChange={(e) => setNewUser((u) => ({ ...u, lastName: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>{t("eventUsers.username")}</Label>
              <Input data-testid="input-username" value={newUser.username} onChange={(e) => setNewUser((u) => ({ ...u, username: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>{t("eventUsers.password")}</Label>
              <Input data-testid="input-password" type="password" value={newUser.password} onChange={(e) => setNewUser((u) => ({ ...u, password: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>{t("eventUsers.role")}</Label>
              <Select value={newUser.role} onValueChange={(v) => setNewUser((u) => ({ ...u, role: v, merchantId: "" }))}>
                <SelectTrigger data-testid="select-staff-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableRoles.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {needsMerchant && (
              <div className="space-y-1">
                <Label>{t("eventUsers.merchant")}</Label>
                <Select value={newUser.merchantId} onValueChange={(v) => setNewUser((u) => ({ ...u, merchantId: v }))}>
                  <SelectTrigger data-testid="select-merchant"><SelectValue placeholder={t("eventUsers.selectMerchant")} /></SelectTrigger>
                  <SelectContent>
                    {merchants.map((m: { id: string; name: string }) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
            <Button data-testid="button-submit-create-user" onClick={handleCreate} disabled={createAccount.isPending || !newUser.firstName || !newUser.username || !newUser.password || (needsMerchant && !newUser.merchantId)}>
              {createAccount.isPending ? t("eventUsers.creating") : t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={roleOpen} onOpenChange={setRoleOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t("eventUsers.changeRoleTitle")} — {selectedUser?.firstName}</DialogTitle></DialogHeader>
          <Select value={newRole} onValueChange={setNewRole}>
            <SelectTrigger data-testid="select-new-role"><SelectValue /></SelectTrigger>
            <SelectContent>{availableRoles.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleOpen(false)}>{t("common.cancel")}</Button>
            <Button data-testid="button-submit-role" onClick={handleRoleUpdate} disabled={updateRole.isPending}>
              {updateRole.isPending ? t("eventUsers.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t("eventUsers.resetPasswordTitle")} — {selectedUser?.firstName}</DialogTitle></DialogHeader>
          <div className="space-y-1">
            <Label>{t("eventUsers.newPasswordLabel")}</Label>
            <Input data-testid="input-new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordOpen(false)}>{t("common.cancel")}</Button>
            <Button data-testid="button-submit-password" onClick={handleResetPassword} disabled={resetPassword.isPending || newPassword.length < 6}>
              {resetPassword.isPending ? t("eventUsers.resetting") : t("eventUsers.reset")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("eventUsers.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("eventUsers.deleteDesc", { name: `${selectedUser?.firstName} ${selectedUser?.lastName}` })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction data-testid="button-confirm-delete" onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteUser.isPending ? t("eventUsers.deleting") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
