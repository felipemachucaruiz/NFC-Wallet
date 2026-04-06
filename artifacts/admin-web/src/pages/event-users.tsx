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
  getListUsersQueryKey,
  UserRole,
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
import { MoreHorizontal, Plus, Search, UserX, UserCheck, Lock, Trash2, Key, Briefcase } from "lucide-react";

const EVENT_ROLES: UserRole[] = [UserRole.bank, UserRole.gate, UserRole.merchant_staff, UserRole.merchant_admin, UserRole.warehouse_admin];

function roleBadgeVariant(role: string) {
  if (role === "event_admin") return "default";
  return "secondary";
}

export default function EventUsers() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: auth } = useGetCurrentAuthUser();
  const eventId = auth?.user?.eventId;

  const { data, isLoading } = useListUsers();
  const allUsers = data?.users ?? [];
  const users = allUsers.filter((u) => u.eventId === eventId && u.role !== "event_admin");

  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<typeof users[0] | null>(null);

  const [newUser, setNewUser] = useState({ firstName: "", lastName: "", username: "", password: "", role: UserRole.bank as UserRole });
  const [newRole, setNewRole] = useState("");
  const [newPassword, setNewPassword] = useState("");

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

  const handleCreate = () => {
    if (!eventId) return;
    createAccount.mutate(
      { data: { ...newUser, eventId } },
      {
        onSuccess: () => { toast({ title: "User created" }); setCreateOpen(false); setNewUser({ firstName: "", lastName: "", username: "", password: "", role: UserRole.bank }); invalidate(); },
        onError: (e: unknown) => toast({ title: "Error", description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  const handleRoleUpdate = () => {
    if (!selectedUser) return;
    updateRole.mutate(
      { userId: selectedUser.id, data: { role: newRole as UserRole } },
      {
        onSuccess: () => { toast({ title: "Role updated" }); setRoleOpen(false); invalidate(); },
        onError: (e: unknown) => toast({ title: "Error", description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  const handleBlock = (user: typeof users[0]) => {
    blockUser.mutate(
      { userId: user.id, data: { isBlocked: !user.isBlocked } },
      {
        onSuccess: () => { toast({ title: user.isBlocked ? "User unblocked" : "User blocked" }); invalidate(); },
        onError: (e: unknown) => toast({ title: "Error", description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  const handleSuspend = (user: typeof users[0]) => {
    if (user.isSuspended) {
      unsuspendUser.mutate({ userId: user.id }, { onSuccess: () => { toast({ title: "Reactivated" }); invalidate(); } });
    } else {
      suspendUser.mutate({ userId: user.id }, { onSuccess: () => { toast({ title: "Suspended" }); invalidate(); } });
    }
  };

  const handleResetPassword = () => {
    if (!selectedUser || newPassword.length < 6) return;
    resetPassword.mutate(
      { userId: selectedUser.id, data: { newPassword } },
      {
        onSuccess: () => { toast({ title: "Password reset" }); setPasswordOpen(false); setNewPassword(""); },
        onError: (e: unknown) => toast({ title: "Error", description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  const handleDelete = () => {
    if (!selectedUser) return;
    deleteUser.mutate(
      { userId: selectedUser.id },
      {
        onSuccess: () => { toast({ title: "User deleted" }); setDeleteOpen(false); invalidate(); },
        onError: (e: unknown) => toast({ title: "Error", description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Staff & Users</h1>
          <p className="text-muted-foreground mt-1">Manage staff for your event.</p>
        </div>
        <Button data-testid="button-create-event-user" onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> Add Staff
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input data-testid="input-user-search" placeholder="Search staff..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="border border-border rounded-lg bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Username</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8">Loading...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No staff found.</TableCell></TableRow>
            ) : (
              filtered.map((user) => (
                <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                  <TableCell className="font-medium">{user.firstName} {user.lastName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{user.username ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={roleBadgeVariant(user.role)} className="uppercase text-xs tracking-wider">{user.role}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {user.isBlocked && <Badge variant="destructive" className="text-xs">Blocked</Badge>}
                      {user.isSuspended && <Badge variant="outline" className="text-xs text-yellow-500 border-yellow-500">Suspended</Badge>}
                      {!user.isBlocked && !user.isSuspended && <Badge variant="outline" className="text-xs text-green-500 border-green-500">Active</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(user.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" data-testid={`button-user-menu-${user.id}`}><MoreHorizontal className="w-4 h-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setSelectedUser(user); setNewRole(user.role); setRoleOpen(true); }}>
                          <Briefcase className="w-4 h-4 mr-2" /> Change Role
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setSelectedUser(user); setPasswordOpen(true); }}>
                          <Key className="w-4 h-4 mr-2" /> Reset Password
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleBlock(user)}>
                          {user.isBlocked ? <><UserCheck className="w-4 h-4 mr-2" /> Unblock</> : <><Lock className="w-4 h-4 mr-2" /> Block</>}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleSuspend(user)}>
                          {user.isSuspended ? <><UserCheck className="w-4 h-4 mr-2" /> Reactivate</> : <><UserX className="w-4 h-4 mr-2" /> Suspend</>}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive" onClick={() => { setSelectedUser(user); setDeleteOpen(true); }}>
                          <Trash2 className="w-4 h-4 mr-2" /> Delete
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
          <DialogHeader><DialogTitle>Add Staff Member</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>First Name *</Label>
                <Input data-testid="input-first-name" value={newUser.firstName} onChange={(e) => setNewUser((u) => ({ ...u, firstName: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Last Name</Label>
                <Input data-testid="input-last-name" value={newUser.lastName} onChange={(e) => setNewUser((u) => ({ ...u, lastName: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Username *</Label>
              <Input data-testid="input-username" value={newUser.username} onChange={(e) => setNewUser((u) => ({ ...u, username: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Password *</Label>
              <Input data-testid="input-password" type="password" value={newUser.password} onChange={(e) => setNewUser((u) => ({ ...u, password: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Role *</Label>
              <Select value={newUser.role} onValueChange={(v) => setNewUser((u) => ({ ...u, role: v as UserRole }))}>
                <SelectTrigger data-testid="select-staff-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EVENT_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button data-testid="button-submit-create-user" onClick={handleCreate} disabled={createAccount.isPending || !newUser.firstName || !newUser.username || !newUser.password}>
              {createAccount.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={roleOpen} onOpenChange={setRoleOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Change Role — {selectedUser?.firstName}</DialogTitle></DialogHeader>
          <Select value={newRole} onValueChange={setNewRole}>
            <SelectTrigger data-testid="select-new-role"><SelectValue /></SelectTrigger>
            <SelectContent>{EVENT_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleOpen(false)}>Cancel</Button>
            <Button data-testid="button-submit-role" onClick={handleRoleUpdate} disabled={updateRole.isPending}>{updateRole.isPending ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Reset Password — {selectedUser?.firstName}</DialogTitle></DialogHeader>
          <div className="space-y-1">
            <Label>New Password (min 6)</Label>
            <Input data-testid="input-new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordOpen(false)}>Cancel</Button>
            <Button data-testid="button-submit-password" onClick={handleResetPassword} disabled={resetPassword.isPending || newPassword.length < 6}>{resetPassword.isPending ? "Resetting..." : "Reset"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>Permanently delete {selectedUser?.firstName} {selectedUser?.lastName}?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction data-testid="button-confirm-delete" onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteUser.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
