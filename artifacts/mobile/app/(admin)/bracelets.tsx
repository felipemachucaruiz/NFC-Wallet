import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import React, { useState, useCallback, useRef } from "react";
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  useGetBracelet,
  useUnflagBracelet,
  useDeleteAdminBracelet,
  useGetSigningKey,
  customFetch,
} from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { useAlert } from "@/components/CustomAlert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CopAmount } from "@/components/CopAmount";
import { isNfcSupported, scanBracelet, scanAndWriteBracelet } from "@/utils/nfc";
import { computeHmac } from "@/utils/hmac";
import { useOfflineQueue } from "@/contexts/OfflineQueueContext";
import { OfflineBanner } from "@/components/OfflineBanner";

type BraceletListItem = {
  id: string;
  nfcUid: string;
  eventId?: string | null;
  attendeeName?: string | null;
  phone?: string | null;
  email?: string | null;
  lastKnownBalanceCop: number;
  lastCounter: number;
  flagged: boolean;
  flagReason?: string | null;
  createdAt: string;
};

type ListResponse = {
  bracelets: BraceletListItem[];
  total: number;
  page: number;
  pages: number;
};

type FilterStatus = "all" | "active" | "flagged";

const PAGE_LIMIT = 50;

export default function BraceletsAdminScreen() {
  const { t } = useTranslation();
  const { show: showAlert } = useAlert();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const scrollRef = useRef<ScrollView>(null);

  // ─── Lookup section ────────────────────────────────────────────────────────
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

  // ─── List section ──────────────────────────────────────────────────────────
  const [listSearch, setListSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [listPage, setListPage] = useState(1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleListSearchChange = (text: string) => {
    setListSearch(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(text);
      setListPage(1);
    }, 400);
  };

  const flaggedParam =
    filterStatus === "flagged" ? "true" : filterStatus === "active" ? "false" : undefined;

  const listQueryKey = ["admin-bracelets", debouncedSearch, flaggedParam, listPage];

  const {
    data: listData,
    isLoading: listLoading,
    isFetching: listFetching,
    refetch: refetchList,
  } = useQuery<ListResponse>({
    queryKey: listQueryKey,
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(listPage),
        limit: String(PAGE_LIMIT),
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (flaggedParam) params.set("flagged", flaggedParam);
      return customFetch<ListResponse>(`/api/admin/bracelets?${params.toString()}`);
    },
    staleTime: 30_000,
  });

  const handleRefreshList = useCallback(() => {
    setListPage(1);
    refetchList();
  }, [refetchList]);

  // ─── Lookup handlers ───────────────────────────────────────────────────────
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
      showAlert(t("common.error"), t("pos.scanError"));
    } finally {
      setScanning(false);
    }
  };

  const handleLookup = () => {
    const trimmed = uid.trim();
    if (!trimmed) {
      showAlert(t("common.error"), t("admin.noUidEntered"));
      return;
    }
    setSearchUid(trimmed);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const handleUnflag = () => {
    showAlert(
      t("admin.unflagBracelet"),
      t("admin.unflagConfirm"),
      [
        { text: t("common.cancel"), variant: "cancel" },
        {
          text: t("admin.unflagBracelet"),
          variant: "primary",
          onPress: async () => {
            try {
              await unflag.mutateAsync({ nfcUid: searchUid });
              showAlert(t("common.success"), t("admin.unflagSuccess"));
              refetch();
              refetchList();
            } catch {
              showAlert(t("common.error"), t("common.unexpectedError"));
            }
          },
        },
      ],
    );
  };

  const handleResetBalance = () => {
    showAlert(
      t("admin.resetBalance"),
      t("admin.resetBalanceConfirm"),
      [
        { text: t("common.cancel"), variant: "cancel" },
        {
          text: t("admin.resetBalance"),
          variant: "danger",
          onPress: async () => {
            if (!isNfcSupported()) {
              showAlert(t("common.error"), t("checkBalance.nfcNotSupported"));
              return;
            }
            if (!hmacSecret) {
              showAlert(t("common.error"), t("common.unknownError"));
              return;
            }
            setResetting(true);
            try {
              await scanAndWriteBracelet(async (payload, tagInfo) => {
                if (payload.uid !== searchUid) {
                  showAlert(t("common.error"), t("checkBalance.wrongBracelet"));
                  return null;
                }
                const newCounter = tagInfo?.type === "MIFARE_CLASSIC"
                  ? (payload.counter ?? 0)
                  : (payload.counter ?? 0) + 1;
                const newHmac = await computeHmac(0, newCounter, hmacSecret);
                return { uid: payload.uid, balance: 0, counter: newCounter, hmac: newHmac };
              });

              await customFetch(`/api/admin/bracelets/${searchUid}/reset-balance`, { method: "POST" });

              showAlert(t("common.success"), t("admin.resetBalanceSuccess"));
              refetch();
              refetchList();
            } catch (e: unknown) {
              const msg = (e instanceof Error ? e.message : String(e)) ?? "";
              if (!msg.includes("cancelled") && !msg.includes("UserCancel")) {
                showAlert(t("common.error"), t("admin.resetBalanceError"));
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
    showAlert(
      t("admin.deleteRecord"),
      t("admin.deleteRecordConfirm"),
      [
        { text: t("common.cancel"), variant: "cancel" },
        {
          text: t("admin.deleteRecord"),
          variant: "danger",
          onPress: async () => {
            try {
              await deleteBracelet.mutateAsync({ nfcUid: searchUid });
              showAlert(t("common.success"), t("admin.deleteRecordSuccess"));
              setUid("");
              setSearchUid("");
              refetchList();
            } catch {
              showAlert(t("common.error"), t("common.unexpectedError"));
            }
          },
        },
      ],
    );
  };

  const handleSelectBracelet = (nfcUid: string) => {
    setUid(nfcUid);
    setSearchUid(nfcUid);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const isFlagged = (bracelet as { flagged?: boolean } | undefined)?.flagged ?? false;
  const flagReason = (bracelet as { flagReason?: string | null } | undefined)?.flagReason;

  const bracelets = listData?.bracelets ?? [];
  const total = listData?.total ?? 0;
  const hasMore = listData ? listPage < listData.pages : false;

  return (
    <>
      <OfflineBanner syncIssuesRoute={""} />
      <ScrollView
        ref={scrollRef}
        style={[styles.container, { backgroundColor: C.background }]}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: isWeb ? 24 : insets.top + 16,
            paddingBottom: insets.bottom + 40,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={listFetching && !listLoading}
            onRefresh={handleRefreshList}
            tintColor={C.primary}
          />
        }
      >
        {/* ── Lookup Section ── */}
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

        {/* ── List Section ── */}
        <View style={[styles.sectionHeader, { borderTopColor: C.border }]}>
          <Text style={[styles.sectionTitle, { color: C.text }]}>{t("admin.braceletsList")}</Text>
          {total > 0 && (
            <Text style={[styles.totalLabel, { color: C.textSecondary }]}>
              {t("admin.braceletsTotal", { count: total })}
            </Text>
          )}
        </View>

        {/* Search */}
        <View style={[styles.searchBox, { backgroundColor: C.card, borderColor: C.border }]}>
          <Feather name="search" size={16} color={C.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: C.text }]}
            placeholder={t("admin.searchBracelets")}
            placeholderTextColor={C.textSecondary}
            value={listSearch}
            onChangeText={handleListSearchChange}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {listSearch.length > 0 && (
            <Pressable onPress={() => { setListSearch(""); setDebouncedSearch(""); setListPage(1); }}>
              <Feather name="x" size={16} color={C.textSecondary} />
            </Pressable>
          )}
        </View>

        {/* Filter chips */}
        <View style={styles.filterRow}>
          {(["all", "active", "flagged"] as FilterStatus[]).map((f) => (
            <Pressable
              key={f}
              onPress={() => { setFilterStatus(f); setListPage(1); }}
              style={[
                styles.filterChip,
                {
                  backgroundColor: filterStatus === f ? C.primary : C.inputBg,
                  borderColor: filterStatus === f ? C.primary : C.border,
                },
              ]}
            >
              <Text style={[styles.filterChipText, { color: filterStatus === f ? "#0a0a0a" : C.textSecondary }]}>
                {f === "all" ? t("admin.filterAll") : f === "active" ? t("admin.filterActive") : t("admin.filterFlagged")}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* List items */}
        {listLoading ? (
          <View style={styles.centerBox}>
            <Text style={[styles.hint, { color: C.textSecondary }]}>{t("common.loading")}</Text>
          </View>
        ) : bracelets.length === 0 ? (
          <View style={[styles.emptyBox, { borderColor: C.border, backgroundColor: C.card }]}>
            <Feather name="credit-card" size={28} color={C.textMuted} />
            <Text style={[styles.emptyText, { color: C.textMuted }]}>
              {debouncedSearch ? t("admin.braceletNotFound") : t("admin.noBracelets", { defaultValue: "No hay pulseras registradas" })}
            </Text>
          </View>
        ) : (
          <View style={styles.listContainer}>
            {bracelets.map((b) => (
              <Pressable
                key={b.id}
                onPress={() => handleSelectBracelet(b.nfcUid)}
                style={({ pressed }) => [
                  styles.braceletRow,
                  { backgroundColor: C.card, borderColor: C.border, opacity: pressed ? 0.75 : 1 },
                  searchUid === b.nfcUid && { borderColor: C.primary },
                ]}
              >
                <View style={styles.braceletLeft}>
                  <View style={styles.braceletUidRow}>
                    <Text style={[styles.braceletUid, { color: C.text }]} numberOfLines={1}>
                      {b.nfcUid}
                    </Text>
                    {b.flagged && (
                      <View style={[styles.flagDot, { backgroundColor: C.danger }]} />
                    )}
                  </View>
                  <Text style={[styles.braceletName, { color: C.textSecondary }]} numberOfLines={1}>
                    {b.attendeeName ?? "—"}
                    {b.eventId ? ` · ${b.eventId.slice(0, 8)}` : ""}
                  </Text>
                </View>
                <View style={styles.braceletRight}>
                  <CopAmount amount={b.lastKnownBalanceCop} size={14} style={{ color: C.text, fontFamily: "Inter_600SemiBold" }} />
                  <View style={[styles.statusDot, { backgroundColor: b.flagged ? C.danger : C.success }]} />
                </View>
              </Pressable>
            ))}

            {hasMore && (
              <Pressable
                onPress={() => setListPage((p) => p + 1)}
                disabled={listFetching}
                style={[styles.loadMoreBtn, { borderColor: C.border, backgroundColor: C.card }]}
              >
                <Text style={[styles.loadMoreText, { color: listFetching ? C.textMuted : C.primary }]}>
                  {listFetching ? t("common.loading") : t("admin.loadMore")}
                </Text>
              </Pressable>
            )}
          </View>
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
  // List section
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    paddingTop: 20,
    marginTop: 4,
  },
  sectionTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  totalLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  filterRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 100,
    borderWidth: 1,
  },
  filterChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  centerBox: { alignItems: "center", paddingVertical: 24 },
  emptyBox: {
    alignItems: "center",
    gap: 10,
    padding: 32,
    borderRadius: 14,
    borderWidth: 1,
  },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  listContainer: { gap: 8 },
  braceletRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  braceletLeft: { flex: 1, gap: 3 },
  braceletUidRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  braceletUid: { fontSize: 14, fontFamily: "Inter_700Bold", flex: 1 },
  flagDot: { width: 8, height: 8, borderRadius: 4 },
  braceletName: { fontSize: 12, fontFamily: "Inter_400Regular" },
  braceletRight: { alignItems: "flex-end", gap: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  loadMoreBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },
  loadMoreText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
