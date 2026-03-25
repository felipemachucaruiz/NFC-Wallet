import { Feather } from "@expo/vector-icons";
import React, { useState, useCallback, useEffect } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
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

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    username: "",
    password: "",
    eventId: "",
  });

  const { data: eventsData } = useListEvents();
  const events = (eventsData as { events?: Array<{ id: string; name: string; status: string }> } | undefined)?.events ?? [];

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
        lastName: form.lastName.trim(),
        password: form.password,
        role: "event_admin",
      };
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
                <Badge
                  label={ev ? t(`admin.eventStatus.${ev.status}`, { defaultValue: ev.status }) : t("admin.noEventAssigned")}
                  variant={ev ? (ev.status === "active" ? "success" : ev.status === "upcoming" ? "info" : "muted") : "muted"}
                  size="sm"
                />
              </View>
            </Card>
          );
        }}
      />

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

            <View style={{ gap: 8 }}>
              <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>{t("admin.assignToEvent")}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                <Text
                  onPress={() => setForm((f) => ({ ...f, eventId: "" }))}
                  style={[
                    styles.eventChip,
                    { backgroundColor: !form.eventId ? C.primary : C.inputBg, color: !form.eventId ? "#fff" : C.textSecondary, borderColor: !form.eventId ? C.primary : C.border },
                  ]}
                >
                  {t("admin.noEventYet")}
                </Text>
                {events.map((ev) => (
                  <Text
                    key={ev.id}
                    onPress={() => setForm((f) => ({ ...f, eventId: ev.id }))}
                    style={[
                      styles.eventChip,
                      { backgroundColor: form.eventId === ev.id ? C.primary : C.inputBg, color: form.eventId === ev.id ? "#fff" : C.textSecondary, borderColor: form.eventId === ev.id ? C.primary : C.border },
                    ]}
                  >
                    {ev.name}
                  </Text>
                ))}
              </ScrollView>
            </View>

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
  sheet: { maxHeight: "90%", borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  sheetTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  sheetHint: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: -8 },
  sheetActions: { flexDirection: "row", gap: 12, marginTop: 8 },
  row: { flexDirection: "row", gap: 12 },
  sectionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8 },
  eventChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 100, fontFamily: "Inter_500Medium", fontSize: 13, borderWidth: 1, overflow: "hidden" },
});
