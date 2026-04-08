import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import { FlatList, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { useListEventBracelets } from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { CopAmount } from "@/components/CopAmount";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { useAuth } from "@/contexts/AuthContext";

type EventBracelet = {
  id: string;
  nfcUid: string;
  eventId?: string | null;
  attendeeName?: string | null;
  phone?: string | null;
  email?: string | null;
  lastKnownBalance?: number | null;
  lastCounter?: number | null;
  flagged: boolean;
  flagReason?: string | null;
  maxOfflineSpend?: number | null;
  createdAt: string;
  updatedAt: string;
};

export default function WristbandsScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  const eventId = user?.eventId ?? "";

  const { data, isLoading, isFetching } = useListEventBracelets(
    eventId,
    { page, limit: 50, search: debouncedSearch || undefined },
    { query: { enabled: !!eventId } }
  );

  const bracelets = (data?.bracelets ?? []) as EventBracelet[];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 50));

  const handleSearchChange = (text: string) => {
    setSearch(text);
    setPage(1);
    const trimmed = text.trim();
    setDebouncedSearch(trimmed);
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
  };

  const renderBracelet = ({ item }: { item: EventBracelet }) => (
    <Card style={styles.card} padding={14}>
      <View style={styles.cardRow}>
        <View style={styles.cardLeft}>
          <View style={styles.uidRow}>
            <Feather name="credit-card" size={13} color={C.textMuted} />
            <Text style={[styles.uid, { color: C.text }]} numberOfLines={1}>
              {item.nfcUid}
            </Text>
            {item.flagged && (
              <Badge label={t("wristbands.flagged")} variant="danger" />
            )}
          </View>
          {item.attendeeName ? (
            <Text style={[styles.attendee, { color: C.textSecondary }]}>
              {item.attendeeName}
            </Text>
          ) : (
            <Text style={[styles.attendee, { color: C.textMuted }]}>
              {t("wristbands.unregistered")}
            </Text>
          )}
          <Text style={[styles.date, { color: C.textMuted }]}>
            {t("wristbands.registered")}: {formatDate(item.createdAt)}
          </Text>
        </View>
        <View style={styles.cardRight}>
          {item.lastKnownBalance !== null && item.lastKnownBalance !== undefined ? (
            <CopAmount amount={item.lastKnownBalance} size={16} />
          ) : (
            <Text style={[styles.noTx, { color: C.textMuted }]}>{t("wristbands.noBalance")}</Text>
          )}
        </View>
      </View>
      {item.flagReason ? (
        <View style={[styles.flagRow, { borderTopColor: C.separator }]}>
          <Feather name="alert-triangle" size={12} color={C.error} />
          <Text style={[styles.flagReason, { color: C.error }]} numberOfLines={2}>
            {item.flagReason}
          </Text>
        </View>
      ) : null}
    </Card>
  );

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: isWeb ? 67 : insets.top + 16,
            paddingHorizontal: 20,
            backgroundColor: C.background,
          },
        ]}
      >
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: C.text }]}>{t("wristbands.title")}</Text>
            <Text style={[styles.subtitle, { color: C.textMuted }]}>
              {total > 0 ? `${total} ${t("wristbands.total")}` : ""}
            </Text>
          </View>
          <Button
            title={t("checkBalance.title")}
            onPress={() => router.push("/check-balance")}
            variant="secondary"
            size="sm"
            icon="credit-card"
          />
        </View>

        <View style={[styles.searchRow, { backgroundColor: C.inputBg, borderColor: C.border }]}>
          <Feather name="search" size={16} color={C.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: C.text }]}
            placeholder={t("wristbands.searchPlaceholder")}
            placeholderTextColor={C.textMuted}
            value={search}
            onChangeText={handleSearchChange}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {search.length > 0 && (
            <Pressable onPress={() => handleSearchChange("")}>
              <Feather name="x" size={16} color={C.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <Loading label={t("common.loading")} />
        </View>
      ) : !eventId ? (
        <View style={styles.emptyContainer}>
          <Feather name="alert-circle" size={40} color={C.textMuted} />
          <Text style={[styles.emptyText, { color: C.textMuted }]}>{t("common.empty")}</Text>
        </View>
      ) : bracelets.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Feather name="credit-card" size={40} color={C.textMuted} />
          <Text style={[styles.emptyText, { color: C.textMuted }]}>{t("wristbands.empty")}</Text>
        </View>
      ) : (
        <FlatList
          data={bracelets}
          keyExtractor={(item) => item.id}
          renderItem={renderBracelet}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: isWeb ? 34 : insets.bottom + 100 },
          ]}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListFooterComponent={
            totalPages > 1 ? (
              <View style={styles.pagination}>
                <Pressable
                  disabled={page <= 1}
                  onPress={() => setPage((p) => p - 1)}
                  style={[styles.pageBtn, { opacity: page <= 1 ? 0.4 : 1, backgroundColor: C.inputBg }]}
                >
                  <Feather name="chevron-left" size={18} color={C.text} />
                </Pressable>
                <Text style={[styles.pageLabel, { color: C.textSecondary }]}>
                  {page} / {totalPages}
                </Text>
                <Pressable
                  disabled={page >= totalPages}
                  onPress={() => setPage((p) => p + 1)}
                  style={[styles.pageBtn, { opacity: page >= totalPages ? 0.4 : 1, backgroundColor: C.inputBg }]}
                >
                  <Feather name="chevron-right" size={18} color={C.text} />
                </Pressable>
              </View>
            ) : null
          }
        />
      )}

      {isFetching && !isLoading && (
        <View style={styles.fetchingIndicator}>
          <Text style={[styles.fetchingText, { color: C.textMuted }]}>{t("common.loading")}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingBottom: 12, gap: 4 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 4 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    padding: 0,
  },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center" },
  list: { paddingHorizontal: 20, paddingTop: 12 },
  card: { },
  cardRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  cardLeft: { flex: 1, gap: 3 },
  cardRight: { alignItems: "flex-end", gap: 4 },
  uidRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  uid: { fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 1 },
  attendee: { fontSize: 13, fontFamily: "Inter_400Regular" },
  date: { fontSize: 11, fontFamily: "Inter_400Regular" },
  noTx: { fontSize: 11, fontFamily: "Inter_400Regular" },
  flagRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, borderTopWidth: 1, paddingTop: 8, marginTop: 6 },
  flagReason: { fontSize: 11, fontFamily: "Inter_400Regular", flex: 1 },
  pagination: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16, paddingVertical: 16 },
  pageBtn: { padding: 8, borderRadius: 8 },
  pageLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  fetchingIndicator: { position: "absolute", bottom: 16, alignSelf: "center", paddingHorizontal: 12, paddingVertical: 4 },
  fetchingText: { fontSize: 12, fontFamily: "Inter_400Regular" },
});
