import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import React, { useState, useCallback } from "react";
import { Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import {
  useListMerchantStaff,
  useCreateMerchantStaff,
  useResetMerchantStaffPassword,
  useDeleteMerchantStaff,
  useListLocations,
  useAssignUserToLocation,
  useRemoveUserFromLocation,
} from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { useAlert } from "@/components/CustomAlert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Loading } from "@/components/ui/Loading";
import { Empty } from "@/components/ui/Empty";
import { useAuth } from "@/contexts/AuthContext";
import { API_BASE_URL } from "@/constants/domain";

type StaffMember = {
  id: string;
  username: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string;
  createdAt: string;
};

type Location = {
  id: string;
  name: string;
  active: boolean;
};

export default function MerchantStaffScreen() {
  const { t } = useTranslation();
  const { show: showAlert } = useAlert();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { token } = useAuth();

  const [showAddModal, setShowAddModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [locationStaff, setLocationStaff] = useState<StaffMember | null>(null);
  const [pendingLocationIds, setPendingLocationIds] = useState<Set<string>>(new Set());
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [savingLocations, setSavingLocations] = useState(false);

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");

  const [resetPassword, setResetPassword] = useState("");

  const { data, isLoading, refetch } = useListMerchantStaff();
  const staff = (data as { staff?: StaffMember[] } | undefined)?.staff ?? [];

  const { data: locData } = useListLocations();
  const allLocations: Location[] = ((locData as { locations?: Location[] } | undefined)?.locations ?? []).filter(
    (l) => l.active !== false,
  );

  const createStaff = useCreateMerchantStaff();
  const resetPwd = useResetMerchantStaffPassword();
  const deleteStaff = useDeleteMerchantStaff();
  const assignLocation = useAssignUserToLocation();
  const removeLocation = useRemoveUserFromLocation();

  const resetAddForm = () => {
    setNewUsername("");
    setNewPassword("");
    setNewFirstName("");
    setNewLastName("");
  };

  const handleAdd = async () => {
    if (newUsername.trim().length < 3) {
      showAlert(t("common.error"), t("merchant_admin.usernameRequired"));
      return;
    }
    if (newPassword.length < 6) {
      showAlert(t("common.error"), t("merchant_admin.passwordRequired"));
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
      showAlert(t("common.success"), t("merchant_admin.staffCreated"));
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      showAlert(
        t("common.error"),
        msg === "Username already taken" ? t("merchant_admin.usernameTaken") : (msg ?? t("common.unexpectedError")),
      );
    }
  };

  const handleResetPassword = async () => {
    if (!selectedStaff) return;
    if (resetPassword.length < 6) {
      showAlert(t("common.error"), t("merchant_admin.passwordRequired"));
      return;
    }
    try {
      await resetPwd.mutateAsync({ userId: selectedStaff.id, data: { newPassword: resetPassword } });
      setShowPasswordModal(false);
      setResetPassword("");
      setSelectedStaff(null);
      showAlert(t("common.success"), t("merchant_admin.passwordReset"));
    } catch {
      showAlert(t("common.error"), t("common.unexpectedError"));
    }
  };

  const handleDelete = (member: StaffMember) => {
    const name = member.firstName ?? member.username ?? member.id;
    showAlert(
      t("merchant_admin.removeStaff"),
      t("merchant_admin.removeStaffConfirm", { name }),
      [
        { text: t("common.cancel"), variant: "cancel" },
        {
          text: t("merchant_admin.removeStaff"),
          variant: "danger",
          onPress: async () => {
            try {
              await deleteStaff.mutateAsync({ userId: member.id });
              refetch();
              showAlert(t("common.success"), t("merchant_admin.staffRemoved"));
            } catch {
              showAlert(t("common.error"), t("common.unexpectedError"));
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

  const openManageLocations = useCallback(
    async (member: StaffMember) => {
      setLocationStaff(member);
      setLoadingAssignments(true);
      setPendingLocationIds(new Set());
      setShowLocationModal(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/locations/staff-assignments/${member.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const body = (await res.json()) as { locationIds: string[] };
          setPendingLocationIds(new Set(body.locationIds));
        }
      } catch {
        // Leave empty — saving with no selections means "all locations" fallback
      } finally {
        setLoadingAssignments(false);
      }
    },
    [token],
  );

  const toggleLocation = (id: string) => {
    setPendingLocationIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSaveLocations = async () => {
    if (!locationStaff) return;
    setSavingLocations(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/locations/staff-assignments/${locationStaff.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const currentIds: string[] = res.ok
        ? ((await res.json()) as { locationIds: string[] }).locationIds
        : [];
      const currentSet = new Set(currentIds);

      const toAssign = [...pendingLocationIds].filter((id) => !currentSet.has(id));
      const toRemove = currentIds.filter((id) => !pendingLocationIds.has(id));

      await Promise.all([
        ...toAssign.map((locationId) =>
          assignLocation.mutateAsync({ locationId, data: { userId: locationStaff.id } }),
        ),
        ...toRemove.map((locationId) =>
          removeLocation.mutateAsync({ locationId, data: { userId: locationStaff.id } }),
        ),
      ]);

      setShowLocationModal(false);
      setLocationStaff(null);
      showAlert(t("common.success"), t("merchant_admin.locationAssignmentSaved"));
    } catch {
      showAlert(t("common.error"), t("common.unexpectedError"));
    } finally {
      setSavingLocations(false);
    }
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
          <Button label={t("merchant_admin.addStaff")} onPress={() => { resetAddForm(); setShowAddModal(true); }} variant="primary" size="sm" icon="user-plus" />
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
                    label={t("merchant_admin.manageLocations")}
                    onPress={() => openManageLocations(member)}
                    variant="secondary"
                    size="sm"
                    icon="map-pin"
                  />
                  <Button
                    label={t("merchant_admin.resetPassword")}
                    onPress={() => openResetPassword(member)}
                    variant="secondary"
                    size="sm"
                    icon="key"
                  />
                  <Button
                    label={t("merchant_admin.removeStaff")}
                    onPress={() => handleDelete(member)}
                    variant="danger"
                    size="sm"
                    icon="trash-2"
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

      {/* Manage Locations Modal */}
      <Modal visible={showLocationModal} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setShowLocationModal(false)}>
        <ScrollView
          style={[styles.modal, { backgroundColor: C.background }]}
          contentContainerStyle={[styles.modalContent, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}
        >
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: C.text }]}>
              {locationStaff ? t("merchant_admin.staffLocationsTitle", { name: displayName(locationStaff) }) : ""}
            </Text>
            <Feather name="x" size={22} color={C.textSecondary} onPress={() => setShowLocationModal(false)} />
          </View>

          <Text style={[styles.subtitle, { color: C.textSecondary }]}>
            {t("merchant_admin.staffLocationsSubtitle")}
          </Text>

          {loadingAssignments ? (
            <ActivityIndicator color={C.primary} style={{ marginTop: 24 }} />
          ) : allLocations.length === 0 ? (
            <Empty message={t("merchant_admin.noLocations")} />
          ) : (
            allLocations.map((loc) => {
              const checked = pendingLocationIds.has(loc.id);
              return (
                <TouchableOpacity
                  key={loc.id}
                  onPress={() => toggleLocation(loc.id)}
                  style={[
                    styles.locationRow,
                    {
                      backgroundColor: checked ? C.primary + "18" : C.card,
                      borderColor: checked ? C.primary : C.border,
                    },
                  ]}
                  activeOpacity={0.7}
                >
                  <View style={[styles.checkbox, { borderColor: checked ? C.primary : C.border, backgroundColor: checked ? C.primary : "transparent" }]}>
                    {checked && <Feather name="check" size={12} color="#0a0a0a" />}
                  </View>
                  <Text style={[styles.locationName, { color: C.text }]}>{loc.name}</Text>
                </TouchableOpacity>
              );
            })
          )}

          <View style={[styles.modalActions, { marginTop: 16 }]}>
            <Button label={t("common.cancel")} onPress={() => setShowLocationModal(false)} variant="secondary" style={styles.modalBtn} />
            <Button
              label={t("common.save")}
              onPress={handleSaveLocations}
              variant="primary"
              loading={savingLocations}
              style={styles.modalBtn}
            />
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
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: -8 },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  locationName: { fontSize: 15, fontFamily: "Inter_500Medium", flex: 1 },
});
