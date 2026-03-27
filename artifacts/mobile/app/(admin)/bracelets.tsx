import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import {
  useGetBracelet,
  useUnflagBracelet,
  useDeleteAdminBracelet,
  useGetSigningKey,
} from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CopAmount } from "@/components/CopAmount";
import { isNfcSupported, scanBracelet, scanAndWriteBracelet } from "@/utils/nfc";
import { computeHmac } from "@/utils/hmac";
import { useOfflineQueue } from "@/contexts/OfflineQueueContext";
import { useAuth } from "@/contexts/AuthContext";
import { API_BASE_URL } from "@/constants/domain";
import { OfflineBanner } from "@/components/OfflineBanner";

export default function BraceletsAdminScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const [uid, setUid] = useState("");
  const [searchUid, setSearchUid] = useState("");
  const [scanning, setScanning] = useState(false);
  const [resetting, setResetting] = useState(false);

  const { data: bracelet, isLoading, error, refetch } = useGetBracelet(searchUid, {
    query: { queryKey: ["bracelet", searchUid], enabled: !!searchUid },
  });

  const unflag = useUnflagBracelet();
  const deleteBracelet = useDeleteAdminBracelet();

  const { data: keyData } = useGetSigningKey();
  const networkHmacSecret = (keyData as unknown as { hmacSecret?: string } | undefined)?.hmacSecret ?? "";
  const { cachedHmacSecret } = useOfflineQueue();
  const hmacSecret = networkHmacSecret || cachedHmacSecret;

  const { token } = useAuth();

  const handleScan = async () => {
    if (!isNfcSupported()) return;
    setScanning(true);
    try {
      const result = await scanBracelet();
      if (result?.payload?.uid) {
        setUid(result.payload.uid);
        setSearchUid(result.payload.uid);
      }
    } catch {
      Alert.alert(t("common.error"), t("pos.scanError"));
    } finally {
      setScanning(false);
    }
  };

  const handleLookup = () => {
    const trimmed = uid.trim();
    if (!trimmed) {
      Alert.alert(t("common.error"), t("admin.noUidEntered"));
      return;
    }
    setSearchUid(trimmed);
  };

  const handleUnflag = () => {
    Alert.alert(
      t("admin.unflagBracelet"),
      t("admin.unflagConfirm"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("admin.unflagBracelet"),
          style: "default",
          onPress: async () => {
            try {
              await unflag.mutateAsync({ nfcUid: searchUid });
              Alert.alert(t("common.success"), t("admin.unflagSuccess"));
              refetch();
            } catch {
              Alert.alert(t("common.error"), t("common.unexpectedError"));
            }
          },
        },
      ],
    );
  };

  const handleResetBalance = () => {
    Alert.alert(
      t("admin.resetBalance"),
      t("admin.resetBalanceConfirm"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("admin.resetBalance"),
          style: "destructive",
          onPress: async () => {
            if (!isNfcSupported()) {
              Alert.alert(t("common.error"), t("checkBalance.nfcNotSupported"));
              return;
            }
            if (!hmacSecret) {
              Alert.alert(t("common.error"), t("common.unknownError"));
              return;
            }
            setResetting(true);
            try {
              await scanAndWriteBracelet(async (payload, tagInfo) => {
                if (payload.uid !== searchUid) {
                  Alert.alert(t("common.error"), t("checkBalance.wrongBracelet"));
                  return null;
                }
                const newCounter = tagInfo?.type === "MIFARE_CLASSIC"
                  ? (payload.counter ?? 0)
                  : (payload.counter ?? 0) + 1;
                const newHmac = await computeHmac(0, newCounter, hmacSecret);
                return { uid: payload.uid, balance: 0, counter: newCounter, hmac: newHmac };
              });

              await fetch(`${API_BASE_URL}/admin/bracelets/${searchUid}/reset-balance`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
              });

              Alert.alert(t("common.success"), t("admin.resetBalanceSuccess"));
              refetch();
            } catch (e: unknown) {
              const msg = (e instanceof Error ? e.message : String(e)) ?? "";
              if (!msg.includes("cancelled") && !msg.includes("UserCancel")) {
                Alert.alert(t("common.error"), t("admin.resetBalanceError"));
              }
            } finally {
              setResetting(false);
            }
          },
        },
      ],
    );
  };

  const handleDelete = () => {
    Alert.alert(
      t("admin.deleteRecord"),
      t("admin.deleteRecordConfirm"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("admin.deleteRecord"),
          style: "destructive",
          onPress: async () => {
            try {
              await deleteBracelet.mutateAsync({ nfcUid: searchUid });
              Alert.alert(t("common.success"), t("admin.deleteRecordSuccess"));
              setUid("");
              setSearchUid("");
            } catch {
              Alert.alert(t("common.error"), t("common.unexpectedError"));
            }
          },
        },
      ],
    );
  };

  const isFlagged = (bracelet as { flagged?: boolean } | undefined)?.flagged ?? false;
  const flagReason = (bracelet as { flagReason?: string | null } | undefined)?.flagReason;

  return (
    <>
    <OfflineBanner syncIssuesRoute={""} />
    <ScrollView
      style={[styles.container, { backgroundColor: C.background }]}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: isWeb ? 24 : insets.top + 16,
          paddingBottom: insets.bottom + 24,
        },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.heading, { color: C.text }]}>{t("admin.braceletLookup")}</Text>
      <Text style={[styles.subtitle, { color: C.textSecondary }]}>{t("admin.scanOrEnterUid")}</Text>

      {isNfcSupported() && (
        <Button
          label={scanning ? t("common.loading") : t("bank.tapBracelet")}
          onPress={handleScan}
          disabled={scanning}
          variant="primary"
          style={styles.scanBtn}
        />
      )}

      <View style={styles.row}>
        <TextInput
          style={[
            styles.uidInput,
            {
              backgroundColor: C.card,
              borderColor: C.border,
              color: C.text,
              flex: 1,
            },
          ]}
          placeholder={t("admin.uidPlaceholder")}
          placeholderTextColor={C.textSecondary}
          value={uid}
          onChangeText={setUid}
          autoCapitalize="characters"
          returnKeyType="search"
          onSubmitEditing={handleLookup}
        />
        <Button
          label={t("admin.lookupBracelet")}
          onPress={handleLookup}
          variant="secondary"
          style={styles.lookupBtn}
        />
      </View>

      {isLoading && (
        <Text style={[styles.hint, { color: C.textSecondary }]}>{t("common.loading")}</Text>
      )}

      {error && !isLoading && (
        <Card style={styles.notFoundCard}>
          <Feather name="alert-circle" size={32} color={C.danger} />
          <Text style={[styles.notFoundText, { color: C.danger }]}>
            {t("admin.braceletNotFound")}
          </Text>
          <Text style={[styles.uidLabel, { color: C.textSecondary }]}>{searchUid}</Text>
        </Card>
      )}

      {bracelet && !isLoading && (
        <Card style={styles.resultCard}>
          <View style={styles.statusRow}>
            <Text style={[styles.uidBig, { color: C.text }]}>{searchUid}</Text>
            <Badge
              label={isFlagged ? t("admin.braceletFlagged") : t("admin.braceletActive")}
              variant={isFlagged ? "danger" : "success"}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: C.border }]} />

          <InfoRow label={t("admin.braceletOwner")} value={(bracelet as { attendeeName?: string | null }).attendeeName ?? "—"} C={C} />
          <InfoRow label={t("admin.braceletEvent")} value={(bracelet as { eventId?: string | null }).eventId ?? "—"} C={C} />
          <InfoRow
            label={t("admin.braceletBalance")}
            value={null}
            C={C}
            customValue={<CopAmount amount={(bracelet as { balance?: number }).balance ?? 0} style={{ color: C.text, fontFamily: "Inter_600SemiBold", fontSize: 16 }} />}
          />
          <InfoRow
            label={t("admin.braceletCounter")}
            value={String((bracelet as { transactionCount?: number }).transactionCount ?? 0)}
            C={C}
          />

          {isFlagged && flagReason && (
            <InfoRow label={t("admin.flagReason")} value={flagReason} C={C} />
          )}

          <View style={[styles.divider, { backgroundColor: C.border }]} />

          <View style={styles.actions}>
            {isFlagged && (
              <Button
                label={t("admin.unflagBracelet")}
                onPress={handleUnflag}
                variant="primary"
                loading={unflag.isPending}
                style={styles.actionBtn}
              />
            )}
            <Button
              label={t("admin.resetBalance")}
              onPress={handleResetBalance}
              variant="secondary"
              loading={resetting}
              style={styles.actionBtn}
            />
            <Button
              label={t("admin.deleteRecord")}
              onPress={handleDelete}
              variant="danger"
              loading={deleteBracelet.isPending}
              style={styles.actionBtn}
            />
          </View>
        </Card>
      )}
    </ScrollView>
    </>
  );
}

function InfoRow({
  label,
  value,
  customValue,
  C,
}: {
  label: string;
  value: string | null;
  customValue?: React.ReactNode;
  C: typeof Colors.light;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: C.textSecondary }]}>{label}</Text>
      {customValue ?? (
        <Text style={[styles.infoValue, { color: C.text }]}>{value}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 16 },
  heading: { fontSize: 22, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: -8 },
  scanBtn: { width: "100%" },
  row: { flexDirection: "row", gap: 10, alignItems: "center" },
  uidInput: {
    height: 46,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  lookupBtn: { flexShrink: 0 },
  hint: { textAlign: "center", fontFamily: "Inter_400Regular", fontSize: 14 },
  notFoundCard: { alignItems: "center", gap: 8, padding: 24 },
  notFoundText: { fontSize: 15, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  uidLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  resultCard: { gap: 12 },
  statusRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  uidBig: { fontSize: 15, fontFamily: "Inter_700Bold", flex: 1, marginRight: 8 },
  divider: { height: 1 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  infoLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  infoValue: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  actions: { gap: 10 },
  actionBtn: { width: "100%" },
});
