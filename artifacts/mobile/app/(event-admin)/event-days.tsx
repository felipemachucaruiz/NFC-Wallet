import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import React, { useState, useCallback, useEffect } from "react";
import {
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

type EventDay = {
  id: string;
  date: string;
  label: string | null;
  doorsOpenAt: string | null;
  doorsCloseAt: string | null;
  displayOrder: number;
};

type DayForm = {
  date: string;
  label: string;
  doorsOpenAt: string;
  doorsCloseAt: string;
};

const EMPTY_FORM: DayForm = { date: "", label: "", doorsOpenAt: "", doorsCloseAt: "" };

export default function EventDaysScreen() {
  const { t } = useTranslation();
  const { show: showAlert } = useAlert();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { token } = useAuth();
  const { eventId } = useEventContext();

  const [days, setDays] = useState<EventDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<EventDay | null>(null);
  const [form, setForm] = useState<DayForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const authHeader = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const load = useCallback(async () => {
    if (!eventId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/events/${eventId}/days`, { headers: authHeader });
      const data = await res.json();
      if (res.ok) setDays((data.days ?? []).sort((a: EventDay, b: EventDay) => a.displayOrder - b.displayOrder));
    } catch {}
    setLoading(false);
  }, [eventId, token]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setShowForm(true); };
  const openEdit = (day: EventDay) => {
    setEditing(day);
    setForm({
      date: day.date,
      label: day.label ?? "",
      doorsOpenAt: day.doorsOpenAt ? day.doorsOpenAt.slice(0, 5) : "",
      doorsCloseAt: day.doorsCloseAt ? day.doorsCloseAt.slice(0, 5) : "",
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.date.trim()) { showAlert(t("common.error"), t("eventDays.dateRequired")); return; }
    setSaving(true);
    try {
      const body = {
        date: form.date.trim(),
        label: form.label.trim() || undefined,
        doorsOpenAt: form.doorsOpenAt || undefined,
        doorsCloseAt: form.doorsCloseAt || undefined,
      };
      const url = editing
        ? `${API_BASE_URL}/api/events/${eventId}/days/${editing.id}`
        : `${API_BASE_URL}/api/events/${eventId}/days`;
      const res = await fetch(url, { method: editing ? "PATCH" : "POST", headers: authHeader, body: JSON.stringify(body) });
      if (!res.ok) { const d = await res.json(); showAlert(t("common.error"), d.error ?? t("common.unknownError")); }
      else { setShowForm(false); load(); }
    } catch { showAlert(t("common.error"), t("common.unknownError")); }
    setSaving(false);
  };

  const handleDelete = (day: EventDay) => {
    showAlert(t("common.deleteConfirm"), t("eventDays.deleteConfirm", { label: day.label ?? day.date }), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"), style: "destructive", onPress: async () => {
          try {
            const res = await fetch(`${API_BASE_URL}/api/events/${eventId}/days/${day.id}`, { method: "DELETE", headers: authHeader });
            if (!res.ok) { const d = await res.json(); showAlert(t("common.error"), d.error ?? t("common.unknownError")); }
            else load();
          } catch { showAlert(t("common.error"), t("common.unknownError")); }
        },
      },
    ]);
  };

  if (loading) return <Loading />;

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <View style={[styles.header, { paddingTop: isWeb ? 67 : insets.top + 16, backgroundColor: C.background }]}>
        <Text style={[styles.title, { color: C.text }]}>{t("eventDays.title")}</Text>
        <Pressable onPress={openCreate} style={[styles.addBtn, { backgroundColor: C.primary }]}>
          <Feather name="plus" size={20} color="#fff" />
        </Pressable>
      </View>

      <FlatList
        data={days}
        keyExtractor={item => item.id}
        contentContainerStyle={[styles.list, { paddingBottom: isWeb ? 34 : insets.bottom + 80 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={<Empty message={t("eventDays.empty")} />}
        renderItem={({ item }) => (
          <Card style={styles.dayCard}>
            <View style={styles.dayRow}>
              <View style={[styles.dayIndex, { backgroundColor: C.primaryLight }]}>
                <Text style={[styles.dayIndexText, { color: C.primary }]}>{item.displayOrder + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.dayLabel, { color: C.text }]}>{item.label ?? item.date}</Text>
                <Text style={[styles.dayDate, { color: C.textMuted }]}>{item.date}</Text>
                {(item.doorsOpenAt || item.doorsCloseAt) && (
                  <Text style={[styles.dayHours, { color: C.textMuted }]}>
                    <Feather name="clock" size={11} /> {item.doorsOpenAt ?? "–"} – {item.doorsCloseAt ?? "–"}
                  </Text>
                )}
              </View>
              <View style={styles.actions}>
                <Pressable onPress={() => openEdit(item)} style={styles.actionBtn}>
                  <Feather name="edit-2" size={16} color={C.textMuted} />
                </Pressable>
                <Pressable onPress={() => handleDelete(item)} style={styles.actionBtn}>
                  <Feather name="trash-2" size={16} color={Colors.danger} />
                </Pressable>
              </View>
            </View>
          </Card>
        )}
      />

      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowForm(false)}>
        <View style={[styles.modalContainer, { backgroundColor: C.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: C.border }]}>
            <Pressable onPress={() => setShowForm(false)}>
              <Feather name="x" size={22} color={C.textMuted} />
            </Pressable>
            <Text style={[styles.modalTitle, { color: C.text }]}>
              {editing ? t("eventDays.edit") : t("eventDays.create")}
            </Text>
            <View style={{ width: 22 }} />
          </View>
          <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
            <Text style={[styles.label, { color: C.textMuted }]}>{t("eventDays.date")} * (YYYY-MM-DD)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: C.inputBg, color: C.text, borderColor: C.border }]}
              value={form.date}
              onChangeText={v => setForm(f => ({ ...f, date: v }))}
              placeholder="2025-06-01"
              placeholderTextColor={C.textMuted}
            />
            <Text style={[styles.label, { color: C.textMuted }]}>{t("eventDays.label")}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: C.inputBg, color: C.text, borderColor: C.border }]}
              value={form.label}
              onChangeText={v => setForm(f => ({ ...f, label: v }))}
              placeholder={t("eventDays.labelPlaceholder")}
              placeholderTextColor={C.textMuted}
            />
            <Text style={[styles.label, { color: C.textMuted }]}>{t("eventDays.doorsOpen")} (HH:MM)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: C.inputBg, color: C.text, borderColor: C.border }]}
              value={form.doorsOpenAt}
              onChangeText={v => setForm(f => ({ ...f, doorsOpenAt: v }))}
              placeholder="18:00"
              placeholderTextColor={C.textMuted}
            />
            <Text style={[styles.label, { color: C.textMuted }]}>{t("eventDays.doorsClose")} (HH:MM)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: C.inputBg, color: C.text, borderColor: C.border }]}
              value={form.doorsCloseAt}
              onChangeText={v => setForm(f => ({ ...f, doorsCloseAt: v }))}
              placeholder="02:00"
              placeholderTextColor={C.textMuted}
            />
            <Button title={saving ? t("common.saving") : t("common.save")} onPress={handleSave} disabled={saving} style={{ marginTop: 16, marginBottom: 32 }} />
          </ScrollView>
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
  dayCard: { marginHorizontal: 0 },
  dayRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  dayIndex: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  dayIndexText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  dayLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  dayDate: { fontSize: 13, fontFamily: "Inter_400Regular" },
  dayHours: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  actions: { flexDirection: "row", gap: 4 },
  actionBtn: { padding: 8 },
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  modalTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  modalBody: { padding: 20 },
  label: { fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, fontFamily: "Inter_400Regular" },
});
