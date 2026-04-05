import Expo, { type ExpoPushMessage } from "expo-server-sdk";
import { db, usersTable, braceletsTable } from "@workspace/db";
import { eq, inArray, and, isNotNull } from "drizzle-orm";

const expo = new Expo();

async function getTokensForBraceletOwner(braceletUid: string): Promise<string[]> {
  try {
    const [bracelet] = await db
      .select({ attendeeUserId: braceletsTable.attendeeUserId })
      .from(braceletsTable)
      .where(eq(braceletsTable.nfcUid, braceletUid));
    if (!bracelet?.attendeeUserId) return [];

    const [user] = await db
      .select({ expoPushToken: usersTable.expoPushToken })
      .from(usersTable)
      .where(eq(usersTable.id, bracelet.attendeeUserId));

    const token = user?.expoPushToken;
    if (!token || !Expo.isExpoPushToken(token)) return [];
    return [token];
  } catch {
    return [];
  }
}

export async function notifyBraceletUnblocked(braceletUid: string): Promise<void> {
  try {
    const tokens = await getTokensForBraceletOwner(braceletUid);
    if (tokens.length === 0) return;
    const messages: ExpoPushMessage[] = tokens.map((to) => ({
      to,
      sound: "default" as const,
      title: "Pulsera desbloqueada",
      body: "Tu pulsera ha sido desbloqueada y puede volver a usarse.",
      data: { navigate: "history" },
    }));
    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      await expo.sendPushNotificationsAsync(chunk);
    }
  } catch {
    // Non-fatal
  }
}

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
