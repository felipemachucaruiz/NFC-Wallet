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
import { useListEvents, useCreateEvent } from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Input } from "@/components/ui/Input";
import { Loading } from "@/components/ui/Loading";
import { formatDate } from "@/utils/format";

const STATUS_BADGE: Record<string, "success" | "warning" | "muted" | "info"> = {
  active: "success",
  upcoming: "info",
  completed: "muted",
  cancelled: "danger" as unknown as "muted",
};

export default function EventsScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const [showCreate, setShowCreate] = useState(false);
  const [eventName, setEventName] = useState("");
  const [venue, setVenue] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const { data, isLoading, refetch } = useListEvents();
  const events = (data as {
    events?: Array<{
      id: string;
      name: string;
      venue: string | null;
      status: string;
      startsAt: string;
      endsAt: string;
    }>
  } | undefined)?.events ?? [];

  const createEvent = useCreateEvent();

  const handleCreate = async () => {
    if (!eventName.trim() || !startDate.trim() || !endDate.trim()) {
      Alert.alert(t("common.error"), "Nombre, fecha inicio y fin son requeridos"); return;
    }
    try {
      await createEvent.mutateAsync({
        name: eventName.trim(),
        venue: venue.trim() || undefined,
        startsAt: new Date(startDate).toISOString(),
        endsAt: new Date(endDate).toISOString(),
      } as Parameters<typeof createEvent.mutateAsync>[0]);
      setShowCreate(false);
      setEventName(""); setVenue(""); setStartDate(""); setEndDate("");
      refetch();
    } catch {
      Alert.alert(t("common.error"), t("common.unknownError"));
    }
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
                {item.venue ? <Text style={[styles.venue, { color: C.textSecondary }]}>{item.venue}</Text> : null}
                <Text style={[styles.dates, { color: C.textMuted }]}>{formatDate(item.startsAt)} → {formatDate(item.endsAt)}</Text>
              </View>
              <Badge label={item.status} variant={STATUS_BADGE[item.status] ?? "muted"} size="sm" />
            </View>
          </Card>
        )}
      />

      <Modal visible={showCreate} transparent animationType="slide">
        <View style={[styles.overlay, { backgroundColor: C.overlay }]}>
          <ScrollView style={[styles.sheet, { backgroundColor: C.card }]} contentContainerStyle={{ gap: 16, padding: 24 }}>
            <Text style={[styles.sheetTitle, { color: C.text }]}>{t("admin.createEvent")}</Text>
            <Input label="Nombre del evento" value={eventName} onChangeText={setEventName} placeholder="Ej. Festival Verano 2026" />
            <Input label="Lugar / Venue" value={venue} onChangeText={setVenue} placeholder="Ej. Parque Simón Bolívar" />
            <Input label="Fecha inicio (YYYY-MM-DD)" value={startDate} onChangeText={setStartDate} placeholder="2026-06-01" />
            <Input label="Fecha fin (YYYY-MM-DD)" value={endDate} onChangeText={setEndDate} placeholder="2026-06-03" />
            <View style={styles.sheetActions}>
              <Button title={t("common.cancel")} onPress={() => setShowCreate(false)} variant="secondary" />
              <Button title={t("admin.createEvent")} onPress={handleCreate} variant="primary" loading={createEvent.isPending} />
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
  overlay: { flex: 1, justifyContent: "flex-end" },
  sheet: { maxHeight: "80%", borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  sheetTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  sheetActions: { flexDirection: "row", gap: 12 },
});
