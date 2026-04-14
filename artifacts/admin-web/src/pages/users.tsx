import { fmtDate } from "@/lib/date";
import { useState } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  useListUsers,
  useCreateAccount,
  useUpdateUserRole,
  useBlockUser,
  useSuspendUser,
  useUnsuspendUser,
  useResetUserPassword,
  useDeleteUser,
  useListEvents,
  useAssignUserToEvent,
  getListUsersQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import type { UserProfile as User, UserRole } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, MoreHorizontal, Activity, Download } from "lucide-react";
import { useTranslation } from "react-i18next";

type AuditorLoginEntry = { id: string; userId: string; loggedInAt: string; ipAddress: string | null };
type AuditorCsvEntry = { id: string; userId: string; downloadedAt: string; filters: Record<string, string> };
type TotpSetupResult = { secret: string; otpauthUrl: string; qrDataUrl: string };

type UserForm = {
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  password: string;
  role: string;
  eventId: string;
};
const emptyForm: UserForm = { firstName: "", lastName: "", email: "", username: "", password: "", role: "event_admin", eventId: "" };

const ROLES = ["admin", "event_admin", "merchant_admin", "merchant_staff", "bank", "gate", "warehouse_admin", "ticketing_auditor"];

function UserStatusBadge({ user, t }: { user: User; t: (key: string) => string }) {
  if (user.isBlocked) return <Badge variant="destructive" className="text-xs">{t("users.statusBlocked")}</Badge>;
  if (user.isSuspended) return <Badge variant="secondary" className="text-xs text-yellow-600">{t("users.statusSuspended")}</Badge>;
  return <Badge variant="default" className="text-xs">{t("users.statusActive")}</Badge>;
}

