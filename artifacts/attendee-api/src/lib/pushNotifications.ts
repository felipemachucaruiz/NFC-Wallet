import { db, usersTable, braceletsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
}

async function sendPushNotifications(messages: PushMessage[]): Promise<void> {
  if (messages.length === 0) return;
  try {
    const chunks: PushMessage[][] = [];
    for (let i = 0; i < messages.length; i += 100) {
      chunks.push(messages.slice(i, i + 100));
    }
    for (const chunk of chunks) {
      await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(chunk),
      });
    }
  } catch (err) {
    console.error("[Push] Failed to send push notifications:", err);
  }
}

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
    if (!token) return [];
    return [token];
  } catch {
    return [];
  }
}

async function getTokensForUser(userId: string): Promise<string[]> {
  try {
    const [user] = await db
      .select({ expoPushToken: usersTable.expoPushToken })
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    const token = user?.expoPushToken;
    if (!token) return [];
    return [token];
  } catch {
    return [];
  }
}

export async function notifyTopUpSuccess(braceletUid: string, amountCop: number, newBalanceCop: number): Promise<void> {
  const tokens = await getTokensForBraceletOwner(braceletUid);
  if (tokens.length === 0) return;
  const formatted = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(amountCop);
  const balanceFormatted = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(newBalanceCop);
  const messages: PushMessage[] = tokens.map((to) => ({
    to,
    title: "¡Recarga exitosa!",
    body: `Se acreditaron ${formatted} a tu pulsera. Nuevo saldo: ${balanceFormatted}.`,
    sound: "default",
    data: { navigate: "history" },
  }));
  await sendPushNotifications(messages);
}

export async function notifyTopUpFailed(userId: string, amountCop: number): Promise<void> {
  const tokens = await getTokensForUser(userId);
  if (tokens.length === 0) return;
  const formatted = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(amountCop);
  const messages: PushMessage[] = tokens.map((to) => ({
    to,
    title: "Recarga fallida",
    body: `El pago de ${formatted} no fue procesado. Por favor inténtalo de nuevo.`,
    sound: "default",
    data: {},
  }));
  await sendPushNotifications(messages);
}

export async function notifyBraceletBlocked(braceletUid: string): Promise<void> {
  const tokens = await getTokensForBraceletOwner(braceletUid);
  if (tokens.length === 0) return;
  const messages: PushMessage[] = tokens.map((to) => ({
    to,
    title: "Pulsera bloqueada",
    body: "Tu pulsera ha sido bloqueada. No podrá usarse para pagos hasta que la desbloquees.",
    sound: "default",
    data: { navigate: "history" },
  }));
  await sendPushNotifications(messages);
}

export async function notifyBraceletUnblocked(braceletUid: string): Promise<void> {
  const tokens = await getTokensForBraceletOwner(braceletUid);
  if (tokens.length === 0) return;
  const messages: PushMessage[] = tokens.map((to) => ({
    to,
    title: "Pulsera desbloqueada",
    body: "Tu pulsera ha sido desbloqueada y puede volver a usarse.",
    sound: "default",
    data: { navigate: "history" },
  }));
  await sendPushNotifications(messages);
}
