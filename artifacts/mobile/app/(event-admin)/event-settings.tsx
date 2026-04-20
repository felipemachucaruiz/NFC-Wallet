import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useGetEvent, useUpdateEvent } from "@workspace/api-client-react";
import { customFetch } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import type { InventoryMode } from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { useAlert } from "@/components/CustomAlert";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Loading } from "@/components/ui/Loading";
import { useAuth } from "@/contexts/AuthContext";
import type { NfcChipType } from "@/contexts/EventContext";

type EventDetail = {
  id: string;
  name: string;
  active?: boolean;
  inventoryMode?: InventoryMode;
  nfcChipType?: NfcChipType;
  allowedNfcTypes?: NfcChipType[];
  hasHmacSecret?: boolean;
  hasDesfireKey?: boolean;
  hasUltralightCKey?: boolean;
  offlineSyncLimit?: number;
  maxOfflineSpendPerBracelet?: number;
  bankPaymentMethods?: string[];
  boxOfficePaymentMethods?: string[];
  bankMinTopup?: number;
};

const BANK_METHODS = [
  { value: "cash", label: "Efectivo", icon: "dollar-sign" as const },
  { value: "card_external", label: "Tarjeta (datafono)", icon: "credit-card" as const },
  { value: "nequi_transfer", label: "Nequi", icon: "smartphone" as const },
  { value: "bancolombia_transfer", label: "Bancolombia", icon: "home" as const },
  { value: "other", label: "Otro", icon: "more-horizontal" as const },
];

const BOX_OFFICE_METHODS = [
  { value: "gate_cash", label: "Efectivo", icon: "dollar-sign" as const },
  { value: "gate_transfer", label: "Transferencia", icon: "smartphone" as const },
  { value: "gate_card", label: "Datafono", icon: "credit-card" as const },
  { value: "gate_nequi", label: "Nequi (Wompi)", icon: "zap" as const },
];

type ConfirmModal =
  | { type: "inventory"; pendingMode: InventoryMode }
  | { type: "rotate_key" }
  | { type: "generate_desfire_key" }
  | { type: "generate_ultralight_c_key" }
  | { type: "close_event"; pendingRefundCount: number }
  | null;