export default function Users() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useListUsers();
  const users = data?.users ?? [];
  const { data: eventsData } = useListEvents();
  const events = eventsData?.events ?? [];

  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [changeRoleOpen, setChangeRoleOpen] = useState(false);
  const [resetPwOpen, setResetPwOpen] = useState(false);
  const [assignEventOpen, setAssignEventOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [auditorActivityOpen, setAuditorActivityOpen] = useState(false);
  const [totpSetupOpen, setTotpSetupOpen] = useState(false);
  const [totpSetupResult, setTotpSetupResult] = useState<TotpSetupResult | null>(null);
  const [totpSetupLoading, setTotpSetupLoading] = useState(false);
  const [selected, setSelected] = useState<User | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [newRole, setNewRole] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newEventId, setNewEventId] = useState("");

  const { data: auditorLoginData } = useQuery<{ activity: AuditorLoginEntry[] }>({
    queryKey: ["auditor-login-activity", selected?.id],
    queryFn: () => customFetch<{ activity: AuditorLoginEntry[] }>(`/api/auditors/${selected!.id}/login-activity`),
    enabled: auditorActivityOpen && !!selected && selected.role === "ticketing_auditor",
  });

  const { data: auditorCsvData } = useQuery<{ downloads: AuditorCsvEntry[] }>({
    queryKey: ["auditor-csv-downloads", selected?.id],
    queryFn: () => customFetch<{ downloads: AuditorCsvEntry[] }>(`/api/auditors/${selected!.id}/csv-downloads`),
    enabled: auditorActivityOpen && !!selected && selected.role === "ticketing_auditor",
  });

  const createAccount = useCreateAccount();
  const updateRole = useUpdateUserRole();
  const blockUser = useBlockUser();
  const suspendUser = useSuspendUser();
  const unsuspendUser = useUnsuspendUser();
  const resetPw = useResetUserPassword();
  const deleteUser = useDeleteUser();
  const assignEvent = useAssignUserToEvent();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return (
      (u.firstName ?? "").toLowerCase().includes(q) ||
      (u.lastName ?? "").toLowerCase().includes(q) ||
      (u.email ?? "").toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("users.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("users.subtitle")}</p>
        </div>
        <Button data-testid="button-create-user" onClick={() => { setForm(emptyForm); setCreateOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" /> {t("users.createUser")}
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input data-testid="input-user-search" placeholder={t("users.searchPlaceholder")} className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="border border-border rounded-lg bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("users.colUser")}</TableHead>
              <TableHead>{t("users.colRole")}</TableHead>
              <TableHead>{t("users.colStatus")}</TableHead>
              <TableHead>{t("users.colEvent")}</TableHead>
              <TableHead>{t("users.colJoined")}</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8">{t("common.loading")}</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{t("users.noUsers")}</TableCell></TableRow>
            ) : (
              filtered.map((user) => (
                <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{user.firstName} {user.lastName}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="outline" className="text-xs capitalize">{user.role.replace(/_/g, " ")}</Badge></TableCell>
                  <TableCell><UserStatusBadge user={user} t={t} /></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{events.find((e) => e.id === user.eventId)?.name ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmtDate(user.createdAt)}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" data-testid={`button-user-menu-${user.id}`}><MoreHorizontal className="w-4 h-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setSelected(user); setNewRole(user.role); setChangeRoleOpen(true); }}>{t("users.changeRole")}</DropdownMenuItem>
                        {user.isBlocked
                          ? <DropdownMenuItem onClick={() => { blockUser.mutate({ userId: user.id, data: { isBlocked: false } }, { onSuccess: () => { toast({ title: t("users.unblocked") }); invalidate(); } }); }}>{t("users.unblock")}</DropdownMenuItem>
                          : <DropdownMenuItem onClick={() => { blockUser.mutate({ userId: user.id, data: { isBlocked: true } }, { onSuccess: () => { toast({ title: t("users.blocked") }); invalidate(); } }); }}>{t("users.block")}</DropdownMenuItem>
                        }
                        {user.isSuspended
                          ? <DropdownMenuItem onClick={() => { unsuspendUser.mutate({ userId: user.id }, { onSuccess: () => { toast({ title: t("users.reactivated") }); invalidate(); } }); }}>{t("users.reactivate")}</DropdownMenuItem>
                          : <DropdownMenuItem onClick={() => { suspendUser.mutate({ userId: user.id }, { onSuccess: () => { toast({ title: t("users.suspended") }); invalidate(); } }); }}>{t("users.suspend")}</DropdownMenuItem>
                        }
                        <DropdownMenuItem onClick={() => { setSelected(user); setNewPassword(""); setResetPwOpen(true); }}>{t("users.resetPassword")}</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setSelected(user); setNewEventId(user.eventId ?? ""); setAssignEventOpen(true); }}>{t("users.assignEvent")}</DropdownMenuItem>
                        {user.role === "ticketing_auditor" && (
                          <>
                            <DropdownMenuItem onClick={() => { setSelected(user); setAuditorActivityOpen(true); }}>
                              <Activity className="w-4 h-4 mr-2" />
                              Ver Actividad Auditor
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={async () => {
                              setSelected(user);
                              setTotpSetupResult(null);
                              setTotpSetupLoading(true);
                              setTotpSetupOpen(true);
                              try {
                                const result = await customFetch<TotpSetupResult>(`/api/auditors/${user.id}/setup-totp`, { method: "POST" });
                                setTotpSetupResult(result);
                              } catch {
                                toast({ title: "Error", description: "No se pudo configurar el 2FA.", variant: "destructive" });
                                setTotpSetupOpen(false);
                              } finally {
                                setTotpSetupLoading(false);
                              }
                            }}>
                              Configurar 2FA
                            </DropdownMenuItem>
                          </>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive" onClick={() => { setSelected(user); setDeleteOpen(true); }}>{t("common.delete")}</DropdownMenuItem>
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
          <DialogHeader><DialogTitle>{t("users.createTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>{t("users.firstName")}</Label><Input data-testid="input-first-name" value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} /></div>
              <div className="space-y-1"><Label>{t("users.lastName")}</Label><Input value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} /></div>
            </div>
            <div className="space-y-1"><Label>{t("users.email")}</Label><Input data-testid="input-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></div>
            <div className="space-y-1"><Label>{t("users.username")}</Label><Input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} /></div>
            <div className="space-y-1"><Label>{t("users.password")}</Label><Input data-testid="input-password" type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} /></div>
            <div className="space-y-1">
              <Label>{t("users.role")}</Label>
              <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}>
                <SelectTrigger data-testid="select-role"><SelectValue /></SelectTrigger>
                <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{r.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("users.assignToEvent")}</Label>
              <Select value={form.eventId || "none"} onValueChange={(v) => setForm((f) => ({ ...f, eventId: v === "none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder={t("users.none")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("users.none")}</SelectItem>
                  {events.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
            <Button data-testid="button-submit-user" onClick={() => {
              createAccount.mutate(
                { data: { firstName: form.firstName, lastName: form.lastName || undefined, email: form.email || undefined, username: form.username || undefined, password: form.password, role: form.role as UserRole, eventId: form.eventId || undefined } },
                {
                  onSuccess: () => { toast({ title: t("users.created") }); setCreateOpen(false); invalidate(); },
                  onError: (e: unknown) => toast({ title: t("users.errorCreating"), description: (e as { message?: string }).message, variant: "destructive" }),
                }
              );
            }} disabled={createAccount.isPending || !form.firstName || !form.password || !form.role}>
              {createAccount.isPending ? t("users.creating") : t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={changeRoleOpen} onOpenChange={setChangeRoleOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>{t("users.changeRoleTitle")}</DialogTitle></DialogHeader>
          <Select value={newRole} onValueChange={setNewRole}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{r.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangeRoleOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={() => {
              if (!selected) return;
              updateRole.mutate({ userId: selected.id, data: { role: newRole as UserRole } }, {
                onSuccess: () => { toast({ title: t("users.roleUpdated") }); setChangeRoleOpen(false); invalidate(); },
                onError: (e: unknown) => toast({ title: t("common.error"), description: (e as { message?: string }).message, variant: "destructive" }),
              });
            }} disabled={updateRole.isPending}>
              {updateRole.isPending ? t("users.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resetPwOpen} onOpenChange={setResetPwOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>{t("users.resetPasswordTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-1">
            <Label>{t("users.newPasswordLabel")}</Label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetPwOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={() => {
              if (!selected) return;
              resetPw.mutate({ userId: selected.id, data: { newPassword } }, {
                onSuccess: () => { toast({ title: t("users.passwordReset") }); setResetPwOpen(false); },
                onError: (e: unknown) => toast({ title: t("common.error"), description: (e as { message?: string }).message, variant: "destructive" }),
              });
            }} disabled={resetPw.isPending || newPassword.length < 6}>
              {resetPw.isPending ? t("users.resetting") : t("users.reset")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assignEventOpen} onOpenChange={setAssignEventOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>{t("users.assignEventTitle")}</DialogTitle></DialogHeader>
          <Select value={newEventId || "none"} onValueChange={(v) => setNewEventId(v === "none" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder={t("users.none")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("users.noneRemoveEvent")}</SelectItem>
              {events.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignEventOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={() => {
              if (!selected) return;
              assignEvent.mutate({ userId: selected.id, data: { eventId: newEventId || null } }, {
                onSuccess: () => { toast({ title: t("users.eventAssigned") }); setAssignEventOpen(false); invalidate(); },
                onError: (e: unknown) => toast({ title: t("common.error"), description: (e as { message?: string }).message, variant: "destructive" }),
              });
            }} disabled={assignEvent.isPending}>
              {assignEvent.isPending ? t("users.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Auditor Activity Dialog */}
      <Dialog open={auditorActivityOpen} onOpenChange={setAuditorActivityOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Actividad del Auditor — {selected?.firstName} {selected?.lastName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Activity className="w-4 h-4" /> Historial de Inicio de Sesión
              </h3>
              <div className="border border-border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha y Hora</TableHead>
                      <TableHead>Dirección IP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(auditorLoginData?.activity ?? []).length === 0 ? (
                      <TableRow><TableCell colSpan={2} className="text-center py-4 text-muted-foreground text-sm">Sin inicios de sesión registrados</TableCell></TableRow>
                    ) : (auditorLoginData?.activity ?? []).map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="text-sm">{new Date(entry.loggedInAt).toLocaleString("es-CO")}</TableCell>
                        <TableCell className="text-sm font-mono text-muted-foreground">{entry.ipAddress ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Download className="w-4 h-4" /> Historial de Exportaciones CSV
              </h3>
              <div className="border border-border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha y Hora</TableHead>
                      <TableHead>Filtros Aplicados</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(auditorCsvData?.downloads ?? []).length === 0 ? (
                      <TableRow><TableCell colSpan={2} className="text-center py-4 text-muted-foreground text-sm">Sin exportaciones registradas</TableCell></TableRow>
                    ) : (auditorCsvData?.downloads ?? []).map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="text-sm">{new Date(entry.downloadedAt).toLocaleString("es-CO")}</TableCell>
                        <TableCell className="text-sm text-muted-foreground font-mono">{JSON.stringify(entry.filters)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAuditorActivityOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* TOTP Setup Dialog for Auditors */}
      <Dialog open={totpSetupOpen} onOpenChange={setTotpSetupOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Configurar 2FA — {selected?.firstName} {selected?.lastName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {totpSetupLoading && (
              <div className="text-center py-6 text-muted-foreground text-sm">Generando código QR...</div>
            )}
            {totpSetupResult && (
              <>
                <p className="text-sm text-muted-foreground">
                  Pida al auditor que escanee este código QR con su aplicación autenticadora (Google Authenticator, Authy, etc.). Después de escanear, el auditor podrá iniciar sesión usando el código de 6 dígitos.
                </p>
                <div className="flex justify-center">
                  <img src={totpSetupResult.qrDataUrl} alt="QR Code 2FA" className="w-48 h-48" />
                </div>
                <div className="bg-muted rounded-md p-3">
                  <p className="text-xs text-muted-foreground mb-1">Clave secreta manual:</p>
                  <p className="font-mono text-sm break-all">{totpSetupResult.secret}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Nota: El auditor deberá confirmar el código la primera vez que inicie sesión para activar su 2FA.
                </p>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTotpSetupOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("users.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("users.deleteDesc", { name: `${selected?.firstName} ${selected?.lastName}` })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (!selected) return;
              deleteUser.mutate({ userId: selected.id }, {
                onSuccess: () => { toast({ title: t("users.deleted") }); setDeleteOpen(false); invalidate(); },
                onError: (e: unknown) => toast({ title: t("common.error"), description: (e as { message?: string }).message, variant: "destructive" }),
              });
            }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteUser.isPending ? t("users.deleting") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
