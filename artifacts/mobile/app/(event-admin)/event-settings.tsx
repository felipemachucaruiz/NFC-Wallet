import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useGetEvent, useUpdateEvent } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import type { InventoryMode } from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Loading } from "@/components/ui/Loading";
import { useAuth } from "@/contexts/AuthContext";

type EventDetail = {
  id: string;
  name: string;
  inventoryMode?: InventoryMode;
};

function InventoryModeOption({
  mode,
  title,
  description,
  icon,
  selected,
  onPress,
}: {
  mode: InventoryMode;
  title: string;
  description: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  selected: boolean;
  onPress: () => void;
}) {
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.modeOption,
        {
          backgroundColor: selected ? C.primaryLight : C.card,
          borderColor: selected ? C.primary : C.border,
        },
      ]}
    >
      <View style={[styles.modeIconBox, { backgroundColor: selected ? C.primary + "22" : C.inputBg }]}>
        <Feather name={icon} size={22} color={selected ? C.primary : C.textMuted} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={styles.modeTitleRow}>
          <Text style={[styles.modeTitle, { color: selected ? C.primary : C.text }]}>
            {title}
          </Text>
          {selected && (
            <View style={[styles.activeBadge, { backgroundColor: C.primary }]}>
              <Text style={styles.activeBadgeText}>Active</Text>
            </View>
          )}
        </View>
        <Text style={[styles.modeDesc, { color: C.textSecondary }]}>{description}</Text>
      </View>
    </Pressable>
  );
}

export default function EventSettingsScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();

  const { data: eventData, isLoading, refetch } = useGetEvent(
    user?.eventId ?? "",
    { query: { enabled: !!user?.eventId, queryKey: ["event-settings", user?.eventId] } },
  );

  const event = eventData as EventDetail | undefined;
  const currentMode: InventoryMode = event?.inventoryMode ?? "location_based";

  const [pendingMode, setPendingMode] = useState<InventoryMode | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const updateEvent = useUpdateEvent();
  const queryClient = useQueryClient();

  const handleSelectMode = (mode: InventoryMode) => {
    if (mode === currentMode) return;
    setPendingMode(mode);
    setShowConfirm(true);
  };

  const handleConfirm = async () => {
    if (!pendingMode || !user?.eventId) return;
    try {
      await updateEvent.mutateAsync({
        eventId: user.eventId,
        data: { inventoryMode: pendingMode },
      });
      setShowConfirm(false);
      setPendingMode(null);
      refetch();
      queryClient.invalidateQueries({ queryKey: ["event-context", user.eventId] });
      queryClient.invalidateQueries({ queryKey: ["event-inventory-mode", user.eventId] });
      Alert.alert(t("common.success"), t("eventAdmin.inventoryModeChanged"));
    } catch {
      setShowConfirm(false);
      setPendingMode(null);
      Alert.alert(t("common.error"), t("eventAdmin.inventoryModeChangeFailed"));
    }
  };

  const handleCancel = () => {
    setShowConfirm(false);
    setPendingMode(null);
  };

  if (isLoading) return <Loading label={t("common.loading")} />;

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: C.background }}
        contentContainerStyle={{
          paddingTop: isWeb ? 67 : insets.top + 16,
          paddingBottom: isWeb ? 34 : insets.bottom + 100,
          paddingHorizontal: 20,
          gap: 20,
        }}
        contentInsetAdjustmentBehavior="automatic"
      >
        <Text style={[styles.title, { color: C.text }]}>{t("eventAdmin.inventorySettings")}</Text>
        <Text style={[styles.subtitle, { color: C.textSecondary }]}>
          {t("eventAdmin.inventoryModeLabel")}
        </Text>

        <View style={styles.modesContainer}>
          <InventoryModeOption
            mode="location_based"
            title={t("eventAdmin.locationBased")}
            description={t("eventAdmin.locationBasedDesc")}
            icon="map-pin"
            selected={currentMode === "location_based"}
            onPress={() => handleSelectMode("location_based")}
          />
          <InventoryModeOption
            mode="centralized_warehouse"
            title={t("eventAdmin.centralizedWarehouse")}
            description={t("eventAdmin.centralizedWarehouseDesc")}
            icon="package"
            selected={currentMode === "centralized_warehouse"}
            onPress={() => handleSelectMode("centralized_warehouse")}
          />
        </View>

        <Card style={[styles.infoCard, { borderColor: C.warning + "55", backgroundColor: C.warningLight }]} padding={14}>
          <View style={styles.infoRow}>
            <Feather name="alert-triangle" size={16} color={C.warning} style={{ marginTop: 1 }} />
            <Text style={[styles.infoText, { color: C.text }]}>
              {t("eventAdmin.inventoryModeWarning")}
            </Text>
          </View>
        </Card>
      </ScrollView>

      <Modal
        visible={showConfirm}
        animationType="slide"
        presentationStyle="pageSheet"
        transparent={false}
        onRequestClose={handleCancel}
      >
        <View style={[styles.confirmModal, { backgroundColor: C.background }]}>
          <View style={styles.modalHandle} />

          <View style={[styles.warningIconBox, { backgroundColor: C.warningLight }]}>
            <Feather name="alert-triangle" size={32} color={C.warning} />
          </View>

          <Text style={[styles.confirmTitle, { color: C.text }]}>
            {t("eventAdmin.inventoryMode")}
          </Text>
          <Text style={[styles.confirmDesc, { color: C.textSecondary }]}>
            {t("eventAdmin.inventoryModeWarning")}
          </Text>

          {pendingMode && (
            <View style={[styles.pendingModeBox, { backgroundColor: C.primaryLight, borderColor: C.primary + "44" }]}>
              <Feather name="arrow-right" size={16} color={C.primary} />
              <Text style={[styles.pendingModeText, { color: C.primary }]}>
                {pendingMode === "location_based"
                  ? t("eventAdmin.locationBased")
                  : t("eventAdmin.centralizedWarehouse")}
              </Text>
            </View>
          )}

          <View style={styles.confirmActions}>
            <Button
              title={t("common.cancel")}
              onPress={handleCancel}
              variant="secondary"
              size="lg"
              fullWidth
            />
            <Button
              title={t("common.confirm")}
              onPress={handleConfirm}
              variant="primary"
              size="lg"
              fullWidth
              loading={updateEvent.isPending}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginTop: -12,
  },
  modesContainer: {
    gap: 12,
  },
  modeOption: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 16,
  },
  modeIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  modeTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  modeTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  activeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 100,
  },
  activeBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  modeDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
  infoCard: {
    borderWidth: 1,
    borderRadius: 12,
  },
  infoRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
  confirmModal: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 28,
    paddingTop: 20,
    paddingBottom: 48,
    gap: 16,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#ccc",
    alignSelf: "center",
    marginBottom: 24,
  },
  warningIconBox: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  confirmDesc: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 21,
  },
  pendingModeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  pendingModeText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  confirmActions: {
    width: "100%",
    gap: 10,
    marginTop: "auto",
  },
});
