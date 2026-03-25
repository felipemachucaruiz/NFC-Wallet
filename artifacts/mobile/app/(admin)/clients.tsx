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
  promoterCompanyId: string | null;
};

type EventItem = { id: string; name: string; status: string };

type PromoterCompany = {
  id: string;
  companyName: string;
  nit: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
};

const emptyCompanyForm = () => ({ companyName: "", nit: "", address: "", phone: "", email: "" });

export default function ClientsScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { token } = useAuth();

  const [activeView, setActiveView] = useState<"clients" | "companies">("clients");

  // ─── Clients ──────────────────────────────────────────────────────────────
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [editEventId, setEditEventId] = useState<string>("");
  const [editClientCompanyId, setEditClientCompanyId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", username: "", password: "", eventId: "" });

  // ─── Companies ─────────────────────────────────────────────────────────────
  const [companies, setCompanies] = useState<PromoterCompany[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [showCreateCompany, setShowCreateCompany] = useState(false);
  const [editCompany, setEditCompany] = useState<PromoterCompany | null>(null);
  const [companyForm, setCompanyForm] = useState(emptyCompanyForm());
  const [savingCompany, setSavingCompany] = useState(false);

  const { data: eventsData, refetch: refetchEvents } = useListEvents();
  const events: EventItem[] = (eventsData as { events?: EventItem[] } | undefined)?.events ?? [];

  const eventName = (id: string | null) =>
    id ? (events.find((e) => e.id === id)?.name ?? id) : t("admin.noEventAssigned");

  const companyName = (id: string | null) =>
    id ? (companies.find((c) => c.id === id)?.companyName ?? id) : "—";

  const fetchClients = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${getApiBase()}/api/users`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json() as { users: Client[] };
      setClients((data.users ?? []).filter((u) => u.role === "event_admin"));
    } catch { setClients([]); }
    setLoading(false);
  }, [token]);

  const fetchCompanies = useCallback(async () => {
    if (!token) return;
    setLoadingCompanies(true);
    try {
      const res = await fetch(`${getApiBase()}/api/promoter-companies`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json() as { companies: PromoterCompany[] };
      setCompanies(data.companies ?? []);
    } catch { setCompanies([]); }
    setLoadingCompanies(false);
  }, [token]);

  useEffect(() => { fetchClients(); fetchCompanies(); }, [fetchClients, fetchCompanies]);

  const resetForm = () => setForm({ firstName: "", lastName: "", email: "", username: "", password: "", eventId: "" });

  // ─── Client CRUD ────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!form.firstName.trim()) { Alert.alert(t("common.error"), t("admin.clientNameRequired")); return; }
    if (!form.email.trim() && !form.username.trim()) { Alert.alert(t("common.error"), t("admin.emailOrUsernameRequired")); return; }
    if (form.password.length < 6) { Alert.alert(t("common.error"), t("admin.passwordMinLength")); return; }
    setCreating(true);
    try {
      const body: Record<string, string> = {
        firstName: form.firstName.trim(), password: form.password, role: "event_admin",
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
      if (!res.ok) { Alert.alert(t("common.error"), data.error ?? t("common.unknownError")); }
      else { setShowCreate(false); resetForm(); fetchClients(); }
    } catch { Alert.alert(t("common.error"), t("common.unknownError")); }
    setCreating(false);
  };

  const openEdit = (client: Client) => {
    setEditClient(client);
    setEditEventId(client.eventId ?? "");
    setEditClientCompanyId(client.promoterCompanyId ?? "");
  };

  const handleSaveEdit = async () => {
    if (!editClient) return;
    setSaving(true);
    try {
      await Promise.all([
        fetch(`${getApiBase()}/api/users/${editClient.id}/event`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ eventId: editEventId || null }),
        }),
        fetch(`${getApiBase()}/api/users/${editClient.id}/promoter-company`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ promoterCompanyId: editClientCompanyId || null }),
        }),
      ]);
      setEditClient(null);
      fetchClients();
      refetchEvents();
    } catch { Alert.alert(t("common.error"), t("common.unknownError")); }
    setSaving(false);
  };

  // ─── Company CRUD ───────────────────────────────────────────────────────────
  const openCreateCompany = () => { setCompanyForm(emptyCompanyForm()); setShowCreateCompany(true); };
  const openEditCompany = (c: PromoterCompany) => {
    setEditCompany(c);
    setCompanyForm({ companyName: c.companyName, nit: c.nit ?? "", address: c.address ?? "", phone: c.phone ?? "", email: c.email ?? "" });
  };

  const handleSaveCompany = async () => {
    if (!companyForm.companyName.trim()) { Alert.alert(t("common.error"), t("promoterCompany.companyNameRequired")); return; }
    setSavingCompany(true);
    const body = {
      companyName: companyForm.companyName.trim(),
      nit: companyForm.nit.trim() || undefined,
      address: companyForm.address.trim() || undefined,
      phone: companyForm.phone.trim() || undefined,
      email: companyForm.email.trim() || undefined,
    };
    try {
      const isEdit = !!editCompany;
      const url = isEdit ? `${getApiBase()}/api/promoter-companies/${editCompany!.id}` : `${getApiBase()}/api/promoter-companies`;
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        Alert.alert(t("common.success"), t("promoterCompany.companySaved"));
        setShowCreateCompany(false);
        setEditCompany(null);
        fetchCompanies();
      } else {
        const err = await res.json().catch(() => ({})) as { error?: string };
        Alert.alert(t("common.error"), err.error ?? t("common.unknownError"));
      }
    } catch { Alert.alert(t("common.error"), t("common.unknownError")); }
    setSavingCompany(false);
  };

  const handleDeleteCompany = (c: PromoterCompany) => {
    Alert.alert(t("common.confirm"), t("promoterCompany.deleteConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: async () => {
          try {
            await fetch(`${getApiBase()}/api/promoter-companies/${c.id}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${token}` },
            });
            fetchCompanies();
          } catch { Alert.alert(t("common.error"), t("common.unknownError")); }
        },
      },
    ]);
  };

  if (loading && clients.length === 0) return <Loading label={t("common.loading")} />;

  const paddingTop = isWeb ? 67 : insets.top + 16;
  const paddingBottom = isWeb ? 34 : insets.bottom + 100;

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      {activeView === "clients" ? (
        <FlatList
          data={clients}
          keyExtractor={(item) => item.id}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingTop, paddingBottom, paddingHorizontal: 20, gap: 12 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { fetchClients(); fetchCompanies(); }} tintColor={C.primary} />}
          ListHeaderComponent={() => (
            <View style={{ gap: 14 }}>
              <View style={styles.header}>
                <View>
                  <Text style={[styles.title, { color: C.text }]}>{t("admin.clients")}</Text>
                  <Text style={[styles.subtitle, { color: C.textSecondary }]}>{t("admin.clientsSubtitle", { count: clients.length })}</Text>
                </View>
                <Button title={`+ ${t("admin.createClient")}`} onPress={() => setShowCreate(true)} variant="primary" size="sm" />
              </View>
              <View style={[styles.tabRow, { backgroundColor: C.inputBg }]}>
                <Pressable onPress={() => setActiveView("clients")} style={[styles.tabBtn, { backgroundColor: C.card }]}>
                  <Feather name="users" size={13} color={C.primary} />
                  <Text style={[styles.tabBtnText, { color: C.primary }]}>{t("admin.clientsTab")}</Text>
                </Pressable>
                <Pressable onPress={() => setActiveView("companies")} style={styles.tabBtn}>
                  <Feather name="briefcase" size={13} color={C.textSecondary} />
                  <Text style={[styles.tabBtnText, { color: C.textSecondary }]}>{t("admin.companiesTab")}</Text>
                </Pressable>
              </View>
            </View>
          )}
          ListEmptyComponent={() => (
            <Empty icon="users" title={t("admin.noClients")} actionLabel={t("admin.createClient")} onAction={() => setShowCreate(true)} />
          )}
          renderItem={({ item }) => {
            const displayName = [item.firstName, item.lastName].filter(Boolean).join(" ") || item.username || item.email || item.id;
            const identifier = item.email ?? item.username ?? "—";
            const ev = item.eventId ? events.find((e) => e.id === item.eventId) : null;
            const company = item.promoterCompanyId ? companies.find((c) => c.id === item.promoterCompanyId) : null;
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
                      {company && (
                        <View style={styles.rowTag}>
                          <Feather name="briefcase" size={12} color={C.textSecondary} />
                          <Text style={[styles.tagText, { color: C.textSecondary }]}>{company.companyName}</Text>
                        </View>
                      )}
                      <View style={styles.rowTag}>
                        <Feather name="calendar" size={12} color={C.textSecondary} />
                        <Text style={[styles.tagText, { color: C.textSecondary }]}>{eventName(item.eventId)}</Text>
                      </View>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 8 }}>
                      <Badge label={ev ? t(`admin.eventStatus.${ev.status}`, { defaultValue: ev.status }) : t("admin.noEventAssigned")} variant={ev ? (ev.status === "active" ? "success" : ev.status === "upcoming" ? "info" : "muted") : "muted"} size="sm" />
                      <Feather name="edit-2" size={13} color={C.textMuted} />
                    </View>
                  </View>
                </Card>
              </Pressable>
            );
          }}
        />
      ) : (
        <FlatList
          data={companies}
          keyExtractor={(item) => item.id}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingTop, paddingBottom, paddingHorizontal: 20, gap: 12 }}
          refreshControl={<RefreshControl refreshing={loadingCompanies} onRefresh={fetchCompanies} tintColor={C.primary} />}
          ListHeaderComponent={() => (
            <View style={{ gap: 14 }}>
              <View style={styles.header}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.title, { color: C.text }]} numberOfLines={1} adjustsFontSizeToFit>{t("promoterCompany.title")}</Text>
                  <Text style={[styles.subtitle, { color: C.textSecondary }]}>{companies.length} {t("promoterCompany.company").toLowerCase()}s</Text>
                </View>
                <Button title={`+ ${t("promoterCompany.addCompany")}`} onPress={openCreateCompany} variant="primary" size="sm" />
              </View>
              <View style={[styles.tabRow, { backgroundColor: C.inputBg }]}>
                <Pressable onPress={() => setActiveView("clients")} style={styles.tabBtn}>
                  <Feather name="users" size={13} color={C.textSecondary} />
                  <Text style={[styles.tabBtnText, { color: C.textSecondary }]}>{t("admin.clientsTab")}</Text>
                </Pressable>
                <Pressable onPress={() => setActiveView("companies")} style={[styles.tabBtn, { backgroundColor: C.card }]}>
                  <Feather name="briefcase" size={13} color={C.primary} />
                  <Text style={[styles.tabBtnText, { color: C.primary }]}>{t("admin.companiesTab")}</Text>
                </Pressable>
              </View>
            </View>
          )}
          ListEmptyComponent={() => (
            <Empty icon="briefcase" title={t("promoterCompany.noCompanies")} actionLabel={t("promoterCompany.addCompany")} onAction={openCreateCompany} />
          )}
          renderItem={({ item }) => (
            <Card>
              <View style={styles.clientRow}>
                <View style={[styles.avatar, { backgroundColor: C.primaryLight }]}>
                  <Feather name="briefcase" size={20} color={C.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.clientName, { color: C.text }]}>{item.companyName}</Text>
                  {item.nit ? <Text style={[styles.clientId, { color: C.textMuted }]}>NIT: {item.nit}</Text> : null}
                  {item.address ? (
                    <View style={styles.rowTag}>
                      <Feather name="map-pin" size={12} color={C.textSecondary} />
                      <Text style={[styles.tagText, { color: C.textSecondary }]}>{item.address}</Text>
                    </View>
                  ) : null}
                  {item.phone ? (
                    <View style={styles.rowTag}>
                      <Feather name="phone" size={12} color={C.textSecondary} />
                      <Text style={[styles.tagText, { color: C.textSecondary }]}>{item.phone}</Text>
                    </View>
                  ) : null}
                  {item.email ? (
                    <View style={styles.rowTag}>
                      <Feather name="mail" size={12} color={C.textSecondary} />
                      <Text style={[styles.tagText, { color: C.textSecondary }]}>{item.email}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={{ gap: 10 }}>
                  <Pressable onPress={() => openEditCompany(item)} style={[styles.iconBtn, { backgroundColor: C.inputBg }]}>
                    <Feather name="edit-2" size={15} color={C.primary} />
                  </Pressable>
                  <Pressable onPress={() => handleDeleteCompany(item)} style={[styles.iconBtn, { backgroundColor: C.dangerLight }]}>
                    <Feather name="trash-2" size={15} color={C.danger} />
                  </Pressable>
                </View>
              </View>
            </Card>
          )}
        />
      )}

      {/* ── Edit client modal ── */}
      <Modal visible={!!editClient} transparent animationType="slide">
        <View style={[styles.overlay, { backgroundColor: C.overlay }]}>
          <ScrollView style={[styles.sheet, { backgroundColor: C.card }]} contentContainerStyle={{ gap: 16, padding: 24, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: C.text }]}>{t("admin.editClient")}</Text>
              <Pressable onPress={() => setEditClient(null)}><Feather name="x" size={22} color={C.textSecondary} /></Pressable>
            </View>
            {editClient && (
              <View style={[styles.clientPreview, { backgroundColor: C.inputBg, borderRadius: 12 }]}>
                <Text style={[styles.clientName, { color: C.text }]}>{[editClient.firstName, editClient.lastName].filter(Boolean).join(" ") || editClient.username || editClient.email}</Text>
                <Text style={[styles.clientId, { color: C.textMuted }]}>{editClient.email ?? editClient.username}</Text>
              </View>
            )}

            {/* Company assignment */}
            <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>{t("admin.promoterCompany")}</Text>
            <Pressable onPress={() => setEditClientCompanyId("")} style={[styles.eventOption, { backgroundColor: !editClientCompanyId ? C.primary + "18" : C.inputBg, borderColor: !editClientCompanyId ? C.primary : C.border }]}>
              <Feather name="slash" size={16} color={!editClientCompanyId ? C.primary : C.textMuted} />
              <Text style={[styles.eventOptionText, { color: !editClientCompanyId ? C.primary : C.textSecondary, flex: 1 }]}>—</Text>
              {!editClientCompanyId && <Feather name="check" size={16} color={C.primary} />}
            </Pressable>
            {companies.map((c) => (
              <Pressable key={c.id} onPress={() => setEditClientCompanyId(c.id)} style={[styles.eventOption, { backgroundColor: editClientCompanyId === c.id ? C.primary + "18" : C.inputBg, borderColor: editClientCompanyId === c.id ? C.primary : C.border }]}>
                <Feather name="briefcase" size={16} color={editClientCompanyId === c.id ? C.primary : C.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.eventOptionText, { color: editClientCompanyId === c.id ? C.primary : C.text }]}>{c.companyName}</Text>
                  {c.nit ? <Text style={[styles.eventOptionSub, { color: C.textMuted }]}>NIT: {c.nit}</Text> : null}
                </View>
                {editClientCompanyId === c.id && <Feather name="check" size={16} color={C.primary} />}
              </Pressable>
            ))}

            {/* Event assignment */}
            <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>{t("admin.assignToEvent")}</Text>
            <Pressable onPress={() => setEditEventId("")} style={[styles.eventOption, { backgroundColor: !editEventId ? C.primary + "18" : C.inputBg, borderColor: !editEventId ? C.primary : C.border }]}>
              <Feather name="slash" size={16} color={!editEventId ? C.primary : C.textMuted} />
              <Text style={[styles.eventOptionText, { color: !editEventId ? C.primary : C.textSecondary }]}>{t("admin.noEventAssigned")}</Text>
              {!editEventId && <Feather name="check" size={16} color={C.primary} />}
            </Pressable>
            {events.map((ev) => (
              <Pressable key={ev.id} onPress={() => setEditEventId(ev.id)} style={[styles.eventOption, { backgroundColor: editEventId === ev.id ? C.primary + "18" : C.inputBg, borderColor: editEventId === ev.id ? C.primary : C.border }]}>
                <Feather name="calendar" size={16} color={editEventId === ev.id ? C.primary : C.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.eventOptionText, { color: editEventId === ev.id ? C.primary : C.text }]}>{ev.name}</Text>
                  <Text style={[styles.eventOptionSub, { color: C.textMuted }]}>{t(`admin.eventStatus.${ev.status}`, { defaultValue: ev.status })}</Text>
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

      {/* ── Create client modal ── */}
      <Modal visible={showCreate} transparent animationType="slide">
        <View style={[styles.overlay, { backgroundColor: C.overlay }]}>
          <ScrollView style={[styles.sheet, { backgroundColor: C.card }]} contentContainerStyle={{ gap: 16, padding: 24, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <Text style={[styles.sheetTitle, { color: C.text }]}>{t("admin.createClient")}</Text>
            <Text style={[styles.sheetHint, { color: C.textSecondary }]}>{t("admin.createClientHint")}</Text>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Input label={t("admin.firstName")} value={form.firstName} onChangeText={(v) => setForm((f) => ({ ...f, firstName: v }))} placeholder="Ana" autoCapitalize="words" />
              </View>
              <View style={{ flex: 1 }}>
                <Input label={t("admin.lastName")} value={form.lastName} onChangeText={(v) => setForm((f) => ({ ...f, lastName: v }))} placeholder="García" autoCapitalize="words" />
              </View>
            </View>
            <Input label={t("admin.clientEmail")} value={form.email} onChangeText={(v) => setForm((f) => ({ ...f, email: v }))} placeholder="ana@festivalapp.com" keyboardType="email-address" autoCapitalize="none" />
            <Input label={t("admin.clientUsername")} value={form.username} onChangeText={(v) => setForm((f) => ({ ...f, username: v }))} placeholder={t("admin.clientUsernamePlaceholder")} autoCapitalize="none" />
            <Input label={t("admin.clientPassword")} value={form.password} onChangeText={(v) => setForm((f) => ({ ...f, password: v }))} placeholder={t("admin.passwordMinLengthHint")} secureTextEntry />
            <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>{t("admin.assignToEvent")}</Text>
            <Pressable onPress={() => setForm((f) => ({ ...f, eventId: "" }))} style={[styles.eventOption, { backgroundColor: !form.eventId ? C.primary + "18" : C.inputBg, borderColor: !form.eventId ? C.primary : C.border }]}>
              <Feather name="slash" size={16} color={!form.eventId ? C.primary : C.textMuted} />
              <Text style={[styles.eventOptionText, { color: !form.eventId ? C.primary : C.textSecondary }]}>{t("admin.noEventYet")}</Text>
              {!form.eventId && <Feather name="check" size={16} color={C.primary} />}
            </Pressable>
            {events.map((ev) => (
              <Pressable key={ev.id} onPress={() => setForm((f) => ({ ...f, eventId: ev.id }))} style={[styles.eventOption, { backgroundColor: form.eventId === ev.id ? C.primary + "18" : C.inputBg, borderColor: form.eventId === ev.id ? C.primary : C.border }]}>
                <Feather name="calendar" size={16} color={form.eventId === ev.id ? C.primary : C.textMuted} />
                <Text style={[styles.eventOptionText, { color: form.eventId === ev.id ? C.primary : C.text, flex: 1 }]}>{ev.name}</Text>
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

      {/* ── Company create/edit modal ── */}
      <Modal visible={showCreateCompany || !!editCompany} transparent animationType="slide">
        <View style={[styles.overlay, { backgroundColor: C.overlay }]}>
          <ScrollView style={[styles.sheet, { backgroundColor: C.card }]} contentContainerStyle={{ gap: 16, padding: 24, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: C.text }]}>
                {editCompany ? t("promoterCompany.editCompany") : t("promoterCompany.addCompany")}
              </Text>
              <Pressable onPress={() => { setShowCreateCompany(false); setEditCompany(null); }}>
                <Feather name="x" size={22} color={C.textSecondary} />
              </Pressable>
            </View>
            <Input label={t("promoterCompany.companyName")} value={companyForm.companyName} onChangeText={(v) => setCompanyForm((f) => ({ ...f, companyName: v }))} placeholder="Festival S.A.S." />
            <Input label={t("promoterCompany.nit")} value={companyForm.nit} onChangeText={(v) => setCompanyForm((f) => ({ ...f, nit: v }))} placeholder="900.123.456-7" keyboardType="numeric" />
            <Input label={t("promoterCompany.address")} value={companyForm.address} onChangeText={(v) => setCompanyForm((f) => ({ ...f, address: v }))} placeholder="Calle 93 # 14-20, Bogotá" />
            <Input label={t("promoterCompany.phone")} value={companyForm.phone} onChangeText={(v) => setCompanyForm((f) => ({ ...f, phone: v }))} placeholder="+57 601 000 0000" keyboardType="phone-pad" />
            <Input label={t("promoterCompany.email")} value={companyForm.email} onChangeText={(v) => setCompanyForm((f) => ({ ...f, email: v }))} placeholder="contacto@festival.com.co" keyboardType="email-address" autoCapitalize="none" />
            <View style={styles.sheetActions}>
              <Button title={t("common.cancel")} onPress={() => { setShowCreateCompany(false); setEditCompany(null); }} variant="secondary" />
              <Button title={t("common.save")} onPress={handleSaveCompany} variant="primary" loading={savingCompany} />
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  tabRow: { flexDirection: "row", borderRadius: 12, padding: 3, gap: 2 },
  tabBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, borderRadius: 10 },
  tabBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  clientRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  clientName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  clientId: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  rowTag: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  tagText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  iconBtn: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
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
