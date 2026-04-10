import React from "react";
import { Feather } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { useColorScheme } from "@/hooks/useColorScheme";

export interface TicketAttendee {
  id: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
}

export interface TicketInfo {
  ticketId: string;
  section: string;
  ticketType: string;
  validDays: number[];
  dayLabels: string[];
  accessZoneId: string;
}

export interface TicketZone {
  id: string;
  name: string;
  colorHex: string | null;
  rank: number;
}

export interface CheckinHistoryEntry {
  dayIndex: number;
  checkedInAt: string | Date;
}

interface TicketConfirmationProps {
  attendee: TicketAttendee;
  ticket: TicketInfo;
  zone: TicketZone | null;
  todayDayIndex: number;
  checkinHistory: CheckinHistoryEntry[];
  onTapBracelet: () => void;
  isRegistering: boolean;
}

export function TicketConfirmation({
  attendee,
  ticket,
  zone,
  todayDayIndex,
  checkinHistory,
  onTapBracelet,
  isRegistering,
}: TicketConfirmationProps) {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;

  const isMultiDay = ticket.validDays.length > 1;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.validBadge, { backgroundColor: "#16a34a22", borderColor: "#16a34a" }]}>
        <Feather name="check-circle" size={20} color="#16a34a" />
        <Text style={[styles.validText, { color: "#16a34a" }]}>{t("gate.ticketValid")}</Text>
      </View>

      <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
        <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>
          {t("gate.ticketAttendeeInfo")}
        </Text>

        <InfoRow
          icon="user"
          label={t("gate.ticketFullName")}
          value={attendee.fullName || "—"}
          C={C}
        />
        {attendee.phone ? (
          <InfoRow icon="phone" label={t("gate.ticketPhone")} value={attendee.phone} C={C} />
        ) : null}
        {attendee.email ? (
          <InfoRow icon="mail" label={t("gate.ticketEmail")} value={attendee.email} C={C} />
        ) : null}
      </View>

      <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
        <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>
          {t("gate.ticketDetails")}
        </Text>

        {ticket.section ? (
          <InfoRow
            icon="map-pin"
            label={t("gate.ticketSection")}
            value={ticket.section}
            C={C}
            valueBadge={zone ? { text: zone.name, color: zone.colorHex ?? C.primary } : undefined}
          />
        ) : null}
        <InfoRow
          icon="tag"
          label={t("gate.ticketType")}
          value={
            isMultiDay
              ? t("gate.ticketAbono")
              : t("gate.ticketSingle")
          }
          C={C}
        />

        {isMultiDay && ticket.dayLabels.length > 0 ? (
          <View style={styles.daysSection}>
            <Text style={[styles.daysLabel, { color: C.textSecondary }]}>
              {t("gate.ticketValidDays")}
            </Text>
            {ticket.validDays.map((dayIdx, i) => {
              const label = ticket.dayLabels[i] || t("gate.ticketDay", { number: dayIdx + 1 });
              const isToday = dayIdx === todayDayIndex;
              const wasCheckedIn = checkinHistory.some((ch) => ch.dayIndex === dayIdx);
              const isPast = dayIdx < todayDayIndex && !isToday;

              let statusIcon: string;
              let statusColor: string;
              let statusText: string;

              if (wasCheckedIn && !isToday) {
                statusIcon = "check-circle";
                statusColor = "#16a34a";
                statusText = t("gate.ticketDayCheckedIn");
              } else if (isToday) {
                statusIcon = "arrow-right";
                statusColor = C.primary;
                statusText = t("gate.ticketDayToday");
              } else {
                statusIcon = "circle";
                statusColor = C.textMuted;
                statusText = t("gate.ticketDayUpcoming");
              }

              return (
                <View key={dayIdx} style={styles.dayRow}>
                  <Feather name={statusIcon as any} size={16} color={statusColor} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.dayLabel, { color: isToday ? C.text : C.textSecondary }]}>
                      {t("gate.ticketDay", { number: dayIdx + 1 })} — {label}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.dayStatus,
                      {
                        color: statusColor,
                        fontFamily: isToday ? "Inter_700Bold" : "Inter_500Medium",
                      },
                    ]}
                  >
                    {statusText}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}
      </View>

      <Pressable
        style={[
          styles.tapBtn,
          {
            backgroundColor: isRegistering ? C.primaryLight : C.primary,
            opacity: isRegistering ? 0.7 : 1,
          },
        ]}
        onPress={onTapBracelet}
        disabled={isRegistering}
      >
        {isRegistering ? (
          <>
            <ActivityIndicator color={C.primaryText} size="small" />
            <Text style={[styles.tapBtnText, { color: C.primaryText }]}>
              {t("gate.ticketRegistering")}
            </Text>
          </>
        ) : (
          <>
            <Feather name="wifi" size={24} color={C.primaryText} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.tapBtnText, { color: C.primaryText }]}>
                {t("gate.ticketTapBracelet")}
              </Text>
              <Text style={[styles.tapBtnSub, { color: C.primaryText + "99" }]}>
                {t("gate.ticketTapBraceletHint")}
              </Text>
            </View>
          </>
        )}
      </Pressable>
    </ScrollView>
  );
}

