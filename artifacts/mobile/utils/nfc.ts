import { Platform } from "react-native";
import type { BraceletPayload } from "./hmac";

let NfcManager: typeof import("react-native-nfc-manager").default | null = null;
let NfcTech: typeof import("react-native-nfc-manager").NfcTech | null = null;
let Ndef: typeof import("react-native-nfc-manager").Ndef | null = null;

if (Platform.OS !== "web") {
  try {
    const nfcModule = require("react-native-nfc-manager");
    NfcManager = nfcModule.default;
    NfcTech = nfcModule.NfcTech;
    Ndef = nfcModule.Ndef;
  } catch {
    NfcManager = null;
  }
}

export function isNfcSupported(): boolean {
  return Platform.OS !== "web" && NfcManager != null;
}

export async function checkNfcEnabled(): Promise<boolean> {
  if (!NfcManager) return false;
  try {
    return await NfcManager.isEnabled();
  } catch {
    return false;
  }
}

export async function initNfc(): Promise<void> {
  if (!NfcManager) return;
  try {
    await NfcManager.start();
  } catch {}
}

export async function readBracelet(): Promise<BraceletPayload> {
  if (!NfcManager || !NfcTech || !Ndef) {
    throw new Error("NFC_NOT_AVAILABLE");
  }

  try {
    await NfcManager.requestTechnology(NfcTech.Ndef);
    const tag = await NfcManager.getTag();
    if (!tag) throw new Error("NFC_NO_TAG");

    const uid = tag.id ? Array.from(tag.id as number[])
      .map((b: number) => b.toString(16).padStart(2, "0"))
      .join(":")
      .toUpperCase() : "UNKNOWN";

    const ndefMsg = tag.ndefMessage;
    if (!ndefMsg || ndefMsg.length === 0) {
      return { uid, balance: 0, counter: 0, hmac: "" };
    }

    const firstRecord = ndefMsg[0];
    const payload = Ndef.text.decodePayload(
      new Uint8Array(firstRecord.payload as number[])
    );

    try {
      const parsed = JSON.parse(payload);
      return {
        uid,
        balance: typeof parsed.balance === "number" ? parsed.balance : 0,
        counter: typeof parsed.counter === "number" ? parsed.counter : 0,
        hmac: typeof parsed.hmac === "string" ? parsed.hmac : "",
      };
    } catch {
      return { uid, balance: 0, counter: 0, hmac: "" };
    }
  } finally {
    await NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}

export async function writeBracelet(payload: BraceletPayload): Promise<void> {
  if (!NfcManager || !NfcTech || !Ndef) {
    throw new Error("NFC_NOT_AVAILABLE");
  }

  try {
    await NfcManager.requestTechnology(NfcTech.Ndef);
    const data = JSON.stringify({
      balance: payload.balance,
      counter: payload.counter,
      hmac: payload.hmac,
    });
    const bytes = Ndef.encodeMessage([Ndef.textRecord(data)]);
    await NfcManager.ndefHandler.writeNdefMessage(bytes);
  } finally {
    await NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}

export async function cancelNfc(): Promise<void> {
  if (!NfcManager) return;
  try {
    await NfcManager.cancelTechnologyRequest();
  } catch {}
}
