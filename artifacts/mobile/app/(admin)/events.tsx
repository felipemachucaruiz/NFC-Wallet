import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
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

const getApiBase = (): string => `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

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
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminFirstName, setAdminFirstName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const { data, isLoading, refetch } = useListEvents();
  const events = (data as {
    events?: Array<{
      id: string;
      name: string;
      venueAddress: string | null;
      status: string;
      startsAt: string;
      endsAt: string;
      platformCommissionRate?: string | number;
    }>
  } | undefined)?.events ?? [];

  const resetForm = () => {
    setEventName(""); setVenue(""); setStartDate(null); setEndDate(null);
    setPlatformCommission("0"); setAdminEmail(""); setAdminPassword(""); setAdminFirstName("");
  };

  const handleCreate = async () => {
    if (!eventName.trim() || !startDate || !endDate) {
      Alert.alert(t("common.error"), t("admin.eventFieldsRequired")); return;
    }
    if (adminEmail && !adminPassword) {
      Alert.alert(t("common.error"), t("auth.passwordPlaceholder")); return;
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

      if (adminEmail.trim()) {
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

      if (res.ok) {
        setShowCreate(false);
        resetForm();
        refetch();
      } else {
        const err = await res.json().catch(() => ({})) as { error?: string };
        Alert.alert(t("common.error"), err.error ?? t("common.unknownError"));
      }
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
              <Badge label={t(`admin.eventStatus.${item.status}`, { defaultValue: item.status })} variant={STATUS_BADGE[item.status] ?? "muted"} size="sm" />
            </View>
          </Card>
        )}
      />

      <Modal visible={showCreate} transparent animationType="slide">
        <View style={[styles.overlay, { backgroundColor: C.overlay }]}>
          <ScrollView style={[styles.sheet, { backgroundColor: C.card }]} contentContainerStyle={{ gap: 16, padding: 24 }}>
            <Text style={[styles.sheetTitle, { color: C.text }]}>{t("admin.createEvent")}</Text>
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
                  Alert.alert(t("common.error"), t("admin.endDateAfterStart"));
                  return;
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

            <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>{t("eventAdmin.eventAdminSection")}</Text>
            <Text style={[styles.sectionHint, { color: C.textMuted }]}>{t("eventAdmin.eventAdminOptional")}</Text>
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
  sheet: { maxHeight: "90%", borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  sheetTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  sectionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8 },
  sectionHint: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: -8 },
  sheetActions: { flexDirection: "row", gap: 12 },
});
