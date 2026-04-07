import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { useEventContext } from "@/contexts/EventContext";

export function EventEndedOverlay() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const { eventName, eventEndsAt } = useEventContext();

  const formattedDate = eventEndsAt
    ? new Date(eventEndsAt).toLocaleDateString("es-CO", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
        <View style={[styles.iconWrap, { backgroundColor: C.primaryLight }]}>
          <Feather name="lock" size={40} color={C.primary} />
        </View>

        <Text style={[styles.title, { color: C.text }]}>
          {t("eventEnded.title")}
        </Text>

        {eventName && (
          <Text style={[styles.eventName, { color: C.primary }]}>{eventName}</Text>
        )}

        <Text style={[styles.message, { color: C.textSecondary }]}>
          {t("eventEnded.message")}
        </Text>

        {formattedDate && (
          <View style={[styles.dateRow, { backgroundColor: C.primaryLight }]}>
            <Feather name="calendar" size={14} color={C.primary} />
            <Text style={[styles.dateText, { color: C.primary }]}>{formattedDate}</Text>
          </View>
        )}

        <Text style={[styles.hint, { color: C.textSecondary }]}>
          {t("eventEnded.hint")}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 20,
    borderWidth: 1,
    padding: 32,
    alignItems: "center",
    gap: 16,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  eventName: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  message: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  dateText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  hint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 4,
  },
});
