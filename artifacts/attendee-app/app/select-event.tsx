import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { Button } from "@/components/ui/Button";
import { API_BASE_URL } from "@/constants/domain";
import { useAuth } from "@/contexts/AuthContext";
import { pinnedFetch } from "@/utils/pinnedFetch";
import { useQueryClient } from "@tanstack/react-query";

type NearbyEvent = {
  id: string;
  name: string;
  venueAddress: string | null;
  distanceMetres: number | null;
};

type PageState = "fetching" | "list" | "linking" | "success" | "error";

function formatDistance(metres: number | null | undefined): string {
  if (metres == null) return "";
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

export default function SelectEventScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const queryClient = useQueryClient();

  const { uid } = useLocalSearchParams<{ uid: string }>();

  const [pageState, setPageState] = useState<PageState>("fetching");
  const [events, setEvents] = useState<NearbyEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<NearbyEvent | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const fetchEvents = useCallback(async () => {
    setPageState("fetching");
    setErrorMsg("");
    try {
      const res = await pinnedFetch(`${API_BASE_URL}/api/attendee/events/nearby`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setErrorMsg(body.error ?? t("common.unknownError"));
        setPageState("error");
        return;
      }

      const data = await res.json() as { events: NearbyEvent[] };
      setEvents(data.events ?? []);
      setPageState("list");
    } catch {
      setErrorMsg(t("common.unknownError"));
      setPageState("error");
    }
  }, [token, t]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const doLink = useCallback(async (event: NearbyEvent) => {
    setSelectedEvent(event);
    setPageState("linking");
    try {
      const res = await pinnedFetch(`${API_BASE_URL}/api/attendee/me/bracelets/link`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ uid, eventId: event.id }),
        cache: "no-store",
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setErrorMsg(body.error ?? t("common.unknownError"));
        setPageState("error");
        return;
      }

      void queryClient.invalidateQueries({ queryKey: ["attendee", "bracelets"] });
      setPageState("success");
      setTimeout(() => {
        router.replace("/(tabs)/home" as never);
      }, 1500);
    } catch {
      setErrorMsg(t("common.unknownError"));
      setPageState("error");
    }
  }, [uid, token, queryClient, t]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.background }}
      contentContainerStyle={{
        paddingBottom: insets.bottom + 40,
        paddingTop: insets.top + 16,
        paddingHorizontal: 20,
        gap: 20,
      }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={22} color={C.text} />
        </Pressable>
        <Text style={[styles.title, { color: C.text }]}>{t("selectEvent.title")}</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Fetching */}
      {pageState === "fetching" && (
        <View style={[styles.centeredCard, { backgroundColor: C.card, borderColor: C.border }]}>
          <ActivityIndicator color={C.primary} size="large" />
          <Text style={[styles.loadingText, { color: C.text }]}>{t("selectEvent.fetchingEvents")}</Text>
        </View>
      )}

      {/* Linking */}
      {pageState === "linking" && (
        <View style={[styles.centeredCard, { backgroundColor: C.card, borderColor: C.border }]}>
          <ActivityIndicator color={C.primary} size="large" />
          <Text style={[styles.loadingText, { color: C.text }]}>{t("selectEvent.linking")}</Text>
        </View>
      )}

      {/* Success */}
      {pageState === "success" && (
        <View style={[styles.resultCard, { backgroundColor: C.successLight, borderColor: C.success }]}>
          <Feather name="check-circle" size={52} color={C.success} />
          <Text style={[styles.resultTitle, { color: C.success }]}>{t("addBracelet.successTitle")}</Text>
          {selectedEvent && (
            <Text style={[styles.resultSub, { color: C.textSecondary }]}>{selectedEvent.name}</Text>
          )}
          <Text style={[styles.resultSub, { color: C.textSecondary }]}>{t("addBracelet.successMsg")}</Text>
          <Button
            title={t("common.back")}
            onPress={() => router.push("/(tabs)/home" as never)}
            variant="primary"
            style={{ marginTop: 8 }}
          />
        </View>
      )}

      {/* Error */}
      {pageState === "error" && (
        <View style={[styles.resultCard, { backgroundColor: C.dangerLight, borderColor: C.danger }]}>
          <Feather name="alert-triangle" size={52} color={C.danger} />
          <Text style={[styles.resultTitle, { color: C.danger }]}>{t("common.error")}</Text>
          <Text style={[styles.resultSub, { color: C.textSecondary }]}>{errorMsg}</Text>
          <Button title={t("common.retry")} onPress={fetchEvents} variant="primary" style={{ marginTop: 8 }} />
        </View>
      )}

      {/* Event list */}
      {pageState === "list" && (
        <View style={{ gap: 16 }}>
          <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>
            {t("selectEvent.selectEvent")}
          </Text>

          {events.length === 0 ? (
            <View style={[styles.centeredCard, { backgroundColor: C.card, borderColor: C.border }]}>
              <Feather name="calendar" size={40} color={C.textMuted} />
              <Text style={[styles.loadingText, { color: C.textSecondary }]}>{t("selectEvent.noEvents")}</Text>
              <Text style={[styles.noEventsHint, { color: C.textMuted }]}>{t("selectEvent.noEventsHint")}</Text>
              <Button title={t("common.retry")} onPress={fetchEvents} variant="secondary" style={{ marginTop: 4 }} />
            </View>
          ) : (
            events.map((event) => (
              <Pressable
                key={event.id}
                onPress={() => doLink(event)}
                style={[styles.eventCard, { backgroundColor: C.card, borderColor: C.border }]}
              >
                <View style={[styles.eventIcon, { backgroundColor: C.primaryLight }]}>
                  <Feather name="calendar" size={20} color={C.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.eventName, { color: C.text }]}>{event.name}</Text>
                  {event.venueAddress ? (
                    <View style={styles.venueRow}>
                      <Feather name="map-pin" size={11} color={C.textMuted} />
                      <Text style={[styles.venueText, { color: C.textMuted }]}>{event.venueAddress}</Text>
                    </View>
                  ) : null}
                </View>
                {event.distanceMetres != null && (
                  <View style={[styles.distanceBadge, { backgroundColor: C.primaryLight }]}>
                    <Feather name="navigation" size={11} color={C.primary} />
                    <Text style={[styles.distanceText, { color: C.primary }]}>
                      {formatDistance(event.distanceMetres)}
                    </Text>
                  </View>
                )}
              </Pressable>
            ))
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  backBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  centeredCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 40,
    alignItems: "center",
    gap: 16,
  },
  loadingText: { fontSize: 15, fontFamily: "Inter_500Medium", textAlign: "center" },
  resultCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 28,
    alignItems: "center",
    gap: 12,
  },
  resultTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  resultSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  eventCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  eventIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  eventName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  venueRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  venueText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  distanceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  distanceText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  noEventsHint: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" },
});
