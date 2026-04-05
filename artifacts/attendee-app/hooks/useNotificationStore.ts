import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY_PREFIX = "tapee_notifications_";
const MAX_STORED = 50;

export type StoredNotification = {
  id: string;
  title: string | null;
  body: string | null;
  data: Record<string, unknown>;
  receivedAt: string;
};

function storageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}${userId}`;
}

export async function loadStoredNotifications(userId?: string | null): Promise<StoredNotification[]> {
  try {
    const key = userId ? storageKey(userId) : STORAGE_KEY_PREFIX + "anon";
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw) as StoredNotification[];
  } catch {
    return [];
  }
}

export async function appendStoredNotification(notification: StoredNotification, userId?: string | null): Promise<void> {
  try {
    const key = userId ? storageKey(userId) : STORAGE_KEY_PREFIX + "anon";
    const existing = await loadStoredNotifications(userId);
    const deduped = existing.filter((n) => n.id !== notification.id);
    const updated = [notification, ...deduped].slice(0, MAX_STORED);
    await AsyncStorage.setItem(key, JSON.stringify(updated));
  } catch {}
}

export async function clearStoredNotifications(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(storageKey(userId));
  } catch {}
}
