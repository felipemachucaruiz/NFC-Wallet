import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { isNfcSupported, scanBraceletUID } from "@/utils/nfc";
import { useLinkBracelet } from "@/hooks/useAttendeeApi";

function normalizeUid(raw: string): string {
  const clean = raw.replace(/[:\s\-]/g, "").toUpperCase();
  if (clean.length === 0) return "";
  return clean.match(/.{1,2}/g)?.join(":") ?? clean;
}

export default function AddBraceletScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const params = useLocalSearchParams<{ prefillUid?: string }>();
  const [uidInput, setUidInput] = useState(params.prefillUid ?? "");
  const [nameInput, setNameInput] = useState("");
  const [nfcAvailable, setNfcAvailable] = useState(false);
  const [scanning, setScanning] = useState(false);

  const { mutate: linkBracelet, isPending } = useLinkBracelet();

  useEffect(() => {
    isNfcSupported().then(setNfcAvailable);
  }, []);

  const handleNfcScan = async () => {
    if (scanning) return;
    setScanning(true);
    try {
      const uid = await scanBraceletUID();
      if (uid) {
        setUidInput(uid);
      }
    } catch {
    } finally {
      setScanning(false);
    }
  };

  const normalizedUid = normalizeUid(uidInput);
  const isValidUid = [8, 14, 20].includes(
    normalizedUid.replace(/:/g, "").length
  );

  const handleLink = () => {
    if (!isValidUid) {
      Alert.alert(t("addBracelet.invalidUid"), t("addBracelet.invalidUidHint"));
      return;
    }
    linkBracelet(
      { uid: normalizedUid, attendeeName: nameInput.trim() || undefined },
      {
        onSuccess: () => {
          Alert.alert(t("addBracelet.successTitle"), t("addBracelet.successMsg"), [
            { text: t("common.confirm"), onPress: () => router.back() },
          ]);
        },
        onError: (err) => {
          const msg = err.message;
          if (msg === "BRACELET_ALREADY_LINKED") {
            Alert.alert(t("addBracelet.alreadyLinkedTitle"), t("addBracelet.alreadyLinkedMsg"));
          } else if (msg === "BRACELET_FLAGGED") {
            Alert.alert(t("addBracelet.flaggedTitle"), t("addBracelet.flaggedMsg"));
          } else {
            Alert.alert(t("common.error"), msg || t("common.unknownError"));
          }
        },
      }
    );
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.background }}
      contentContainerStyle={{
        paddingBottom: isWeb ? 34 : insets.bottom + 40,
        paddingTop: isWeb ? 67 : insets.top + 16,
        paddingHorizontal: 20,
        gap: 20,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={22} color={C.text} />
        </Pressable>
        <Text style={[styles.title, { color: C.text }]}>{t("addBracelet.title")}</Text>
        <View style={{ width: 32 }} />
      </View>

      <Card style={{ gap: 16 }}>
        <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>
          {t("addBracelet.uidSection")}
        </Text>

        {nfcAvailable && (
          <Pressable
            style={[
              styles.nfcButton,
              {
                backgroundColor: scanning ? C.primaryLight : "rgba(0,241,255,0.10)",
                borderColor: C.primary,
              },
            ]}
            onPress={handleNfcScan}
            disabled={scanning}
          >
            <Feather
              name={scanning ? "loader" : "wifi"}
              size={20}
              color={C.primary}
            />
            <Text style={[styles.nfcButtonText, { color: C.primary }]}>
              {scanning ? t("addBracelet.scanning") : t("addBracelet.scanNfc")}
            </Text>
          </Pressable>
        )}

        <View style={[styles.dividerRow, { display: nfcAvailable ? "flex" : "none" }]}>
          <View style={[styles.dividerLine, { backgroundColor: C.separator }]} />
          <Text style={[styles.dividerText, { color: C.textMuted }]}>{t("addBracelet.orEnter")}</Text>
          <View style={[styles.dividerLine, { backgroundColor: C.separator }]} />
        </View>

        <View>
          <Text style={[styles.inputLabel, { color: C.textSecondary }]}>{t("addBracelet.uidLabel")}</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: C.inputBg,
                color: C.text,
                borderColor: isValidUid ? C.primary : C.border,
              },
            ]}
            value={uidInput}
            onChangeText={(v) => setUidInput(v.toUpperCase())}
            placeholder={t("addBracelet.uidPlaceholder")}
            placeholderTextColor={C.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <Text style={[styles.inputHint, { color: C.textMuted }]}>{t("addBracelet.uidHint")}</Text>
        </View>

        {normalizedUid.length > 0 && (
          <View style={[styles.uidPreview, { backgroundColor: C.primaryLight, borderColor: C.primary }]}>
            <Feather name="tag" size={14} color={C.primary} />
            <Text style={[styles.uidPreviewText, { color: C.primary }]}>{normalizedUid}</Text>
            {isValidUid && <Feather name="check-circle" size={14} color={C.primary} />}
          </View>
        )}
      </Card>

      <Card style={{ gap: 16 }}>
        <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>
          {t("addBracelet.nameSection")}
        </Text>
        <View>
          <Text style={[styles.inputLabel, { color: C.textSecondary }]}>{t("addBracelet.nameLabel")}</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: C.inputBg,
                color: C.text,
                borderColor: C.border,
              },
            ]}
            value={nameInput}
            onChangeText={setNameInput}
            placeholder={t("addBracelet.namePlaceholder")}
            placeholderTextColor={C.textMuted}
            autoCapitalize="words"
          />
          <Text style={[styles.inputHint, { color: C.textMuted }]}>{t("addBracelet.nameHint")}</Text>
        </View>
      </Card>

      <Button
        title={isPending ? t("addBracelet.linking") : t("addBracelet.linkBtn")}
        onPress={handleLink}
        variant="primary"
        disabled={!isValidUid || isPending}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  nfcButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  nfcButtonText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  inputLabel: {
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
    fontFamily: "Inter_500Medium",
  },
  inputHint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 5,
  },
  uidPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  uidPreviewText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
  },
});
