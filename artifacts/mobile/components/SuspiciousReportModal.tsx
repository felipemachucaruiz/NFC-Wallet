import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useReportSuspiciousBracelet } from "@workspace/api-client-react";
import type { ManualReportReason } from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { Button } from "@/components/ui/Button";
import { useAlert } from "@/components/CustomAlert";

interface Props {
  visible: boolean;
  onClose: () => void;
  prefillUid?: string;
}

const REASONS: { value: ManualReportReason; labelKey: string }[] = [
  { value: "wrong_balance", labelKey: "fraud.reasonWrongBalance" },
  { value: "strange_behavior", labelKey: "fraud.reasonStrangeBehavior" },
  { value: "damaged_bracelet", labelKey: "fraud.reasonDamagedBracelet" },
  { value: "other", labelKey: "fraud.reasonOther" },
];

export function SuspiciousReportModal({ visible, onClose, prefillUid }: Props) {
  const { t } = useTranslation();
  const { show: showAlert } = useAlert();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const [uid, setUid] = useState(prefillUid ?? "");
  const [reason, setReason] = useState<ManualReportReason>("wrong_balance");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (visible) {
      setUid(prefillUid ?? "");
    }
  }, [visible, prefillUid]);

  const reportMutation = useReportSuspiciousBracelet();

  const handleSubmit = async () => {
    if (!uid.trim()) {
      showAlert(t("common.error"), t("fraud.reportUidLabel") + " " + t("common.fillRequired"));
      return;
    }
    try {
      await reportMutation.mutateAsync({
        data: {
          nfcUid: uid.trim(),
          reason,
          notes: notes.trim() || undefined,
        },
      });
      showAlert(t("fraud.reportSuccess"), t("fraud.reportSuccessDetail"));
      setUid(prefillUid ?? "");
      setReason("wrong_balance");
      setNotes("");
      onClose();
    } catch {
      showAlert(t("common.error"), t("fraud.reportError"));
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: C.card,
              paddingBottom: isWeb ? 32 : insets.bottom + 24,
            },
          ]}
        >
          <View style={[styles.header, { borderBottomColor: C.separator }]}>
            <Text style={[styles.title, { color: C.text }]}>{t("fraud.reportTitle")}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Feather name="x" size={22} color={C.textMuted} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Text style={[styles.label, { color: C.textSecondary }]}>{t("fraud.reportUidLabel")}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: C.inputBg, color: C.text, borderColor: C.border }]}
              placeholder={t("fraud.reportUidPlaceholder")}
              placeholderTextColor={C.textMuted}
              value={uid}
              onChangeText={setUid}
              autoCapitalize="characters"
            />

            <Text style={[styles.label, { color: C.textSecondary, marginTop: 16 }]}>{t("fraud.reportReason")}</Text>
            <View style={styles.reasonGrid}>
              {REASONS.map((r) => {
                const isSelected = reason === r.value;
                return (
                  <Pressable
                    key={r.value}
                    onPress={() => setReason(r.value)}
                    style={[
                      styles.reasonBtn,
                      {
                        backgroundColor: isSelected ? C.primaryLight : C.inputBg,
                        borderColor: isSelected ? C.primary : C.border,
                      },
                    ]}
                  >
                    <Text style={[styles.reasonLabel, { color: isSelected ? C.primary : C.textSecondary }]}>
                      {t(r.labelKey)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.label, { color: C.textSecondary, marginTop: 16 }]}>{t("fraud.reportNotes")}</Text>
            <TextInput
              style={[
                styles.input,
                styles.notesInput,
                { backgroundColor: C.inputBg, color: C.text, borderColor: C.border },
              ]}
              placeholder={t("fraud.reportNotesPlaceholder")}
              placeholderTextColor={C.textMuted}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
            />

            <Button
              title={t("fraud.reportSubmit")}
              onPress={handleSubmit}
              variant="danger"
              size="lg"
              fullWidth
              loading={reportMutation.isPending}
              style={{ marginTop: 24 }}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "90%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  body: {
    padding: 20,
    gap: 4,
  },
  label: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  notesInput: {
    height: 80,
    textAlignVertical: "top",
    paddingTop: 10,
  },
  reasonGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  reasonBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  reasonLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
});
