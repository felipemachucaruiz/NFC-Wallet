import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
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
import { useUpdateUserRole } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import Colors from "@/constants/colors";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Empty } from "@/components/ui/Empty";

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

export default function RolesScreen() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const [showAssign, setShowAssign] = useState(false);
  const [userId, setUserId] = useState("");
  const [selectedRole, setSelectedRole] = useState<Role>("attendee");

  const updateRole = useUpdateUserRole();

  const handleLogout = () => {
    Alert.alert(t("auth.logoutConfirm"), undefined, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("auth.logout"),
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/login");
        },
      },
    ]);
  };

  const handleAssign = async () => {
    if (!userId.trim()) { Alert.alert(t("common.error"), t("admin.userIdRequired")); return; }
    Alert.alert(
      t("admin.assignRole"),
      t("admin.assignRoleConfirm", { role: selectedRole, userId: userId.trim() }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.confirm"),
          onPress: async () => {
            try {
              await updateRole.mutateAsync({ userId: userId.trim(), role: selectedRole } as Parameters<typeof updateRole.mutateAsync>[0]);
              Alert.alert(t("common.success"), t("admin.roleAssigned"));
              setShowAssign(false);
              setUserId("");
              setSelectedRole("attendee");
            } catch {
              Alert.alert(t("common.error"), t("common.unknownError"));
            }
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <ScrollView contentContainerStyle={{
        paddingTop: isWeb ? 67 : insets.top + 16,
        paddingBottom: isWeb ? 34 : insets.bottom + 32,
        paddingHorizontal: 20,
        gap: 16,
      }}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: C.text }]}>{t("admin.settings")}</Text>
          <Button title={`+ ${t("admin.assignRole")}`} onPress={() => setShowAssign(true)} variant="primary" size="sm" />
        </View>

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

        <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>{t("admin.availableRoles")}</Text>
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
            <Text style={[styles.sheetTitle, { color: C.text }]}>{t("admin.assignRole")}</Text>
            <Input label={t("admin.userId")} value={userId} onChangeText={setUserId} placeholder={t("admin.userIdPlaceholder")} />
            <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>{t("admin.selectRole")}</Text>
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
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  sectionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8 },
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
  sheet: { padding: 24, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 16 },
  sheetTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  roleGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  roleChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100, borderWidth: 1 },
  roleChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  sheetActions: { flexDirection: "row", gap: 12 },
});
