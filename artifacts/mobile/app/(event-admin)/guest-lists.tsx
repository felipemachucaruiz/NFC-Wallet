import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import React, { useState, useCallback, useEffect } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { useAlert } from "@/components/CustomAlert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Loading } from "@/components/ui/Loading";
import { useAuth } from "@/contexts/AuthContext";
import { useEventContext } from "@/contexts/EventContext";
import { API_BASE_URL } from "@/constants/domain";

type GuestList = {
  id: string;
  name: string;
  slug: string;
  maxGuests: number;
  currentCount: number;
  isPublic: boolean;
  status: string;
  expiresAt: string | null;
};

type GuestEntry = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string;
  phone: string | null;
  createdAt: string;
};

type ListForm = { name: string; maxGuests: string; isPublic: boolean; expiresAt: string };
const EMPTY_FORM: ListForm = { name: "", maxGuests: "50", isPublic: false, expiresAt: "" };

export default function GuestListsScreen() {
  const { t } = useTranslation();
  const { show: showAlert } = useAlert();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { token } = useAuth();
  const { eventId } = useEventContext();

  const [lists, setLists] = useState<GuestList[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<GuestList | null>(null);
  const [form, setForm] = useState<ListForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [entriesListId, setEntriesListId] = useState<string | null>(null);
  const [entries, setEntries] = useState<GuestEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);

  const authHeader = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const load = useCallback(async () => {
    if (!eventId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/events/${eventId}/guest-lists`, { headers: authHeader });
      const data = await res.json();
      if (res.ok) setLists(data.guestLists ?? []);
    } catch {}
    setLoading(false);
  }, [eventId, token]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (gl: GuestList) => {
    setEditing(gl);
    setForm({
      name: gl.name,
      maxGuests: String(gl.maxGuests),
      isPublic: gl.isPublic,
      expiresAt: gl.expiresAt ? gl.expiresAt.slice(0, 16) : "",
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { showAlert(t("common.error"), t("guestLists.nameRequired")); return; }
    const maxGuests = parseInt(form.maxGuests, 10);
    if (isNaN(maxGuests) || maxGuests < 1) { showAlert(t("common.error"), t("guestLists.maxGuestsInvalid")); return; }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        maxGuests,
        isPublic: form.isPublic,
        expiresAt: form.expiresAt || null,
      };
      const url = editing
        ? `${API_BASE_URL}/api/events/${eventId}/guest-lists/${editing.id}`
        : `${API_BASE_URL}/api/events/${eventId}/guest-lists`;
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: authHeader,
        body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json(); showAlert(t("common.error"), d.error ?? t("common.unknownError")); }
      else { setShowForm(false); setEditing(null); setForm(EMPTY_FORM); load(); }
    } catch { showAlert(t("common.error"), t("common.unknownError")); }
    setSaving(false);
  };

  const handleDelete = (gl: GuestList) => {
    showAlert(t("common.deleteConfirm"), t("guestLists.deleteConfirm", { name: gl.name }), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"), style: "destructive", onPress: async () => {
          try {
            const res = await fetch(`${API_BASE_URL}/api/events/${eventId}/guest-lists/${gl.id}`, { method: "DELETE", headers: authHeader });
            if (!res.ok) { const d = await res.json(); showAlert(t("common.error"), d.error ?? t("common.unknownError")); }
            else load();
          } catch { showAlert(t("common.error"), t("common.unknownError")); }
        },
      },
    ]);
  };

  const togglePublic = async (gl: GuestList) => {
    try {
      await fetch(`${API_BASE_URL}/api/events/${eventId}/guest-lists/${gl.id}`, {
        method: "PATCH", headers: authHeader, body: JSON.stringify({ isPublic: !gl.isPublic }),
      });
      load();
    } catch {}
  };

  const openEntries = async (gl: GuestList) => {
    setEntriesListId(gl.id);
    setEntriesLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/events/${eventId}/guest-lists/${gl.id}/entries`, { headers: authHeader });
      const data = await res.json();
      setEntries(data.entries ?? []);
    } catch { setEntries([]); }
    setEntriesLoading(false);
  };

  const shareLink = (gl: GuestList) => {
    const url = `${process.env.EXPO_PUBLIC_TICKETS_URL ?? "https://tapeetickets.com"}/guest/${gl.slug}`;
    Share.share({ message: url, url });
  };

  if (loading) return <Loading />;

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <View style={[styles.header, { paddingTop: isWeb ? 67 : insets.top + 16, backgroundColor: C.background }]}>
        <Text style={[styles.title, { color: C.text }]}>{t("guestLists.title")}</Text>
        <Pressable onPress={openCreate} style={[styles.addBtn, { backgroundColor: C.primary }]}>
          <Feather name="plus" size={20} color="#fff" />
        </Pressable>
      </View>

      <FlatList
        data={lists}
        keyExtractor={item => item.id}
        contentContainerStyle={[styles.list, { paddingBottom: isWeb ? 34 : insets.bottom + 80 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={<Empty message={t("guestLists.empty")} />}
        renderItem={({ item }) => (
          <Card style={styles.listCard}>
            <View style={styles.listRow}>
              <View style={{ flex: 1 }}>
                <View style={styles.listNameRow}>
                  <Text style={[styles.listName, { color: C.text }]}>{item.name}</Text>
                  {item.isPublic && (
                    <View style={[styles.publicBadge, { backgroundColor: C.primaryLight }]}>
                      <Text style={[styles.publicBadgeText, { color: C.primary }]}>{t("guestLists.public")}</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.listCount, { color: C.textMuted }]}>
                  {item.currentCount}/{item.maxGuests} {t("guestLists.guests")}
                </Text>
                {item.expiresAt && (
                  <Text style={[styles.listExpiry, { color: C.textMuted }]}>
                    {t("guestLists.expires")}: {new Date(item.expiresAt).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Bogota" })}
                  </Text>
                )}
              </View>
              <View style={styles.listActions}>
                <Pressable onPress={() => openEntries(item)} style={styles.actionBtn}>
                  <Feather name="users" size={16} color={C.primary} />
                </Pressable>
                <Pressable onPress={() => openEdit(item)} style={styles.actionBtn}>
                  <Feather name="edit-2" size={16} color={C.textMuted} />
                </Pressable>
                {item.isPublic && (
                  <Pressable onPress={() => shareLink(item)} style={styles.actionBtn}>
                    <Feather name="share-2" size={16} color={C.primary} />
                  </Pressable>
                )}
                <Pressable onPress={() => handleDelete(item)} style={styles.actionBtn}>
                  <Feather name="trash-2" size={16} color={Colors.danger} />
                </Pressable>
              </View>
            </View>
            <View style={styles.publicRow}>
              <Text style={[styles.publicLabel, { color: C.textMuted }]}>{t("guestLists.publicToggle")}</Text>
              <Switch value={item.isPublic} onValueChange={() => togglePublic(item)} trackColor={{ true: C.primary }} />
            </View>
          </Card>
        )}
      />

      {/* Create / Edit Modal */}
      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setShowForm(false); setEditing(null); }}>
        <View style={[styles.modalContainer, { backgroundColor: C.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: C.border }]}>
            <Pressable onPress={() => { setShowForm(false); setEditing(null); }}>
              <Feather name="x" size={22} color={C.textMuted} />
            </Pressable>
            <Text style={[styles.modalTitle, { color: C.text }]}>
              {editing ? t("guestLists.edit") : t("guestLists.create")}
            </Text>
            <View style={{ width: 22 }} />
          </View>
          <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
            <Text style={[styles.label, { color: C.textMuted }]}>{t("guestLists.name")} *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: C.inputBg, color: C.text, borderColor: C.border }]}
              value={form.name} onChangeText={v => setForm(f => ({ ...f, name: v }))}
              placeholder={t("guestLists.namePlaceholder")} placeholderTextColor={C.textMuted}
            />
            <Text style={[styles.label, { color: C.textMuted }]}>{t("guestLists.maxGuests")} *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: C.inputBg, color: C.text, borderColor: C.border }]}
              value={form.maxGuests} onChangeText={v => setForm(f => ({ ...f, maxGuests: v }))}
              keyboardType="numeric" placeholder="50" placeholderTextColor={C.textMuted}
            />
            <Text style={[styles.label, { color: C.textMuted }]}>{t("guestLists.expiresAt")}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: C.inputBg, color: C.text, borderColor: C.border }]}
              value={form.expiresAt} onChangeText={v => setForm(f => ({ ...f, expiresAt: v }))}
              placeholder="YYYY-MM-DDTHH:MM" placeholderTextColor={C.textMuted}
            />
            <View style={styles.switchRow}>
              <Text style={[styles.label, { color: C.textMuted, marginBottom: 0 }]}>{t("guestLists.publicToggle")}</Text>
              <Switch value={form.isPublic} onValueChange={v => setForm(f => ({ ...f, isPublic: v }))} trackColor={{ true: C.primary }} />
            </View>
            <Button title={saving ? t("common.saving") : t("common.save")} onPress={handleSave} disabled={saving} style={{ marginTop: 16, marginBottom: 32 }} />
          </ScrollView>
        </View>
      </Modal>

      {/* Entries Modal */}
      <Modal visible={!!entriesListId} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEntriesListId(null)}>
        <View style={[styles.modalContainer, { backgroundColor: C.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: C.border }]}>
            <Pressable onPress={() => setEntriesListId(null)}><Feather name="x" size={22} color={C.textMuted} /></Pressable>
            <Text style={[styles.modalTitle, { color: C.text }]}>{t("guestLists.entries")}</Text>
            <View style={{ width: 22 }} />
          </View>
          {entriesLoading ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={C.primary} />
          ) : (
            <FlatList
              data={entries}
              keyExtractor={e => e.id}
              contentContainerStyle={[styles.list, { paddingBottom: 40 }]}
              ListEmptyComponent={<Empty message={t("guestLists.noEntries")} />}
              renderItem={({ item }) => (
                <Card style={styles.entryCard}>
                  <Text style={[styles.entryName, { color: C.text }]}>
                    {item.firstName} {item.lastName ?? ""}
                  </Text>
                  <Text style={[styles.entryEmail, { color: C.textMuted }]}>{item.email}</Text>
                  {item.phone && <Text style={[styles.entryEmail, { color: C.textMuted }]}>{item.phone}</Text>}
                  <Text style={[styles.entryDate, { color: C.textMuted }]}>
                    {new Date(item.createdAt).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" })}
                  </Text>
                </Card>
              )}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 12 },
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  addBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  list: { paddingHorizontal: 16, paddingTop: 8, gap: 10 },
  listCard: { marginHorizontal: 0 },
  listRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  listNameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  listName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  publicBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  publicBadgeText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  listCount: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  listExpiry: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  listActions: { flexDirection: "row", gap: 4 },
  actionBtn: { padding: 8 },
  publicRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  publicLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  modalTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  modalBody: { padding: 20 },
  label: { fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, fontFamily: "Inter_400Regular" },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 16 },
  entryCard: { marginHorizontal: 0 },
  entryName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  entryEmail: { fontSize: 13, fontFamily: "Inter_400Regular" },
  entryDate: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
});
