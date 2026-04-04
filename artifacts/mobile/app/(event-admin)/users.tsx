import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import React, { useState, useEffect } from "react";
import { FlatList, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { useAlert } from "@/components/CustomAlert";
import { API_BASE_URL } from "@/constants/domain";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Input } from "@/components/ui/Input";
import { Loading } from "@/components/ui/Loading";
import { useAuth } from "@/contexts/AuthContext";
import { useZoneCache } from "@/contexts/ZoneCacheContext";

type EventAdminRole = "attendee" | "bank" | "gate" | "merchant_staff" | "merchant_admin" | "warehouse_admin";

const EVENT_ROLES: EventAdminRole[] = ["attendee", "bank", "gate", "merchant_staff", "merchant_admin", "warehouse_admin"];

const ROLE_COLORS: Record<EventAdminRole, "success" | "info" | "warning" | "muted" | "danger"> = {
  attendee: "muted",
  bank: "info",
  gate: "success",
  merchant_staff: "success",
  merchant_admin: "warning",
  warehouse_admin: "info",
};

const MERCHANT_ROLES: EventAdminRole[] = ["merchant_staff", "merchant_admin"];
const GATE_ROLES: EventAdminRole[] = ["gate"];

type User = {
  id: string;
  email: string | null;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string;
  merchantId: string | null;
  gateZoneId: string | null;
  isBlocked: boolean;
};

type Merchant = {
  id: string;
  name: string;
};

const getApiBase = (): string => API_BASE_URL;

