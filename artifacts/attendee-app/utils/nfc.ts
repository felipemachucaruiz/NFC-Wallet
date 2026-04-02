import { Platform } from "react-native";

let NfcManager: typeof import("react-native-nfc-manager").default | null = null;
let NfcTech: typeof import("react-native-nfc-manager").NfcTech | null = null;

if (Platform.OS !== "web") {
  try {
    const nfcModule = require("react-native-nfc-manager");
    NfcManager = nfcModule.default;
    NfcTech = nfcModule.NfcTech;
  } catch {
    NfcManager = null;
  }
}

/**
 * Synchronous — just checks the native module loaded.
 * Never calls native APIs so it never fails due to NFC being disabled.
 */
export function isNfcSupported(): boolean {
  return Platform.OS !== "web" && NfcManager != null;
}

/**
 * Must be called once at app startup (_layout.tsx).
 * Do NOT call this inside scan functions — it resets handler references to null.
 */
export async function initNfc(): Promise<void> {
  if (!NfcManager) return;
  try {
    await NfcManager.start();
  } catch {}
}

/**
 * Robust UID extractor — handles plain number[], Uint8Array/Buffer, and hex strings.
 */
function extractUid(tag: unknown): string | null {
  if (!tag || typeof tag !== "object") return null;
  const id = (tag as { id?: unknown }).id;
  if (!id) return null;

  // Plain number array (most common on Android)
  if (Array.isArray(id) && id.length > 0) {
    return (id as number[])
      .map((b: number) => (b & 0xff).toString(16).padStart(2, "0"))
      .join(":")
      .toUpperCase();
  }

  // Uint8Array / Buffer (some Android versions)
  if (typeof id === "object" && "byteLength" in (id as object)) {
    const arr = new Uint8Array(id as ArrayBuffer);
    if (arr.length > 0) {
      return Array.from(arr)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(":")
        .toUpperCase();
    }
  }

  // Hex string fallback
  if (typeof id === "string" && id.length > 0 && id !== "UNKNOWN") {
    const clean = id.replace(/[^0-9a-fA-F]/g, "");
    if (clean.length >= 2) {
      return (clean.match(/.{1,2}/g) ?? []).join(":").toUpperCase();
    }
  }

  return null;
}

export async function scanBraceletUID(): Promise<string | null> {
  if (Platform.OS === "web" || !NfcManager || !NfcTech) return null;

  // Cancel any stale session first — prevents silent failures when
  // a previous scan didn't clean up (e.g. app was backgrounded mid-scan).
  await NfcManager.cancelTechnologyRequest().catch(() => {});

  try {
    await NfcManager.requestTechnology([
      NfcTech.MifareClassic,
      NfcTech.MifareUltralight,
      NfcTech.Ndef,
      NfcTech.NfcA,
      NfcTech.IsoDep,
    ] as never);

    const tag = await NfcManager.getTag();
    return extractUid(tag);
  } finally {
    await NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}

export async function cancelNfcScan(): Promise<void> {
  if (!NfcManager) return;
  try {
    await NfcManager.cancelTechnologyRequest();
  } catch {}
}