function NfcChipCheckbox({
  chipType,
  title,
  description,
  icon,
  checked,
  onToggle,
}: {
  chipType: NfcChipType;
  title: string;
  description: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  checked: boolean;
  onToggle: () => void;
}) {
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;

  return (
    <Pressable
      onPress={onToggle}
      style={[
        styles.modeOption,
        {
          backgroundColor: checked ? C.primaryLight : C.card,
          borderColor: checked ? C.primary : C.border,
        },
      ]}
    >
      <View style={[styles.modeIconBox, { backgroundColor: checked ? C.primary + "22" : C.inputBg }]}>
        <Feather name={icon} size={22} color={checked ? C.primary : C.textMuted} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={styles.modeTitleRow}>
          <Text style={[styles.modeTitle, { color: checked ? C.primary : C.text }]}>
            {title}
          </Text>
          {checked && (
            <View style={[styles.activeBadge, { backgroundColor: C.primary }]}>
              <Text style={styles.activeBadgeText}>Active</Text>
            </View>
          )}
        </View>
        <Text style={[styles.modeDesc, { color: C.textSecondary }]}>{description}</Text>
      </View>
      <View style={[
        styles.radioBox,
        {
          borderColor: checked ? C.primary : C.border,
        },
      ]}>
        {checked && <View style={[styles.radioDot, { backgroundColor: C.primary }]} />}
      </View>
    </Pressable>
  );
}

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
  const { show: showAlert } = useAlert();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();

  const { data: eventData, isLoading, refetch } = useGetEvent(
    user?.eventId ?? "",
    { query: { enabled: !!user?.eventId, queryKey: ["event-settings", user?.eventId] } },
  );

  const { data: flaggedData, refetch: refetchFlagged } = useQuery({
    queryKey: ["flagged-bracelets", user?.eventId],
    enabled: !!user?.eventId,
    queryFn: async () => {
      const res = await customFetch(`/api/events/${user!.eventId}/flagged-bracelets`, { method: "GET" });
      return res as { flaggedBracelets: Array<{ nfcUid: string; flagReason: string | null; updatedAt: string }> };
    },
  });
  const flaggedBracelets = flaggedData?.flaggedBracelets ?? [];

  const event = eventData as EventDetail | undefined;
  const currentMode: InventoryMode = event?.inventoryMode ?? "location_based";
  const currentAllowedTypes: NfcChipType[] = event?.allowedNfcTypes ?? [event?.nfcChipType ?? "ntag_21x"];

  const [confirmModal, setConfirmModal] = useState<ConfirmModal>(null);
  const [isRotating, setIsRotating] = useState(false);
  const [isClosingEvent, setIsClosingEvent] = useState(false);
  const [isCheckingRefunds, setIsCheckingRefunds] = useState(false);

  const [offlineSyncLimit, setOfflineSyncLimit] = useState<string>("");
  const [maxOfflineSpendPerBracelet, setMaxOfflineSpendPerBracelet] = useState<string>("");
  const [isSavingLimits, setIsSavingLimits] = useState(false);

  const [selectedChipType, setSelectedChipType] = useState<NfcChipType>("ntag_21x");
  const [isSavingChipType, setIsSavingChipType] = useState(false);
  const [isGeneratingDesfireKey, setIsGeneratingDesfireKey] = useState(false);
  const [isGeneratingUltralightCKey, setIsGeneratingUltralightCKey] = useState(false);

  const [selectedBankMethods, setSelectedBankMethods] = useState<string[]>(["cash", "card_external", "nequi_transfer", "bancolombia_transfer", "other"]);
  const [selectedBoxOfficeMethods, setSelectedBoxOfficeMethods] = useState<string[]>(["gate_cash", "gate_transfer", "gate_card", "gate_nequi"]);
  const [bankMinTopupText, setBankMinTopupText] = useState("0");
  const [isSavingPaymentConfig, setIsSavingPaymentConfig] = useState(false);

  React.useEffect(() => {
    if (event) {
      setOfflineSyncLimit(String(event.offlineSyncLimit ?? 500000));
      setMaxOfflineSpendPerBracelet(String(event.maxOfflineSpendPerBracelet ?? 200000));
      const types = event.allowedNfcTypes ?? [event.nfcChipType ?? "ntag_21x"];
      setSelectedChipType(types[0] ?? "ntag_21x");
      if (event.bankPaymentMethods) setSelectedBankMethods(event.bankPaymentMethods);
      if (event.boxOfficePaymentMethods) setSelectedBoxOfficeMethods(event.boxOfficePaymentMethods);
      if (event.bankMinTopup !== undefined) setBankMinTopupText(String(event.bankMinTopup));
    }
  }, [event?.offlineSyncLimit, event?.maxOfflineSpendPerBracelet, event?.nfcChipType, event?.allowedNfcTypes, event?.bankPaymentMethods, event?.boxOfficePaymentMethods, event?.bankMinTopup]);

  const updateEvent = useUpdateEvent();
  const queryClient = useQueryClient();

  const handleSavePaymentConfig = async () => {
    if (!user?.eventId) return;
    if (selectedBankMethods.length === 0 || selectedBoxOfficeMethods.length === 0) {
      showAlert(t("common.error"), "Selecciona al menos un método de pago para cada área.");
      return;
    }
    const minTopup = parseInt(bankMinTopupText, 10);
    if (isNaN(minTopup) || minTopup < 0) {
      showAlert(t("common.error"), "Monto mínimo inválido.");
      return;
    }
    setIsSavingPaymentConfig(true);
    try {
      await customFetch(`/api/events/${user.eventId}`, {
        method: "PATCH",
        body: JSON.stringify({
          bankPaymentMethods: selectedBankMethods,
          boxOfficePaymentMethods: selectedBoxOfficeMethods,
          bankMinTopup: minTopup,
        }),
      });
      refetch();
      showAlert(t("common.success"), "Configuración de pagos guardada.");
    } catch {
      showAlert(t("common.error"), t("common.error"));
    } finally {
      setIsSavingPaymentConfig(false);
    }
  };

  const handleSelectMode = (mode: InventoryMode) => {
    if (mode === currentMode) return;
    setConfirmModal({ type: "inventory", pendingMode: mode });
  };

  const handleConfirm = async () => {
    if (!user?.eventId) return;

    if (confirmModal?.type === "inventory") {
      const pendingMode = confirmModal.pendingMode;
      try {
        await updateEvent.mutateAsync({
          eventId: user.eventId,
          data: { inventoryMode: pendingMode },
        });
        setConfirmModal(null);
        refetch();
        queryClient.invalidateQueries({ queryKey: ["event-context", user.eventId] });
        queryClient.invalidateQueries({ queryKey: ["event-inventory-mode", user.eventId] });
        showAlert(t("common.success"), t("eventAdmin.inventoryModeChanged"));
      } catch {
        setConfirmModal(null);
        showAlert(t("common.error"), t("eventAdmin.inventoryModeChangeFailed"));
      }
    } else if (confirmModal?.type === "rotate_key") {
      setIsRotating(true);
      setConfirmModal(null);
      try {
        await customFetch(`/api/events/${user.eventId}/rotate-signing-key`, {
          method: "POST",
        });
        refetch();
        showAlert(t("common.success"), t("eventAdmin.signingKeyRotated"));
      } catch {
        showAlert(t("common.error"), t("eventAdmin.signingKeyRotateFailed"));
      } finally {
        setIsRotating(false);
      }
    } else if (confirmModal?.type === "generate_desfire_key") {
      setIsGeneratingDesfireKey(true);
      setConfirmModal(null);
      try {
        await customFetch(`/api/events/${user.eventId}/generate-desfire-key`, {
          method: "POST",
        });
        refetch();
        showAlert(t("common.success"), t("eventAdmin.desfireKeyGenerated"));
      } catch {
        showAlert(t("common.error"), t("eventAdmin.desfireKeyGenerateFailed"));
      } finally {
        setIsGeneratingDesfireKey(false);
      }
    } else if (confirmModal?.type === "generate_ultralight_c_key") {
      setIsGeneratingUltralightCKey(true);
      setConfirmModal(null);
      try {
        await customFetch(`/api/events/${user.eventId}/generate-ultralight-c-key`, {
          method: "POST",
        });
        refetch();
        showAlert(t("common.success"), t("eventAdmin.ultralightCKeyGenerated"));
      } catch {
        showAlert(t("common.error"), t("eventAdmin.ultralightCKeyGenerateFailed"));
      } finally {
        setIsGeneratingUltralightCKey(false);
      }
    } else if (confirmModal?.type === "close_event") {
      const pendingRefundCount = confirmModal.pendingRefundCount;
      setIsClosingEvent(true);
      setConfirmModal(null);
      try {
        const url = pendingRefundCount > 0
          ? `/api/events/${user.eventId}/close?force=true`
          : `/api/events/${user.eventId}/close`;
        const result = await customFetch(url, {
          method: "POST",
        }) as { braceletsFlagged?: number; refundRequestsCreated?: number } | undefined;
        refetch();
        queryClient.invalidateQueries({ queryKey: ["event-context", user.eventId] });
        showAlert(
          t("eventAdmin.eventClosed"),
          t("eventAdmin.eventClosedDetail", {
            flagged: result?.braceletsFlagged ?? 0,
            refunds: result?.refundRequestsCreated ?? 0,
          }),
        );
      } catch {
        showAlert(t("common.error"), t("eventAdmin.eventCloseFailed"));
      } finally {
        setIsClosingEvent(false);
      }
    }
  };

  const handleCloseEventPress = async () => {
    if (!user?.eventId) return;
    setIsCheckingRefunds(true);
    try {
      const result = await customFetch(`/api/events/${user.eventId}/pending-refund-count`, {
        method: "GET",
      }) as { pendingRefundCount: number };
      setConfirmModal({ type: "close_event", pendingRefundCount: result.pendingRefundCount ?? 0 });
    } catch {
      showAlert(
        t("common.error"),
        t("eventAdmin.closeEventRefundCheckFailed"),
        [
          { text: t("common.cancel"), variant: "cancel" },
          {
            text: t("common.retry"),
            onPress: handleCloseEventPress,
          },
        ]
      );
    } finally {
      setIsCheckingRefunds(false);
    }
  };

  const handleCancel = () => {
    setConfirmModal(null);
  };

  const handleSaveLimits = async () => {
    if (!user?.eventId) return;
    const syncLimit = parseInt(offlineSyncLimit, 10);
    const braceletLimit = parseInt(maxOfflineSpendPerBracelet, 10);
    if (isNaN(syncLimit) || syncLimit <= 0 || isNaN(braceletLimit) || braceletLimit <= 0) {
      showAlert(t("common.error"), t("eventAdmin.invalidLimitValues"));
      return;
    }
    setIsSavingLimits(true);
    try {
      await customFetch(`/api/events/${user.eventId}`, {
        method: "PATCH",
        body: JSON.stringify({
          offlineSyncLimit: syncLimit,
          maxOfflineSpendPerBracelet: braceletLimit,
        }),
      });
      refetch();
      showAlert(t("common.success"), t("eventAdmin.offlineLimitsSaved"));
    } catch {
      showAlert(t("common.error"), t("common.error"));
    } finally {
      setIsSavingLimits(false);
    }
  };

  const handleSelectChipType = (chipType: NfcChipType) => {
    setSelectedChipType(chipType);
  };

  const allowedTypesChanged = selectedChipType !== (currentAllowedTypes[0] ?? "ntag_21x");

  const handleSaveChipType = async () => {
    if (!user?.eventId) return;
    if (!allowedTypesChanged) return;
    setIsSavingChipType(true);
    try {
      await customFetch(`/api/events/${user.eventId}`, {
        method: "PATCH",
        body: JSON.stringify({ allowedNfcTypes: [selectedChipType], nfcChipType: selectedChipType }),
      });
      refetch();
      queryClient.invalidateQueries({ queryKey: ["event-context", user.eventId] });
      showAlert(t("common.success"), t("eventAdmin.nfcChipSaved"));
    } catch {
      showAlert(t("common.error"), t("eventAdmin.nfcChipSaveFailed"));
    } finally {
      setIsSavingChipType(false);
    }
  };

  if (isLoading) return <Loading label={t("common.loading")} />;

  const pendingMode = confirmModal?.type === "inventory" ? confirmModal.pendingMode : null;

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: C.background }}
        contentContainerStyle={{
          paddingTop: isWeb ? 67 : insets.top + 16,
          paddingBottom: isWeb ? 34 : insets.bottom + 80,
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

        <View style={[styles.sectionDivider, { borderTopColor: C.separator }]} />

        <Text style={[styles.sectionTitle, { color: C.text }]}>{t("eventAdmin.securitySettings")}</Text>
        <Text style={[styles.subtitle, { color: C.textSecondary }]}>
          {t("eventAdmin.hmacKeyDescription")}
        </Text>

        <Card padding={16} style={{ borderColor: C.border, borderWidth: 1 }}>
          <View style={styles.keyRow}>
            <View style={[styles.keyIconBox, { backgroundColor: C.primaryLight }]}>
              <Feather name="key" size={20} color={C.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.keyLabel, { color: C.text }]}>{t("eventAdmin.signingKey")}</Text>
              <Text style={[styles.keyValue, { color: C.textMuted, fontFamily: "Inter_400Regular" }]}>
                {event?.hasHmacSecret ? "••••••••••••••••••••••••••••••••" : t("eventAdmin.noKeySet")}
              </Text>
            </View>
          </View>

          <Button
            title={isRotating ? t("common.loading") : t("eventAdmin.rotateSigningKey")}
            onPress={() => setConfirmModal({ type: "rotate_key" })}
            variant="danger"
            size="md"
            fullWidth
            style={{ marginTop: 12 }}
            loading={isRotating}
          />
        </Card>

        <Card style={[styles.infoCard, { borderColor: C.danger + "55", backgroundColor: C.dangerLight }]} padding={14}>
          <View style={styles.infoRow}>
            <Feather name="alert-octagon" size={16} color={C.danger} style={{ marginTop: 1 }} />
            <Text style={[styles.infoText, { color: C.text }]}>
              {t("eventAdmin.rotateKeyWarning")}
            </Text>
          </View>
        </Card>

        <View style={[styles.sectionDivider, { borderTopColor: C.separator }]} />

        <Text style={[styles.sectionTitle, { color: C.text }]}>{t("eventAdmin.offlineLimits")}</Text>
        <Text style={[styles.subtitle, { color: C.textSecondary }]}>
          {t("eventAdmin.offlineLimitsDescription")}
        </Text>

        <Card padding={16} style={{ borderColor: C.border, borderWidth: 1 }}>
          <Text style={[styles.inputLabel, { color: C.text }]}>{t("eventAdmin.offlineSyncLimit")}</Text>
          <Text style={[styles.inputHint, { color: C.textMuted }]}>
            {t("eventAdmin.offlineSyncLimitHint")}
          </Text>
          <TextInput
            style={[styles.limitInput, { backgroundColor: C.inputBg, color: C.text, borderColor: C.border }]}
            value={offlineSyncLimit}
            onChangeText={setOfflineSyncLimit}
            keyboardType="numeric"
            placeholder="500000"
            placeholderTextColor={C.textMuted}
          />

          <Text style={[styles.inputLabel, { color: C.text, marginTop: 16 }]}>{t("eventAdmin.maxOfflineSpendPerBracelet")}</Text>
          <Text style={[styles.inputHint, { color: C.textMuted }]}>
            {t("eventAdmin.maxOfflineSpendHint")}
          </Text>
          <TextInput
            style={[styles.limitInput, { backgroundColor: C.inputBg, color: C.text, borderColor: C.border }]}
            value={maxOfflineSpendPerBracelet}
            onChangeText={setMaxOfflineSpendPerBracelet}
            keyboardType="numeric"
            placeholder="200000"
            placeholderTextColor={C.textMuted}
          />

          <Button
            title={t("common.save")}
            onPress={handleSaveLimits}
            variant="primary"
            size="md"
            fullWidth
            style={{ marginTop: 16 }}
            loading={isSavingLimits}
          />
        </Card>

        <View style={[styles.sectionDivider, { borderTopColor: C.separator }]} />

        <Text style={[styles.sectionTitle, { color: C.text }]}>{t("eventAdmin.nfcChipSettings")}</Text>
        <Text style={[styles.subtitle, { color: C.textSecondary }]}>
          {t("eventAdmin.nfcChipSettingsDescription")}
        </Text>

        <View style={styles.modesContainer}>
          <NfcChipCheckbox
            chipType="ntag_21x"
            title={t("eventAdmin.ntag21x")}
            description={t("eventAdmin.ntag21xDesc")}
            icon="wifi"
            checked={selectedChipType === "ntag_21x"}
            onToggle={() => handleSelectChipType("ntag_21x")}
          />
          <NfcChipCheckbox
            chipType="mifare_classic"
            title={t("eventAdmin.mifareClassic")}
            description={t("eventAdmin.mifareClassicDesc")}
            icon="cpu"
            checked={selectedChipType === "mifare_classic"}
            onToggle={() => handleSelectChipType("mifare_classic")}
          />
          <NfcChipCheckbox
            chipType="desfire_ev3"
            title={t("eventAdmin.desfireEv3")}
            description={t("eventAdmin.desfireEv3Desc")}
            icon="shield"
            checked={selectedChipType === "desfire_ev3"}
            onToggle={() => handleSelectChipType("desfire_ev3")}
          />
          <NfcChipCheckbox
            chipType="mifare_ultralight_c"
            title={t("eventAdmin.mifareUltralightC")}
            description={t("eventAdmin.mifareUltralightCDesc")}
            icon="lock"
            checked={selectedChipType === "mifare_ultralight_c"}
            onToggle={() => handleSelectChipType("mifare_ultralight_c")}
          />
        </View>

        {selectedChipType === "mifare_classic" && (
          <Card style={[styles.infoCard, { borderColor: C.warning + "55", backgroundColor: C.warningLight }]} padding={14}>
            <View style={styles.infoRow}>
              <Feather name="alert-triangle" size={16} color={C.warning} style={{ marginTop: 1 }} />
              <Text style={[styles.infoText, { color: C.text }]}>
                {t("eventAdmin.mifareClassicWarning")}
              </Text>
            </View>
          </Card>
        )}

        {selectedChipType === "desfire_ev3" && (
          <Card style={[styles.infoCard, { borderColor: C.primary + "55", backgroundColor: C.primaryLight }]} padding={14}>
            <View style={styles.infoRow}>
              <Feather name="info" size={16} color={C.primary} style={{ marginTop: 1 }} />
              <Text style={[styles.infoText, { color: C.text }]}>
                {t("eventAdmin.desfireEv3Compatibility")}
              </Text>
            </View>
          </Card>
        )}

        <Button
          title={t("common.save")}
          onPress={handleSaveChipType}
          variant="primary"
          size="md"
          fullWidth
          loading={isSavingChipType}
          disabled={!allowedTypesChanged}
        />

        {selectedChipType === "desfire_ev3" && (
          <>
            <View style={[styles.sectionDivider, { borderTopColor: C.separator }]} />
            <Text style={[styles.sectionTitle, { color: C.text }]}>{t("eventAdmin.desfireAesKey")}</Text>
            <Text style={[styles.subtitle, { color: C.textSecondary }]}>
              {t("eventAdmin.desfireAesKeyDescription")}
            </Text>
            <Card padding={16} style={{ borderColor: C.border, borderWidth: 1 }}>
              <View style={styles.keyRow}>
                <View style={[styles.keyIconBox, { backgroundColor: C.primaryLight }]}>
                  <Feather name="lock" size={20} color={C.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.keyLabel, { color: C.text }]}>{t("eventAdmin.desfireAesKeyLabel")}</Text>
                  <Text style={[styles.keyValue, { color: C.textMuted, fontFamily: "Inter_400Regular" }]}>
                    {event?.hasDesfireKey ? "••••••••••••••••••••••••••••••••" : t("eventAdmin.noKeySet")}
                  </Text>
                </View>
              </View>
              <Button
                title={isGeneratingDesfireKey ? t("common.loading") : (event?.hasDesfireKey ? t("eventAdmin.regenerateDesfireKey") : t("eventAdmin.generateDesfireKey"))}
                onPress={() => setConfirmModal({ type: "generate_desfire_key" })}
                variant={event?.hasDesfireKey ? "danger" : "primary"}
                size="md"
                fullWidth
                style={{ marginTop: 12 }}
                loading={isGeneratingDesfireKey}
              />
            </Card>
            {event?.hasDesfireKey && (
              <Card style={[styles.infoCard, { borderColor: C.danger + "55", backgroundColor: C.dangerLight }]} padding={14}>
                <View style={styles.infoRow}>
                  <Feather name="alert-octagon" size={16} color={C.danger} style={{ marginTop: 1 }} />
                  <Text style={[styles.infoText, { color: C.text }]}>
                    {t("eventAdmin.desfireKeyRotateWarning")}
                  </Text>
                </View>
              </Card>
            )}
          </>
        )}

        {selectedChipType === "mifare_ultralight_c" && (
          <>
            <View style={[styles.sectionDivider, { borderTopColor: C.separator }]} />
            <Text style={[styles.sectionTitle, { color: C.text }]}>{t("eventAdmin.ultralightCDesKey")}</Text>
            <Text style={[styles.subtitle, { color: C.textSecondary }]}>
              {t("eventAdmin.ultralightCDesKeyDescription")}
            </Text>
            <Card padding={16} style={{ borderColor: C.border, borderWidth: 1 }}>
              <View style={styles.keyRow}>
                <View style={[styles.keyIconBox, { backgroundColor: C.primaryLight }]}>
                  <Feather name="lock" size={20} color={C.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.keyLabel, { color: C.text }]}>{t("eventAdmin.ultralightCDesKeyLabel")}</Text>
                  <Text style={[styles.keyValue, { color: C.textMuted, fontFamily: "Inter_400Regular" }]}>
                    {event?.hasUltralightCKey ? "••••••••••••••••••••••••••••••••" : t("eventAdmin.noKeySet")}
                  </Text>
                </View>
              </View>
              <Button
                title={isGeneratingUltralightCKey ? t("common.loading") : (event?.hasUltralightCKey ? t("eventAdmin.regenerateUltralightCKey") : t("eventAdmin.generateUltralightCKey"))}
                onPress={() => setConfirmModal({ type: "generate_ultralight_c_key" })}
                variant={event?.hasUltralightCKey ? "danger" : "primary"}
                size="md"
                fullWidth
                style={{ marginTop: 12 }}
                loading={isGeneratingUltralightCKey}
              />
            </Card>
            {event?.hasUltralightCKey && (
              <Card style={[styles.infoCard, { borderColor: C.danger + "55", backgroundColor: C.dangerLight }]} padding={14}>
                <View style={styles.infoRow}>
                  <Feather name="alert-octagon" size={16} color={C.danger} style={{ marginTop: 1 }} />
                  <Text style={[styles.infoText, { color: C.text }]}>
                    {t("eventAdmin.ultralightCKeyRotateWarning")}
                  </Text>
                </View>
              </Card>
            )}
          </>
        )}

        <View style={[styles.sectionDivider, { borderTopColor: C.separator }]} />

        <Text style={[styles.sectionTitle, { color: C.text }]}>Métodos de Pago</Text>
        <Text style={[styles.subtitle, { color: C.textSecondary }]}>
          Configura qué métodos de pago están disponibles para banco y boletería.
        </Text>

        <Card padding={16} style={{ borderColor: C.border, borderWidth: 1 }}>
          <Text style={[styles.inputLabel, { color: C.text }]}>Banco — Recargas</Text>
          <View style={{ gap: 8, marginTop: 8 }}>
            {BANK_METHODS.map((m) => {
              const isChecked = selectedBankMethods.includes(m.value);
              return (
                <Pressable
                  key={m.value}
                  onPress={() => setSelectedBankMethods((prev) =>
                    prev.includes(m.value)
                      ? prev.length > 1 ? prev.filter((x) => x !== m.value) : prev
                      : [...prev, m.value]
                  )}
                  style={[
                    styles.modeOption,
                    {
                      backgroundColor: isChecked ? C.primaryLight : C.card,
                      borderColor: isChecked ? C.primary : C.border,
                      padding: 12,
                    },
                  ]}
                >
                  <Feather name={m.icon} size={18} color={isChecked ? C.primary : C.textMuted} />
                  <Text style={[styles.modeTitle, { color: isChecked ? C.primary : C.text, flex: 1 }]}>{m.label}</Text>
                  <View style={[styles.checkboxBox, { borderColor: isChecked ? C.primary : C.border, backgroundColor: isChecked ? C.primary : "transparent" }]}>
                    {isChecked && <Feather name="check" size={14} color="#0a0a0a" />}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.inputLabel, { color: C.text, marginTop: 16 }]}>Monto mínimo de recarga (COP)</Text>
          <Text style={[styles.inputHint, { color: C.textMuted }]}>0 = sin mínimo adicional (usa el mínimo base de $1.000)</Text>
          <TextInput
            style={[styles.limitInput, { backgroundColor: C.inputBg, color: C.text, borderColor: C.border }]}
            value={bankMinTopupText}
            onChangeText={setBankMinTopupText}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={C.textMuted}
          />

          <Text style={[styles.inputLabel, { color: C.text, marginTop: 16 }]}>Boletería — Venta en puerta</Text>
          <View style={{ gap: 8, marginTop: 8 }}>
            {BOX_OFFICE_METHODS.map((m) => {
              const isChecked = selectedBoxOfficeMethods.includes(m.value);
              return (
                <Pressable
                  key={m.value}
                  onPress={() => setSelectedBoxOfficeMethods((prev) =>
                    prev.includes(m.value)
                      ? prev.length > 1 ? prev.filter((x) => x !== m.value) : prev
                      : [...prev, m.value]
                  )}
                  style={[
                    styles.modeOption,
                    {
                      backgroundColor: isChecked ? C.primaryLight : C.card,
                      borderColor: isChecked ? C.primary : C.border,
                      padding: 12,
                    },
                  ]}
                >
                  <Feather name={m.icon} size={18} color={isChecked ? C.primary : C.textMuted} />
                  <Text style={[styles.modeTitle, { color: isChecked ? C.primary : C.text, flex: 1 }]}>{m.label}</Text>
                  <View style={[styles.checkboxBox, { borderColor: isChecked ? C.primary : C.border, backgroundColor: isChecked ? C.primary : "transparent" }]}>
                    {isChecked && <Feather name="check" size={14} color="#0a0a0a" />}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Button
            title={t("common.save")}
            onPress={handleSavePaymentConfig}
            variant="primary"
            size="md"
            fullWidth
            style={{ marginTop: 16 }}
            loading={isSavingPaymentConfig}
          />
        </Card>

        <View style={[styles.sectionDivider, { borderTopColor: C.separator }]} />

        <Text style={[styles.sectionTitle, { color: C.text }]}>{t("eventAdmin.closeEventSection")}</Text>
        <Text style={[styles.subtitle, { color: C.textSecondary }]}>
          {t("eventAdmin.closeEventDescription")}
        </Text>

        <Card style={[styles.infoCard, { borderColor: C.danger + "55", backgroundColor: C.dangerLight }]} padding={14}>
          <View style={styles.infoRow}>
            <Feather name="alert-octagon" size={16} color={C.danger} style={{ marginTop: 1 }} />
            <Text style={[styles.infoText, { color: C.text }]}>
              {t("eventAdmin.closeEventWarning")}
            </Text>
          </View>
        </Card>

        <Button
          title={isClosingEvent || isCheckingRefunds ? t("common.processing") : t("eventAdmin.closeEvent")}
          onPress={handleCloseEventPress}
          variant="danger"
          size="md"
          fullWidth
          loading={isClosingEvent || isCheckingRefunds}
          disabled={event?.active === false}
        />

        <View style={[styles.sectionDivider, { borderTopColor: C.separator }]} />

        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: C.text }]}>{t("eventAdmin.flaggedBracelets")}</Text>
          <Pressable onPress={() => refetchFlagged()} style={styles.refreshBtn}>
            <Feather name="refresh-cw" size={16} color={C.primary} />
          </Pressable>
        </View>
        <Text style={[styles.subtitle, { color: C.textSecondary }]}>
          {t("eventAdmin.flaggedBraceletsDescription")}
        </Text>

        {flaggedBracelets.length === 0 ? (
          <Card padding={16} style={{ borderColor: C.border, borderWidth: 1 }}>
            <View style={styles.infoRow}>
              <Feather name="check-circle" size={16} color={C.success} style={{ marginTop: 1 }} />
              <Text style={[styles.infoText, { color: C.text }]}>{t("eventAdmin.noFlaggedBracelets")}</Text>
            </View>
          </Card>
        ) : (
          <Card padding={0} style={{ borderColor: C.danger + "55", borderWidth: 1, overflow: "hidden" }}>
            {flaggedBracelets.map((b, idx) => (
              <View
                key={b.nfcUid}
                style={[
                  styles.flaggedRow,
                  { borderTopColor: C.border, borderTopWidth: idx === 0 ? 0 : 1 },
                ]}
              >
                <View style={[styles.flagDot, { backgroundColor: C.danger }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.flagUid, { color: C.text, fontFamily: "Inter_600SemiBold" }]}>{b.nfcUid}</Text>
                  {b.flagReason ? (
                    <Text style={[styles.flagReason, { color: C.textSecondary }]}>{b.flagReason}</Text>
                  ) : null}
                </View>
              </View>
            ))}
          </Card>
        )}
      </ScrollView>

      <Modal
        visible={confirmModal !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        transparent={false}
        onRequestClose={handleCancel}
      >
        <View style={[styles.confirmModal, { backgroundColor: C.background }]}>
          <View style={styles.modalHandle} />

          {confirmModal?.type === "close_event" ? (
            <>
              <View style={[styles.warningIconBox, { backgroundColor: C.dangerLight }]}>
                <Feather name="lock" size={32} color={C.danger} />
              </View>
              <Text style={[styles.confirmTitle, { color: C.text }]}>
                {t("eventAdmin.closeEvent")}
              </Text>
              <Text style={[styles.confirmDesc, { color: C.textSecondary }]}>
                {t("eventAdmin.closeEventConfirmDesc")}
              </Text>
              {confirmModal.pendingRefundCount > 0 && (
                <View style={[styles.pendingRefundWarning, { backgroundColor: C.warningLight, borderColor: C.warning + "55" }]}>
                  <Feather name="alert-triangle" size={16} color={C.warning} />
                  <Text style={[styles.pendingRefundWarningText, { color: C.text }]}>
                    {t("eventAdmin.closeEventPendingWarning", { count: confirmModal.pendingRefundCount })}
                  </Text>
                </View>
              )}
            </>
          ) : confirmModal?.type === "rotate_key" ? (
            <>
              <View style={[styles.warningIconBox, { backgroundColor: C.dangerLight }]}>
                <Feather name="alert-octagon" size={32} color={C.danger} />
              </View>
              <Text style={[styles.confirmTitle, { color: C.text }]}>
                {t("eventAdmin.rotateSigningKey")}
              </Text>
              <Text style={[styles.confirmDesc, { color: C.textSecondary }]}>
                {t("eventAdmin.rotateKeyWarning")}
              </Text>
            </>
          ) : confirmModal?.type === "generate_desfire_key" ? (
            <>
              <View style={[styles.warningIconBox, { backgroundColor: C.primaryLight }]}>
                <Feather name="lock" size={32} color={C.primary} />
              </View>
              <Text style={[styles.confirmTitle, { color: C.text }]}>
                {t("eventAdmin.generateDesfireKey")}
              </Text>
              <Text style={[styles.confirmDesc, { color: C.textSecondary }]}>
                {t("eventAdmin.desfireKeyConfirmDesc")}
              </Text>
            </>
          ) : confirmModal?.type === "generate_ultralight_c_key" ? (
            <>
              <View style={[styles.warningIconBox, { backgroundColor: C.primaryLight }]}>
                <Feather name="lock" size={32} color={C.primary} />
              </View>
              <Text style={[styles.confirmTitle, { color: C.text }]}>
                {t("eventAdmin.generateUltralightCKey")}
              </Text>
              <Text style={[styles.confirmDesc, { color: C.textSecondary }]}>
                {t("eventAdmin.ultralightCKeyConfirmDesc")}
              </Text>
            </>
          ) : (
            <>
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
            </>
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
              title={
                confirmModal?.type === "rotate_key"
                  ? t("eventAdmin.confirmRotate")
                  : confirmModal?.type === "close_event"
                    ? (confirmModal.pendingRefundCount > 0
                        ? t("eventAdmin.forceCloseEvent")
                        : t("eventAdmin.closeEventConfirm"))
                    : t("common.confirm")
              }
              onPress={handleConfirm}
              variant={confirmModal?.type === "rotate_key" || confirmModal?.type === "close_event" ? "danger" : "primary"}
              size="lg"
              fullWidth
              loading={updateEvent.isPending || isRotating || isGeneratingDesfireKey || isGeneratingUltralightCKey || isClosingEvent}
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
  sectionTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginTop: -12,
  },
  sectionDivider: {
    borderTopWidth: 1,
    marginVertical: 4,
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
    color: "#0a0a0a",
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
  keyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 4,
  },
  keyIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  keyLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  keyValue: {
    fontSize: 13,
    marginTop: 2,
    letterSpacing: 2,
  },
  inputLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
  },
  inputHint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginBottom: 6,
  },
  limitInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
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
  pendingRefundWarning: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    width: "100%",
  },
  pendingRefundWarningText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
  confirmActions: {
    width: "100%",
    gap: 10,
    marginTop: "auto",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  refreshBtn: {
    padding: 6,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    flexShrink: 0,
  },
  radioBox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    flexShrink: 0,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  flaggedRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
  },
  flagDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
  },
  flagUid: {
    fontSize: 13,
  },
  flagReason: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
});
