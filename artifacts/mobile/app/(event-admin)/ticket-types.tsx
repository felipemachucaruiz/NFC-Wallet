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
import { formatCurrency } from "@/utils/format";

type TicketType = {
  id: string;
  name: string;
  price: number;
  serviceFee: number;
  quantity: number;
  soldCount: number;
  saleStart: string | null;
  saleEnd: string | null;
  isActive: boolean;
  validEventDayIds: string[];
  sectionId: string | null;
};

type EventDay = {
  id: string;
  date: string;
  label: string | null;
  displayOrder: number;
};

type PricingStage = {
  id: string;
  name: string;
  price: number;
  startsAt: string;
  endsAt: string;
  displayOrder: number;
};

type TypeForm = {
  name: string;
  price: string;
  serviceFee: string;
  quantity: string;
  isActive: boolean;
  saleStart: string;
  saleEnd: string;
  selectedDayIds: string[];
};

const EMPTY_FORM: TypeForm = {
  name: "",
  price: "",
  serviceFee: "",
  quantity: "",
  isActive: true,
  saleStart: "",
  saleEnd: "",
  selectedDayIds: [],
};

type StageForm = { name: string; price: string; startsAt: string; endsAt: string };
const EMPTY_STAGE: StageForm = { name: "", price: "", startsAt: "", endsAt: "" };

