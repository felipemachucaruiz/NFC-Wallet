import { Platform } from "react-native";
import { requireNativeModule } from "expo-modules-core";

let _mod: { setToken: (t: string) => Promise<void>; clearToken: () => Promise<void>; isSupported: () => Promise<boolean> } | null = null;

if (Platform.OS !== "web") {
  try {
    _mod = requireNativeModule("NfcHce");
  } catch {
    _mod = null;
  }
}

export async function setNfcTicketToken(token: string): Promise<void> {
  await _mod?.setToken(token);
}

export async function clearNfcTicketToken(): Promise<void> {
  await _mod?.clearToken();
}

export async function isNfcHceSupported(): Promise<boolean> {
  if (!_mod) return false;
  try {
    return await _mod.isSupported();
  } catch {
    return false;
  }
}
