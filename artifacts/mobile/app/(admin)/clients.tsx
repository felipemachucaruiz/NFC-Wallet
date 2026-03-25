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
import { Empty } from "@/components/ui/Empty";
import { Input } from "@/components/ui/Input";
import { Loading } from "@/components/ui/Loading";
import { useAuth } from "@/contexts/AuthContext";

const getApiBase = () => `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

type Client = {
  id: string;
  email: string | null;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string;
  eventId: string | null;
};

type EventItem = { id: string; name: string; status: string };

export default function ClientsScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { token } = useAuth();

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  // Edit state
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [editEventId, setEditEventId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    username: "",
    password: "",
    eventId: "",
  });

  const { data: eventsData, refetch: refetchEvents } = useListEvents();
  const events: EventItem[] = (eventsData as { events?: EventItem[] } | undefined)?.events ?? [];

  const eventName = (id: string | null) =>
    id ? (events.find((e) => e.id === id)?.name ?? id) : t("admin.noEventAssigned");

  const fetchClients = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${getApiBase()}/api/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json() as { users: Client[] };
      setClients((data.users ?? []).filter((u) => u.role === "event_admin"));
    } catch {
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  const resetForm = () => setForm({ firstName: "", lastName: "", email: "", username: "", password: "", eventId: "" });

  const handleCreate = async () => {
    if (!form.firstName.trim()) {
      Alert.alert(t("common.error"), t("admin.clientNameRequired")); return;
    }
    if (!form.email.trim() && !form.username.trim()) {
      Alert.alert(t("common.error"), t("admin.emailOrUsernameRequired")); return;
    }
    if (form.password.length < 6) {
      Alert.alert(t("common.error"), t("admin.passwordMinLength")); return;
    }
    setCreating(true);
    try {
      const body: Record<string, string> = {
        firstName: form.firstName.trim(),
        password: form.password,
        role: "event_admin",
      };
      if (form.lastName.trim()) body.lastName = form.lastName.trim();
      if (form.email.trim()) body.email = form.email.trim().toLowerCase();
      if (form.username.trim()) body.username = form.username.trim();
      if (form.eventId.trim()) body.eventId = form.eventId.trim();

      const res = await fetch(`${getApiBase()}/api/auth/create-account`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        Alert.alert(t("common.error"), data.error ?? t("common.unknownError")); return;
      }
      setShowCreate(false);
      resetForm();
      fetchClients();
    } catch {
      Alert.alert(t("common.error"), t("common.unknownError"));
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (client: Client) => {
    setEditClient(client);
    setEditEventId(client.eventId ?? "");
  };

  const handleSaveEdit = async () => {
    if (!editClient) return;
    setSaving(true);
    try {
      const res = await fetch(`${getApiBase()}/api/users/${editClient.id}/event`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ eventId: editEventId || null }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        Alert.alert(t("common.error"), data.error ?? t("common.unknownError")); return;
      }
      setEditClient(null);
      fetchClients();
      refetchEvents();
    } catch {
      Alert.alert(t("common.error"), t("common.unknownError"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading label={t("common.loading")} />;

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <FlatList
        data={clients}
        keyExtractor={(item) => item.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingTop: isWeb ? 67 : insets.top + 16,
          paddingBottom: isWeb ? 34 : insets.bottom + 100,
          paddingHorizontal: 20,
          gap: 12,
        }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchClients} tintColor={C.primary} />}
        ListHeaderComponent={() => (
          <View style={styles.header}>
            <View>
              <Text style={[styles.title, { color: C.text }]}>{t("admin.clients")}</Text>
              <Text style={[styles.subtitle, { color: C.textSecondary }]}>
                {t("admin.clientsSubtitle", { count: clients.length })}
              </Text>
            </View>
            <Button
              title={`+ ${t("admin.createClient")}`}
              onPress={() => setShowCreate(true)}
              variant="primary"
              size="sm"
            />
          </View>
        )}
        ListEmptyComponent={() => (
          <Empty
            icon="users"
            title={t("admin.noClients")}
            actionLabel={t("admin.createClient")}
            onAction={() => setShowCreate(true)}
          />
        )}
        renderItem={({ item }) => {
          const displayName = [item.firstName, item.lastName].filter(Boolean).join(" ") || item.username || item.email || item.id;
          const identifier = item.email ?? item.username ?? "—";
          const ev = item.eventId ? events.find((e) => e.id === item.eventId) : null;
          return (
            <Pressable onPress={() => openEdit(item)}>
              <Card>
                <View style={styles.clientRow}>
                  <View style={[styles.avatar, { backgroundColor: C.primaryLight }]}>
                    <Feather name="user" size={20} color={C.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.clientName, { color: C.text }]}>{displayName}</Text>
                    <Text style={[styles.clientId, { color: C.textMuted }]}>{identifier}</Text>
                    <View style={styles.eventTag}>
                      <Feather name="calendar" size={12} color={C.textSecondary} />
                      <Text style={[styles.eventTagText, { color: C.textSecondary }]}>
                        {eventName(item.eventId)}
                      </Text>
                    </View>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 8 }}>
                    <Badge
                      label={ev ? t(`admin.eventStatus.${ev.status}`, { defaultValue: ev.status }) : t("admin.noEventAssigned")}
                      variant={ev ? (ev.status === "active" ? "success" : ev.status === "upcoming" ? "info" : "muted") : "muted"}
                      size="sm"
                    />
                    <Feather name="edit-2" size={13} color={C.textMuted} />
                  </View>
                </View>
              </Card>
            </Pressable>
          );
        }}
      />

      {/* Edit client modal */}
      <Modal visible={!!editClient} transparent animationType="slide">
        <View style={[styles.overlay, { backgroundColor: C.overlay }]}>
          <ScrollView
            style={[styles.sheet, { backgroundColor: C.card }]}
            contentContainerStyle={{ gap: 16, padding: 24, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: C.text }]}>{t("admin.editClient")}</Text>
              <Pressable onPress={() => setEditClient(null)}>
                <Feather name="x" size={22} color={C.textSecondary} />
              </Pressable>
            </View>

            {editClient && (
              <View style={[styles.clientPreview, { backgroundColor: C.inputBg, borderRadius: 12 }]}>
                <Text style={[styles.clientName, { color: C.text }]}>
                  {[editClient.firstName, editClient.lastName].filter(Boolean).join(" ") || editClient.username || editClient.email}
                </Text>
                <Text style={[styles.clientId, { color: C.textMuted }]}>
                  {editClient.email ?? editClient.username}
                </Text>
              </View>
            )}

            <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>{t("admin.assignToEvent")}</Text>

            {/* No event option */}
            <Pressable
              onPress={() => setEditEventId("")}
              style={[
                styles.eventOption,
                {
                  backgroundColor: !editEventId ? C.primary + "18" : C.inputBg,
                  borderColor: !editEventId ? C.primary : C.border,
                },
              ]}
            >
              <Feather name="slash" size={16} color={!editEventId ? C.primary : C.textMuted} />
              <Text style={[styles.eventOptionText, { color: !editEventId ? C.primary : C.textSecondary }]}>
                {t("admin.noEventAssigned")}
              </Text>
              {!editEventId && <Feather name="check" size={16} color={C.primary} />}
            </Pressable>

            {events.map((ev) => (
              <Pressable
                key={ev.id}
                onPress={() => setEditEventId(ev.id)}
                style={[
                  styles.eventOption,
                  {
                    backgroundColor: editEventId === ev.id ? C.primary + "18" : C.inputBg,
                    borderColor: editEventId === ev.id ? C.primary : C.border,
                  },
                ]}
              >
                <Feather name="calendar" size={16} color={editEventId === ev.id ? C.primary : C.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.eventOptionText, { color: editEventId === ev.id ? C.primary : C.text }]}>
                    {ev.name}
                  </Text>
                  <Text style={[styles.eventOptionSub, { color: C.textMuted }]}>
                    {t(`admin.eventStatus.${ev.status}`, { defaultValue: ev.status })}
                  </Text>
                </View>
                {editEventId === ev.id && <Feather name="check" size={16} color={C.primary} />}
              </Pressable>
            ))}

            <View style={styles.sheetActions}>
              <Button title={t("common.cancel")} onPress={() => setEditClient(null)} variant="secondary" />
              <Button title={t("common.save")} onPress={handleSaveEdit} variant="primary" loading={saving} />
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Create client modal */}
      <Modal visible={showCreate} transparent animationType="slide">
        <View style={[styles.overlay, { backgroundColor: C.overlay }]}>
          <ScrollView
            style={[styles.sheet, { backgroundColor: C.card }]}
            contentContainerStyle={{ gap: 16, padding: 24, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={[styles.sheetTitle, { color: C.text }]}>{t("admin.createClient")}</Text>
            <Text style={[styles.sheetHint, { color: C.textSecondary }]}>{t("admin.createClientHint")}</Text>

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Input
                  label={t("admin.firstName")}
                  value={form.firstName}
                  onChangeText={(v) => setForm((f) => ({ ...f, firstName: v }))}
                  placeholder="Ana"
                  autoCapitalize="words"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Input
                  label={t("admin.lastName")}
                  value={form.lastName}
                  onChangeText={(v) => setForm((f) => ({ ...f, lastName: v }))}
                  placeholder="García"
                  autoCapitalize="words"
                />
              </View>
            </View>

            <Input
              label={t("admin.clientEmail")}
              value={form.email}
              onChangeText={(v) => setForm((f) => ({ ...f, email: v }))}
              placeholder="ana@festivalapp.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Input
              label={t("admin.clientUsername")}
              value={form.username}
              onChangeText={(v) => setForm((f) => ({ ...f, username: v }))}
              placeholder={t("admin.clientUsernamePlaceholder")}
              autoCapitalize="none"
            />
            <Input
              label={t("admin.clientPassword")}
              value={form.password}
              onChangeText={(v) => setForm((f) => ({ ...f, password: v }))}
              placeholder={t("admin.passwordMinLengthHint")}
              secureTextEntry
            />

            <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>{t("admin.assignToEvent")}</Text>

            <Pressable
              onPress={() => setForm((f) => ({ ...f, eventId: "" }))}
              style={[
                styles.eventOption,
                {
                  backgroundColor: !form.eventId ? C.primary + "18" : C.inputBg,
                  borderColor: !form.eventId ? C.primary : C.border,
                },
              ]}
            >
              <Feather name="slash" size={16} color={!form.eventId ? C.primary : C.textMuted} />
              <Text style={[styles.eventOptionText, { color: !form.eventId ? C.primary : C.textSecondary }]}>
                {t("admin.noEventYet")}
              </Text>
              {!form.eventId && <Feather name="check" size={16} color={C.primary} />}
            </Pressable>

            {events.map((ev) => (
              <Pressable
                key={ev.id}
                onPress={() => setForm((f) => ({ ...f, eventId: ev.id }))}
                style={[
                  styles.eventOption,
                  {
                    backgroundColor: form.eventId === ev.id ? C.primary + "18" : C.inputBg,
                    borderColor: form.eventId === ev.id ? C.primary : C.border,
                  },
                ]}
              >
                <Feather name="calendar" size={16} color={form.eventId === ev.id ? C.primary : C.textMuted} />
                <Text style={[styles.eventOptionText, { color: form.eventId === ev.id ? C.primary : C.text, flex: 1 }]}>
                  {ev.name}
                </Text>
                {form.eventId === ev.id && <Feather name="check" size={16} color={C.primary} />}
              </Pressable>
            ))}

            <View style={styles.sheetActions}>
              <Button title={t("common.cancel")} onPress={() => { setShowCreate(false); resetForm(); }} variant="secondary" />
              <Button title={t("admin.createClient")} onPress={handleCreate} variant="primary" loading={creating} />
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 },
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  clientRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  clientName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  clientId: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  eventTag: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  eventTagText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  overlay: { flex: 1, justifyContent: "flex-end" },
  sheet: { maxHeight: "92%", borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sheetTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  sheetHint: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: -8 },
  sheetActions: { flexDirection: "row", gap: 12, marginTop: 8 },
  row: { flexDirection: "row", gap: 12 },
  sectionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8 },
  eventOption: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 12, borderWidth: 1 },
  eventOptionText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  eventOptionSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  clientPreview: { padding: 14 },
});
