import AsyncStorage from "@react-native-async-storage/async-storage";

let SecureStore: typeof import("expo-secure-store") | null = null;
try {
  SecureStore = require("expo-secure-store");
} catch {
  SecureStore = null;
}

const SECURE_KEY = "hmac_signing_key";
const LEGACY_KEY = "@hmac_signing_key";

export async function cacheSigningKey(hmacSecret: string): Promise<void> {
  try {
    if (SecureStore) { await SecureStore.setItemAsync(SECURE_KEY, hmacSecret); return; }
    await AsyncStorage.setItem(LEGACY_KEY, hmacSecret);
  } catch {
    await AsyncStorage.setItem(LEGACY_KEY, hmacSecret);
  }
}

export async function getCachedSigningKey(): Promise<string | null> {
  try {
    if (SecureStore) {
      const val = await SecureStore.getItemAsync(SECURE_KEY);
      if (val !== null) return val;
    }
    const legacy = await AsyncStorage.getItem(LEGACY_KEY);
    if (legacy && SecureStore) {
      try { await SecureStore.setItemAsync(SECURE_KEY, legacy); } catch {}
      await AsyncStorage.removeItem(LEGACY_KEY);
    }
    return legacy;
  } catch {
    try {
      return await AsyncStorage.getItem(LEGACY_KEY);
    } catch {
      return null;
    }
  }
}

export async function clearSigningKeyCache(): Promise<void> {
  if (SecureStore) {
    try { await SecureStore.deleteItemAsync(SECURE_KEY); } catch {}
  }
  try { await AsyncStorage.removeItem(LEGACY_KEY); } catch {}
}