export default function TicketTypesScreen() {
  const { t } = useTranslation();
  const { show: showAlert } = useAlert();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { token } = useAuth();
  const { eventId, currencyCode } = useEventContext();

  const [types, setTypes] = useState<TicketType[]>([]);
  const [days, setDays] = useState<EventDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TicketType | null>(null);
  const [form, setForm] = useState<TypeForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [stageTypeId, setStageTypeId] = useState<string | null>(null);
  const [stages, setStages] = useState<PricingStage[]>([]);
  const [stagesLoading, setStagesLoading] = useState(false);
  const [showStageForm, setShowStageForm] = useState(false);
  const [editingStage, setEditingStage] = useState<PricingStage | null>(null);
  const [stageForm, setStageForm] = useState<StageForm>(EMPTY_STAGE);
  const [stageSaving, setStageSaving] = useState(false);

  const authHeader = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const load = useCallback(async () => {
    if (!eventId) return;
    try {
      const [typesRes, daysRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/events/${eventId}/ticket-types`, { headers: authHeader }),
        fetch(`${API_BASE_URL}/api/events/${eventId}/days`, { headers: authHeader }),
      ]);
      const typesData = await typesRes.json();
      const daysData = await daysRes.json();
      if (typesRes.ok) setTypes(typesData.ticketTypes ?? []);
      if (daysRes.ok) setDays((daysData.days ?? []).sort((a: EventDay, b: EventDay) => a.displayOrder - b.displayOrder));
    } catch {}
    setLoading(false);
  }, [eventId, token]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setShowForm(true); };
  const openEdit = (tt: TicketType) => {
    setEditing(tt);
    setForm({
      name: tt.name,
      price: String(tt.price),
      serviceFee: String(tt.serviceFee),
      quantity: String(tt.quantity),
      isActive: tt.isActive,
      saleStart: tt.saleStart ? tt.saleStart.slice(0, 16) : "",
      saleEnd: tt.saleEnd ? tt.saleEnd.slice(0, 16) : "",
      selectedDayIds: tt.validEventDayIds ?? [],
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { showAlert(t("common.error"), t("ticketTypes.nameRequired")); return; }
    const price = parseInt(form.price, 10);
    const qty = parseInt(form.quantity, 10);
    if (isNaN(price) || price < 0) { showAlert(t("common.error"), t("ticketTypes.priceInvalid")); return; }
    if (isNaN(qty) || qty < 1) { showAlert(t("common.error"), t("ticketTypes.quantityInvalid")); return; }
    const fee = parseInt(form.serviceFee, 10);
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        price,
        serviceFee: isNaN(fee) ? 0 : fee,
        quantity: qty,
        isActive: form.isActive,
        saleStart: form.saleStart || null,
        saleEnd: form.saleEnd || null,
        validEventDayIds: form.selectedDayIds,
      };
      const url = editing
        ? `${API_BASE_URL}/api/events/${eventId}/ticket-types/${editing.id}`
        : `${API_BASE_URL}/api/events/${eventId}/ticket-types`;
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: authHeader,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json();
        showAlert(t("common.error"), d.error ?? t("common.unknownError"));
      } else {
        setShowForm(false);
        load();
      }
    } catch { showAlert(t("common.error"), t("common.unknownError")); }
    setSaving(false);
  };

  const openStages = async (tt: TicketType) => {
    setStageTypeId(tt.id);
    setStagesLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/events/${eventId}/ticket-types/${tt.id}/pricing-stages`, { headers: authHeader });
      const d = await res.json();
      setStages(d.stages ?? []);
    } catch { setStages([]); }
    setStagesLoading(false);
  };

  const closeStages = () => { setStageTypeId(null); setStages([]); };

  const openStageCreate = () => { setEditingStage(null); setStageForm(EMPTY_STAGE); setShowStageForm(true); };
  const openStageEdit = (s: PricingStage) => {
    setEditingStage(s);
    setStageForm({ name: s.name, price: String(s.price), startsAt: s.startsAt.slice(0, 16), endsAt: s.endsAt.slice(0, 16) });
    setShowStageForm(true);
  };

  const handleStageSave = async () => {
    if (!stageTypeId) return;
    if (!stageForm.name.trim()) { showAlert(t("common.error"), t("ticketTypes.stageNameRequired")); return; }
    const price = parseInt(stageForm.price, 10);
    if (isNaN(price) || price < 0) { showAlert(t("common.error"), t("ticketTypes.priceInvalid")); return; }
    if (!stageForm.startsAt || !stageForm.endsAt) { showAlert(t("common.error"), t("ticketTypes.stageDatesRequired")); return; }
    setStageSaving(true);
    try {
      const body = { name: stageForm.name.trim(), price, startsAt: new Date(stageForm.startsAt).toISOString(), endsAt: new Date(stageForm.endsAt).toISOString() };
      const url = editingStage
        ? `${API_BASE_URL}/api/events/${eventId}/ticket-types/${stageTypeId}/pricing-stages/${editingStage.id}`
        : `${API_BASE_URL}/api/events/${eventId}/ticket-types/${stageTypeId}/pricing-stages`;
      const res = await fetch(url, { method: editingStage ? "PATCH" : "POST", headers: authHeader, body: JSON.stringify(body) });
      if (!res.ok) { const d = await res.json(); showAlert(t("common.error"), d.error ?? t("common.unknownError")); }
      else {
        setShowStageForm(false);
        openStages(types.find(tt => tt.id === stageTypeId)!);
      }
    } catch { showAlert(t("common.error"), t("common.unknownError")); }
    setStageSaving(false);
  };

  const handleDeleteStage = async (stageId: string) => {
    if (!stageTypeId) return;
    showAlert(t("common.deleteConfirm"), t("ticketTypes.stageDeleteConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"), style: "destructive", onPress: async () => {
          try {
            await fetch(`${API_BASE_URL}/api/events/${eventId}/ticket-types/${stageTypeId}/pricing-stages/${stageId}`, { method: "DELETE", headers: authHeader });
            openStages(types.find(tt => tt.id === stageTypeId)!);
          } catch {}
        },
      },
    ]);
  };

  const fmt = (n: number) => formatCurrency(n, currencyCode ?? "COP");

  const toggleDay = (dayId: string) => {
    setForm(f => ({
      ...f,
      selectedDayIds: f.selectedDayIds.includes(dayId)
        ? f.selectedDayIds.filter(d => d !== dayId)
        : [...f.selectedDayIds, dayId],
    }));
  };

  if (loading) return <Loading />;

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <View style={[styles.header, { paddingTop: isWeb ? 67 : insets.top + 16, backgroundColor: C.background }]}>
        <Text style={[styles.title, { color: C.text }]}>{t("ticketTypes.title")}</Text>
        <Pressable onPress={openCreate} style={[styles.addBtn, { backgroundColor: C.primary }]}>
          <Feather name="plus" size={20} color="#fff" />
        </Pressable>
      </View>

      <FlatList
        data={types}
        keyExtractor={item => item.id}
        contentContainerStyle={[styles.list, { paddingBottom: isWeb ? 34 : insets.bottom + 100 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={<Empty message={t("ticketTypes.empty")} />}
        renderItem={({ item }) => (
          <Card style={styles.typeCard}>
            <View style={styles.typeRow}>
              <View style={styles.typeMeta}>
                <View style={styles.typeNameRow}>
                  <Text style={[styles.typeName, { color: C.text }]}>{item.name}</Text>
                  <View style={[styles.activeBadge, { backgroundColor: item.isActive ? C.primaryLight : C.inputBg }]}>
                    <Text style={[styles.activeBadgeText, { color: item.isActive ? C.primary : C.textMuted }]}>
                      {item.isActive ? t("common.active") : t("common.inactive")}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.typePrice, { color: C.primary }]}>{fmt(item.price)}</Text>
                {item.serviceFee > 0 && (
                  <Text style={[styles.typeSub, { color: C.textMuted }]}>
                    {t("ticketTypes.fee")}: {fmt(item.serviceFee)}
                  </Text>
                )}
                <Text style={[styles.typeSub, { color: C.textMuted }]}>
                  {item.soldCount}/{item.quantity} {t("ticketTypes.sold")}
                </Text>
              </View>
              <View style={styles.typeActions}>
                <Pressable onPress={() => openStages(item)} style={styles.actionBtn}>
                  <Feather name="trending-up" size={16} color={C.primary} />
                </Pressable>
                <Pressable onPress={() => openEdit(item)} style={styles.actionBtn}>
                  <Feather name="edit-2" size={16} color={C.textMuted} />
                </Pressable>
              </View>
            </View>
          </Card>
        )}
      />

      {/* Create / Edit Modal */}
      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowForm(false)}>
        <View style={[styles.modalContainer, { backgroundColor: C.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: C.border }]}>
            <Pressable onPress={() => setShowForm(false)}>
              <Feather name="x" size={22} color={C.textMuted} />
            </Pressable>
            <Text style={[styles.modalTitle, { color: C.text }]}>
              {editing ? t("ticketTypes.edit") : t("ticketTypes.create")}
            </Text>
            <View style={{ width: 22 }} />
          </View>
          <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
            <Text style={[styles.label, { color: C.textMuted }]}>{t("ticketTypes.name")} *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: C.inputBg, color: C.text, borderColor: C.border }]}
              value={form.name}
              onChangeText={v => setForm(f => ({ ...f, name: v }))}
              placeholder={t("ticketTypes.namePlaceholder")}
              placeholderTextColor={C.textMuted}
            />

            <Text style={[styles.label, { color: C.textMuted }]}>{t("ticketTypes.price")} *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: C.inputBg, color: C.text, borderColor: C.border }]}
              value={form.price}
              onChangeText={v => setForm(f => ({ ...f, price: v }))}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={C.textMuted}
            />

            <Text style={[styles.label, { color: C.textMuted }]}>{t("ticketTypes.serviceFee")}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: C.inputBg, color: C.text, borderColor: C.border }]}
              value={form.serviceFee}
              onChangeText={v => setForm(f => ({ ...f, serviceFee: v }))}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={C.textMuted}
            />

            <Text style={[styles.label, { color: C.textMuted }]}>{t("ticketTypes.quantity")} *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: C.inputBg, color: C.text, borderColor: C.border }]}
              value={form.quantity}
              onChangeText={v => setForm(f => ({ ...f, quantity: v }))}
              keyboardType="numeric"
              placeholder="100"
              placeholderTextColor={C.textMuted}
            />

            <Text style={[styles.label, { color: C.textMuted }]}>{t("ticketTypes.saleStart")}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: C.inputBg, color: C.text, borderColor: C.border }]}
              value={form.saleStart}
              onChangeText={v => setForm(f => ({ ...f, saleStart: v }))}
              placeholder="YYYY-MM-DDTHH:MM"
              placeholderTextColor={C.textMuted}
            />

            <Text style={[styles.label, { color: C.textMuted }]}>{t("ticketTypes.saleEnd")}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: C.inputBg, color: C.text, borderColor: C.border }]}
              value={form.saleEnd}
              onChangeText={v => setForm(f => ({ ...f, saleEnd: v }))}
              placeholder="YYYY-MM-DDTHH:MM"
              placeholderTextColor={C.textMuted}
            />

            <View style={styles.switchRow}>
              <Text style={[styles.label, { color: C.textMuted, marginBottom: 0 }]}>{t("ticketTypes.active")}</Text>
              <Switch value={form.isActive} onValueChange={v => setForm(f => ({ ...f, isActive: v }))} trackColor={{ true: C.primary }} />
            </View>

            {days.length > 0 && (
              <>
                <Text style={[styles.label, { color: C.textMuted }]}>{t("ticketTypes.validDays")}</Text>
                <View style={styles.daysGrid}>
                  {days.map(day => {
                    const selected = form.selectedDayIds.includes(day.id);
                    return (
                      <Pressable
                        key={day.id}
                        onPress={() => toggleDay(day.id)}
                        style={[styles.dayChip, { backgroundColor: selected ? C.primary : C.inputBg, borderColor: selected ? C.primary : C.border }]}
                      >
                        <Text style={[styles.dayChipText, { color: selected ? "#fff" : C.textMuted }]}>
                          {day.label ?? day.date}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}

            <Button title={saving ? t("common.saving") : t("common.save")} onPress={handleSave} disabled={saving} style={{ marginTop: 8, marginBottom: 32 }} />
          </ScrollView>
        </View>
      </Modal>

      {/* Pricing Stages Modal */}
      <Modal visible={!!stageTypeId} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeStages}>
        <View style={[styles.modalContainer, { backgroundColor: C.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: C.border }]}>
            <Pressable onPress={closeStages}>
              <Feather name="x" size={22} color={C.textMuted} />
            </Pressable>
            <Text style={[styles.modalTitle, { color: C.text }]}>{t("ticketTypes.pricingStages")}</Text>
            <Pressable onPress={openStageCreate}>
              <Feather name="plus" size={22} color={C.primary} />
            </Pressable>
          </View>

          {stagesLoading ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={C.primary} />
          ) : (
            <ScrollView style={styles.modalBody}>
              {stages.length === 0 && <Text style={[styles.emptyStages, { color: C.textMuted }]}>{t("ticketTypes.noStages")}</Text>}
              {stages.map(s => (
                <Card key={s.id} style={styles.stageCard}>
                  <View style={styles.stageRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.stageName, { color: C.text }]}>{s.name}</Text>
                      <Text style={[styles.stagePrice, { color: C.primary }]}>{fmt(s.price)}</Text>
                      <Text style={[styles.stageDates, { color: C.textMuted }]}>
                        {new Date(s.startsAt).toLocaleDateString()} – {new Date(s.endsAt).toLocaleDateString()}
                      </Text>
                    </View>
                    <View style={styles.stageActions}>
                      <Pressable onPress={() => openStageEdit(s)} style={styles.actionBtn}>
                        <Feather name="edit-2" size={15} color={C.textMuted} />
                      </Pressable>
                      <Pressable onPress={() => handleDeleteStage(s.id)} style={styles.actionBtn}>
                        <Feather name="trash-2" size={15} color={Colors.danger} />
                      </Pressable>
                    </View>
                  </View>
                </Card>
              ))}
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* Stage Form Modal */}
      <Modal visible={showStageForm} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowStageForm(false)}>
        <View style={[styles.modalContainer, { backgroundColor: C.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: C.border }]}>
            <Pressable onPress={() => setShowStageForm(false)}>
              <Feather name="x" size={22} color={C.textMuted} />
            </Pressable>
            <Text style={[styles.modalTitle, { color: C.text }]}>
              {editingStage ? t("ticketTypes.editStage") : t("ticketTypes.addStage")}
            </Text>
            <View style={{ width: 22 }} />
          </View>
          <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
            <Text style={[styles.label, { color: C.textMuted }]}>{t("ticketTypes.stageName")} *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: C.inputBg, color: C.text, borderColor: C.border }]}
              value={stageForm.name}
              onChangeText={v => setStageForm(f => ({ ...f, name: v }))}
              placeholder={t("ticketTypes.stageNamePlaceholder")}
              placeholderTextColor={C.textMuted}
            />
            <Text style={[styles.label, { color: C.textMuted }]}>{t("ticketTypes.price")} *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: C.inputBg, color: C.text, borderColor: C.border }]}
              value={stageForm.price}
              onChangeText={v => setStageForm(f => ({ ...f, price: v }))}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={C.textMuted}
            />
            <Text style={[styles.label, { color: C.textMuted }]}>{t("ticketTypes.stageStart")} *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: C.inputBg, color: C.text, borderColor: C.border }]}
              value={stageForm.startsAt}
              onChangeText={v => setStageForm(f => ({ ...f, startsAt: v }))}
              placeholder="YYYY-MM-DDTHH:MM"
              placeholderTextColor={C.textMuted}
            />
            <Text style={[styles.label, { color: C.textMuted }]}>{t("ticketTypes.stageEnd")} *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: C.inputBg, color: C.text, borderColor: C.border }]}
              value={stageForm.endsAt}
              onChangeText={v => setStageForm(f => ({ ...f, endsAt: v }))}
              placeholder="YYYY-MM-DDTHH:MM"
              placeholderTextColor={C.textMuted}
            />
            <Button title={stageSaving ? t("common.saving") : t("common.save")} onPress={handleStageSave} disabled={stageSaving} style={{ marginTop: 8, marginBottom: 32 }} />
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
  typeCard: { marginHorizontal: 0 },
  typeRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  typeMeta: { flex: 1, gap: 2 },
  typeNameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  typeName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  activeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  activeBadgeText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  typePrice: { fontSize: 17, fontFamily: "Inter_700Bold" },
  typeSub: { fontSize: 13, fontFamily: "Inter_400Regular" },
  typeActions: { flexDirection: "row", gap: 4 },
  actionBtn: { padding: 8 },
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  modalTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  modalBody: { padding: 20 },
  label: { fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, fontFamily: "Inter_400Regular" },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 16 },
  daysGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  dayChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  dayChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  stageCard: { marginHorizontal: 0, marginBottom: 8 },
  stageRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  stageName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  stagePrice: { fontSize: 16, fontFamily: "Inter_700Bold" },
  stageDates: { fontSize: 12, fontFamily: "Inter_400Regular" },
  stageActions: { flexDirection: "row", gap: 4 },
  emptyStages: { textAlign: "center", marginTop: 40, fontSize: 14, fontFamily: "Inter_400Regular" },
});
