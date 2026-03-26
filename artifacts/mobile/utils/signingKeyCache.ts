import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SECURE_KEY = "hmac_signing_key";
const LEGACY_KEY = "@hmac_signing_key";

export async function cacheSigningKey(hmacSecret: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(SECURE_KEY, hmacSecret);
  } catch {
    await AsyncStorage.setItem(LEGACY_KEY, hmacSecret);
  }
}

export async function getCachedSigningKey(): Promise<string | null> {
  try {
    const val = await SecureStore.getItemAsync(SECURE_KEY);
    if (val !== null) return val;
    const legacy = await AsyncStorage.getItem(LEGACY_KEY);
    if (legacy) {
      await SecureStore.setItemAsync(SECURE_KEY, legacy);
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
  try {
    await SecureStore.deleteItemAsync(SECURE_KEY);
  } catch {}
  try {
    await AsyncStorage.removeItem(LEGACY_KEY);
  } catch {}
}
