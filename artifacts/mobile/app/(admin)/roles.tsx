import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useUpdateUserRole } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import Colors from "@/constants/colors";
import { useAlert } from "@/components/CustomAlert";
import { API_BASE_URL } from "@/constants/domain";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

type Role = "attendee" | "bank" | "merchant_staff" | "merchant_admin" | "warehouse_admin" | "event_admin" | "admin";

const ROLES: Role[] = ["attendee", "bank", "merchant_staff", "merchant_admin", "warehouse_admin", "event_admin", "admin"];

const ROLE_COLORS: Record<Role, "success" | "info" | "warning" | "muted" | "danger"> = {
  attendee: "muted",
  bank: "info",
  merchant_staff: "success",
  merchant_admin: "warning",
  warehouse_admin: "info",
  event_admin: "info",
  admin: "danger",
};

type UserItem = {
  id: string;
  email: string | null;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string;
};

const getApiBase = () => API_BASE_URL;

export default function RolesScreen() {
  const { t } = useTranslation();
  const { show: showAlert } = useAlert();
  const { user, logout, token } = useAuth();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const [showAssign, setShowAssign] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);
  const [selectedRole, setSelectedRole] = useState<Role>("attendee");
  const [userSearch, setUserSearch] = useState("");
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Tab inside the assign sheet: "role" or "password"
  const [activeTab, setActiveTab] = useState<"role" | "password">("role");
  const [newPassword, setNewPassword] = useState("");
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  const updateRole = useUpdateUserRole();

  const fetchUsers = useCallback(async () => {
    if (!token) return;
    setLoadingUsers(true);
    try {
      const res = await fetch(`${getApiBase()}/api/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setUsers((data.users ?? data) as UserItem[]);
    } catch {
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  }, [token]);

  useEffect(() => {
    if (showAssign) {
      fetchUsers();
      setSelectedUser(null);
      setUserSearch("");
      setSelectedRole("attendee");
      setActiveTab("role");
      setNewPassword("");
    }
  }, [showAssign, fetchUsers]);

  const filteredUsers = users.filter((u) => {
    const q = userSearch.toLowerCase();
    return (
      u.email?.toLowerCase().includes(q) ||
      u.username?.toLowerCase().includes(q) ||
      u.firstName?.toLowerCase().includes(q) ||
      u.lastName?.toLowerCase().includes(q)
    );
  });

  const handleLogout = () => {
    showAlert(t("auth.logoutConfirm"), undefined, [
      { text: t("common.cancel"), variant: "cancel" },
      {
        text: t("auth.logout"),
        variant: "danger",
        onPress: async () => {
          await logout();
          router.replace("/login");
        },
      },
    ]);
  };

  const handleAssign = async () => {
    if (!selectedUser) {
      showAlert(t("common.error"), t("admin.selectUserRequired"));
      return;
    }
    showAlert(
      t("admin.assignRole"),
      t("admin.assignRoleConfirm", {
        role: t(`admin.roles.${selectedRole}`),
        userId: selectedUser.firstName ?? selectedUser.email ?? selectedUser.username,
      }),
      [
        { text: t("common.cancel"), variant: "cancel" },
        {
          text: t("common.confirm"),
          onPress: async () => {
            try {
              await updateRole.mutateAsync({ userId: selectedUser.id, data: { role: selectedRole } });
              showAlert(t("common.success"), t("admin.roleAssigned"));
              setShowAssign(false);
            } catch {
              showAlert(t("common.error"), t("common.unknownError"));
            }
          },
        },
      ]
    );
  };

  const handleResetPassword = async () => {
    if (!selectedUser) return;
    if (newPassword.length < 6) {
      showAlert(t("common.error"), t("common.passwordMinLength"));
      return;
    }
    setIsResettingPassword(true);
    try {
      const res = await fetch(`${getApiBase()}/api/users/${selectedUser.id}/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ newPassword }),
      });
      if (res.ok) {
        showAlert(t("common.success"), t("admin.passwordReset"));
        setShowAssign(false);
      } else {
        const err = await res.json().catch(() => ({})) as { error?: string };
        showAlert(t("common.error"), err.error ?? t("common.unknownError"));
      }
    } catch {
      showAlert(t("common.error"), t("common.unknownError"));
    }
    setIsResettingPassword(false);
  };

  const displayName = (u: UserItem) =>
    [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || u.email || u.id;

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <ScrollView contentContainerStyle={{
        paddingTop: isWeb ? 67 : insets.top + 16,
        paddingBottom: isWeb ? 34 : insets.bottom + 32,
        paddingHorizontal: 20,
        gap: 16,
      }}>
        <Text style={[styles.title, { color: C.text }]}>{t("admin.settings")}</Text>

        <Card>
          <View style={styles.userRow}>
            <View style={[styles.userAvatar, { backgroundColor: C.primaryLight }]}>
              <Feather name="user" size={22} color={C.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.userName, { color: C.text }]}>{user?.firstName} {user?.lastName}</Text>
              <Text style={[styles.userEmail, { color: C.textSecondary }]}>{user?.email}</Text>
            </View>
          </View>
        </Card>

        <Pressable
          onPress={handleLogout}
          style={({ pressed }) => [styles.logoutBtn, { backgroundColor: C.dangerLight, opacity: pressed ? 0.8 : 1 }]}
        >
          <Feather name="log-out" size={18} color={C.danger} />
          <Text style={[styles.logoutText, { color: C.danger }]}>{t("auth.logout")}</Text>
        </Pressable>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>{t("admin.availableRoles")}</Text>
          <Pressable
            onPress={() => setShowAssign(true)}
            style={({ pressed }) => [styles.assignBtn, { backgroundColor: C.primaryLight, opacity: pressed ? 0.7 : 1 }]}
          >
            <Feather name="user-plus" size={13} color={C.primary} />
            <Text style={[styles.assignBtnText, { color: C.primary }]}>{t("admin.assignRole")}</Text>
          </Pressable>
        </View>

        {ROLES.map((role) => (
          <Card key={role} padding={14}>
            <View style={styles.roleRow}>
              <View style={[styles.roleIcon, { backgroundColor: C.inputBg }]}>
                <Feather name="user" size={16} color={C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.roleName, { color: C.text }]}>
                  {t(`admin.roles.${role}`)}
                </Text>
              </View>
              <Badge label={role} variant={ROLE_COLORS[role]} size="sm" />
            </View>
          </Card>
        ))}
      </ScrollView>

      <Modal visible={showAssign} transparent animationType="slide">
        <View style={[styles.overlay, { backgroundColor: C.overlay }]}>
          <View style={[styles.sheet, { backgroundColor: C.card }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: C.text }]}>{t("admin.assignRole")}</Text>

            {/* User search */}
            <View style={[styles.searchBox, { backgroundColor: C.inputBg, borderColor: C.border }]}>
              <Feather name="search" size={16} color={C.textSecondary} />
              <TextInput
                style={[styles.searchInput, { color: C.text }]}
                placeholder={t("admin.searchUser")}
                placeholderTextColor={C.textSecondary}
                value={userSearch}
                onChangeText={setUserSearch}
                autoCapitalize="none"
              />
              {userSearch.length > 0 && (
                <Pressable onPress={() => setUserSearch("")}>
                  <Feather name="x" size={16} color={C.textSecondary} />
                </Pressable>
              )}
            </View>

            {/* User list */}
            <ScrollView style={styles.userList} nestedScrollEnabled>
              {loadingUsers ? (
                <Text style={[styles.hint, { color: C.textSecondary }]}>{t("common.loading")}…</Text>
              ) : filteredUsers.length === 0 ? (
                <Text style={[styles.hint, { color: C.textSecondary }]}>{t("common.noResults")}</Text>
              ) : filteredUsers.map((u) => {
                const selected = selectedUser?.id === u.id;
                return (
                  <Pressable
                    key={u.id}
                    onPress={() => {
                      setSelectedUser(u);
                      setSelectedRole(u.role as Role ?? "attendee");
                      setActiveTab("role");
                      setNewPassword("");
                    }}
                    style={[
                      styles.userItem,
                      {
                        backgroundColor: selected ? C.primaryLight : "transparent",
                        borderBottomColor: C.separator,
                      },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.userItemName, { color: C.text }]}>{displayName(u)}</Text>
                      <Text style={[styles.userItemSub, { color: C.textSecondary }]}>{u.email ?? u.username ?? ""}</Text>
                    </View>
                    <Badge label={u.role} variant={ROLE_COLORS[u.role as Role] ?? "muted"} size="sm" />
                    {selected && <Feather name="check-circle" size={18} color={C.primary} style={{ marginLeft: 8 }} />}
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Tab switcher + action area — only visible once a user is selected */}
            {selectedUser && (
              <>
                <View style={[styles.tabRow, { backgroundColor: C.inputBg }]}>
                  <Pressable
                    onPress={() => setActiveTab("role")}
                    style={[styles.tabBtn, activeTab === "role" && { backgroundColor: C.card }]}
                  >
                    <Feather name="shield" size={13} color={activeTab === "role" ? C.primary : C.textSecondary} />
                    <Text style={[styles.tabBtnText, { color: activeTab === "role" ? C.primary : C.textSecondary }]}>
                      {t("admin.changeRole")}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setActiveTab("password")}
                    style={[styles.tabBtn, activeTab === "password" && { backgroundColor: C.card }]}
                  >
                    <Feather name="key" size={13} color={activeTab === "password" ? C.primary : C.textSecondary} />
                    <Text style={[styles.tabBtnText, { color: activeTab === "password" ? C.primary : C.textSecondary }]}>
                      {t("admin.resetPassword")}
                    </Text>
                  </Pressable>
                </View>

                {activeTab === "role" ? (
                  <>
                    <View style={styles.roleGrid}>
                      {ROLES.map((role) => (
                        <Pressable
                          key={role}
                          onPress={() => setSelectedRole(role)}
                          style={[
                            styles.roleChip,
                            {
                              backgroundColor: selectedRole === role ? C.primary : C.inputBg,
                              borderColor: selectedRole === role ? C.primary : C.border,
                            },
                          ]}
                        >
                          <Text style={[styles.roleChipText, { color: selectedRole === role ? "#fff" : C.textSecondary }]}>
                            {t(`admin.roles.${role}`)}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <View style={styles.sheetActions}>
                      <Button title={t("common.cancel")} onPress={() => setShowAssign(false)} variant="secondary" />
                      <Button title={t("admin.assignRole")} onPress={handleAssign} variant="primary" loading={updateRole.isPending} />
                    </View>
                  </>
                ) : (
                  <>
                    <Input
                      label={t("admin.newPassword")}
                      value={newPassword}
                      onChangeText={setNewPassword}
                      secureTextEntry
                      placeholder="••••••"
                    />
                    <View style={styles.sheetActions}>
                      <Button title={t("common.cancel")} onPress={() => setShowAssign(false)} variant="secondary" />
                      <Button title={t("admin.resetPassword")} onPress={handleResetPassword} variant="danger" loading={isResettingPassword} />
                    </View>
                  </>
                )}
              </>
            )}

            {/* No user selected yet — just a cancel */}
            {!selectedUser && (
              <Button title={t("common.cancel")} onPress={() => setShowAssign(false)} variant="secondary" />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8 },
  assignBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100 },
  assignBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  userRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  userAvatar: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  userName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  userEmail: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  logoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, padding: 16, borderRadius: 14 },
  logoutText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  roleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  roleIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  roleName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  overlay: { flex: 1, justifyContent: "flex-end" },
  sheet: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 32, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 14, maxHeight: "85%" },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#ccc", alignSelf: "center", marginBottom: 4 },
  sheetTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", padding: 0 },
  userList: { maxHeight: 180 },
  userItem: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10 },
  userItemName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  userItemSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  hint: { fontSize: 13, fontFamily: "Inter_400Regular", paddingVertical: 12, textAlign: "center" },
  tabRow: { flexDirection: "row", borderRadius: 12, padding: 3, gap: 2 },
  tabBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, borderRadius: 10 },
  tabBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  roleGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  roleChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100, borderWidth: 1 },
  roleChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  sheetActions: { flexDirection: "row", gap: 12 },
});
