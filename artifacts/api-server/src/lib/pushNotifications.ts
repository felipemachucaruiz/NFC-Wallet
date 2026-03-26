import Expo, { type ExpoPushMessage } from "expo-server-sdk";
import { db, usersTable } from "@workspace/db";
import { eq, inArray, and, isNotNull } from "drizzle-orm";

const expo = new Expo();

export async function sendFraudAlertPushNotifications(params: {
  eventId: string;
  alertType: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
}) {
  if (params.severity !== "high" && params.severity !== "critical") return;

  try {
    const adminUsers = await db
      .select({ expoPushToken: usersTable.expoPushToken })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.eventId, params.eventId),
          eq(usersTable.role, "event_admin"),
          isNotNull(usersTable.expoPushToken),
        ),
      );

    const tokens = adminUsers
      .map((u) => u.expoPushToken)
      .filter((t): t is string => !!t && Expo.isExpoPushToken(t));

    if (tokens.length === 0) return;

    const messages: ExpoPushMessage[] = tokens.map((to) => ({
      to,
      sound: "default",
      title: params.severity === "critical" ? "🚨 Critical Fraud Alert" : "⚠️ Fraud Alert",
      body: params.description.slice(0, 200),
      data: { eventId: params.eventId, alertType: params.alertType, severity: params.severity },
      priority: params.severity === "critical" ? "high" : "normal",
    }));

    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      await expo.sendPushNotificationsAsync(chunk);
    }
  } catch {
    // Non-fatal — fraud alert was already saved
  }
}
