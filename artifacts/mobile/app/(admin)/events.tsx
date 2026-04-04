import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import React, { useState, useCallback, useEffect } from "react";
import { FlatList, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useListEvents } from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { useAlert } from "@/components/CustomAlert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { Empty } from "@/components/ui/Empty";
import { Input } from "@/components/ui/Input";
import { Loading } from "@/components/ui/Loading";
import { formatDate } from "@/utils/format";
import { useAuth } from "@/contexts/AuthContext";
import { API_BASE_URL } from "@/constants/domain";

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

const getApiBase = (): string => API_BASE_URL;

type OrganizerMode = "none" | "existing" | "new";

type Client = {
  id: string;
  email: string | null;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  eventId: string | null;
};

type PromoterCompany = {
  id: string;
  companyName: string;
  nit: string | null;
};

type NfcChipType = "ntag_21x" | "mifare_classic";

type EventItem = {
  id: string;
  name: string;
  venueAddress: string | null;
  active?: boolean;
  startsAt: string;
  endsAt: string;
  platformCommissionRate?: string | number;
  capacity?: number | null;
  promoterCompanyId?: string | null;
  promoterCompanyName?: string | null;
  pulepId?: string | null;
  nfcChipType?: NfcChipType | null;
};

export default function EventsScreen() {
  const { t } = useTranslation();
  const { show: showAlert } = useAlert();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { token } = useAuth();

  // Create modal
  const [showCreate, setShowCreate] = useState(false);

  // Edit modal
  const [editingEvent, setEditingEvent] = useState<EventItem | null>(null);
  const [editActive, setEditActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Shared form fields
  const [eventName, setEventName] = useState("");
  const [venue, setVenue] = useState("");
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [platformCommission, setPlatformCommission] = useState("0");
  const [capacity, setCapacity] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [pulepId, setPulepId] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Organizer section (create only)
  const [nfcChipType, setNfcChipType] = useState<NfcChipType>("ntag_21x");

  const [organizerMode, setOrganizerMode] = useState<OrganizerMode>("none");
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [clientSearch, setClientSearch] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminFirstName, setAdminFirstName] = useState("");

  // Clients + companies lists
  const [clients, setClients] = useState<Client[]>([]);
  const [companies, setCompanies] = useState<PromoterCompany[]>([]);
  const [allCompanies, setAllCompanies] = useState<PromoterCompany[]>([]);

  useEffect(() => {
    if (!token) return;
    fetch(`${getApiBase()}/api/promoter-companies`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d: { companies?: PromoterCompany[] }) => setAllCompanies(d.companies ?? []))
      .catch(() => {});
  }, [token]);

  const { data, isLoading, refetch } = useListEvents();
  const events = (data as { events?: EventItem[] } | undefined)?.events ?? [];

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

  const fetchCompanies = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${getApiBase()}/api/promoter-companies`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json() as { companies: PromoterCompany[] };
      setCompanies(data.companies ?? []);
    } catch {
      setCompanies([]);
    }
  }, [token]);

  useEffect(() => {
    if (showCreate) {
      fetchClients();
      fetchCompanies();
    }
  }, [showCreate, fetchClients, fetchCompanies]);

  useEffect(() => {
    if (editingEvent) {
      fetchCompanies();
    }
  }, [editingEvent, fetchCompanies]);

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
    setPlatformCommission("0"); setCapacity(""); setSelectedCompanyId(""); setPulepId("");
    setAdminEmail(""); setAdminPassword(""); setAdminFirstName("");
    setOrganizerMode("none"); setSelectedClientId(""); setClientSearch("");
    setNfcChipType("ntag_21x");
  };

  const openEdit = (item: EventItem) => {
    setEventName(item.name);
    setVenue(item.venueAddress ?? "");
    setStartDate(item.startsAt ? new Date(item.startsAt) : null);
    setEndDate(item.endsAt ? new Date(item.endsAt) : null);
    setPlatformCommission(item.platformCommissionRate ? String(item.platformCommissionRate) : "0");
    setCapacity(item.capacity ? String(item.capacity) : "");
    setSelectedCompanyId(item.promoterCompanyId ?? "");
    setPulepId(item.pulepId ?? "");
    setEditActive(item.active !== false);
    setNfcChipType(item.nfcChipType ?? "ntag_21x");
    setEditingEvent(item);
  };

  const closeEdit = () => {
    setEditingEvent(null);
    resetForm();
  };

  const handleCreate = async () => {
    if (!eventName.trim() || !startDate || !endDate) {
      showAlert(t("common.error"), t("admin.eventFieldsRequired")); return;
    }
    if (!selectedCompanyId) {
      showAlert(t("common.error"), t("admin.promoterCompanyRequired")); return;
    }
    if (organizerMode === "new" && adminEmail && !adminPassword) {
      showAlert(t("common.error"), t("auth.passwordPlaceholder")); return;
    }
    if (organizerMode === "existing" && !selectedClientId) {
      showAlert(t("common.error"), t("admin.selectClientRequired")); return;
    }

    setIsCreating(true);
    try {
      const body: Record<string, unknown> = {
        name: eventName.trim(),
        venueAddress: venue.trim() || undefined,
        startsAt: startDate.toISOString(),
        endsAt: endDate.toISOString(),
        platformCommissionRate: platformCommission.trim() || "0",
        capacity: capacity.trim() ? parseInt(capacity.trim(), 10) : undefined,
        promoterCompanyId: selectedCompanyId,
        pulepId: pulepId.trim() || undefined,
        nfcChipType,
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
        showAlert(t("common.error"), err.error ?? t("common.unknownError"));
        setIsCreating(false);
        return;
      }

      const created = await res.json() as { id: string };
      const newEventId = created?.id;

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
      showAlert(t("common.error"), t("common.unknownError"));
    }
    setIsCreating(false);
  };

  const handleEdit = async () => {
    if (!editingEvent) return;
    if (!eventName.trim() || !startDate || !endDate) {
      showAlert(t("common.error"), t("admin.eventFieldsRequired")); return;
    }
    if (!selectedCompanyId) {
      showAlert(t("common.error"), t("admin.promoterCompanyRequired")); return;
    }

    setIsSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: eventName.trim(),
        venueAddress: venue.trim() || null,
        startsAt: startDate.toISOString(),
        endsAt: endDate.toISOString(),
        platformCommissionRate: platformCommission.trim() || "0",
        capacity: capacity.trim() ? parseInt(capacity.trim(), 10) : null,
        promoterCompanyId: selectedCompanyId,
        pulepId: pulepId.trim() || null,
        active: editActive,
        nfcChipType,
      };

      const res = await fetch(`${getApiBase()}/api/events/${editingEvent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        showAlert(t("common.error"), err.error ?? t("common.unknownError"));
        setIsSaving(false);
        return;
      }

      closeEdit();
      refetch();
    } catch {
      showAlert(t("common.error"), t("common.unknownError"));
    }
    setIsSaving(false);
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
        renderItem={({ item }) => {
          const companyName = item.promoterCompanyName
            ?? (item.promoterCompanyId ? allCompanies.find((c) => c.id === item.promoterCompanyId)?.companyName : null);
          const status = getEventStatus(item);
          return (
            <Card>
              <View style={styles.eventRow}>
                <View style={[styles.eventIcon, { backgroundColor: C.primaryLight }]}>
                  <Feather name="calendar" size={20} color={C.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.eventName, { color: C.text }]}>{item.name}</Text>
                  {companyName && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                      <Feather name="briefcase" size={11} color={C.textSecondary} />
                      <Text style={[styles.venue, { color: C.textSecondary }]}>{companyName}</Text>
                    </View>
                  )}
                  {item.venueAddress ? <Text style={[styles.venue, { color: C.textSecondary }]}>{item.venueAddress}</Text> : null}
                  <Text style={[styles.dates, { color: C.textMuted }]}>{formatDate(item.startsAt)} → {formatDate(item.endsAt)}</Text>
                  {item.capacity ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                      <Feather name="users" size={11} color={C.textSecondary} />
                      <Text style={[styles.dates, { color: C.textMuted }]}>{t("admin.capacity")}: {item.capacity.toLocaleString()}</Text>
                    </View>
                  ) : null}
                  {item.pulepId ? (
                    <Text style={[styles.commission, { color: C.textMuted }]}>PULEP: {item.pulepId}</Text>
                  ) : null}
                  {item.platformCommissionRate && parseFloat(String(item.platformCommissionRate)) > 0 ? (
                    <Text style={[styles.commission, { color: C.warning }]}>
                      {t("eventAdmin.platformCommission").replace(" (%)", "")}: {item.platformCommissionRate}%
                    </Text>
                  ) : null}
                </View>
                <View style={{ alignItems: "flex-end", gap: 8 }}>
                  <Badge label={t(`admin.eventStatus.${status}`)} variant={STATUS_BADGE[status] ?? "muted"} size="sm" />
                  <Pressable
                    onPress={() => openEdit(item)}
                    style={[styles.editBtn, { backgroundColor: C.inputBg, borderColor: C.border }]}
                    hitSlop={8}
                  >
                    <Feather name="edit-2" size={13} color={C.textSecondary} />
                    <Text style={[styles.editBtnText, { color: C.textSecondary }]}>{t("admin.editEvent")}</Text>
                  </Pressable>
                </View>
              </View>
            </Card>
          );
        }}
      />

      {/* ── CREATE MODAL ─────────────────────────────────────────────── */}
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

            <EventFormFields
              C={C}
              t={t}
              eventName={eventName} setEventName={setEventName}
              venue={venue} setVenue={setVenue}
              startDate={startDate} setStartDate={setStartDate}
              endDate={endDate} setEndDate={setEndDate}
              platformCommission={platformCommission} setPlatformCommission={setPlatformCommission}
              capacity={capacity} setCapacity={setCapacity}
              companies={companies} selectedCompanyId={selectedCompanyId} setSelectedCompanyId={setSelectedCompanyId}
              pulepId={pulepId} setPulepId={setPulepId}
              nfcChipType={nfcChipType} setNfcChipType={setNfcChipType}
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
                            <Feather name="user" size={14} color={isSelected ? "#0a0a0a" : C.textSecondary} />
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

      {/* ── EDIT MODAL ───────────────────────────────────────────────── */}
      <Modal visible={!!editingEvent} transparent animationType="slide">
        <View style={[styles.overlay, { backgroundColor: C.overlay }]}>
          <ScrollView
            style={[styles.sheet, { backgroundColor: C.card }]}
            contentContainerStyle={{ gap: 16, padding: 24, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: C.text }]}>{t("admin.editEvent")}</Text>
              <Pressable onPress={closeEdit}>
                <Feather name="x" size={22} color={C.textSecondary} />
              </Pressable>
            </View>

            {/* Active / Inactive toggle */}
            <View style={[styles.activeRow, { backgroundColor: C.inputBg, borderColor: C.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.activeLabel, { color: C.text }]}>
                  {editActive ? t("admin.eventActive") : t("admin.eventInactive")}
                </Text>
                <Text style={[styles.activeSub, { color: C.textMuted }]}>
                  {editActive ? t("admin.deactivateEvent") : t("admin.activateEvent")}
                </Text>
              </View>
              <Switch
                value={editActive}
                onValueChange={setEditActive}
                trackColor={{ false: C.border, true: C.primary + "80" }}
                thumbColor={editActive ? C.primary : C.textMuted}
              />
            </View>

            <EventFormFields
              C={C}
              t={t}
              eventName={eventName} setEventName={setEventName}
              venue={venue} setVenue={setVenue}
              startDate={startDate} setStartDate={setStartDate}
              endDate={endDate} setEndDate={setEndDate}
              platformCommission={platformCommission} setPlatformCommission={setPlatformCommission}
              capacity={capacity} setCapacity={setCapacity}
              companies={companies} selectedCompanyId={selectedCompanyId} setSelectedCompanyId={setSelectedCompanyId}
              pulepId={pulepId} setPulepId={setPulepId}
              nfcChipType={nfcChipType} setNfcChipType={setNfcChipType}
            />

            <View style={styles.sheetActions}>
              <Button title={t("common.cancel")} onPress={closeEdit} variant="secondary" />
              <Button title={t("admin.saveChanges")} onPress={handleEdit} variant="primary" loading={isSaving} />
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ── Shared form fields component ─────────────────────────────────────────────
type Colors = typeof import("@/constants/colors").default.light;

function EventFormFields({
  C, t,
  eventName, setEventName,
  venue, setVenue,
  startDate, setStartDate,
  endDate, setEndDate,
  platformCommission, setPlatformCommission,
  capacity, setCapacity,
  companies, selectedCompanyId, setSelectedCompanyId,
  pulepId, setPulepId,
  nfcChipType, setNfcChipType,
}: {
  C: Colors;
  t: (key: string) => string;
  eventName: string; setEventName: (v: string) => void;
  venue: string; setVenue: (v: string) => void;
  startDate: Date | null; setStartDate: (v: Date | null) => void;
  endDate: Date | null; setEndDate: (v: Date | null) => void;
  platformCommission: string; setPlatformCommission: (v: string) => void;
  capacity: string; setCapacity: (v: string) => void;
  companies: PromoterCompany[]; selectedCompanyId: string; setSelectedCompanyId: (v: string) => void;
  pulepId: string; setPulepId: (v: string) => void;
  nfcChipType: NfcChipType; setNfcChipType: (v: NfcChipType) => void;
}) {
  const { show: showAlert } = useAlert();
  return (
    <>
      <Input label={t("admin.eventName")} value={eventName} onChangeText={setEventName} placeholder={t("admin.eventNamePlaceholder")} />
      <Input label={t("admin.venue")} value={venue} onChangeText={setVenue} placeholder={t("admin.venuePlaceholder")} />
      <DatePickerInput label={t("admin.startDate")} value={startDate} onChange={setStartDate} placeholder={t("admin.startDatePlaceholder")} />
      <DatePickerInput
        label={t("admin.endDate")}
        value={endDate}
        onChange={(d) => {
          if (startDate && d < startDate) {
            showAlert("Error", t("admin.endDateAfterStart")); return;
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
      <Input
        label={t("admin.capacity")}
        value={capacity}
        onChangeText={setCapacity}
        keyboardType="number-pad"
        placeholder={t("admin.capacityPlaceholder")}
      />

      {/* Promoter Company */}
      <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>
        {t("admin.promoterCompany")} <Text style={{ color: C.danger }}>*</Text>
      </Text>
      {companies.length === 0 ? (
        <Text style={[styles.hintText, { color: C.textMuted }]}>{t("promoterCompany.noCompanies")}</Text>
      ) : companies.map((c) => (
        <Pressable
          key={c.id}
          onPress={() => setSelectedCompanyId(c.id)}
          style={[
            styles.clientOption,
            {
              backgroundColor: selectedCompanyId === c.id ? C.primary + "18" : C.inputBg,
              borderColor: selectedCompanyId === c.id ? C.primary : C.border,
            },
          ]}
        >
          <View style={[styles.clientAvatar, { backgroundColor: selectedCompanyId === c.id ? C.primary : C.border }]}>
            <Feather name="briefcase" size={14} color={selectedCompanyId === c.id ? "#0a0a0a" : C.textSecondary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.clientOptionName, { color: selectedCompanyId === c.id ? C.primary : C.text }]}>{c.companyName}</Text>
            {c.nit ? <Text style={[styles.clientOptionSub, { color: C.textMuted }]}>NIT: {c.nit}</Text> : null}
          </View>
          {selectedCompanyId === c.id && <Feather name="check-circle" size={18} color={C.primary} />}
        </Pressable>
      ))}

      {/* PULEP ID */}
      <Input
        label={t("admin.pulepId")}
        value={pulepId}
        onChangeText={setPulepId}
        placeholder={t("admin.pulepIdPlaceholder")}
        autoCapitalize="none"
      />

      {/* NFC Chip Type */}
      <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>
        {t("eventAdmin.nfcChipSettings")}
      </Text>
      {(["ntag_21x", "mifare_classic"] as NfcChipType[]).map((chip) => {
        const isSelected = nfcChipType === chip;
        const label = chip === "ntag_21x" ? t("eventAdmin.ntag21x") : t("eventAdmin.mifareClassic");
        const desc = chip === "ntag_21x" ? t("eventAdmin.ntag21xDesc") : t("eventAdmin.mifareClassicDesc");
        return (
          <Pressable
            key={chip}
            onPress={() => setNfcChipType(chip)}
            style={[
              styles.clientOption,
              {
                backgroundColor: isSelected ? C.primary + "18" : C.inputBg,
                borderColor: isSelected ? C.primary : C.border,
              },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.clientOptionName, { color: isSelected ? C.primary : C.text }]}>{label}</Text>
              <Text style={[styles.clientOptionSub, { color: C.textMuted }]}>{desc}</Text>
            </View>
            {isSelected && <Feather name="check-circle" size={18} color={C.primary} />}
          </Pressable>
        );
      })}
      {nfcChipType === "mifare_classic" && (
        <View style={[styles.clientOption, { backgroundColor: C.warning + "18", borderColor: C.warning }]}>
          <Feather name="alert-triangle" size={16} color={C.warning} />
          <Text style={[styles.clientOptionSub, { color: C.warning, flex: 1 }]}>
            {t("eventAdmin.mifareClassicWarning")}
          </Text>
        </View>
      )}
    </>
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
  editBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  editBtnText: { fontSize: 11, fontFamily: "Inter_500Medium" },
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
  activeRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 12, borderWidth: 1 },
  activeLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  activeSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
});
