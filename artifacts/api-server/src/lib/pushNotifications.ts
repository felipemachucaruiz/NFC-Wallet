import Expo, { type ExpoPushMessage } from "expo-server-sdk";
import { db, usersTable, braceletsTable, productsTable, locationsTable } from "@workspace/db";
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

async function getTokenForUser(userId: string): Promise<string[]> {
  try {
    const [user] = await db
      .select({ expoPushToken: usersTable.expoPushToken })
      .from(usersTable)
      .where(eq(usersTable.id, userId));

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

/**
 * Notify the attendee that their refund request was approved.
 */
export async function notifyRefundRequestApproved(params: {
  attendeeUserId: string;
  amountCop: number;
}): Promise<void> {
  try {
    const tokens = await getTokenForUser(params.attendeeUserId);
    if (tokens.length === 0) return;

    const formattedAmount = new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(params.amountCop);

    const messages: ExpoPushMessage[] = tokens.map((to) => ({
      to,
      sound: "default" as const,
      title: "Reembolso aprobado",
      body: `Tu solicitud de reembolso por ${formattedAmount} ha sido aprobada.`,
      data: { navigate: "refunds" },
    }));

    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      await expo.sendPushNotificationsAsync(chunk);
    }
  } catch {
    // Non-fatal
  }
}

/**
 * Notify the attendee that their refund request was rejected.
 */
export async function notifyRefundRequestRejected(params: {
  attendeeUserId: string;
  amountCop: number;
}): Promise<void> {
  try {
    const tokens = await getTokenForUser(params.attendeeUserId);
    if (tokens.length === 0) return;

    const formattedAmount = new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(params.amountCop);

    const messages: ExpoPushMessage[] = tokens.map((to) => ({
      to,
      sound: "default" as const,
      title: "Solicitud de reembolso rechazada",
      body: `Tu solicitud de reembolso por ${formattedAmount} no fue aprobada.`,
      data: { navigate: "refunds" },
    }));

    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      await expo.sendPushNotificationsAsync(chunk);
    }
  } catch {
    // Non-fatal
  }
}

/**
 * Notify warehouse admins for an event that a product's stock has fallen below the minimum threshold.
 */
export async function notifyLowStock(params: {
  eventId: string;
  productId: string;
  locationId: string;
  currentQty: number;
  restockTrigger: number;
}): Promise<void> {
  try {
    const [product, location] = await Promise.all([
      db.select({ name: productsTable.name }).from(productsTable).where(eq(productsTable.id, params.productId)).then((r) => r[0]),
      db.select({ name: locationsTable.name }).from(locationsTable).where(eq(locationsTable.id, params.locationId)).then((r) => r[0]),
    ]);

    const warehouseAdmins = await db
      .select({ expoPushToken: usersTable.expoPushToken })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.eventId, params.eventId),
          eq(usersTable.role, "warehouse_admin"),
          isNotNull(usersTable.expoPushToken),
        ),
      );

    const tokens = warehouseAdmins
      .map((u) => u.expoPushToken)
      .filter((t): t is string => !!t && Expo.isExpoPushToken(t));

    if (tokens.length === 0) return;

    const productName = product?.name ?? params.productId;
    const locationName = location?.name ?? params.locationId;

    const messages: ExpoPushMessage[] = tokens.map((to) => ({
      to,
      sound: "default" as const,
      title: "Alerta de stock bajo",
      body: `El producto "${productName}" en "${locationName}" tiene solo ${params.currentQty} unidades (umbral mínimo: ${params.restockTrigger}).`,
      data: {
        eventId: params.eventId,
        productId: params.productId,
        locationId: params.locationId,
        navigate: "inventory",
      },
    }));

    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      await expo.sendPushNotificationsAsync(chunk);
    }
  } catch {
    // Non-fatal
  }
}
