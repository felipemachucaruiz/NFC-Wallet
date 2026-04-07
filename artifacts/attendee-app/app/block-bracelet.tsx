import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { useAlert } from "@/components/CustomAlert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useBlockBracelet } from "@/hooks/useAttendeeApi";
import { extractErrorMessage } from "@/utils/errorMessage";

export default function BlockBraceletScreen() {
  const { t } = useTranslation();
  const { show: showAlert } = useAlert();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const params = useLocalSearchParams<{ uid: string }>();
  const uid = params.uid ?? "";

  const [step, setStep] = useState<"confirm" | "success">("confirm");
  const blockBracelet = useBlockBracelet();

  const handleBlock = () => {
    showAlert(
      t("block.title"),
      t("block.confirmMessage"),
      [
        { text: t("common.cancel"), variant: "cancel" },
        {
          text: t("block.blockBtn"),
          variant: "danger",
          onPress: async () => {
            try {
              await blockBracelet.mutateAsync({ uid, reason: "Blocked by attendee via app" });
              setStep("success");
            } catch (e: unknown) {
              showAlert(t("common.error"), extractErrorMessage(e, t("common.unknownError")));
            }
          },
        },
      ]
    );
  };

  if (step === "success") {
    return (
      <View style={[styles.center, { backgroundColor: C.background }]}>
        <View style={[styles.iconBox, { backgroundColor: C.successLight }]}>
          <Feather name="lock" size={52} color={C.success} />
        </View>
        <Text style={[styles.successTitle, { color: C.text }]}>{t("block.blockedTitle")}</Text>
        <Text style={[styles.successSubtitle, { color: C.textSecondary }]}>
          {t("block.blockedMessage")}
        </Text>
        <Button
          title={t("common.back")}
          onPress={() => router.back()}
          variant="primary"
          size="lg"
          fullWidth
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.background }}
      contentContainerStyle={{
        paddingTop: isWeb ? 67 : insets.top + 16,
        paddingBottom: isWeb ? 34 : insets.bottom + 24,
        paddingHorizontal: 20,
        gap: 20,
      }}
    >
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color={C.text} />
        </Pressable>
        <Text style={[styles.pageTitle, { color: C.text }]}>{t("block.title")}</Text>
        <View style={{ width: 24 }} />
      </View>

      <Card>
        <View style={styles.braceletRow}>
          <View style={[styles.nfcIcon, { backgroundColor: C.dangerLight }]}>
            <Feather name="wifi" size={20} color={C.danger} />
          </View>
          <View>
            <Text style={[styles.uidLabel, { color: C.textMuted }]}>{t("common.bracelet")}</Text>
            <Text style={[styles.uid, { color: C.text }]}>{uid}</Text>
          </View>
        </View>
      </Card>

      <Card>
        <View style={styles.warningBox}>
          <Feather name="alert-triangle" size={20} color={C.warning} />
          <Text style={[styles.warningTitle, { color: C.text }]}>{t("block.warningTitle")}</Text>
        </View>
        <View style={styles.warningList}>
          {[t("block.warning1"), t("block.warning2"), t("block.warning3")].map((w, i) => (
            <View key={i} style={styles.warningItem}>
              <View style={[styles.dot, { backgroundColor: C.warning }]} />
              <Text style={[styles.warningText, { color: C.textSecondary }]}>{w}</Text>
            </View>
          ))}
        </View>
      </Card>

      <Card>
        <View style={styles.unlockInfo}>
          <Feather name="info" size={16} color={C.primary} />
          <Text style={[styles.unlockText, { color: C.textSecondary }]}>
            {t("block.unlockInfo")}
          </Text>
        </View>
      </Card>

      <Button
        title={t("block.blockBtn")}
        onPress={handleBlock}
        variant="danger"
        size="lg"
        fullWidth
        loading={blockBracelet.isPending}
        testID="block-bracelet-btn"
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 20, paddingHorizontal: 28 },
  iconBox: { width: 100, height: 100, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  successTitle: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  successSubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pageTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  braceletRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  nfcIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  uidLabel: { fontSize: 11, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.5 },
  uid: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginTop: 2 },
  warningBox: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  warningTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  warningList: { gap: 8 },
  warningItem: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  warningText: { fontSize: 14, fontFamily: "Inter_400Regular", flex: 1 },
  unlockInfo: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  unlockText: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
});
