import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { Button } from "@/components/ui/Button";
import { CopAmount } from "@/components/CopAmount";
import { extractErrorMessage } from "@/utils/errorMessage";
import { useAuth } from "@/contexts/AuthContext";
import { useZoneCache, type AccessZone } from "@/contexts/ZoneCacheContext";
import {
  isNfcSupported,
  scanAndWriteBracelet,
  cancelNfc,
  type NfcChipTypeHint,
} from "@/utils/nfc";
import { computeHmac } from "@/utils/hmac";
import { API_BASE_URL } from "@/constants/domain";
import { fetchWithTimeout } from "@/utils/fetchWithTimeout";
import { useGetSigningKey } from "@workspace/api-client-react";

type FlowStep = "select" | "confirm" | "writing" | "done" | "error";

/** An upgrade option returned by the API — extends AccessZone with computed pricing */
interface UpgradeOption extends AccessZone {
  /** Cumulative price to reach this zone from current level (sum of all step prices) */
  totalUpgradePrice: number;
  /** All zones that will be added when upgrading to this target (including intermediate ones) */
  zonesGranted: AccessZone[];
}

interface UpgradeResult {
  currentZones: AccessZone[];
  zonesAdded: AccessZone[];
}

export default function UpgradeAccessScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { token } = useAuth();
  const { getZonesByIds } = useZoneCache();

  const params = useLocalSearchParams<{
    uid: string;
    tagType: string;
    tagLabel: string;
    tagMemoryBytes: string;
    counter: string;
    hmac: string;
    balance: string;
  }>();

  const uid = params.uid ?? "";
  const balance = Number(params.balance ?? 0);
  const counter = Number(params.counter ?? 0);
  const tagType = (params.tagType ?? "") as import("@/utils/nfc").TagType;
  const tagLabel = params.tagLabel ?? "";
  const tagMemoryBytes = Number(params.tagMemoryBytes ?? 0);

  const [step, setStep] = useState<FlowStep>("select");
  const [selectedOption, setSelectedOption] = useState<UpgradeOption | null>(null);
  const [upgradeResult, setUpgradeResult] = useState<UpgradeResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [currentZoneIds, setCurrentZoneIds] = useState<string[]>([]);
  const [availableUpgrades, setAvailableUpgrades] = useState<UpgradeOption[]>([]);
  const [loadingUpgrades, setLoadingUpgrades] = useState(true);
  const [maxAccess, setMaxAccess] = useState(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const cancelledRef = useRef(false);

  const { data: signingKeyData } = useGetSigningKey();
  const signingKey = (signingKeyData as { key?: string } | undefined)?.key;

  useEffect(() => {
    if (step !== "writing") return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.2, duration: 650, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 650, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [step]);

  useFocusEffect(
    useCallback(() => {
      cancelledRef.current = false;
      return () => {
        cancelledRef.current = true;
        cancelNfc().catch(() => {});
      };
    }, [])
  );

  // Load available upgrades from server (now includes totalUpgradePrice and zonesGranted)
  useEffect(() => {
    if (!uid || !token) return;
    setLoadingUpgrades(true);
    fetchWithTimeout(`${API_BASE_URL}/api/bracelets/${uid}/available-upgrades`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error("fetch failed");
        const body = await r.json() as {
          currentZones: AccessZone[];
          availableUpgrades: UpgradeOption[];
          atMaxLevel: boolean;
        };
        setCurrentZoneIds(body.currentZones.map((z) => z.id));
        setAvailableUpgrades(
          body.availableUpgrades.map((opt) => ({
            ...opt,
            zonesGranted: opt.zonesGranted ?? [],
            totalUpgradePrice: opt.totalUpgradePrice ?? opt.upgradePrice ?? 0,
          })),
        );
        setMaxAccess(body.atMaxLevel);
      })
      .catch(() => {})
      .finally(() => setLoadingUpgrades(false));
  }, [uid, token]);

  const currentZones = getZonesByIds(currentZoneIds);

  const handleConfirm = () => {
    if (!selectedOption) return;
    setStep("confirm");
  };

  const handleExecuteUpgrade = async () => {
    if (!selectedOption || !uid) return;
    setStep("writing");
    setErrorMsg("");

    try {
      // 1. Call server with targetZoneId — server adds all intermediate zones automatically
      const upgradeRes = await fetchWithTimeout(`${API_BASE_URL}/api/bracelets/${uid}/upgrade-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ targetZoneId: selectedOption.id }),
      });

      if (!upgradeRes.ok) {
        const err = await upgradeRes.json().catch(() => ({})) as { error?: string };
        setErrorMsg(err.error ?? t("common.unknownError"));
        setStep("error");
        return;
      }

      const rawData = await upgradeRes.json() as {
        currentZones: AccessZone[];
        zonesAdded: AccessZone[];
      };
      setUpgradeResult({
        currentZones: rawData.currentZones ?? [],
        zonesAdded: rawData.zonesAdded ?? [],
      });

      if (isNfcSupported() && tagType && signingKey) {
        const newCounter = counter + 1;
        const newHmac = await computeHmac(balance, newCounter, signingKey, uid);
        const chipHint: NfcChipTypeHint | undefined =
          tagType === "MIFARE_CLASSIC" ? "mifare_classic" : undefined;

        try {
          await scanAndWriteBracelet(async (payload) => {
            if (payload.uid !== uid) return null;
            return { uid, balance, counter: newCounter, hmac: newHmac };
          }, {
            expectedChipType: chipHint,
          });
        } catch (nfcErr: unknown) {
          const msg = extractErrorMessage(nfcErr, "");
          if (!msg.includes("cancel") && msg !== "USER_CANCELLED") {
            setErrorMsg(t("zones.nfcWriteFailed"));
          }
        }
      }

      setStep("done");
    } catch (e: unknown) {
      if (cancelledRef.current) return;
      const msg = extractErrorMessage(e, "");
      setErrorMsg(msg || t("common.unknownError"));
      setStep("error");
    }
  };

  if (!uid) {
    return (
      <View style={[styles.container, { backgroundColor: C.background }]}>
        <ScrollView
          contentContainerStyle={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 32,
            gap: 16,
          }}
        >
          <View style={[styles.nfcIconWrap, { backgroundColor: C.primaryLight }]}>
            <Feather name="shield" size={40} color={C.primary} />
          </View>
          <Text style={[styles.headerTitle, { color: C.text, textAlign: "center" }]}>
            {t("zones.upgradeAccess")}
          </Text>
          <Text style={{ color: C.textSecondary, textAlign: "center", fontSize: 15, lineHeight: 22 }}>
            {t("zones.scanBraceletFirst")}
          </Text>
          <Button
            title={t("bank.topUpLabel")}
            onPress={() => router.replace("/(bank)")}
            variant="primary"
            icon="plus-circle"
            style={{ marginTop: 8 }}
          />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: isWeb ? 67 : insets.top + 16,
            backgroundColor: C.card,
            borderBottomColor: C.border,
          },
        ]}
      >
        <Pressable
          onPress={() => { cancelNfc().catch(() => {}); router.back(); }}
          hitSlop={8}
        >
          <Feather name="arrow-left" size={22} color={C.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: C.text }]}>{t("zones.upgradeAccess")}</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 24,
          paddingBottom: isWeb ? 34 : insets.bottom + 40,
          gap: 20,
        }}
      >
        {/* Bracelet UID badge */}
        <View style={[styles.uidBadge, { backgroundColor: C.primaryLight, borderColor: C.primary }]}>
          <Feather name="wifi" size={16} color={C.primary} />
          <Text style={[styles.uidText, { color: C.primary }]}>{uid}</Text>
        </View>

        {/* Current zones */}
        <View style={[styles.section, { backgroundColor: C.card, borderColor: C.border }]}>
          <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>{t("zones.currentAccess")}</Text>
          {currentZones.length === 0 ? (
            <Text style={[styles.emptyText, { color: C.textMuted }]}>{t("zones.noAccess")}</Text>
          ) : (
            <View style={styles.zoneBadges}>
              {currentZones.map((z) => (
                <View
                  key={z.id}
                  style={[styles.zonePill, { backgroundColor: z.colorHex + "22", borderColor: z.colorHex }]}
                >
                  <View style={[styles.zoneDot, { backgroundColor: z.colorHex }]} />
                  <Text style={[styles.zonePillText, { color: z.colorHex }]}>{z.name}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Done state */}
        {step === "done" && upgradeResult && (
          <View style={[styles.successCard, { backgroundColor: C.successLight, borderColor: C.success }]}>
            <Feather name="check-circle" size={48} color={C.success} />
            <Text style={[styles.successTitle, { color: C.success }]}>{t("zones.upgradeSuccess")}</Text>

            {/* Zones added in this transaction */}
            {upgradeResult.zonesAdded.length > 0 && (
              <View style={{ width: "100%", gap: 6 }}>
                <Text style={[styles.sectionLabel, { color: C.success }]}>{t("zones.zonesAdded")}</Text>
                <View style={styles.zoneBadges}>
                  {upgradeResult.zonesAdded.map((z) => (
                    <View
                      key={z.id}
                      style={[styles.zonePill, { backgroundColor: z.colorHex + "22", borderColor: z.colorHex }]}
                    >
                      <View style={[styles.zoneDot, { backgroundColor: z.colorHex }]} />
                      <Text style={[styles.zonePillText, { color: z.colorHex }]}>{z.name}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* All zones now on bracelet */}
            <View style={{ width: "100%", gap: 6 }}>
              <Text style={[styles.sectionLabel, { color: C.success }]}>{t("zones.allAccessNow")}</Text>
              <View style={styles.zoneBadges}>
                {upgradeResult.currentZones.map((z) => (
                  <View
                    key={z.id}
                    style={[styles.zonePill, { backgroundColor: z.colorHex + "22", borderColor: z.colorHex }]}
                  >
                    <View style={[styles.zoneDot, { backgroundColor: z.colorHex }]} />
                    <Text style={[styles.zonePillText, { color: z.colorHex }]}>{z.name}</Text>
                  </View>
                ))}
              </View>
            </View>

            <Button
              title={t("zones.upgradeAnotherZone")}
              onPress={() => { setStep("select"); setSelectedOption(null); setUpgradeResult(null); }}
              variant="primary"
              style={{ width: "100%" }}
            />
            <Button
              title={t("common.done")}
              onPress={() => router.back()}
              variant="secondary"
              style={{ width: "100%" }}
            />
          </View>
        )}

        {/* Error state */}
        {step === "error" && (
          <View style={[styles.errorCard, { backgroundColor: C.dangerLight, borderColor: C.danger }]}>
            <Feather name="alert-circle" size={32} color={C.danger} />
            <Text style={[styles.errorTitle, { color: C.danger }]}>{t("common.error")}</Text>
            <Text style={[styles.errorMsg, { color: C.danger }]}>{errorMsg}</Text>
            <Button
              title={t("common.retry")}
              onPress={() => setStep("select")}
              variant="secondary"
              style={{ width: "100%" }}
            />
          </View>
        )}

        {/* Confirm step — shows itemized price breakdown */}
        {step === "confirm" && selectedOption && (
          <View style={[styles.confirmCard, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={[styles.confirmTitle, { color: C.text }]}>{t("zones.confirmUpgrade")}</Text>

            {/* Price breakdown per zone */}
            {selectedOption.zonesGranted.length > 0 && (
              <View style={[styles.breakdownBox, { backgroundColor: C.inputBg, borderColor: C.border }]}>
                <Text style={[styles.breakdownHeader, { color: C.textSecondary }]}>
                  {t("zones.priceBreakdown")}
                </Text>
                {selectedOption.zonesGranted.map((z) => (
                  <View key={z.id} style={styles.breakdownRow}>
                    <View style={[styles.zoneDotLg, { backgroundColor: z.colorHex }]} />
                    <Text style={[styles.breakdownZoneName, { color: C.text }]}>{z.name}</Text>
                    {z.upgradePrice != null && z.upgradePrice > 0 ? (
                      <CopAmount amount={z.upgradePrice} size={14} />
                    ) : (
                      <View style={[styles.freeBadge, { backgroundColor: C.successLight, borderColor: C.success }]}>
                        <Text style={[styles.freeBadgeText, { color: C.success }]}>{t("zones.free")}</Text>
                      </View>
                    )}
                  </View>
                ))}
                {/* Total line */}
                <View style={[styles.totalRow, { borderTopColor: C.border }]}>
                  <Text style={[styles.totalLabel, { color: C.text }]}>{t("zones.totalToPay")}</Text>
                  <CopAmount amount={selectedOption.totalUpgradePrice} size={20} />
                </View>
              </View>
            )}

            <View style={styles.confirmActions}>
              <Button
                title={t("common.cancel")}
                onPress={() => setStep("select")}
                variant="secondary"
              />
              <Button
                title={t("zones.confirmAndWrite")}
                onPress={handleExecuteUpgrade}
                variant="primary"
                icon="check"
              />
            </View>
          </View>
        )}

        {/* Writing step */}
        {step === "writing" && (
          <View style={[styles.writingCard, { backgroundColor: C.card, borderColor: C.primary }]}>
            <Animated.View
              style={[
                styles.nfcIconWrap,
                { backgroundColor: C.primaryLight, transform: [{ scale: pulseAnim }] },
              ]}
            >
              <ActivityIndicator size="large" color={C.primary} />
            </Animated.View>
            <Text style={[styles.writingTitle, { color: C.text }]}>{t("zones.writingNfc")}</Text>
            <Text style={[styles.writingSub, { color: C.textSecondary }]}>{t("gate.scanningHint")}</Text>
          </View>
        )}

        {/* Zone selection step */}
        {(step === "select" || step === "error") && (
          <>
            {loadingUpgrades ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={C.primary} />
                <Text style={[styles.loadingText, { color: C.textSecondary }]}>{t("common.loading")}</Text>
              </View>
            ) : maxAccess ? (
              <View style={[styles.maxAccessCard, { backgroundColor: C.card, borderColor: C.border }]}>
                <Feather name="award" size={40} color={C.primary} />
                <Text style={[styles.maxAccessTitle, { color: C.text }]}>{t("zones.maxAccessLevel")}</Text>
                <Text style={[styles.maxAccessSub, { color: C.textSecondary }]}>{t("zones.maxAccessLevelHint")}</Text>
              </View>
            ) : availableUpgrades.length === 0 ? (
              <View style={[styles.maxAccessCard, { backgroundColor: C.card, borderColor: C.border }]}>
                <Feather name="info" size={40} color={C.textSecondary} />
                <Text style={[styles.maxAccessTitle, { color: C.text }]}>{t("zones.noUpgradesAvailable")}</Text>
              </View>
            ) : (
              <View style={[styles.section, { backgroundColor: C.card, borderColor: C.border }]}>
                <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>{t("zones.selectUpgradeZone")}</Text>
                <View style={styles.upgradeList}>
                  {availableUpgrades.map((opt) => {
                    const isSelected = selectedOption?.id === opt.id;
                    const isMultiStep = opt.zonesGranted.length > 1;
                    return (
                      <Pressable
                        key={opt.id}
                        onPress={() => setSelectedOption(opt)}
                        style={[
                          styles.upgradeRow,
                          {
                            backgroundColor: isSelected ? opt.colorHex + "22" : C.inputBg,
                            borderColor: isSelected ? opt.colorHex : C.border,
                          },
                        ]}
                      >
                        <View style={[styles.zoneDotLg, { backgroundColor: opt.colorHex }]} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.upgradeZoneName, { color: C.text }]}>{opt.name}</Text>
                          {opt.description ? (
                            <Text style={[styles.upgradeZoneDesc, { color: C.textSecondary }]}>{opt.description}</Text>
                          ) : null}
                          {/* Show "includes X zones" hint when jumping multiple levels */}
                          {isMultiStep && (
                            <Text style={[styles.multiStepHint, { color: C.textMuted }]}>
                              {t("zones.includesZones", {
                                zones: opt.zonesGranted.map((z) => z.name).join(", "),
                              })}
                            </Text>
                          )}
                        </View>
                        {/* Show TOTAL cumulative price, not just this zone's price */}
                        {opt.totalUpgradePrice > 0 ? (
                          <CopAmount amount={opt.totalUpgradePrice} size={16} />
                        ) : (
                          <View style={[styles.freeBadge, { backgroundColor: C.successLight, borderColor: C.success }]}>
                            <Text style={[styles.freeBadgeText, { color: C.success }]}>{t("zones.free")}</Text>
                          </View>
                        )}
                        {isSelected && (
                          <Feather name="check-circle" size={20} color={opt.colorHex} />
                        )}
                      </Pressable>
                    );
                  })}
                </View>

                <Button
                  title={t("zones.upgradeAccess")}
                  onPress={handleConfirm}
                  variant="primary"
                  fullWidth
                  disabled={!selectedOption}
                  icon="arrow-up-circle"
                />
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  uidBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  uidText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  section: { borderRadius: 20, borderWidth: 1, padding: 20, gap: 14 },
  sectionLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  zoneBadges: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  zonePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
    borderWidth: 2,
  },
  zoneDot: { width: 8, height: 8, borderRadius: 4 },
  zoneDotLg: { width: 14, height: 14, borderRadius: 7 },
  zonePillText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  successCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 28,
    alignItems: "center",
    gap: 16,
  },
  successTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  errorCard: { borderRadius: 20, borderWidth: 1, padding: 28, alignItems: "center", gap: 12 },
  errorTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  errorMsg: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  confirmCard: { borderRadius: 20, borderWidth: 1, padding: 24, gap: 16, alignItems: "center" },
  confirmTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  breakdownBox: {
    width: "100%",
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  breakdownHeader: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  breakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  breakdownZoneName: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 12,
    borderTopWidth: 1,
    marginTop: 4,
  },
  totalLabel: { fontSize: 15, fontFamily: "Inter_700Bold" },
  confirmActions: { flexDirection: "row", gap: 12, width: "100%" },
  writingCard: { borderRadius: 20, borderWidth: 1, padding: 28, alignItems: "center", gap: 16 },
  nfcIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  writingTitle: { fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  writingSub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 12, justifyContent: "center", paddingVertical: 20 },
  loadingText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  maxAccessCard: { borderRadius: 20, borderWidth: 1, padding: 32, alignItems: "center", gap: 12 },
  maxAccessTitle: { fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  maxAccessSub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  upgradeList: { gap: 10 },
  upgradeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 14,
    borderWidth: 2,
  },
  upgradeZoneName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  upgradeZoneDesc: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  multiStepHint: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 3 },
  freeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  freeBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
});
