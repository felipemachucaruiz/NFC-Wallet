import { Feather } from "@expo/vector-icons";
import React, { useState, useCallback, useEffect } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useListEvents } from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { Empty } from "@/components/ui/Empty";
import { Input } from "@/components/ui/Input";
import { Loading } from "@/components/ui/Loading";
import { formatDate } from "@/utils/format";
import { useAuth } from "@/contexts/AuthContext";

const STATUS_BADGE: Record<string, "success" | "warning" | "muted" | "info" | "danger"> = {
  active: "success",
  upcoming: "info",
  completed: "muted",
  cancelled: "danger",
};

function getEventStatus(event: { active?: boolean; startsAt: string; endsAt: string }): string {
  if (!event.active) return "cancelled";
  const now = Date.now();
  const start = new Date(event.startsAt).getTime();
  const end = new Date(event.endsAt).getTime();
  if (now < start) return "upcoming";
  if (now > end) return "completed";
  return "active";
}

const getApiBase = (): string => `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

type OrganizerMode = "none" | "existing" | "new";

type Client = {
  id: string;
  email: string | null;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  eventId: string | null;
};

export default function EventsScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { token } = useAuth();

  const [showCreate, setShowCreate] = useState(false);
  const [eventName, setEventName] = useState("");
  const [venue, setVenue] = useState("");
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [platformCommission, setPlatformCommission] = useState("0");
  const [isCreating, setIsCreating] = useState(false);

  // Organizer section
  const [organizerMode, setOrganizerMode] = useState<OrganizerMode>("none");
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [clientSearch, setClientSearch] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminFirstName, setAdminFirstName] = useState("");

  // Clients list (event_admin users)
  const [clients, setClients] = useState<Client[]>([]);

  const { data, isLoading, refetch } = useListEvents();
  const events = (data as {
    events?: Array<{
      id: string;
      name: string;
      venueAddress: string | null;
      active?: boolean;
      startsAt: string;
      endsAt: string;
      platformCommissionRate?: string | number;
    }>
  } | undefined)?.events ?? [];

  const fetchClients = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${getApiBase()}/api/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json() as { users: Client[] };
      setClients((data.users ?? []).filter((u: Client & { role: string }) => (u as Client & { role: string }).role === "event_admin"));
    } catch {
      setClients([]);
    }
  }, [token]);

  useEffect(() => { if (showCreate) fetchClients(); }, [showCreate, fetchClients]);

  const filteredClients = clients.filter((c) => {
    if (!clientSearch.trim()) return true;
    const q = clientSearch.toLowerCase();
    return (
      c.firstName?.toLowerCase().includes(q) ||
      c.lastName?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.username?.toLowerCase().includes(q)
    );
  });

  const resetForm = () => {
    setEventName(""); setVenue(""); setStartDate(null); setEndDate(null);
    setPlatformCommission("0"); setAdminEmail(""); setAdminPassword(""); setAdminFirstName("");
    setOrganizerMode("none"); setSelectedClientId(""); setClientSearch("");
  };

  const handleCreate = async () => {
    if (!eventName.trim() || !startDate || !endDate) {
      Alert.alert(t("common.error"), t("admin.eventFieldsRequired")); return;
    }
    if (organizerMode === "new" && adminEmail && !adminPassword) {
      Alert.alert(t("common.error"), t("auth.passwordPlaceholder")); return;
    }
    if (organizerMode === "existing" && !selectedClientId) {
      Alert.alert(t("common.error"), t("admin.selectClientRequired")); return;
    }

    setIsCreating(true);
    try {
      const body: Record<string, unknown> = {
        name: eventName.trim(),
        venueAddress: venue.trim() || undefined,
        startsAt: startDate.toISOString(),
        endsAt: endDate.toISOString(),
        platformCommissionRate: platformCommission.trim() || "0",
      };

      if (organizerMode === "new" && adminEmail.trim()) {
        body.eventAdmin = {
          email: adminEmail.trim(),
          password: adminPassword,
          firstName: adminFirstName.trim() || undefined,
        };
      }

      const res = await fetch(`${getApiBase()}/api/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        Alert.alert(t("common.error"), err.error ?? t("common.unknownError"));
        setIsCreating(false);
        return;
      }

      const created = await res.json() as { id: string };
      const newEventId = created?.id;

      // If assigning existing client, patch their eventId
      if (organizerMode === "existing" && selectedClientId && newEventId) {
        await fetch(`${getApiBase()}/api/users/${selectedClientId}/event`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ eventId: newEventId }),
        });
      }

      setShowCreate(false);
      resetForm();
      refetch();
    } catch {
      Alert.alert(t("common.error"), t("common.unknownError"));
    }
    setIsCreating(false);
  };

  if (isLoading) return <Loading label={t("common.loading")} />;

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingTop: isWeb ? 67 : insets.top + 16,
          paddingBottom: isWeb ? 34 : insets.bottom + 100,
          paddingHorizontal: 20,
          gap: 12,
        }}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={C.primary} />}
        ListHeaderComponent={() => (
          <View style={styles.header}>
            <Text style={[styles.title, { color: C.text }]}>{t("admin.events")}</Text>
            <Button title={`+ ${t("admin.createEvent")}`} onPress={() => setShowCreate(true)} variant="primary" size="sm" />
          </View>
        )}
        ListEmptyComponent={() => (
          <Empty icon="calendar" title={t("admin.noEvents")} actionLabel={t("admin.createEvent")} onAction={() => setShowCreate(true)} />
        )}
        scrollEnabled={!!events.length}
        renderItem={({ item }) => (
          <Card>
            <View style={styles.eventRow}>
              <View style={[styles.eventIcon, { backgroundColor: C.primaryLight }]}>
                <Feather name="calendar" size={20} color={C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.eventName, { color: C.text }]}>{item.name}</Text>
                {item.venueAddress ? <Text style={[styles.venue, { color: C.textSecondary }]}>{item.venueAddress}</Text> : null}
                <Text style={[styles.dates, { color: C.textMuted }]}>{formatDate(item.startsAt)} → {formatDate(item.endsAt)}</Text>
                {item.platformCommissionRate && parseFloat(String(item.platformCommissionRate)) > 0 ? (
                  <Text style={[styles.commission, { color: C.warning }]}>
                    {t("eventAdmin.platformCommission").replace(" (%)", "")}: {item.platformCommissionRate}%
                  </Text>
                ) : null}
              </View>
              <Badge label={t(`admin.eventStatus.${getEventStatus(item)}`)} variant={STATUS_BADGE[getEventStatus(item)] ?? "muted"} size="sm" />
            </View>
          </Card>
        )}
      />

      <Modal visible={showCreate} transparent animationType="slide">
        <View style={[styles.overlay, { backgroundColor: C.overlay }]}>
          <ScrollView
            style={[styles.sheet, { backgroundColor: C.card }]}
            contentContainerStyle={{ gap: 16, padding: 24, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: C.text }]}>{t("admin.createEvent")}</Text>
              <Pressable onPress={() => { setShowCreate(false); resetForm(); }}>
                <Feather name="x" size={22} color={C.textSecondary} />
              </Pressable>
            </View>

            <Input label={t("admin.eventName")} value={eventName} onChangeText={setEventName} placeholder={t("admin.eventNamePlaceholder")} />
            <Input label={t("admin.venue")} value={venue} onChangeText={setVenue} placeholder={t("admin.venuePlaceholder")} />
            <DatePickerInput
              label={t("admin.startDate")}
              value={startDate}
              onChange={setStartDate}
              placeholder={t("admin.startDatePlaceholder")}
            />
            <DatePickerInput
              label={t("admin.endDate")}
              value={endDate}
              onChange={(d) => {
                if (startDate && d < startDate) {
                  Alert.alert(t("common.error"), t("admin.endDateAfterStart")); return;
                }
                setEndDate(d);
              }}
              minimumDate={startDate ?? undefined}
              placeholder={t("admin.endDatePlaceholder")}
            />
            <Input
              label={t("eventAdmin.platformCommission")}
              value={platformCommission}
              onChangeText={setPlatformCommission}
              keyboardType="decimal-pad"
              placeholder={t("eventAdmin.platformCommissionPlaceholder")}
            />

            {/* Organizer section */}
            <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>{t("admin.organizerSection")}</Text>

            <View style={[styles.modeRow, { backgroundColor: C.inputBg, borderRadius: 12 }]}>
              {(["none", "existing", "new"] as OrganizerMode[]).map((mode) => (
                <Pressable
                  key={mode}
                  onPress={() => { setOrganizerMode(mode); setSelectedClientId(""); setClientSearch(""); }}
                  style={[
                    styles.modeBtn,
                    organizerMode === mode && { backgroundColor: C.card, borderRadius: 9 },
                  ]}
                >
                  <Text style={[styles.modeBtnText, { color: organizerMode === mode ? C.primary : C.textMuted }]}>
                    {t(`admin.organizerMode.${mode}`)}
                  </Text>
                </Pressable>
              ))}
            </View>

            {organizerMode === "existing" && (
              <View style={{ gap: 10 }}>
                {clients.length === 0 ? (
                  <Text style={[styles.hintText, { color: C.textMuted }]}>{t("admin.noClientsToAssign")}</Text>
                ) : (
                  <>
                    <View style={[styles.searchBox, { backgroundColor: C.inputBg, borderColor: C.border }]}>
                      <Feather name="search" size={16} color={C.textMuted} />
                      <TextInput
                        value={clientSearch}
                        onChangeText={setClientSearch}
                        placeholder={t("admin.searchClients")}
                        placeholderTextColor={C.textMuted}
                        style={[styles.searchInput, { color: C.text }]}
                      />
                    </View>
                    {filteredClients.map((c) => {
                      const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || c.username || c.email || c.id;
                      const sub = c.email ?? c.username ?? "";
                      const isSelected = selectedClientId === c.id;
                      return (
                        <Pressable
                          key={c.id}
                          onPress={() => setSelectedClientId(c.id)}
                          style={[
                            styles.clientOption,
                            {
                              backgroundColor: isSelected ? C.primary + "18" : C.inputBg,
                              borderColor: isSelected ? C.primary : C.border,
                            },
                          ]}
                        >
                          <View style={[styles.clientAvatar, { backgroundColor: isSelected ? C.primary : C.border }]}>
                            <Feather name="user" size={14} color={isSelected ? "#fff" : C.textSecondary} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.clientOptionName, { color: isSelected ? C.primary : C.text }]}>{name}</Text>
                            {sub ? <Text style={[styles.clientOptionSub, { color: C.textMuted }]}>{sub}</Text> : null}
                            {c.eventId ? (
                              <Text style={[styles.clientOptionSub, { color: C.warning }]}>
                                {t("admin.alreadyAssigned")}
                              </Text>
                            ) : null}
                          </View>
                          {isSelected && <Feather name="check-circle" size={18} color={C.primary} />}
                        </Pressable>
                      );
                    })}
                  </>
                )}
              </View>
            )}

            {organizerMode === "new" && (
              <View style={{ gap: 12 }}>
                <Text style={[styles.hintText, { color: C.textMuted }]}>{t("eventAdmin.eventAdminOptional")}</Text>
                <Input
                  label={t("eventAdmin.eventAdminEmail")}
                  value={adminEmail}
                  onChangeText={setAdminEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholder="admin@example.com"
                />
                {adminEmail.trim() ? (
                  <>
                    <Input
                      label={t("eventAdmin.eventAdminPassword")}
                      value={adminPassword}
                      onChangeText={setAdminPassword}
                      secureTextEntry
                      placeholder={t("auth.passwordPlaceholder")}
                    />
                    <Input
                      label={t("eventAdmin.firstName")}
                      value={adminFirstName}
                      onChangeText={setAdminFirstName}
                      placeholder={t("eventAdmin.firstNamePlaceholder")}
                    />
                  </>
                ) : null}
              </View>
            )}

            <View style={styles.sheetActions}>
              <Button title={t("common.cancel")} onPress={() => { setShowCreate(false); resetForm(); }} variant="secondary" />
              <Button title={t("admin.createEvent")} onPress={handleCreate} variant="primary" loading={isCreating} />
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  eventRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  eventIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  eventName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  venue: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  dates: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4 },
  commission: { fontSize: 11, fontFamily: "Inter_500Medium", marginTop: 2 },
  overlay: { flex: 1, justifyContent: "flex-end" },
  sheet: { maxHeight: "92%", borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sheetTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  sectionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8 },
  sheetActions: { flexDirection: "row", gap: 12, marginTop: 4 },
  modeRow: { flexDirection: "row", padding: 4, gap: 2 },
  modeBtn: { flex: 1, alignItems: "center", paddingVertical: 9, paddingHorizontal: 4 },
  modeBtnText: { fontSize: 12, fontFamily: "Inter_500Medium", textAlign: "center" },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", padding: 0 },
  clientOption: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 12, borderWidth: 1 },
  clientAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  clientOptionName: { fontSize: 14, fontFamily: "Inter_500Medium" },
  clientOptionSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  hintText: { fontSize: 12, fontFamily: "Inter_400Regular" },
});
