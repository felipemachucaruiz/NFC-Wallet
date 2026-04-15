import { Platform } from "react-native";
import type { BraceletPayload } from "./hmac";
import CryptoJS from "crypto-js";

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

export type TagType =
  | "NTAG213"
  | "NTAG215"
  | "NTAG216"
  | "MIFARE_ULTRALIGHT"
  | "MIFARE_ULTRALIGHT_C"
  | "MIFARE_CLASSIC"
  | "DESFIRE_EV3"
  | "NDEF";

export interface TagInfo {
  type: TagType;
  label: string;
  memoryBytes: number;
}

const NTAG_CC_MAP: Record<number, { type: TagType; label: string; memoryBytes: number }> = {
  0x12: { type: "NTAG213", label: "NTAG213", memoryBytes: 144 },
  0x3e: { type: "NTAG215", label: "NTAG215", memoryBytes: 504 },
  0x6d: { type: "NTAG216", label: "NTAG216", memoryBytes: 888 },
};

const NTAG_USER_MEMORY_END_PAGE: Record<TagType, number> = {
  NTAG213: 40,
  NTAG215: 130,
  NTAG216: 226,
  MIFARE_ULTRALIGHT: 15,
  MIFARE_ULTRALIGHT_C: 39,
  MIFARE_CLASSIC: 0,
  DESFIRE_EV3: 0,
  NDEF: 0,
};

type AnyRecord = Record<string, unknown>;

interface MfcHandler {
  mifareClassicAuthenticateA: (sector: number, key: number[]) => Promise<void>;
  mifareClassicReadBlock: (block: number) => Promise<number[]>;
  mifareClassicWriteBlock: (block: number, data: number[]) => Promise<void>;
  mifareClassicSectorToBlock: (sector: number) => Promise<number>;
}

interface MfuHandler {
  mifareUltralightReadPages: (pageOffset: number) => Promise<number[]>;
  mifareUltralightWritePage: (pageOffset: number, data: number[]) => Promise<void>;
  transceive?: (data: number[]) => Promise<number[]>;
}

function getMfuHandler(mgr: AnyRecord): MfuHandler | null {
  const h = mgr["mifareUltralightHandlerAndroid"];
  if (h && typeof h === "object") return h as MfuHandler;
  return null;
}

function getMfcHandler(mgr: AnyRecord): MfcHandler | null {
  const h = mgr["mifareClassicHandlerAndroid"];
  if (h && typeof h === "object") return h as MfcHandler;
  return null;
}

function hasTech(techTypes: string[], tech: string): boolean {
  return techTypes.some((t) => t.includes(tech));
}

function getTagTechTypes(tag: unknown): string[] {
  if (tag && typeof tag === "object" && "techTypes" in tag) {
    const tt = (tag as { techTypes?: unknown }).techTypes;
    if (Array.isArray(tt)) return tt as string[];
  }
  return [];
}

