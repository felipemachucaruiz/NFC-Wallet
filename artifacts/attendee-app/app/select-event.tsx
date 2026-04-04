import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as Location from "expo-location";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
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
  distanceKm: number;
};

type PageState = "requesting_location" | "fetching" | "list" | "single_confirm" | "linking" | "success" | "error" | "no_location";

function formatDistance(km: number): string {
  if (km < 1) {
    return `${Math.round(km * 1000)} m`;
  }
  return `${km.toFixed(1)} km`;
}

export default function SelectEventScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { token } = useAuth();
  const queryClient = useQueryClient();

  const { uid } = useLocalSearchParams<{ uid: string }>();

  const [pageState, setPageState] = useState<PageState>("requesting_location");
  const [events, setEvents] = useState<NearbyEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<NearbyEvent | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    void fetchNearbyEvents();
  }, []);

  const fetchNearbyEvents = async () => {
    setPageState("requesting_location");
    try {
      let coords: { latitude: number; longitude: number } | null = null;

      if (Platform.OS !== "web") {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        }
      }

      setPageState("fetching");

      const url = coords
        ? `${API_BASE_URL}/api/attendee/events/nearby?lat=${coords.latitude}&lng=${coords.longitude}`
        : `${API_BASE_URL}/api/attendee/events/nearby`;

      const res = await pinnedFetch(url, {
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
      const nearbyEvents = data.events ?? [];
      setEvents(nearbyEvents);

      const within5km = nearbyEvents.filter((e) => e.distanceKm <= 5);
      if (within5km.length === 1) {
        setSelectedEvent(within5km[0]);
        setPageState("single_confirm");
      } else {
        setPageState("list");
      }
    } catch {
      setErrorMsg(t("common.unknownError"));
      setPageState("error");
    }
  };

  const handleSelectEvent = async (event: NearbyEvent) => {
    setSelectedEvent(event);
    setPageState("linking");
    await doRegisterAndLink(event.id);
  };

  const handleConfirmSingle = async () => {
    if (!selectedEvent) return;
    setPageState("linking");
    await doRegisterAndLink(selectedEvent.id);
  };

  const doRegisterAndLink = async (eventId: string) => {
    try {
      const res = await pinnedFetch(`${API_BASE_URL}/api/attendee/me/bracelets/link`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ uid, eventId }),
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
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.background }}
      contentContainerStyle={{
        paddingBottom: isWeb ? 34 : insets.bottom + 40,
        paddingTop: isWeb ? 67 : insets.top + 16,
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

      {/* Loading states */}
      {(pageState === "requesting_location" || pageState === "fetching") && (
        <View style={[styles.centeredCard, { backgroundColor: C.card, borderColor: C.border }]}>
          <ActivityIndicator color={C.primary} size="large" />
          <Text style={[styles.loadingText, { color: C.text }]}>
            {pageState === "requesting_location" ? t("selectEvent.requestingLocation") : t("selectEvent.fetchingEvents")}
          </Text>
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
          <Text style={[styles.resultSub, { color: C.textSecondary }]}>
            {selectedEvent ? selectedEvent.name : ""}
          </Text>
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
          <Button title={t("common.retry")} onPress={fetchNearbyEvents} variant="primary" style={{ marginTop: 8 }} />
        </View>
      )}

      {/* Single event confirm */}
      {pageState === "single_confirm" && selectedEvent && (
        <View style={{ gap: 16 }}>
          <View style={[styles.infoCard, { backgroundColor: C.card, borderColor: C.border }]}>
            <Feather name="map-pin" size={16} color={C.primary} />
            <Text style={[styles.infoText, { color: C.textSecondary }]}>
              {t("selectEvent.nearbyEventFound")}
            </Text>
          </View>

          <View style={[styles.confirmCard, { backgroundColor: C.card, borderColor: C.primary }]}>
            <View style={[styles.confirmIcon, { backgroundColor: C.primaryLight }]}>
              <Feather name="calendar" size={28} color={C.primary} />
            </View>
            <Text style={[styles.confirmQuestion, { color: C.textSecondary }]}>
              {t("selectEvent.attendingQuestion")}
            </Text>
            <Text style={[styles.confirmEventName, { color: C.text }]}>{selectedEvent.name}</Text>
            {selectedEvent.venueAddress ? (
              <View style={styles.venueRow}>
                <Feather name="map-pin" size={12} color={C.textMuted} />
                <Text style={[styles.venueText, { color: C.textMuted }]}>{selectedEvent.venueAddress}</Text>
              </View>
            ) : null}
            <View style={[styles.distanceBadge, { backgroundColor: C.primaryLight }]}>
              <Feather name="navigation" size={11} color={C.primary} />
              <Text style={[styles.distanceText, { color: C.primary }]}>
                {formatDistance(selectedEvent.distanceKm)}
              </Text>
            </View>
          </View>

          <Button
            title={t("common.confirm")}
            onPress={handleConfirmSingle}
            variant="primary"
          />
          <Button
            title={t("selectEvent.showAllEvents")}
            onPress={() => setPageState("list")}
            variant="secondary"
          />
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
              <Feather name="map" size={40} color={C.textMuted} />
              <Text style={[styles.loadingText, { color: C.textSecondary }]}>{t("selectEvent.noEvents")}</Text>
              <Text style={[styles.noEventsHint, { color: C.textMuted }]}>{t("selectEvent.noEventsHint")}</Text>
            </View>
          ) : (
            events.map((event) => (
              <Pressable
                key={event.id}
                onPress={() => handleSelectEvent(event)}
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
                <View style={[styles.distanceBadge, { backgroundColor: C.primaryLight }]}>
                  <Feather name="navigation" size={11} color={C.primary} />
                  <Text style={[styles.distanceText, { color: C.primary }]}>
                    {formatDistance(event.distanceKm)}
                  </Text>
                </View>
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
  infoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  infoText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  confirmCard: {
    borderRadius: 20,
    borderWidth: 2,
    padding: 24,
    alignItems: "center",
    gap: 10,
  },
  confirmIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  confirmQuestion: { fontSize: 14, fontFamily: "Inter_500Medium" },
  confirmEventName: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
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