export default function EventAdminUsersScreen() {
  const { t } = useTranslation();
  const { show: showAlert } = useAlert();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { token } = useAuth();
  const { zones } = useZoneCache();

  const [users, setUsers] = useState<User[]>([]);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [selectedRole, setSelectedRole] = useState<EventAdminRole>("merchant_admin");
  const [selectedMerchantId, setSelectedMerchantId] = useState<string | null>(null);
  const [selectedGateZoneId, setSelectedGateZoneId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Edit role form
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editRole, setEditRole] = useState<EventAdminRole>("merchant_admin");
  const [editMerchantId, setEditMerchantId] = useState<string | null>(null);
  const [editGateZoneId, setEditGateZoneId] = useState<string | null>(null);
  const [isSavingRole, setIsSavingRole] = useState(false);

  // Reset password
  const [resetPw, setResetPw] = useState("");
  const [isResettingPw, setIsResettingPw] = useState(false);
  const [isBlocking, setIsBlocking] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchData = async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const [usersRes, merchantsRes] = await Promise.all([
        fetch(`${getApiBase()}/api/users`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${getApiBase()}/api/merchants`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (usersRes.ok) {
        const body = await usersRes.json() as { users: User[] };
        setUsers(body.users);
      }
      if (merchantsRes.ok) {
        const body = await merchantsRes.json() as { merchants: Merchant[] };
        setMerchants(body.merchants);
      }
    } catch {}
    setIsLoading(false);
  };

  useEffect(() => { fetchData(); }, [token]);

  const resetCreateForm = () => {
    setUsername(""); setEmail(""); setPassword(""); setFirstName(""); setLastName("");
    setSelectedRole("merchant_admin"); setSelectedMerchantId(null); setSelectedGateZoneId(null);
  };

  const handleCreate = async () => {
    if (!username.trim() || !password.trim()) {
      showAlert(t("common.error"), t("common.fillRequired")); return;
    }
    if (/\s/.test(username)) {
      showAlert(t("common.error"), t("eventAdmin.usernameNoSpaces")); return;
    }
    if (MERCHANT_ROLES.includes(selectedRole) && !selectedMerchantId) {
      showAlert(t("common.error"), t("eventAdmin.selectMerchantForRole")); return;
    }
    setIsCreating(true);
    try {
      const body: Record<string, unknown> = {
        username: username.trim().toLowerCase(),
        password,
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        role: selectedRole,
      };
      if (email.trim()) body.email = email.trim().toLowerCase();
      if (MERCHANT_ROLES.includes(selectedRole) && selectedMerchantId) {
        body.merchantId = selectedMerchantId;
      }
      if (GATE_ROLES.includes(selectedRole) && selectedGateZoneId) {
        body.gateZoneId = selectedGateZoneId;
      }
      const res = await fetch(`${getApiBase()}/api/auth/create-account`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        showAlert(t("common.success"), t("eventAdmin.userCreated"));
        setShowCreate(false);
        resetCreateForm();
        fetchData();
      } else {
        const err = await res.json().catch(() => ({})) as { error?: string };
        showAlert(t("common.error"), err.error ?? t("common.unknownError"));
      }
    } catch {
      showAlert(t("common.error"), t("common.unknownError"));
    }
    setIsCreating(false);
  };

  const openEdit = (user: User) => {
    setEditingUser(user);
    setEditRole((user.role as EventAdminRole) ?? "attendee");
    setEditMerchantId(user.merchantId ?? null);
    setEditGateZoneId(user.gateZoneId ?? null);
    setResetPw("");
  };

  const handleResetPassword = async () => {
    if (!editingUser) return;
    if (resetPw.length < 6) {
      showAlert(t("common.error"), t("common.passwordMinLength"));
      return;
    }
    setIsResettingPw(true);
    try {
      const res = await fetch(`${getApiBase()}/api/users/${editingUser.id}/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ newPassword: resetPw }),
      });
      if (res.ok) {
        showAlert(t("common.success"), t("admin.passwordReset"));
        setEditingUser(null);
      } else {
        const err = await res.json().catch(() => ({})) as { error?: string };
        showAlert(t("common.error"), err.error ?? t("common.unknownError"));
      }
    } catch {
      showAlert(t("common.error"), t("common.unknownError"));
    }
    setIsResettingPw(false);
  };

  const getDisplayName = (user: User) =>
    user.firstName && user.lastName
      ? `${user.firstName} ${user.lastName}`
      : user.username ?? user.email ?? user.id;

  const handleDelete = async () => {
    if (!editingUser) return;
    const name = getDisplayName(editingUser);
    showAlert(
      t("eventAdmin.deleteUser"),
      t("eventAdmin.deleteUserConfirm", { name }),
      [
        { text: t("common.cancel"), variant: "cancel" },
        {
          text: t("eventAdmin.deleteUser"),
          variant: "danger",
          onPress: async () => {
            setIsDeleting(true);
            try {
              const res = await fetch(`${getApiBase()}/api/users/${editingUser.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
              });
              if (res.ok) {
                showAlert(t("common.success"), t("eventAdmin.userDeleted"));
                setEditingUser(null);
                fetchData();
              } else {
                const err = await res.json().catch(() => ({})) as { error?: string };
                showAlert(t("common.error"), err.error ?? t("common.unknownError"));
              }
            } catch {
              showAlert(t("common.error"), t("common.unknownError"));
            }
            setIsDeleting(false);
          },
        },
      ],
    );
  };

  const handleBlock = async () => {
    if (!editingUser) return;
    const name = getDisplayName(editingUser);
    const willBlock = !editingUser.isBlocked;
    if (willBlock) {
      showAlert(
        t("eventAdmin.blockUser"),
        t("eventAdmin.blockUserConfirm", { name }),
        [
          { text: t("common.cancel"), variant: "cancel" },
          {
            text: t("eventAdmin.blockUser"),
            variant: "danger",
            onPress: () => executeBlock(true),
          },
        ],
      );
    } else {
      executeBlock(false);
    }
  };

  const executeBlock = async (block: boolean) => {
    if (!editingUser) return;
    setIsBlocking(true);
    try {
      const res = await fetch(`${getApiBase()}/api/users/${editingUser.id}/block`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isBlocked: block }),
      });
      if (res.ok) {
        showAlert(t("common.success"), block ? t("eventAdmin.userBlocked") : t("eventAdmin.userUnblocked"));
        setEditingUser(null);
        fetchData();
      } else {
        const err = await res.json().catch(() => ({})) as { error?: string };
        showAlert(t("common.error"), err.error ?? t("common.unknownError"));
      }
    } catch {
      showAlert(t("common.error"), t("common.unknownError"));
    }
    setIsBlocking(false);
  };

  const handleSaveRole = async () => {
    if (!editingUser) return;
    if (MERCHANT_ROLES.includes(editRole) && !editMerchantId) {
      showAlert(t("common.error"), t("eventAdmin.selectMerchantForRole")); return;
    }
    setIsSavingRole(true);
    try {
      const body: Record<string, unknown> = { role: editRole };
      if (MERCHANT_ROLES.includes(editRole)) {
        body.merchantId = editMerchantId;
      } else {
        body.merchantId = null;
      }
      if (GATE_ROLES.includes(editRole)) {
        body.gateZoneId = editGateZoneId;
      } else {
        body.gateZoneId = null;
      }
      const res = await fetch(`${getApiBase()}/api/users/${editingUser.id}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setEditingUser(null);
        fetchData();
      } else {
        const err = await res.json().catch(() => ({})) as { error?: string };
        showAlert(t("common.error"), err.error ?? t("common.unknownError"));
      }
    } catch {
      showAlert(t("common.error"), t("common.unknownError"));
    }
    setIsSavingRole(false);
  };

  if (isLoading && users.length === 0) return <Loading label={t("common.loading")} />;

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <FlatList
        data={users}
        keyExtractor={(item) => item.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingTop: isWeb ? 67 : insets.top + 16,
          paddingBottom: isWeb ? 34 : insets.bottom + 100,
          paddingHorizontal: 20,
          gap: 12,
        }}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={fetchData} tintColor={C.primary} />}
        ListHeaderComponent={() => (
          <View style={styles.header}>
            <Text style={[styles.title, { color: C.text }]}>{t("eventAdmin.users")}</Text>
            <Button title={`+ ${t("eventAdmin.createUser")}`} onPress={() => setShowCreate(true)} variant="primary" size="sm" />
          </View>
        )}
        ListEmptyComponent={() => (
          <Empty icon="users" title={t("admin.noUsers")} actionLabel={t("eventAdmin.createUser")} onAction={() => setShowCreate(true)} />
        )}
        scrollEnabled={!!users.length}
        renderItem={({ item }) => {
          const merchant = merchants.find((m) => m.id === item.merchantId);
          return (
            <Pressable onPress={() => openEdit(item)}>
              <Card>
                <View style={styles.userRow}>
                  <View style={[styles.userIcon, { backgroundColor: C.inputBg }]}>
                    <Feather name="user" size={18} color={C.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.userName, { color: C.text }]}>
                      {item.firstName && item.lastName ? `${item.firstName} ${item.lastName}` : item.username ?? item.email ?? item.id}
                    </Text>
                    {item.username ? <Text style={[styles.userEmail, { color: C.textSecondary }]}>@{item.username}</Text> : null}
                    {item.email ? <Text style={[styles.userEmail, { color: C.textMuted }]}>{item.email}</Text> : null}
                    {merchant ? <Text style={[styles.merchantName, { color: C.textMuted }]}>{merchant.name}</Text> : null}
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <Badge label={t(`admin.roles.${item.role}`, { defaultValue: item.role })} variant={ROLE_COLORS[item.role as EventAdminRole] ?? "muted"} size="sm" />
                    {item.isBlocked ? <Badge label={t("eventAdmin.blockedBadge")} variant="danger" size="sm" /> : null}
                    <Feather name="edit-2" size={12} color={C.textMuted} />
                  </View>
                </View>
              </Card>
            </Pressable>
          );
        }}
      />

      {/* Create User Modal */}
      <Modal visible={showCreate} transparent animationType="slide">
        <View style={[styles.overlay, { backgroundColor: C.overlay }]}>
          <ScrollView style={[styles.sheet, { backgroundColor: C.card }]} contentContainerStyle={{ gap: 16, padding: 24 }}>
            <Text style={[styles.sheetTitle, { color: C.text }]}>{t("eventAdmin.createUser")}</Text>
            <Input label={t("admin.clientUsername")} value={username} onChangeText={(v) => setUsername(v.replace(/\s/g, "").toLowerCase())} placeholder="juancarlos" autoCapitalize="none" autoCorrect={false} />
            <Input label={`${t("common.email")} (${t("common.optional")})`} value={email} onChangeText={(v) => setEmail(v.toLowerCase())} keyboardType="email-address" placeholder="user@example.com" autoCapitalize="none" />
            <Input label={t("auth.password")} value={password} onChangeText={setPassword} secureTextEntry placeholder={t("auth.passwordPlaceholder")} />
            <Input label={t("eventAdmin.firstName")} value={firstName} onChangeText={setFirstName} placeholder={t("eventAdmin.firstNamePlaceholder")} />
            <Input label={t("eventAdmin.lastName")} value={lastName} onChangeText={setLastName} placeholder={t("eventAdmin.lastNamePlaceholder")} />
            <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>{t("admin.selectRole")}</Text>
            <View style={styles.roleGrid}>
              {EVENT_ROLES.map((role) => (
                <Pressable
                  key={role}
                  onPress={() => { setSelectedRole(role); if (!MERCHANT_ROLES.includes(role)) setSelectedMerchantId(null); }}
                  style={[
                    styles.roleChip,
                    { backgroundColor: selectedRole === role ? C.primary : C.inputBg, borderColor: selectedRole === role ? C.primary : C.border },
                  ]}
                >
                  <Text style={[styles.roleChipText, { color: selectedRole === role ? "#0a0a0a" : C.textSecondary }]}>
                    {t(`admin.roles.${role}`)}
                  </Text>
                </Pressable>
              ))}
            </View>
            {MERCHANT_ROLES.includes(selectedRole) && merchants.length > 0 ? (
              <>
                <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>{t("eventAdmin.selectMerchant")}</Text>
                <View style={styles.roleGrid}>
                  {merchants.map((m) => (
                    <Pressable
                      key={m.id}
                      onPress={() => setSelectedMerchantId(m.id)}
                      style={[
                        styles.roleChip,
                        { backgroundColor: selectedMerchantId === m.id ? C.primary : C.inputBg, borderColor: selectedMerchantId === m.id ? C.primary : C.border },
                      ]}
                    >
                      <Text style={[styles.roleChipText, { color: selectedMerchantId === m.id ? "#0a0a0a" : C.textSecondary }]}>{m.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
            {GATE_ROLES.includes(selectedRole) && zones.length > 0 ? (
              <>
                <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>{t("zones.assignZone")}</Text>
                <View style={styles.roleGrid}>
                  {zones.map((z) => (
                    <Pressable
                      key={z.id}
                      onPress={() => setSelectedGateZoneId(z.id === selectedGateZoneId ? null : z.id)}
                      style={[
                        styles.roleChip,
                        { backgroundColor: selectedGateZoneId === z.id ? z.colorHex : C.inputBg, borderColor: selectedGateZoneId === z.id ? z.colorHex : C.border },
                      ]}
                    >
                      <Text style={[styles.roleChipText, { color: selectedGateZoneId === z.id ? "#fff" : C.textSecondary }]}>{z.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
            <View style={styles.sheetActions}>
              <Button title={t("common.cancel")} onPress={() => { setShowCreate(false); resetCreateForm(); }} variant="secondary" />
              <Button title={t("eventAdmin.createUser")} onPress={handleCreate} variant="primary" loading={isCreating} />
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Edit Role Modal */}
      <Modal visible={!!editingUser} transparent animationType="slide">
        <View style={[styles.overlay, { backgroundColor: C.overlay }]}>
          <ScrollView style={[styles.sheet, { backgroundColor: C.card }]} contentContainerStyle={{ gap: 16, padding: 24 }}>
            <Text style={[styles.sheetTitle, { color: C.text }]}>{t("admin.userRole")}</Text>
            {editingUser ? (
              <View style={{ gap: 2 }}>
                <Text style={[styles.userName, { color: C.text }]}>
                  {editingUser.firstName && editingUser.lastName
                    ? `${editingUser.firstName} ${editingUser.lastName}`
                    : editingUser.username ?? editingUser.email ?? editingUser.id}
                </Text>
                {editingUser.username ? <Text style={[styles.userEmail, { color: C.textSecondary }]}>@{editingUser.username}</Text> : null}
                {editingUser.email ? <Text style={[styles.userEmail, { color: C.textMuted }]}>{editingUser.email}</Text> : null}
              </View>
            ) : null}
            <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>{t("admin.selectRole")}</Text>
            <View style={styles.roleGrid}>
              {EVENT_ROLES.map((role) => (
                <Pressable
                  key={role}
                  onPress={() => { setEditRole(role); if (!MERCHANT_ROLES.includes(role)) setEditMerchantId(null); }}
                  style={[
                    styles.roleChip,
                    { backgroundColor: editRole === role ? C.primary : C.inputBg, borderColor: editRole === role ? C.primary : C.border },
                  ]}
                >
                  <Text style={[styles.roleChipText, { color: editRole === role ? "#0a0a0a" : C.textSecondary }]}>
                    {t(`admin.roles.${role}`)}
                  </Text>
                </Pressable>
              ))}
            </View>
            {MERCHANT_ROLES.includes(editRole) && merchants.length > 0 ? (
              <>
                <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>{t("eventAdmin.selectMerchant")}</Text>
                <View style={styles.roleGrid}>
                  {merchants.map((m) => (
                    <Pressable
                      key={m.id}
                      onPress={() => setEditMerchantId(m.id)}
                      style={[
                        styles.roleChip,
                        { backgroundColor: editMerchantId === m.id ? C.primary : C.inputBg, borderColor: editMerchantId === m.id ? C.primary : C.border },
                      ]}
                    >
                      <Text style={[styles.roleChipText, { color: editMerchantId === m.id ? "#0a0a0a" : C.textSecondary }]}>{m.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
            {GATE_ROLES.includes(editRole) && zones.length > 0 ? (
              <>
                <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>{t("zones.assignZone")}</Text>
                <View style={styles.roleGrid}>
                  {zones.map((z) => (
                    <Pressable
                      key={z.id}
                      onPress={() => setEditGateZoneId(z.id === editGateZoneId ? null : z.id)}
                      style={[
                        styles.roleChip,
                        { backgroundColor: editGateZoneId === z.id ? z.colorHex : C.inputBg, borderColor: editGateZoneId === z.id ? z.colorHex : C.border },
                      ]}
                    >
                      <Text style={[styles.roleChipText, { color: editGateZoneId === z.id ? "#fff" : C.textSecondary }]}>{z.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
            <View style={styles.sheetActions}>
              <Button title={t("common.cancel")} onPress={() => setEditingUser(null)} variant="secondary" />
              <Button title={t("common.save")} onPress={handleSaveRole} variant="primary" loading={isSavingRole} />
            </View>

            <View style={[styles.divider, { backgroundColor: C.separator }]} />

            <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>{t("admin.resetPassword")}</Text>
            <Input
              label={t("admin.newPassword")}
              value={resetPw}
              onChangeText={setResetPw}
              secureTextEntry
              placeholder="••••••"
            />
            <Button
              title={t("admin.resetPassword")}
              onPress={handleResetPassword}
              variant="danger"
              loading={isResettingPw}
            />

            <View style={[styles.divider, { backgroundColor: C.separator }]} />

            <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>{t("common.danger")}</Text>
            <Button
              title={editingUser?.isBlocked ? t("eventAdmin.unblockUser") : t("eventAdmin.blockUser")}
              onPress={handleBlock}
              variant="secondary"
              loading={isBlocking}
            />
            <Button
              title={t("eventAdmin.deleteUser")}
              onPress={handleDelete}
              variant="danger"
              loading={isDeleting}
            />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  userRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  userIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  userName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  userEmail: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  merchantName: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  overlay: { flex: 1, justifyContent: "flex-end" },
  sheet: { maxHeight: "85%", borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  sheetTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  sectionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8 },
  roleGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  roleChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100, borderWidth: 1 },
  roleChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  sheetActions: { flexDirection: "row", gap: 12 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
});