async function readUltralightCCByte(): Promise<number | null> {
  if (!NfcManager || !NfcTech) return null;
  try {
    await NfcManager.requestTechnology(NfcTech.MifareUltralight);
    const mfuHandler = getMfuHandler(NfcManager as unknown as AnyRecord);
    if (!mfuHandler?.mifareUltralightReadPages) return null;
    const page3Data = await mfuHandler.mifareUltralightReadPages(3);
    return page3Data[2] ?? null;
  } catch {
    return null;
  } finally {
    await NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Compact binary format for basic MIFARE Ultralight (16 pages, 44 usable bytes).
// JSON payload with full HMAC is ~100 bytes — too large. This format fits 20 bytes.
//
// Layout (20 bytes = 5 pages, written starting at page 4):
//   Byte  0   : 0xBF  — magic marker (never valid JSON: JSON starts with 0x7B '{')
//   Bytes 1-4 : balance  — uint32 big-endian (max ~4.29 B COP)
//   Bytes 5-8 : counter  — uint32 big-endian
//   Bytes 9-16: HMAC[0..7] — first 8 raw bytes of HMAC-SHA256 (= 16 hex chars)
//   Bytes 17-19: 0x00 padding
// ---------------------------------------------------------------------------
const COMPACT_BINARY_MAGIC = 0xbf;
const COMPACT_BINARY_PAGES = 5; // 20 bytes

function encodeBraceletCompact(payload: BraceletPayload): number[] {
  const out = new Array(COMPACT_BINARY_PAGES * MFU_PAGE_SIZE).fill(0);
  out[0] = COMPACT_BINARY_MAGIC;
  // Balance — uint32 big-endian
  const bal = Math.max(0, Math.floor(payload.balance)) >>> 0;
  out[1] = (bal >>> 24) & 0xff;
  out[2] = (bal >>> 16) & 0xff;
  out[3] = (bal >>> 8) & 0xff;
  out[4] = bal & 0xff;
  // Counter — uint32 big-endian
  const ctr = Math.max(0, Math.floor(payload.counter)) >>> 0;
  out[5] = (ctr >>> 24) & 0xff;
  out[6] = (ctr >>> 16) & 0xff;
  out[7] = (ctr >>> 8) & 0xff;
  out[8] = ctr & 0xff;
  // HMAC — first 8 bytes (16 hex chars) of the full 64-char HMAC
  const hmacHex = (payload.hmac || "").slice(0, 16).padEnd(16, "0");
  for (let i = 0; i < 8; i++) {
    out[9 + i] = parseInt(hmacHex.slice(i * 2, i * 2 + 2), 16) || 0;
  }
  return out;
}

function decodeBraceletCompact(bytes: Uint8Array, uid: string): BraceletPayload {
  if (bytes.length < 17 || bytes[0] !== COMPACT_BINARY_MAGIC) {
    return { uid, balance: 0, counter: 0, hmac: "" };
  }
  const balance = ((bytes[1] << 24) | (bytes[2] << 16) | (bytes[3] << 8) | bytes[4]) >>> 0;
  const counter = ((bytes[5] << 24) | (bytes[6] << 16) | (bytes[7] << 8) | bytes[8]) >>> 0;
  const hmacBytes = bytes.slice(9, 17);
  const hmac = Array.from(hmacBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return { uid, balance, counter, hmac };
}

// GET_VERSION response byte 6 → chip storage size → NTAG type mapping.
// NTAG213=0x0F, NTAG215=0x11, NTAG216=0x13. Ultralight C does NOT support GET_VERSION.
const NTAG_VERSION_SIZE_MAP: Record<number, TagInfo> = {
  0x0f: { type: "NTAG213", label: "NTAG213", memoryBytes: 144 },
  0x11: { type: "NTAG215", label: "NTAG215", memoryBytes: 504 },
  0x13: { type: "NTAG216", label: "NTAG216", memoryBytes: 888 },
};

async function detectUltralightSubtype(mfuHandler: MfuHandler | null): Promise<TagInfo> {
  if (!mfuHandler?.mifareUltralightReadPages) {
    return { type: "MIFARE_ULTRALIGHT", label: "MIFARE Ultralight", memoryBytes: 64 };
  }

  // Step 1: CC byte from page 3 — fastest and most reliable for initialized NTAG chips.
  // For NTAG213 CC2=0x12, NTAG215 CC2=0x3E, NTAG216 CC2=0x6D.
  try {
    const page3Data = await mfuHandler.mifareUltralightReadPages(3);
    const ccByte = (page3Data[2] ?? null);
    if (ccByte !== null) {
      const ntag = NTAG_CC_MAP[ccByte & 0xff];
      if (ntag) {
        console.log("[NFC] Detected via CC byte 0x" + (ccByte & 0xff).toString(16) + ":", ntag.type);
        return ntag;
      }
    }
  } catch {}

  // Step 2: GET_VERSION command (0x60). NTAG213/215/216 respond with 8 bytes
  // where byte 6 encodes the storage size. Ultralight C and basic Ultralight
  // do NOT support this command and return a NACK / error.
  // This is the authoritative way to tell NTAG from Ultralight C.
  if (mfuHandler.transceive) {
    try {
      const ver = await mfuHandler.transceive([0x60]);
      if (ver.length >= 8) {
        const ntag = NTAG_VERSION_SIZE_MAP[ver[6] & 0xff];
        if (ntag) {
          console.log("[NFC] Detected via GET_VERSION byte[6]=0x" + (ver[6] & 0xff).toString(16) + ":", ntag.type);
          return ntag;
        }
        // byte[6] not in NTAG map — chip responded to GET_VERSION but is NOT an NTAG21x.
        // Most likely MIFARE Ultralight EV1 (MF0UL11: byte[6]=0x0B, MF0UL21: byte[6]=0x0E).
        // EV1 has limited user pages (MF0UL11: pages 4-15, MF0UL21: pages 4-35).
        // Treating as NTAG213 (endPage=40) would attempt writes beyond the chip's
        // physical page count → TAG_LOST / NACK failures.
        // Use MIFARE_ULTRALIGHT → compact binary format (5 pages = 20 bytes), safe for all EV1 variants.
        console.log("[NFC] GET_VERSION byte[6]=0x" + (ver[6] & 0xff).toString(16) + " — Ultralight EV1 or unknown, using compact format");
        return { type: "MIFARE_ULTRALIGHT", label: "MIFARE Ultralight EV1", memoryBytes: 64 };
      }
      // GET_VERSION returned fewer than 8 bytes — unusual, treat as MIFARE_ULTRALIGHT.
      console.log("[NFC] GET_VERSION short response — treating as MIFARE_ULTRALIGHT");
      return { type: "MIFARE_ULTRALIGHT", label: "MIFARE Ultralight", memoryBytes: 64 };
    } catch {
      // GET_VERSION failed → Ultralight C or basic Ultralight. Fall through.
      console.log("[NFC] GET_VERSION not supported — likely Ultralight C or basic Ultralight");
    }
  }

  // Step 3: Try reading page 40. MIFARE Ultralight C has 48 pages (0-47) so
  // page 40 is valid. Basic Ultralight has only 16 pages — reading page 40 fails.
  // NOTE: NTAG213 also has pages up to 44, but we should have identified it via
  // CC byte or GET_VERSION above; reaching here means CC and GET_VERSION both
  // failed, which is unusual for a well-formed NTAG chip.
  try {
    await mfuHandler.mifareUltralightReadPages(40);
    console.log("[NFC] Page 40 readable — detected as MIFARE_ULTRALIGHT_C");
    return { type: "MIFARE_ULTRALIGHT_C", label: "MIFARE Ultralight C", memoryBytes: 144 };
  } catch {}

  // Final fallback: basic MIFARE Ultralight (16 pages, 64 bytes total user memory).
  console.log("[NFC] Falling back to basic MIFARE_ULTRALIGHT");
  return { type: "MIFARE_ULTRALIGHT", label: "MIFARE Ultralight", memoryBytes: 64 };
}

export async function detectTagType(techTypes: string[]): Promise<TagInfo> {
  if (hasTech(techTypes, "IsoDep") && !hasTech(techTypes, "MifareUltralight") && !hasTech(techTypes, "MifareClassic")) {
    return { type: "DESFIRE_EV3", label: "DESFire EV3", memoryBytes: 8192 };
  }

  if (hasTech(techTypes, "MifareClassic")) {
    return { type: "MIFARE_CLASSIC", label: "MIFARE Classic", memoryBytes: 1024 };
  }

  if (hasTech(techTypes, "MifareUltralight")) {
    if (Platform.OS === "android" && NfcManager && NfcTech) {
      try {
        await NfcManager.requestTechnology(NfcTech.MifareUltralight);
        const mfuHandler = getMfuHandler(NfcManager as unknown as AnyRecord);
        return await detectUltralightSubtype(mfuHandler);
      } catch {
        return { type: "MIFARE_ULTRALIGHT", label: "MIFARE Ultralight", memoryBytes: 64 };
      } finally {
        await NfcManager.cancelTechnologyRequest().catch(() => {});
      }
    }
    return { type: "MIFARE_ULTRALIGHT", label: "MIFARE Ultralight", memoryBytes: 64 };
  }

  return { type: "NDEF", label: "NDEF", memoryBytes: 0 };
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

function parsePayloadJson(text: string, uid: string): BraceletPayload {
  try {
    const parsed = JSON.parse(text);
    return {
      uid,
      balance: typeof parsed.balance === "number" ? parsed.balance : 0,
      counter: typeof parsed.counter === "number" ? parsed.counter : 0,
      hmac: typeof parsed.hmac === "string" ? parsed.hmac : "",
    };
  } catch {
    return { uid, balance: 0, counter: 0, hmac: "" };
  }
}

function getUid(tag: unknown): string {
  if (tag && typeof tag === "object" && "id" in tag) {
    const id = (tag as { id?: unknown }).id;
    // Plain number array (most common on Android)
    if (Array.isArray(id) && id.length > 0) {
      return (id as number[])
        .map((b: number) => (b & 0xff).toString(16).padStart(2, "0"))
        .join(":")
        .toUpperCase();
    }
    // Uint8Array / Buffer (some Android versions / react-native-nfc-manager variants)
    if (id && typeof id === "object" && "byteLength" in (id as object)) {
      const arr = new Uint8Array(id as ArrayBuffer);
      if (arr.length > 0) {
        return Array.from(arr)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(":")
          .toUpperCase();
      }
    }
    // Hex string fallback (e.g. "04A3B2C1")
    if (typeof id === "string" && id.length > 0 && id !== "UNKNOWN") {
      const clean = id.replace(/[^0-9a-fA-F]/g, "");
      if (clean.length >= 2) {
        return (clean.match(/.{1,2}/g) ?? []).join(":").toUpperCase();
      }
    }
  }
  return "UNKNOWN";
}

async function readBraceletNdef(): Promise<BraceletPayload> {
  if (!NfcManager || !NfcTech || !Ndef) {
    throw new Error("NFC_NOT_AVAILABLE");
  }

  try {
    await NfcManager.requestTechnology(NfcTech.Ndef);
    const tag = await NfcManager.getTag();
    if (!tag) throw new Error("NFC_NO_TAG");

    const uid = getUid(tag);
    const ndefMsg = (tag as { ndefMessage?: unknown[] }).ndefMessage;
    if (!ndefMsg || ndefMsg.length === 0) {
      return { uid, balance: 0, counter: 0, hmac: "" };
    }

    const firstRecord = ndefMsg[0] as { payload: number[] };
    const text = Ndef.text.decodePayload(new Uint8Array(firstRecord.payload));
    return parsePayloadJson(text, uid);
  } finally {
    await NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}

async function writeBraceletNdef(payload: BraceletPayload): Promise<void> {
  if (!NfcManager || !NfcTech || !Ndef) {
    throw new Error("NFC_NOT_AVAILABLE");
  }

  // Clear any stale session — do NOT call start() as it resets handler references
  await NfcManager.cancelTechnologyRequest().catch(() => {});

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

const MIFARE_BLOCK_SIZE = 16;
const MFC_KEY_A = [0xff, 0xff, 0xff, 0xff, 0xff, 0xff];
const MFC_PAYLOAD_SECTORS = [1, 2, 3];
const MFC_DATA_BLOCKS_IN_SECTOR = 3;

export async function readBraceletMifareClassic(): Promise<BraceletPayload> {
  if (!NfcManager || !NfcTech) throw new Error("NFC_NOT_AVAILABLE");

  if (Platform.OS === "ios") {
    return readBraceletNdef();
  }

  try {
    await NfcManager.requestTechnology(NfcTech.MifareClassic);
    const tag = await NfcManager.getTag();
    if (!tag) throw new Error("NFC_NO_TAG");

    const uid = getUid(tag);
    const mfcHandler = getMfcHandler(NfcManager as unknown as AnyRecord);
    if (!mfcHandler) throw new Error("MIFARE_CLASSIC_HANDLER_UNAVAILABLE");

    const allBytes: number[] = [];
    for (const sector of MFC_PAYLOAD_SECTORS) {
      await mfcHandler.mifareClassicAuthenticateA(sector, MFC_KEY_A);
      const sectorFirstBlock = await mfcHandler.mifareClassicSectorToBlock(sector);
      for (let i = 0; i < MFC_DATA_BLOCKS_IN_SECTOR; i++) {
        const blockData = await mfcHandler.mifareClassicReadBlock(sectorFirstBlock + i);
        allBytes.push(...blockData);
      }
    }

    const textBytes = new Uint8Array(allBytes);
    const jsonStart = textBytes.indexOf(0x7b);
    if (jsonStart === -1) {
      return { uid, balance: 0, counter: 0, hmac: "" };
    }
    let jsonEnd = textBytes.length;
    for (let i = jsonStart; i < textBytes.length; i++) {
      if (textBytes[i] === 0) {
        jsonEnd = i;
        break;
      }
    }
    const text = new TextDecoder().decode(textBytes.slice(jsonStart, jsonEnd));
    return parsePayloadJson(text, uid);
  } finally {
    await NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}

export async function writeBraceletMifareClassic(payload: BraceletPayload): Promise<void> {
  if (!NfcManager || !NfcTech) throw new Error("NFC_NOT_AVAILABLE");

  if (Platform.OS === "ios") {
    return writeBraceletNdef(payload);
  }

  // Clear any stale session — same multi-tech array as scanBracelet so Android
  // uses the same foreground-dispatch path and keeps mifareClassicHandlerAndroid intact.
  // Do NOT call NfcManager.start() here — it resets handler references to null.
  await NfcManager.cancelTechnologyRequest().catch(() => {});

  try {
    await NfcManager.requestTechnology([
      NfcTech.MifareClassic,
      NfcTech.MifareUltralight,
      NfcTech.Ndef,
      NfcTech.NfcA,
    ]);

    // Verify the tag is actually MIFARE Classic
    const tag = await NfcManager.getTag();
    if (!tag) throw new Error("NFC_NO_TAG");
    const techTypes = getTagTechTypes(tag);
    if (!hasTech(techTypes, "MifareClassic")) {
      throw new Error("TAG_NOT_MIFARE_CLASSIC");
    }

    const mfcHandler = getMfcHandler(NfcManager as unknown as AnyRecord);
    if (!mfcHandler) throw new Error("MIFARE_CLASSIC_HANDLER_UNAVAILABLE");

    const data = JSON.stringify({
      balance: payload.balance,
      counter: payload.counter,
      hmac: payload.hmac,
    });
    const dataBytes = Array.from(new TextEncoder().encode(data));
    const maxCapacity = MIFARE_BLOCK_SIZE * MFC_DATA_BLOCKS_IN_SECTOR * MFC_PAYLOAD_SECTORS.length;
    if (dataBytes.length > maxCapacity) {
      throw new Error("PAYLOAD_TOO_LARGE_FOR_MIFARE_CLASSIC");
    }

    const padded = new Array(maxCapacity).fill(0);
    for (let i = 0; i < dataBytes.length; i++) {
      padded[i] = dataBytes[i];
    }

    let byteOffset = 0;
    for (const sector of MFC_PAYLOAD_SECTORS) {
      await mfcHandler.mifareClassicAuthenticateA(sector, MFC_KEY_A);
      const sectorFirstBlock = await mfcHandler.mifareClassicSectorToBlock(sector);
      for (let i = 0; i < MFC_DATA_BLOCKS_IN_SECTOR; i++) {
        const blockData = padded.slice(byteOffset, byteOffset + MIFARE_BLOCK_SIZE);
        await mfcHandler.mifareClassicWriteBlock(sectorFirstBlock + i, blockData);
        byteOffset += MIFARE_BLOCK_SIZE;
      }
    }
  } finally {
    await NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}

const MFU_PAGE_SIZE = 4;
const MFU_PAYLOAD_START_PAGE = 4;
// NXP factory-default 3DES key for MIFARE Ultralight C (AUTH0=0x30 out of box).
// Used as a fallback when no custom key is configured for the event.
const ULTRALIGHT_C_FACTORY_KEY = "49454d4b41455242214e4143554f5946";

function getMfuEndPage(tagType: TagType): number {
  return NTAG_USER_MEMORY_END_PAGE[tagType] ?? 15;
}

export async function readBraceletUltralight(tagType: TagType = "MIFARE_ULTRALIGHT"): Promise<BraceletPayload> {
  if (!NfcManager || !NfcTech) throw new Error("NFC_NOT_AVAILABLE");

  if (Platform.OS === "ios") {
    return readBraceletNdef();
  }

  let uid = "UNKNOWN";
  let needsNdefFallback = false;
  let rawResult: BraceletPayload | null = null;

  try {
    await NfcManager.requestTechnology(NfcTech.MifareUltralight);
    const tag = await NfcManager.getTag();
    if (!tag) throw new Error("NFC_NO_TAG");

    uid = getUid(tag);
    const mfuHandler = getMfuHandler(NfcManager as unknown as AnyRecord);
    if (!mfuHandler) throw new Error("ULTRALIGHT_HANDLER_UNAVAILABLE");

    const endPage = getMfuEndPage(tagType);
    const rawBytes: number[] = [];
    let foundEnd = false;
    for (let page = MFU_PAYLOAD_START_PAGE; page < endPage && !foundEnd; page += 4) {
      const pageData = await mfuHandler.mifareUltralightReadPages(page);
      rawBytes.push(...pageData);
      for (let i = 0; i < pageData.length; i++) {
        if (pageData[i] === 0) {
          foundEnd = true;
          break;
        }
      }
    }

    const allBytes = new Uint8Array(rawBytes);
    const jsonStart = allBytes.indexOf(0x7b);
    if (jsonStart === -1) {
      needsNdefFallback = true;
    } else {
      let jsonEnd = allBytes.length;
      for (let i = jsonStart; i < allBytes.length; i++) {
        if (allBytes[i] === 0) {
          jsonEnd = i;
          break;
        }
      }
      const text = new TextDecoder().decode(allBytes.slice(jsonStart, jsonEnd));
      const result = parsePayloadJson(text, uid);
      if (!result.hmac && !result.balance && !result.counter) {
        needsNdefFallback = true;
        rawResult = result;
      } else {
        rawResult = result;
      }
    }
  } finally {
    await NfcManager.cancelTechnologyRequest().catch(() => {});
  }

  if (needsNdefFallback) {
    return readBraceletNdef().catch(() => rawResult ?? { uid, balance: 0, counter: 0, hmac: "" });
  }

  return rawResult ?? { uid, balance: 0, counter: 0, hmac: "" };
}

export async function writeBraceletUltralight(
  payload: BraceletPayload,
  tagType: TagType = "MIFARE_ULTRALIGHT"
): Promise<void> {
  if (!NfcManager || !NfcTech) throw new Error("NFC_NOT_AVAILABLE");

  if (Platform.OS === "ios") {
    return writeBraceletNdef(payload);
  }

  // Clear any stale session — do NOT call start()
  await NfcManager.cancelTechnologyRequest().catch(() => {});

  try {
    await NfcManager.requestTechnology([
      NfcTech.MifareUltralight,
      NfcTech.MifareClassic,
      NfcTech.Ndef,
      NfcTech.NfcA,
    ]);
    const mfuHandler = getMfuHandler(NfcManager as unknown as AnyRecord);
    if (!mfuHandler) throw new Error("ULTRALIGHT_HANDLER_UNAVAILABLE");

    const data = JSON.stringify({
      balance: payload.balance,
      counter: payload.counter,
      hmac: payload.hmac,
    });
    const dataBytes = Array.from(new TextEncoder().encode(data));
    const endPage = getMfuEndPage(tagType);
    const maxDataPages = endPage - MFU_PAYLOAD_START_PAGE;
    const pageCount = Math.ceil((dataBytes.length + 1) / MFU_PAGE_SIZE);
    if (pageCount > maxDataPages) {
      throw new Error("PAYLOAD_TOO_LARGE_FOR_ULTRALIGHT");
    }

    const padded = new Array(pageCount * MFU_PAGE_SIZE).fill(0);
    for (let i = 0; i < dataBytes.length; i++) {
      padded[i] = dataBytes[i];
    }

    for (let i = 0; i < pageCount; i++) {
      const pageData = padded.slice(i * MFU_PAGE_SIZE, (i + 1) * MFU_PAGE_SIZE);
      await mfuHandler.mifareUltralightWritePage(MFU_PAYLOAD_START_PAGE + i, pageData);
    }

    if (pageCount < maxDataPages) {
      await mfuHandler.mifareUltralightWritePage(MFU_PAYLOAD_START_PAGE + pageCount, [0, 0, 0, 0]);
    }
  } finally {
    await NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}

type TransceiveFn = (data: number[]) => Promise<number[]>;

async function authenticateUltralightC(transceiveFn: TransceiveFn, keyHex: string): Promise<void> {
  if (!/^[0-9a-fA-F]{32}$/.test(keyHex)) {
    throw new Error("ULTRALIGHT_C_INVALID_KEY_FORMAT");
  }
  const keyBytes = new Uint8Array(
    (keyHex.match(/.{1,2}/g) ?? []).map((b) => parseInt(b, 16))
  );
  if (keyBytes.length !== 16) {
    throw new Error("ULTRALIGHT_C_INVALID_KEY_LENGTH");
  }

  // Step 1: Send AUTH1 command (0x1A 0x00) to get RndB encrypted
  const auth1Response = await transceiveFn([0x1a, 0x00]);
  if (!auth1Response || auth1Response.length < 9) {
    throw new Error("ULTRALIGHT_C_AUTH_FAILED_STEP1");
  }
  // Response: 0xAF + 8 bytes encrypted RndB
  if (auth1Response[0] !== 0xaf) {
    throw new Error("ULTRALIGHT_C_AUTH_UNEXPECTED_RESPONSE");
  }
  const encRndB = new Uint8Array(auth1Response.slice(1, 9));

  // Step 2: Decrypt RndB using 3DES (2TDEA) in CBC mode with IV=0
  const rndB = des3DecryptCBC(encRndB, keyBytes, new Uint8Array(8));

  // Step 3: Rotate RndB left by 1 byte to get RndB'
  const rndBPrime = new Uint8Array(8);
  for (let i = 0; i < 7; i++) rndBPrime[i] = rndB[i + 1];
  rndBPrime[7] = rndB[0];

  // Step 4: Generate random RndA (8 bytes)
  const rndA = new Uint8Array(8);
  crypto.getRandomValues(rndA);

  // Step 5: Encrypt [RndA | RndB'] with 3DES CBC, IV = last block of encRndB
  const plaintext = new Uint8Array(16);
  plaintext.set(rndA, 0);
  plaintext.set(rndBPrime, 8);
  const encPayload = des3EncryptCBC(plaintext, keyBytes, encRndB);

  // Step 6: Send AUTH2 command: 0xAF + 16 bytes ciphertext
  const auth2Cmd = [0xaf, ...Array.from(encPayload)];
  const auth2Response = await transceiveFn(auth2Cmd);
  if (!auth2Response || auth2Response.length < 9) {
    throw new Error("ULTRALIGHT_C_AUTH_FAILED_STEP2");
  }
  // Response: 0x00 + 8 bytes encrypted RndA' (tag-rotated RndA, left 1 byte)
  if (auth2Response[0] !== 0x00) {
    throw new Error("ULTRALIGHT_C_AUTH_FAILED_WRONG_MAC");
  }
  const encRndAPrime = new Uint8Array(auth2Response.slice(1, 9));

  // Step 7: Decrypt RndA' and verify it equals RndA rotated left by 1 byte
  // IV for this decrypt is the last block of encPayload (second 8 bytes)
  const ivForDecrypt = encPayload.slice(8, 16);
  const decRndAPrime = des3DecryptCBC(encRndAPrime, keyBytes, ivForDecrypt);

  // Expected RndA' = RndA rotated left by 1 byte
  const expectedRndAPrime = new Uint8Array(8);
  for (let i = 0; i < 7; i++) expectedRndAPrime[i] = rndA[i + 1];
  expectedRndAPrime[7] = rndA[0];

  for (let i = 0; i < 8; i++) {
    if (decRndAPrime[i] !== expectedRndAPrime[i]) {
      throw new Error("ULTRALIGHT_C_AUTH_FAILED_RNDA_MISMATCH");
    }
  }
}

// ---------------------------------------------------------------------------
// 3DES (2TDEA) CBC helpers using crypto-js (already a project dependency).
// Used for MIFARE Ultralight C mutual authentication.
// ---------------------------------------------------------------------------

function uint8ArrayToWordArray(u8: Uint8Array): CryptoJS.lib.WordArray {
  const words: number[] = [];
  for (let i = 0; i < u8.length; i += 4) {
    words.push(
      ((u8[i] ?? 0) << 24) |
      ((u8[i + 1] ?? 0) << 16) |
      ((u8[i + 2] ?? 0) << 8) |
      (u8[i + 3] ?? 0)
    );
  }
  return CryptoJS.lib.WordArray.create(words, u8.length);
}

function wordArrayToUint8Array(wa: CryptoJS.lib.WordArray): Uint8Array {
  const out = new Uint8Array(wa.sigBytes);
  for (let i = 0; i < wa.sigBytes; i++) {
    out[i] = (wa.words[i >> 2] >> (24 - (i & 3) * 8)) & 0xff;
  }
  return out;
}

function des3DecryptCBC(data: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array {
  const keyWA = uint8ArrayToWordArray(key);
  const ivWA = uint8ArrayToWordArray(iv);
  const dataWA = uint8ArrayToWordArray(data);
  const decrypted = CryptoJS.TripleDES.decrypt(
    { ciphertext: dataWA } as CryptoJS.lib.CipherParams,
    keyWA,
    { iv: ivWA, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.NoPadding }
  );
  return wordArrayToUint8Array(decrypted);
}

function des3EncryptCBC(data: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array {
  const keyWA = uint8ArrayToWordArray(key);
  const ivWA = uint8ArrayToWordArray(iv);
  const dataWA = uint8ArrayToWordArray(data);
  const encrypted = CryptoJS.TripleDES.encrypt(
    dataWA,
    keyWA,
    { iv: ivWA, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.NoPadding }
  );
  return wordArrayToUint8Array(encrypted.ciphertext);
}

export async function readBraceletUltralightC(): Promise<BraceletPayload> {
  return readBraceletUltralight("MIFARE_ULTRALIGHT_C");
}

export async function writeBraceletUltralightC(
  payload: BraceletPayload,
  keyHex?: string
): Promise<void> {
  if (!NfcManager || !NfcTech) throw new Error("NFC_NOT_AVAILABLE");

  if (Platform.OS === "ios") {
    return writeBraceletNdef(payload);
  }

  await NfcManager.cancelTechnologyRequest().catch(() => {});

  try {
    await NfcManager.requestTechnology([
      NfcTech.MifareUltralight,
      NfcTech.MifareClassic,
      NfcTech.Ndef,
      NfcTech.NfcA,
    ]);
    const mfuHandler = getMfuHandler(NfcManager as unknown as AnyRecord);
    if (!mfuHandler) throw new Error("ULTRALIGHT_HANDLER_UNAVAILABLE");

    // Authenticate before writing if a key is provided — hard failure if auth fails.
    // MifareUltralightHandlerAndroid does NOT expose transceive; use nfcAHandler instead.
    if (keyHex && Platform.OS === "android") {
      const mgr2 = NfcManager as unknown as AnyRecord;
      const nfcAHandler2 = mgr2["nfcAHandler"] as { transceive?: TransceiveFn } | null;
      const transceiveFn2: TransceiveFn | undefined =
        (nfcAHandler2?.transceive ? nfcAHandler2.transceive.bind(nfcAHandler2) : undefined) ??
        (typeof mgr2["transceive"] === "function" ? (mgr2["transceive"] as TransceiveFn).bind(mgr2) : undefined);
      if (!transceiveFn2) throw new Error("ULTRALIGHT_C_AUTH_FAILED: ULTRALIGHT_C_TRANSCEIVE_UNAVAILABLE");
      await authenticateUltralightC(transceiveFn2, keyHex);
    }

    const data = JSON.stringify({
      balance: payload.balance,
      counter: payload.counter,
      hmac: payload.hmac,
    });
    const dataBytes = Array.from(new TextEncoder().encode(data));
    const endPage = getMfuEndPage("MIFARE_ULTRALIGHT_C");
    const maxDataPages = endPage - MFU_PAYLOAD_START_PAGE;
    const pageCount = Math.ceil((dataBytes.length + 1) / MFU_PAGE_SIZE);
    if (pageCount > maxDataPages) {
      throw new Error("PAYLOAD_TOO_LARGE_FOR_ULTRALIGHT_C");
    }

    const padded = new Array(pageCount * MFU_PAGE_SIZE).fill(0);
    for (let i = 0; i < dataBytes.length; i++) {
      padded[i] = dataBytes[i];
    }

    for (let i = 0; i < pageCount; i++) {
      const pageData = padded.slice(i * MFU_PAGE_SIZE, (i + 1) * MFU_PAGE_SIZE);
      await mfuHandler.mifareUltralightWritePage(MFU_PAYLOAD_START_PAGE + i, pageData);
    }

    if (pageCount < maxDataPages) {
      await mfuHandler.mifareUltralightWritePage(MFU_PAYLOAD_START_PAGE + pageCount, [0, 0, 0, 0]);
    }
  } finally {
    await NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}

export interface ScanResult {
  payload: BraceletPayload;
  tagInfo: TagInfo;
}

async function detectTagTypeIos(): Promise<TagInfo> {
  if (!NfcManager || !NfcTech) return { type: "NDEF", label: "NDEF", memoryBytes: 0 };
  try {
    await NfcManager.requestTechnology(NfcTech.Ndef);
    const tag = await NfcManager.getTag();
    const techTypes = getTagTechTypes(tag);
    if (hasTech(techTypes, "MifareUltralight") || hasTech(techTypes, "MifareIOS") || hasTech(techTypes, "mifare")) {
      return { type: "MIFARE_ULTRALIGHT", label: "MIFARE Ultralight", memoryBytes: 64 };
    }
    return { type: "NDEF", label: "NDEF", memoryBytes: 0 };
  } catch {
    return { type: "NDEF", label: "NDEF", memoryBytes: 0 };
  } finally {
    await NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}

export type NfcChipTypeHint = "ntag_21x" | "mifare_classic" | "mifare_ultralight_c";

export async function scanBracelet(opts?: { expectedChipType?: NfcChipTypeHint }): Promise<ScanResult> {
  if (!NfcManager || !NfcTech || !Ndef) {
    throw new Error("NFC_NOT_AVAILABLE");
  }

  if (Platform.OS === "ios") {
    try {
      await NfcManager.requestTechnology(NfcTech.Ndef);
      const tag = await NfcManager.getTag();
      if (!tag) throw new Error("NFC_NO_TAG");
      const uid = getUid(tag);
      const techTypes = getTagTechTypes(tag);
      const tagInfo: TagInfo =
        hasTech(techTypes, "MifareUltralight") || hasTech(techTypes, "MifareIOS") || hasTech(techTypes, "mifare")
          ? { type: "MIFARE_ULTRALIGHT", label: "MIFARE Ultralight", memoryBytes: 64 }
          : { type: "NDEF", label: "NDEF", memoryBytes: 0 };
      const ndefMsg = (tag as { ndefMessage?: unknown[] }).ndefMessage;
      if (!ndefMsg || ndefMsg.length === 0) {
        return { payload: { uid, balance: 0, counter: 0, hmac: "" }, tagInfo };
      }
      const firstRecord = ndefMsg[0] as { payload: number[] };
      const text = Ndef.text.decodePayload(new Uint8Array(firstRecord.payload));
      return { payload: parsePayloadJson(text, uid), tagInfo };
    } finally {
      await NfcManager.cancelTechnologyRequest().catch(() => {});
    }
  }

  // Android: single NFC session — detect tag type AND read data without re-requesting.
  // Prioritize the expected chip technology first so Android foreground dispatch
  // picks it up in a single pass, while keeping others as fallback.
  const preferMifare = opts?.expectedChipType === "mifare_classic";
  try {
    await NfcManager.requestTechnology(
      preferMifare
        ? [NfcTech.MifareClassic, NfcTech.MifareUltralight, NfcTech.Ndef, NfcTech.NfcA]
        : [NfcTech.MifareUltralight, NfcTech.MifareClassic, NfcTech.Ndef, NfcTech.NfcA]
    );
    const tag = await NfcManager.getTag();
    if (!tag) throw new Error("NFC_NO_TAG");

    const uid = getUid(tag);
    const techTypes = getTagTechTypes(tag);

    if (hasTech(techTypes, "MifareClassic")) {
      const tagInfo: TagInfo = { type: "MIFARE_CLASSIC", label: "MIFARE Classic", memoryBytes: 1024 };
      const mfcHandler = getMfcHandler(NfcManager as unknown as AnyRecord);
      if (!mfcHandler) throw new Error("MIFARE_CLASSIC_HANDLER_UNAVAILABLE");

      const allBytes: number[] = [];
      for (const sector of MFC_PAYLOAD_SECTORS) {
        await mfcHandler.mifareClassicAuthenticateA(sector, MFC_KEY_A);
        const sectorFirstBlock = await mfcHandler.mifareClassicSectorToBlock(sector);
        for (let i = 0; i < MFC_DATA_BLOCKS_IN_SECTOR; i++) {
          const blockData = await mfcHandler.mifareClassicReadBlock(sectorFirstBlock + i);
          allBytes.push(...blockData);
        }
      }
      const textBytes = new Uint8Array(allBytes);
      const jsonStart = textBytes.indexOf(0x7b);
      if (jsonStart === -1) return { payload: { uid, balance: 0, counter: 0, hmac: "" }, tagInfo };
      let jsonEnd = textBytes.length;
      for (let i = jsonStart; i < textBytes.length; i++) {
        if (textBytes[i] === 0) { jsonEnd = i; break; }
      }
      const text = new TextDecoder().decode(textBytes.slice(jsonStart, jsonEnd));
      return { payload: parsePayloadJson(text, uid), tagInfo };
    }

    if (hasTech(techTypes, "MifareUltralight")) {
      const mfuHandler = getMfuHandler(NfcManager as unknown as AnyRecord);
      if (!mfuHandler) throw new Error("ULTRALIGHT_HANDLER_UNAVAILABLE");

      const subtype = await detectUltralightSubtype(mfuHandler);
      const tagInfo: TagInfo = subtype;
      const endPage = getMfuEndPage(tagInfo.type);

      const rawBytes: number[] = [];
      let foundEnd = false;
      for (let page = MFU_PAYLOAD_START_PAGE; page < endPage && !foundEnd; page += 4) {
        const pageData = await mfuHandler.mifareUltralightReadPages(page);
        rawBytes.push(...pageData);
        for (let i = 0; i < pageData.length; i++) {
          if (pageData[i] === 0) { foundEnd = true; break; }
        }
      }
      const allBytes = new Uint8Array(rawBytes);
      const jsonStart = allBytes.indexOf(0x7b);
      if (jsonStart === -1) return { payload: { uid, balance: 0, counter: 0, hmac: "" }, tagInfo };
      let jsonEnd = allBytes.length;
      for (let i = jsonStart; i < allBytes.length; i++) {
        if (allBytes[i] === 0) { jsonEnd = i; break; }
      }
      const text = new TextDecoder().decode(allBytes.slice(jsonStart, jsonEnd));
      return { payload: parsePayloadJson(text, uid), tagInfo };
    }

    // NDEF fallback
    const tagInfo: TagInfo = { type: "NDEF", label: "NDEF", memoryBytes: 0 };
    const ndefMsg = (tag as { ndefMessage?: unknown[] }).ndefMessage;
    if (!ndefMsg || ndefMsg.length === 0) {
      return { payload: { uid, balance: 0, counter: 0, hmac: "" }, tagInfo };
    }
    const firstRecord = ndefMsg[0] as { payload: number[] };
    const text = Ndef.text.decodePayload(new Uint8Array(firstRecord.payload));
    return { payload: parsePayloadJson(text, uid), tagInfo };
  } finally {
    await NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}

export async function writeBracelet(
  payload: BraceletPayload,
  tagInfo?: TagInfo,
  opts?: { ultralightCKeyHex?: string }
): Promise<void> {
  if (!tagInfo) {
    return writeBraceletNdef(payload);
  }

  switch (tagInfo.type) {
    case "MIFARE_CLASSIC":
      return writeBraceletMifareClassic(payload);
    case "NTAG213":
    case "NTAG215":
    case "NTAG216":
    case "MIFARE_ULTRALIGHT":
      return writeBraceletUltralight(payload, tagInfo.type);
    case "MIFARE_ULTRALIGHT_C":
      return writeBraceletUltralightC(payload, opts?.ultralightCKeyHex);
    default:
      return writeBraceletNdef(payload);
  }
}

export async function readBracelet(): Promise<BraceletPayload> {
  return readBraceletNdef();
}

export async function cancelNfc(): Promise<void> {
  if (!NfcManager) return;
  try {
    await NfcManager.cancelTechnologyRequest();
  } catch {}
}

/**
 * Read then write in a single NFC session — one tap only.
 *
 * `onRead` receives the data read from the tag and returns either:
 *   - A new BraceletPayload to write back to the tag, OR
 *   - null to abort the write (e.g. HMAC fail, insufficient balance).
 *
 * Returns the read payload, the detected tag type, and whether a write occurred.
 */
export async function scanAndWriteBracelet(
  onRead: (payload: BraceletPayload, tagInfo: TagInfo) => Promise<BraceletPayload | null>,
  opts?: { expectedChipType?: NfcChipTypeHint; ultralightCKeyHex?: string; onBeforeFirstWrite?: () => void }
): Promise<{ payload: BraceletPayload; tagInfo: TagInfo; written: boolean }> {
  if (!NfcManager || !NfcTech || !Ndef) {
    throw new Error("NFC_NOT_AVAILABLE");
  }

  // ── iOS: single NDEF session covers both read and write ──────────────────
  if (Platform.OS === "ios") {
    await NfcManager.cancelTechnologyRequest().catch(() => {});
    try {
      await NfcManager.requestTechnology(NfcTech.Ndef);
      const tag = await NfcManager.getTag();
      if (!tag) throw new Error("NFC_NO_TAG");

      const uid = getUid(tag);
      const techTypes = getTagTechTypes(tag);
      const tagInfo: TagInfo =
        hasTech(techTypes, "MifareUltralight") || hasTech(techTypes, "MifareIOS") || hasTech(techTypes, "mifare")
          ? { type: "MIFARE_ULTRALIGHT", label: "MIFARE Ultralight", memoryBytes: 64 }
          : { type: "NDEF", label: "NDEF", memoryBytes: 0 };

      const ndefMsg = (tag as { ndefMessage?: unknown[] }).ndefMessage;
      let payload: BraceletPayload;
      if (!ndefMsg || ndefMsg.length === 0) {
        payload = { uid, balance: 0, counter: 0, hmac: "" };
      } else {
        const firstRecord = ndefMsg[0] as { payload: number[] };
        const text = Ndef.text.decodePayload(new Uint8Array(firstRecord.payload));
        payload = parsePayloadJson(text, uid);
      }

      const newPayload = await onRead(payload, tagInfo);
      if (!newPayload) return { payload, tagInfo, written: false };

      const data = JSON.stringify({ balance: newPayload.balance, counter: newPayload.counter, hmac: newPayload.hmac });
      const bytes = Ndef.encodeMessage([Ndef.textRecord(data)]);
      await NfcManager.ndefHandler.writeNdefMessage(bytes);
      return { payload, tagInfo, written: true };
    } finally {
      await NfcManager.cancelTechnologyRequest().catch(() => {});
    }
  }

  // ── Android: request all tech types once, then read + write in same session.
  // Prioritize the expected chip technology first for better foreground dispatch.
  const preferMifareWrite = opts?.expectedChipType === "mifare_classic";
  await NfcManager.cancelTechnologyRequest().catch(() => {});
  try {
    await NfcManager.requestTechnology(
      preferMifareWrite
        ? [NfcTech.MifareClassic, NfcTech.MifareUltralight, NfcTech.Ndef, NfcTech.NfcA]
        : [NfcTech.MifareUltralight, NfcTech.MifareClassic, NfcTech.Ndef, NfcTech.NfcA]
    );
    const tag = await NfcManager.getTag();
    if (!tag) throw new Error("NFC_NO_TAG");

    const uid = getUid(tag);
    const techTypes = getTagTechTypes(tag);

    // ── MIFARE Classic ──────────────────────────────────────────────────────
    if (hasTech(techTypes, "MifareClassic")) {
      const tagInfo: TagInfo = { type: "MIFARE_CLASSIC", label: "MIFARE Classic", memoryBytes: 1024 };
      const mfcHandler = getMfcHandler(NfcManager as unknown as AnyRecord);
      if (!mfcHandler) throw new Error("MIFARE_CLASSIC_HANDLER_UNAVAILABLE");

      // Read
      const allBytes: number[] = [];
      for (const sector of MFC_PAYLOAD_SECTORS) {
        await mfcHandler.mifareClassicAuthenticateA(sector, MFC_KEY_A);
        const sectorFirstBlock = await mfcHandler.mifareClassicSectorToBlock(sector);
        for (let i = 0; i < MFC_DATA_BLOCKS_IN_SECTOR; i++) {
          const blockData = await mfcHandler.mifareClassicReadBlock(sectorFirstBlock + i);
          allBytes.push(...blockData);
        }
      }
      const textBytes = new Uint8Array(allBytes);
      const jsonStart = textBytes.indexOf(0x7b);
      let payload: BraceletPayload;
      if (jsonStart === -1) {
        payload = { uid, balance: 0, counter: 0, hmac: "" };
      } else {
        let jsonEnd = textBytes.length;
        for (let i = jsonStart; i < textBytes.length; i++) {
          if (textBytes[i] === 0) { jsonEnd = i; break; }
        }
        payload = parsePayloadJson(new TextDecoder().decode(textBytes.slice(jsonStart, jsonEnd)), uid);
      }

      const newPayload = await onRead(payload, tagInfo);
      if (!newPayload) return { payload, tagInfo, written: false };

      // Write in the same session
      const data = JSON.stringify({ balance: newPayload.balance, counter: newPayload.counter, hmac: newPayload.hmac });
      const dataBytes = Array.from(new TextEncoder().encode(data));
      const maxCapacity = MIFARE_BLOCK_SIZE * MFC_DATA_BLOCKS_IN_SECTOR * MFC_PAYLOAD_SECTORS.length;
      if (dataBytes.length > maxCapacity) throw new Error("PAYLOAD_TOO_LARGE_FOR_MIFARE_CLASSIC");
      const padded = new Array(maxCapacity).fill(0);
      for (let i = 0; i < dataBytes.length; i++) padded[i] = dataBytes[i];

      let firstBlockWritten = false;
      let byteOffset = 0;
      for (const sector of MFC_PAYLOAD_SECTORS) {
        await mfcHandler.mifareClassicAuthenticateA(sector, MFC_KEY_A);
        const sectorFirstBlock = await mfcHandler.mifareClassicSectorToBlock(sector);
        for (let i = 0; i < MFC_DATA_BLOCKS_IN_SECTOR; i++) {
          await mfcHandler.mifareClassicWriteBlock(sectorFirstBlock + i, padded.slice(byteOffset, byteOffset + MIFARE_BLOCK_SIZE));
          if (!firstBlockWritten) { firstBlockWritten = true; opts?.onBeforeFirstWrite?.(); }
          byteOffset += MIFARE_BLOCK_SIZE;
        }
      }
      return { payload, tagInfo, written: true };
    }

    // ── MIFARE Ultralight / NTAG / Ultralight C ─────────────────────────────
    if (hasTech(techTypes, "MifareUltralight")) {
      const mfuHandler = getMfuHandler(NfcManager as unknown as AnyRecord);
      if (!mfuHandler) throw new Error("ULTRALIGHT_HANDLER_UNAVAILABLE");

      console.log("[NFC] Ultralight path — detecting subtype...");
      let tagInfo: TagInfo;
      try {
        tagInfo = await detectUltralightSubtype(mfuHandler);
      } catch (e) {
        console.error("[NFC] detectUltralightSubtype failed:", e instanceof Error ? e.message : String(e));
        throw e;
      }
      console.log("[NFC] Chip type:", tagInfo.type, tagInfo.label, "endPage:", getMfuEndPage(tagInfo.type));
      const endPage = getMfuEndPage(tagInfo.type);

      // Read pages
      const rawBytes: number[] = [];
      let foundEnd = false;
      try {
        for (let page = MFU_PAYLOAD_START_PAGE; page < endPage && !foundEnd; page += 4) {
          const pageData = await mfuHandler.mifareUltralightReadPages(page);
          rawBytes.push(...pageData);
          for (let i = 0; i < pageData.length; i++) {
            if (pageData[i] === 0) { foundEnd = true; break; }
          }
        }
      } catch (e) {
        console.error("[NFC] Read pages failed:", e instanceof Error ? e.message : String(e));
        throw e;
      }
      const allBytes = new Uint8Array(rawBytes);
      let payload: BraceletPayload;
      if (allBytes.length > 0 && allBytes[0] === COMPACT_BINARY_MAGIC) {
        // Compact binary format (basic MIFARE Ultralight)
        payload = decodeBraceletCompact(allBytes, uid);
        console.log("[NFC] Read compact binary — balance:", payload.balance, "counter:", payload.counter);
      } else {
        const jsonStart = allBytes.indexOf(0x7b);
        if (jsonStart === -1) {
          payload = { uid, balance: 0, counter: 0, hmac: "" };
        } else {
          let jsonEnd = allBytes.length;
          for (let i = jsonStart; i < allBytes.length; i++) {
            if (allBytes[i] === 0) { jsonEnd = i; break; }
          }
          payload = parsePayloadJson(new TextDecoder().decode(allBytes.slice(jsonStart, jsonEnd)), uid);
        }
        console.log("[NFC] Read JSON payload balance:", payload.balance, "uid:", uid.slice(-6));
      }

      const newPayload = await onRead(payload, tagInfo);
      if (!newPayload) return { payload, tagInfo, written: false };

      // For Ultralight C: always attempt 3DES authentication before writing.
      // Use the configured key if provided; fall back to the NXP factory default.
      // This covers chips where write-protection is enabled (AUTH0 set) but no
      // custom key has been configured in the event — the factory default key
      // is the most common case for unmodified NXP bracelets.
      // If auth fails with the chosen key, we propagate the error so the caller
      // does NOT record a topup (writeAttempted stays false — chip unchanged).
      if (tagInfo.type === "MIFARE_ULTRALIGHT_C") {
        const usingCustomKey = !!opts?.ultralightCKeyHex;
        const authKey = opts?.ultralightCKeyHex || ULTRALIGHT_C_FACTORY_KEY;
        // MifareUltralightHandlerAndroid does NOT expose transceive in react-native-nfc-manager v3.x.
        // Raw transceive is available via NfcManager.nfcAHandler.transceive (cross-platform)
        // or directly on NfcManagerAndroid.transceive. MIFARE Ultralight C IS an NFC-A tag,
        // so the NfcA transceive channel works for the 3DES AUTH1/AUTH2 commands.
        const mgr = NfcManager as unknown as AnyRecord;
        const nfcAHandler = mgr["nfcAHandler"] as { transceive?: TransceiveFn } | null;
        const transceiveFn: TransceiveFn | undefined =
          (nfcAHandler?.transceive ? nfcAHandler.transceive.bind(nfcAHandler) : undefined) ??
          (typeof mgr["transceive"] === "function" ? (mgr["transceive"] as TransceiveFn).bind(mgr) : undefined);
        if (!transceiveFn) {
          throw new Error("ULTRALIGHT_C_AUTH_FAILED: ULTRALIGHT_C_TRANSCEIVE_UNAVAILABLE");
        }
        console.log("[NFC] Ultralight C — authenticating with", usingCustomKey ? "custom key" : "factory default key");
        try {
          await authenticateUltralightC(transceiveFn, authKey);
          console.log("[NFC] Ultralight C auth OK");
        } catch (authErr) {
          console.error("[NFC] Ultralight C auth FAILED:", authErr instanceof Error ? authErr.message : String(authErr));
          throw new Error(`ULTRALIGHT_C_AUTH_FAILED: ${authErr instanceof Error ? authErr.message : String(authErr)}`);
        }
      }

      // Write pages in the same session.
      // onBeforeFirstWrite fires AFTER the first page is physically confirmed written —
      // this is the earliest moment we know data actually landed on the chip.
      // Callers use it to set writeAttempted=true so that a failure on page 2+
      // triggers the "charge recorded with warning" path, while a failure on
      // page 1 (e.g. write-protection or immediate TAG_LOST) leaves writeAttempted=false
      // and the topup is NOT recorded — chip definitely unchanged.
      //
      // Basic MIFARE Ultralight has only 44 usable bytes — too small for the full
      // JSON payload (~100 bytes with 64-char HMAC). Use compact binary format instead.
      let writePages: number[];
      if (tagInfo.type === "MIFARE_ULTRALIGHT") {
        writePages = encodeBraceletCompact(newPayload);
        console.log("[NFC] Writing compact binary format (basic MFU)");
      } else {
        const data = JSON.stringify({ balance: newPayload.balance, counter: newPayload.counter, hmac: newPayload.hmac });
        const dataBytes = Array.from(new TextEncoder().encode(data));
        const maxDataPages = endPage - MFU_PAYLOAD_START_PAGE;
        const pageCount = Math.ceil((dataBytes.length + 1) / MFU_PAGE_SIZE);
        if (pageCount > maxDataPages) throw new Error("PAYLOAD_TOO_LARGE_FOR_ULTRALIGHT");
        const padded = new Array(pageCount * MFU_PAGE_SIZE).fill(0);
        for (let i = 0; i < dataBytes.length; i++) padded[i] = dataBytes[i];
        writePages = padded;
      }
      const totalPages = Math.ceil(writePages.length / MFU_PAGE_SIZE);
      for (let i = 0; i < totalPages; i++) {
        await mfuHandler.mifareUltralightWritePage(MFU_PAYLOAD_START_PAGE + i, writePages.slice(i * MFU_PAGE_SIZE, (i + 1) * MFU_PAGE_SIZE));
        if (i === 0) opts?.onBeforeFirstWrite?.();
      }
      // For non-compact (JSON) format: write a terminator page if there's room.
      // Not needed for compact binary — it always fills exactly 5 pages, no ambiguity.
      if (tagInfo.type !== "MIFARE_ULTRALIGHT") {
        const writtenDataPages = Math.ceil(writePages.length / MFU_PAGE_SIZE);
        const maxDataPages = endPage - MFU_PAYLOAD_START_PAGE;
        if (writtenDataPages < maxDataPages) {
          try {
            await mfuHandler.mifareUltralightWritePage(MFU_PAYLOAD_START_PAGE + writtenDataPages, [0, 0, 0, 0]);
          } catch {
            console.warn("[NFC] Terminator page write failed after data write — data pages intact, ignoring");
          }
        }
      }
      return { payload, tagInfo, written: true };
    }

    // ── NDEF fallback ───────────────────────────────────────────────────────
    const tagInfo: TagInfo = { type: "NDEF", label: "NDEF", memoryBytes: 0 };
    const ndefMsg = (tag as { ndefMessage?: unknown[] }).ndefMessage;
    let payload: BraceletPayload;
    if (!ndefMsg || ndefMsg.length === 0) {
      payload = { uid, balance: 0, counter: 0, hmac: "" };
    } else {
      const firstRecord = ndefMsg[0] as { payload: number[] };
      const text = Ndef.text.decodePayload(new Uint8Array(firstRecord.payload));
      payload = parsePayloadJson(text, uid);
    }

    const newPayload = await onRead(payload, tagInfo);
    if (!newPayload) return { payload, tagInfo, written: false };

    const data = JSON.stringify({ balance: newPayload.balance, counter: newPayload.counter, hmac: newPayload.hmac });
    const bytes = Ndef.encodeMessage([Ndef.textRecord(data)]);
    await NfcManager.ndefHandler.writeNdefMessage(bytes);
    return { payload, tagInfo, written: true };
  } finally {
    await NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}
