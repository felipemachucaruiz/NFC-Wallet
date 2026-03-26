import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import {
  useListMerchantStaff,
  useCreateMerchantStaff,
  useResetMerchantStaffPassword,
  useDeleteMerchantStaff,
} from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Loading } from "@/components/ui/Loading";
import { Empty } from "@/components/ui/Empty";

type StaffMember = {
  id: string;
  username: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string;
  createdAt: string;
};

export default function MerchantStaffScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const [showAddModal, setShowAddModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");

  const [resetPassword, setResetPassword] = useState("");

  const { data, isLoading, refetch } = useListMerchantStaff();
  const staff = (data as { staff?: StaffMember[] } | undefined)?.staff ?? [];

  const createStaff = useCreateMerchantStaff();
  const resetPwd = useResetMerchantStaffPassword();
  const deleteStaff = useDeleteMerchantStaff();

  const resetAddForm = () => {
    setNewUsername("");
    setNewPassword("");
    setNewFirstName("");
    setNewLastName("");
  };

  const handleAdd = async () => {
    if (newUsername.trim().length < 3) {
      Alert.alert(t("common.error"), t("merchant_admin.usernameRequired"));
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert(t("common.error"), t("merchant_admin.passwordRequired"));
      return;
    }
    try {
      await createStaff.mutateAsync({
        data: {
          username: newUsername.trim().toLowerCase(),
          password: newPassword,
          firstName: newFirstName.trim() || undefined,
          lastName: newLastName.trim() || undefined,
        },
      });
      setShowAddModal(false);
      resetAddForm();
      refetch();
      Alert.alert(t("common.success"), t("merchant_admin.staffCreated"));
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      Alert.alert(
        t("common.error"),
        msg === "Username already taken" ? t("merchant_admin.usernameTaken") : (msg ?? t("common.unexpectedError")),
      );
    }
  };

  const handleResetPassword = async () => {
    if (!selectedStaff) return;
    if (resetPassword.length < 6) {
      Alert.alert(t("common.error"), t("merchant_admin.passwordRequired"));
      return;
    }
    try {
      await resetPwd.mutateAsync({ userId: selectedStaff.id, data: { newPassword: resetPassword } });
      setShowPasswordModal(false);
      setResetPassword("");
      setSelectedStaff(null);
      Alert.alert(t("common.success"), t("merchant_admin.passwordReset"));
    } catch {
      Alert.alert(t("common.error"), t("common.unexpectedError"));
    }
  };

  const handleDelete = (member: StaffMember) => {
    const name = member.firstName ?? member.username ?? member.id;
    Alert.alert(
      t("merchant_admin.removeStaff"),
      t("merchant_admin.removeStaffConfirm", { name }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("merchant_admin.removeStaff"),
          style: "destructive",
          onPress: async () => {
            try {
              await deleteStaff.mutateAsync({ userId: member.id });
              refetch();
              Alert.alert(t("common.success"), t("merchant_admin.staffRemoved"));
            } catch {
              Alert.alert(t("common.error"), t("common.unexpectedError"));
            }
          },
        },
      ],
    );
  };

  const openResetPassword = (member: StaffMember) => {
    setSelectedStaff(member);
    setResetPassword("");
    setShowPasswordModal(true);
  };

  const displayName = (m: StaffMember) =>
    [m.firstName, m.lastName].filter(Boolean).join(" ") || m.username || m.id;

  if (isLoading) return <Loading />;

  return (
    <>
      <ScrollView
        style={[styles.container, { backgroundColor: C.background }]}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: isWeb ? 24 : insets.top + 16,
            paddingBottom: insets.bottom + 100,
          },
        ]}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={C.primary} />}
      >
        <View style={styles.header}>
          <Text style={[styles.heading, { color: C.text }]}>{t("merchant_admin.staffManagement")}</Text>
          <Button label={t("merchant_admin.addStaff")} onPress={() => { resetAddForm(); setShowAddModal(true); }} variant="primary" size="sm" />
        </View>

        {staff.length === 0 ? (
          <Empty message={t("merchant_admin.noStaff")} />
        ) : (
          staff.map((member) => (
            <Card key={member.id} style={styles.memberCard}>
              <View style={styles.memberRow}>
                <View style={styles.memberInfo}>
                  <Text style={[styles.memberName, { color: C.text }]}>{displayName(member)}</Text>
                  <Text style={[styles.memberUsername, { color: C.textSecondary }]}>@{member.username}</Text>
                </View>
                <View style={styles.memberActions}>
                  <Button
                    label={t("merchant_admin.resetPassword")}
                    onPress={() => openResetPassword(member)}
                    variant="secondary"
                    size="sm"
                  />
                  <Button
                    label={t("merchant_admin.removeStaff")}
                    onPress={() => handleDelete(member)}
                    variant="danger"
                    size="sm"
                  />
                </View>
              </View>
            </Card>
          ))
        )}
      </ScrollView>

      {/* Add Staff Modal */}
      <Modal visible={showAddModal} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setShowAddModal(false)}>
        <ScrollView
          style={[styles.modal, { backgroundColor: C.background }]}
          contentContainerStyle={[styles.modalContent, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: C.text }]}>{t("merchant_admin.addStaff")}</Text>
            <Feather name="x" size={22} color={C.textSecondary} onPress={() => setShowAddModal(false)} />
          </View>

          <Input
            label={t("merchant_admin.staffFirstName")}
            placeholder={t("merchant_admin.staffFirstNamePlaceholder")}
            value={newFirstName}
            onChangeText={setNewFirstName}
            autoCapitalize="words"
          />
          <Input
            label={t("merchant_admin.staffLastName")}
            placeholder={t("merchant_admin.staffFirstNamePlaceholder")}
            value={newLastName}
            onChangeText={setNewLastName}
            autoCapitalize="words"
          />
          <Input
            label={t("merchant_admin.staffUsername")}
            placeholder={t("merchant_admin.staffUsernamePlaceholder")}
            value={newUsername}
            onChangeText={setNewUsername}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Input
            label={t("merchant_admin.staffPassword")}
            placeholder={t("merchant_admin.staffPasswordPlaceholder")}
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
          />

          <View style={styles.modalActions}>
            <Button label={t("common.cancel")} onPress={() => setShowAddModal(false)} variant="secondary" style={styles.modalBtn} />
            <Button label={t("merchant_admin.addStaff")} onPress={handleAdd} variant="primary" loading={createStaff.isPending} style={styles.modalBtn} />
          </View>
        </ScrollView>
      </Modal>

      {/* Reset Password Modal */}
      <Modal visible={showPasswordModal} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setShowPasswordModal(false)}>
        <ScrollView
          style={[styles.modal, { backgroundColor: C.background }]}
          contentContainerStyle={[styles.modalContent, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: C.text }]}>
              {selectedStaff ? t("merchant_admin.resetPasswordFor", { name: displayName(selectedStaff) }) : t("merchant_admin.resetPassword")}
            </Text>
            <Feather name="x" size={22} color={C.textSecondary} onPress={() => setShowPasswordModal(false)} />
          </View>

          <Input
            label={t("merchant_admin.newPassword")}
            placeholder={t("merchant_admin.newPasswordPlaceholder")}
            value={resetPassword}
            onChangeText={setResetPassword}
            secureTextEntry
          />

          <View style={styles.modalActions}>
            <Button label={t("common.cancel")} onPress={() => setShowPasswordModal(false)} variant="secondary" style={styles.modalBtn} />
            <Button label={t("common.save")} onPress={handleResetPassword} variant="primary" loading={resetPwd.isPending} style={styles.modalBtn} />
          </View>
        </ScrollView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 12 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  heading: { fontSize: 20, fontFamily: "Inter_700Bold" },
  memberCard: { gap: 8 },
  memberRow: { gap: 10 },
  memberInfo: { gap: 2 },
  memberName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  memberUsername: { fontSize: 13, fontFamily: "Inter_400Regular" },
  memberActions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  modal: { flex: 1 },
  modalContent: { padding: 20, gap: 16 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", flex: 1 },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 8 },
  modalBtn: { flex: 1 },
});
