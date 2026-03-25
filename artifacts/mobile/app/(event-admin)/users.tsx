import { Feather } from "@expo/vector-icons";
import React, { useState, useEffect } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Input } from "@/components/ui/Input";
import { Loading } from "@/components/ui/Loading";
import { useAuth } from "@/contexts/AuthContext";

type EventAdminRole = "attendee" | "bank" | "merchant_staff" | "merchant_admin" | "warehouse_admin";

const EVENT_ROLES: EventAdminRole[] = ["attendee", "bank", "merchant_staff", "merchant_admin", "warehouse_admin"];

const ROLE_COLORS: Record<EventAdminRole, "success" | "info" | "warning" | "muted" | "danger"> = {
  attendee: "muted",
  bank: "info",
  merchant_staff: "success",
  merchant_admin: "warning",
  warehouse_admin: "info",
};

const MERCHANT_ROLES: EventAdminRole[] = ["merchant_staff", "merchant_admin"];

type User = {
  id: string;
  email: string | null;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string;
  merchantId: string | null;
};

type Merchant = {
  id: string;
  name: string;
};

const getApiBase = (): string => `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

export default function EventAdminUsersScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { token } = useAuth();

  const [users, setUsers] = useState<User[]>([]);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [selectedRole, setSelectedRole] = useState<EventAdminRole>("merchant_admin");
  const [selectedMerchantId, setSelectedMerchantId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Edit role form
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editRole, setEditRole] = useState<EventAdminRole>("merchant_admin");
  const [editMerchantId, setEditMerchantId] = useState<string | null>(null);
  const [isSavingRole, setIsSavingRole] = useState(false);

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
    setEmail(""); setPassword(""); setFirstName(""); setLastName("");
    setSelectedRole("merchant_admin"); setSelectedMerchantId(null);
  };

  const handleCreate = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert(t("common.error"), t("common.fillRequired")); return;
    }
    if (MERCHANT_ROLES.includes(selectedRole) && !selectedMerchantId) {
      Alert.alert(t("common.error"), t("eventAdmin.selectMerchantForRole")); return;
    }
    setIsCreating(true);
    try {
      const body: Record<string, unknown> = {
        email: email.trim(), password,
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        role: selectedRole,
      };
      if (MERCHANT_ROLES.includes(selectedRole) && selectedMerchantId) {
        body.merchantId = selectedMerchantId;
      }
      const res = await fetch(`${getApiBase()}/api/auth/create-account`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        Alert.alert(t("common.success"), t("eventAdmin.userCreated"));
        setShowCreate(false);
        resetCreateForm();
        fetchData();
      } else {
        const err = await res.json().catch(() => ({})) as { error?: string };
        Alert.alert(t("common.error"), err.error ?? t("common.unknownError"));
      }
    } catch {
      Alert.alert(t("common.error"), t("common.unknownError"));
    }
    setIsCreating(false);
  };

  const openEdit = (user: User) => {
    setEditingUser(user);
    setEditRole((user.role as EventAdminRole) ?? "attendee");
    setEditMerchantId(user.merchantId ?? null);
  };

  const handleSaveRole = async () => {
    if (!editingUser) return;
    if (MERCHANT_ROLES.includes(editRole) && !editMerchantId) {
      Alert.alert(t("common.error"), t("eventAdmin.selectMerchantForRole")); return;
    }
    setIsSavingRole(true);
    try {
      const body: Record<string, unknown> = { role: editRole };
      if (MERCHANT_ROLES.includes(editRole)) {
        body.merchantId = editMerchantId;
      } else {
        body.merchantId = null;
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
        Alert.alert(t("common.error"), err.error ?? t("common.unknownError"));
      }
    } catch {
      Alert.alert(t("common.error"), t("common.unknownError"));
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
                      {item.firstName && item.lastName ? `${item.firstName} ${item.lastName}` : item.email ?? item.username ?? item.id}
                    </Text>
                    {item.email ? <Text style={[styles.userEmail, { color: C.textSecondary }]}>{item.email}</Text> : null}
                    {merchant ? <Text style={[styles.merchantName, { color: C.textMuted }]}>{merchant.name}</Text> : null}
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <Badge label={t(`admin.roles.${item.role}`, { defaultValue: item.role })} variant={ROLE_COLORS[item.role as EventAdminRole] ?? "muted"} size="sm" />
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
            <Input label={t("common.email")} value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="user@example.com" autoCapitalize="none" />
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
                  <Text style={[styles.roleChipText, { color: selectedRole === role ? "#fff" : C.textSecondary }]}>
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
                      <Text style={[styles.roleChipText, { color: selectedMerchantId === m.id ? "#fff" : C.textSecondary }]}>{m.name}</Text>
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
              <Text style={[styles.userEmail, { color: C.textSecondary }]}>
                {editingUser.firstName && editingUser.lastName
                  ? `${editingUser.firstName} ${editingUser.lastName}`
                  : editingUser.email ?? editingUser.id}
              </Text>
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
                  <Text style={[styles.roleChipText, { color: editRole === role ? "#fff" : C.textSecondary }]}>
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
                      <Text style={[styles.roleChipText, { color: editMerchantId === m.id ? "#fff" : C.textSecondary }]}>{m.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
            <View style={styles.sheetActions}>
              <Button title={t("common.cancel")} onPress={() => setEditingUser(null)} variant="secondary" />
              <Button title={t("common.save")} onPress={handleSaveRole} variant="primary" loading={isSavingRole} />
            </View>
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
});