function InfoRow({
  icon,
  label,
  value,
  C,
  valueBadge,
}: {
  icon: string;
  label: string;
  value: string;
  C: typeof Colors.light;
  valueBadge?: { text: string; color: string };
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoRowLeft}>
        <Feather name={icon as any} size={14} color={C.textSecondary} />
        <Text style={[styles.infoLabel, { color: C.textSecondary }]}>{label}</Text>
      </View>
      <View style={styles.infoRowRight}>
        {valueBadge ? (
          <View style={[styles.zoneBadgeSmall, { backgroundColor: valueBadge.color + "22", borderColor: valueBadge.color }]}>
            <View style={[styles.zoneDotSmall, { backgroundColor: valueBadge.color }]} />
            <Text style={[styles.zoneBadgeText, { color: valueBadge.color }]}>{valueBadge.text}</Text>
          </View>
        ) : (
          <Text style={[styles.infoValue, { color: C.text }]}>{value}</Text>
        )}
      </View>
    </View>
  );
}

export interface CheckinHistoryListItem {
  id: string;
  ticketId: string;
  attendeeName: string;
  section: string | null;
  ticketType: string | null;
  braceletNfcUid: string | null;
  eventDayIndex: number;
  checkedInAt: string;
}

interface CheckinHistoryListProps {
  items: CheckinHistoryListItem[];
}

export function CheckinHistoryList({ items }: CheckinHistoryListProps) {
  const { t, i18n } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const locale = i18n.language ?? "es";

  if (items.length === 0) {
    return (
      <View style={[styles.historyEmpty, { backgroundColor: C.card, borderColor: C.border }]}>
        <Feather name="clipboard" size={24} color={C.textMuted} />
        <Text style={[styles.historyEmptyText, { color: C.textMuted }]}>
          {t("gate.ticketHistoryEmpty")}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.historyContainer, { backgroundColor: C.card, borderColor: C.border }]}>
      <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>
        {t("gate.ticketHistory")}
      </Text>
      {items.map((item) => {
        const time = new Date(item.checkedInAt).toLocaleTimeString(
          locale === "es" ? "es-CO" : "en-US",
          { hour: "2-digit", minute: "2-digit" }
        );
        return (
          <View key={item.id} style={[styles.historyItem, { borderBottomColor: C.border }]}>
            <View style={[styles.historyDot, { backgroundColor: "#16a34a" }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.historyName, { color: C.text }]}>{item.attendeeName}</Text>
              <View style={styles.historyMeta}>
                {item.section ? (
                  <Text style={[styles.historyMetaText, { color: C.textSecondary }]}>
                    {item.section}
                  </Text>
                ) : null}
                {item.braceletNfcUid ? (
                  <Text style={[styles.historyMetaText, { color: C.textMuted }]}>
                    {item.braceletNfcUid}
                  </Text>
                ) : null}
              </View>
            </View>
            <Text style={[styles.historyTime, { color: C.textMuted }]}>{time}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
    paddingBottom: 20,
  },
  validBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 2,
  },
  validText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  infoRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  infoRowRight: {
    flex: 1,
    alignItems: "flex-end",
  },
  infoLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  infoValue: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    textAlign: "right",
  },
  zoneBadgeSmall: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  zoneDotSmall: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  zoneBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  daysSection: {
    marginTop: 4,
    gap: 8,
  },
  daysLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
  },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
  },
  dayLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  dayStatus: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tapBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 16,
    padding: 20,
  },
  tapBtnText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  tapBtnSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  historyEmpty: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    gap: 8,
  },
  historyEmptyText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  historyContainer: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  historyItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  historyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  historyName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  historyMeta: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
  },
  historyMetaText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  historyTime: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
});
