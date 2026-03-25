import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useGetSigningKey } from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { CopAmount } from "@/components/CopAmount";
import { Button } from "@/components/ui/Button";
import { Loading } from "@/components/ui/Loading";
import { isNfcSupported, readBracelet } from "@/utils/nfc";
import { verifyHmac, type BraceletPayload } from "@/utils/hmac";
import { formatDateTime } from "@/utils/format";

export default function AttendeeBalanceScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const [bracelet, setBracelet] = useState<BraceletPayload | null>(null);
  const [isTapping, setIsTapping] = useState(false);
  const [hmacValid, setHmacValid] = useState<boolean | null>(null);
  const [showManualUid, setShowManualUid] = useState(false);
  const [manualUid, setManualUid] = useState("");
  const [lastRead, setLastRead] = useState<string | null>(null);

  const { data: keyData } = useGetSigningKey();
  const hmacSecret = keyData?.key ?? "";

  const handleTap = async () => {
    if (!isNfcSupported()) {
      setShowManualUid(true);
      return;
    }
    setIsTapping(true);
    try {
      const payload = await readBracelet();
      if (hmacSecret && payload.hmac) {
        const valid = await verifyHmac(payload.balance, payload.counter, payload.hmac, hmacSecret);
        setHmacValid(valid);
      } else {
        setHmacValid(null);
      }
      setBracelet(payload);
      setLastRead(new Date().toISOString());
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (msg !== "NFC_NOT_AVAILABLE") {
        Alert.alert(t("common.error"), t("common.unknownError"));
      }
    } finally {
      setIsTapping(false);
    }
  };

  const handleManualConfirm = () => {
    if (!manualUid.trim()) return;
    setBracelet({ uid: manualUid.trim(), balance: 0, counter: 0, hmac: "" });
    setHmacValid(null);
    setLastRead(new Date().toISOString());
    setShowManualUid(false);
    setManualUid("");
  };

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <LinearGradient
        colors={scheme === "dark" ? ["#0A0F1E", "#0D1B3E"] : ["#EFF6FF", "#DBEAFE"]}
        style={StyleSheet.absoluteFill}
      />

      <View
        style={[
          styles.topBar,
          { paddingTop: isWeb ? 67 : insets.top + 8 },
        ]}
      >
        <Text style={[styles.pageTitle, { color: C.text }]}>
          {t("attendee.balanceTitle")}
        </Text>
        <Pressable onPress={() => router.push("/settings")}>
          <Feather name="settings" size={22} color={C.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.body}>
        {bracelet ? (
          <View style={styles.balanceCard}>
            <View style={[styles.balanceCircle, { borderColor: C.primary + "33", backgroundColor: C.card }]}>
              <Text style={[styles.balanceLabel, { color: C.textSecondary }]}>
                {t("attendee.balance")}
              </Text>
              <CopAmount amount={bracelet.balance} size={44} />
              {hmacValid === false && (
                <View style={[styles.tamperBadge, { backgroundColor: C.dangerLight }]}>
                  <Feather name="alert-triangle" size={12} color={C.danger} />
                  <Text style={[styles.tamperText, { color: C.danger }]}>
                    Bracelet inválida
                  </Text>
                </View>
              )}
            </View>
            {lastRead && (
              <Text style={[styles.lastRead, { color: C.textMuted }]}>
                {t("attendee.lastUpdated")}: {formatDateTime(lastRead)}
              </Text>
            )}
            <Text style={[styles.uidText, { color: C.textMuted }]}>
              UID: {bracelet.uid}
            </Text>
          </View>
        ) : (
          <View style={styles.tapPrompt}>
            <View style={[styles.tapCircle, { backgroundColor: C.primaryLight, borderColor: C.primary + "44" }]}>
              <Feather name="wifi" size={52} color={C.primary} />
            </View>
            <Text style={[styles.tapTitle, { color: C.text }]}>
              {isNfcSupported() ? t("attendee.tapBracelet") : "Ingresa el UID de tu pulsera"}
            </Text>
          </View>
        )}

        <Button
          title={isTapping ? t("attendee.tapping") : isNfcSupported() ? "Toca tu pulsera" : "Ingresar UID"}
          onPress={handleTap}
          loading={isTapping}
          variant="primary"
          size="lg"
          fullWidth
          testID="tap-bracelet-btn"
        />
        {bracelet && (
          <Button
            title="Actualizar saldo"
            onPress={handleTap}
            variant="ghost"
            size="md"
            fullWidth
          />
        )}
      </View>

      <Modal visible={showManualUid} transparent animationType="slide">
        <View style={[styles.modalOverlay, { backgroundColor: C.overlay }]}>
          <View style={[styles.modalBox, { backgroundColor: C.card }]}>
            <Text style={[styles.modalTitle, { color: C.text }]}>
              Ingresar UID de pulsera
            </Text>
            <TextInput
              style={[styles.uidInput, { backgroundColor: C.inputBg, color: C.text, borderColor: C.border }]}
              placeholder="Ej. A1:B2:C3:D4"
              placeholderTextColor={C.textMuted}
              value={manualUid}
              onChangeText={setManualUid}
              autoCapitalize="characters"
            />
            <View style={styles.modalActions}>
              <Button title={t("common.cancel")} onPress={() => setShowManualUid(false)} variant="secondary" />
              <Button title={t("common.confirm")} onPress={handleManualConfirm} variant="primary" />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  pageTitle: { fontSize: 24, fontFamily: "Inter_700Bold" },
  body: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
    gap: 24,
  },
  balanceCard: { alignItems: "center", gap: 12 },
  balanceCircle: {
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#1A56DB",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  balanceLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  tamperBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 4,
  },
  tamperText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  lastRead: { fontSize: 12, fontFamily: "Inter_400Regular" },
  uidText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  tapPrompt: { alignItems: "center", gap: 20 },
  tapCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  tapTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalBox: { padding: 24, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 16 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  uidInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
  },
  modalActions: { flexDirection: "row", gap: 12 },
});
