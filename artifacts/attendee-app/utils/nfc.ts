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

let nfcInitialized = false;
let nfcSupported: boolean | null = null;

export async function initNfc(): Promise<void> {
  if (Platform.OS === "web" || !NfcManager) return;
  try {
    nfcSupported = await NfcManager.isSupported();
    if (nfcSupported) {
      await NfcManager.start();
      nfcInitialized = true;
    }
  } catch {
    nfcSupported = false;
  }
}

export async function isNfcSupported(): Promise<boolean> {
  if (Platform.OS === "web" || !NfcManager) return false;
  if (nfcSupported !== null) return nfcSupported;
  try {
    nfcSupported = await NfcManager.isSupported();
    return nfcSupported;
  } catch {
    return false;
  }
}

function bytesToHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(":");
}

export async function scanBraceletUID(): Promise<string | null> {
  if (Platform.OS === "web" || !NfcManager || !NfcTech) return null;
  if (!nfcInitialized) {
    await initNfc();
  }
  try {
    await NfcManager.requestTechnology([NfcTech.Ndef, NfcTech.IsoDep, NfcTech.NfcA] as never);
    const tag = await NfcManager.getTag();
    if (tag?.id) {
      const idBytes = tag.id as number[];
      return bytesToHex(idBytes);
    }
    return null;
  } catch {
    return null;
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
