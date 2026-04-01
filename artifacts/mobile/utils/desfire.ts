import { Platform } from "react-native";
import type { BraceletPayload } from "./hmac";

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

export interface DesfireTagInfo {
  type: "DESFIRE_EV3";
  label: string;
  memoryBytes: number;
}

type AnyRecord = Record<string, unknown>;

interface IsoDepHandler {
  connect: () => Promise<void>;
  close: () => Promise<void>;
  transceive: (bytes: number[]) => Promise<number[]>;
  getMaxTransceiveLength?: () => Promise<number>;
}

function getIsoDepHandler(mgr: AnyRecord): IsoDepHandler | null {
  const h = mgr["isoDepHandlerAndroid"];
  if (h && typeof h === "object") return h as IsoDepHandler;
  return null;
}

function getUid(tag: unknown): string {
  if (tag && typeof tag === "object" && "id" in tag) {
    const id = (tag as { id?: unknown }).id;
    if (Array.isArray(id) && id.length > 0) {
      return (id as number[])
        .map((b: number) => (b & 0xff).toString(16).padStart(2, "0"))
        .join(":")
        .toUpperCase();
    }
    if (id && typeof id === "object" && "byteLength" in (id as object)) {
      const arr = new Uint8Array(id as ArrayBuffer);
      if (arr.length > 0) {
        return Array.from(arr)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(":")
          .toUpperCase();
      }
    }
    if (typeof id === "string" && id.length > 0 && id !== "UNKNOWN") {
      const clean = id.replace(/[^0-9a-fA-F]/g, "");
      if (clean.length >= 2) {
        return (clean.match(/.{1,2}/g) ?? []).join(":").toUpperCase();
      }
    }
  }
  return "UNKNOWN";
}

function getTagTechTypes(tag: unknown): string[] {
  if (tag && typeof tag === "object" && "techTypes" in tag) {
    const tt = (tag as { techTypes?: unknown }).techTypes;
    if (Array.isArray(tt)) return tt as string[];
  }
  return [];
}

export function hasIsoDepTech(techTypes: string[]): boolean {
  return techTypes.some((t) => t.includes("IsoDep") || t.includes("Iso14443") || t.includes("iso14443"));
}

const TAPEE_AID = [0xD2, 0x76, 0x00, 0x00, 0x85, 0x01, 0x01];
const DESFIRE_AID = [0x54, 0x41, 0x50, 0x45, 0x45];

const DESFIRE_CMD_SELECT_APPLICATION = 0x5A;
const DESFIRE_CMD_GET_APPLICATION_IDS = 0x6A;
const DESFIRE_CMD_CREATE_APPLICATION = 0xCA;
const DESFIRE_CMD_READ_DATA = 0xBD;
const DESFIRE_CMD_WRITE_DATA = 0x3D;
const DESFIRE_CMD_GET_VALUE = 0x6C;
const DESFIRE_CMD_CREDIT = 0x0C;
const DESFIRE_CMD_DEBIT = 0xDC;
const DESFIRE_CMD_COMMIT = 0xC7;
const DESFIRE_CMD_SELECT_FILE = 0xF5;

const DESFIRE_STATUS_OK = 0x00;
const DESFIRE_STATUS_ADDITIONAL_FRAME = 0xAF;

const NATIVE_CLA = 0x90;

function buildApdu(cmd: number, data: number[] = []): number[] {
  return [NATIVE_CLA, cmd, 0x00, 0x00, ...(data.length > 0 ? [data.length, ...data] : []), 0x00];
}

function checkStatus(response: number[]): void {
  if (response.length < 2) throw new Error("DESFIRE_INVALID_RESPONSE");
  const sw1 = response[response.length - 2];
  const sw2 = response[response.length - 1];
  if (sw1 === 0x91 && sw2 === DESFIRE_STATUS_OK) return;
  if (sw1 === 0x91 && sw2 === DESFIRE_STATUS_ADDITIONAL_FRAME) return;
  throw new Error(`DESFIRE_ERROR_${sw1.toString(16).toUpperCase()}${sw2.toString(16).toUpperCase()}`);
}

function readInt32LE(bytes: number[], offset: number): number {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>> 0
  );
}

function writeInt32LE(value: number): number[] {
  return [
    value & 0xff,
    (value >> 8) & 0xff,
    (value >> 16) & 0xff,
    (value >> 24) & 0xff,
  ];
}

function computeTransactionMac(
  uid: string,
  counter: number,
  newBalance: number,
  aesKeyHex: string
): string {
  const message = `${uid}:${counter}:${newBalance}`;
  const keyBytes = Buffer.from(aesKeyHex, "hex");
  const crypto = require("crypto") as typeof import("crypto");
  const mac = crypto.createHmac("sha256", keyBytes).update(message).digest("hex");
  return mac.slice(0, 16);
}

export async function readDesfireBracelet(aesKeyHex: string): Promise<BraceletPayload & { transactionMac?: string }> {
  if (!NfcManager || !NfcTech) throw new Error("NFC_NOT_AVAILABLE");

  if (Platform.OS === "ios") {
    throw new Error("DESFIRE_NOT_SUPPORTED_ON_IOS");
  }

  try {
    await NfcManager.requestTechnology([NfcTech.IsoDep]);
    const tag = await NfcManager.getTag();
    if (!tag) throw new Error("NFC_NO_TAG");

    const uid = getUid(tag);
    const isoDepHandler = getIsoDepHandler(NfcManager as unknown as AnyRecord);
    if (!isoDepHandler) throw new Error("ISODEP_HANDLER_UNAVAILABLE");

    const selectAppCmd = buildApdu(DESFIRE_CMD_SELECT_APPLICATION, DESFIRE_AID);
    const selectResp = await isoDepHandler.transceive(selectAppCmd);
    checkStatus(selectResp);

    const getValueCmd = buildApdu(DESFIRE_CMD_GET_VALUE, [0x01]);
    const valueResp = await isoDepHandler.transceive(getValueCmd);
    checkStatus(valueResp);

    if (valueResp.length < 6) throw new Error("DESFIRE_INVALID_VALUE_RESPONSE");
    const balance = readInt32LE(valueResp, 0);

    const readDataCmd = buildApdu(DESFIRE_CMD_READ_DATA, [0x02, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00]);
    const dataResp = await isoDepHandler.transceive(readDataCmd);
    checkStatus(dataResp);

    let counter = 0;
    if (dataResp.length >= 6) {
      counter = readInt32LE(dataResp, 0);
    }

    const mac = computeTransactionMac(uid, counter, balance, aesKeyHex);

    return { uid, balance, counter, hmac: mac, transactionMac: mac };
  } finally {
    await NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}

export async function writeDesfireBracelet(
  payload: BraceletPayload,
  aesKeyHex: string
): Promise<{ transactionMac: string }> {
  if (!NfcManager || !NfcTech) throw new Error("NFC_NOT_AVAILABLE");

  if (Platform.OS === "ios") {
    throw new Error("DESFIRE_NOT_SUPPORTED_ON_IOS");
  }

  try {
    await NfcManager.requestTechnology([NfcTech.IsoDep]);
    const tag = await NfcManager.getTag();
    if (!tag) throw new Error("NFC_NO_TAG");

    const uid = getUid(tag);
    const isoDepHandler = getIsoDepHandler(NfcManager as unknown as AnyRecord);
    if (!isoDepHandler) throw new Error("ISODEP_HANDLER_UNAVAILABLE");

    const selectAppCmd = buildApdu(DESFIRE_CMD_SELECT_APPLICATION, DESFIRE_AID);
    const selectResp = await isoDepHandler.transceive(selectAppCmd);
    checkStatus(selectResp);

    const balanceBytes = writeInt32LE(payload.balance);
    const creditCmd = buildApdu(DESFIRE_CMD_CREDIT, [0x01, ...balanceBytes]);
    const creditResp = await isoDepHandler.transceive(creditCmd);
    checkStatus(creditResp);

    const counterBytes = writeInt32LE(payload.counter);
    const writeDataCmd = buildApdu(DESFIRE_CMD_WRITE_DATA, [0x02, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, ...counterBytes]);
    const writeResp = await isoDepHandler.transceive(writeDataCmd);
    checkStatus(writeResp);

    const commitCmd = buildApdu(DESFIRE_CMD_COMMIT, []);
    const commitResp = await isoDepHandler.transceive(commitCmd);
    checkStatus(commitResp);

    const mac = computeTransactionMac(uid, payload.counter, payload.balance, aesKeyHex);
    return { transactionMac: mac };
  } finally {
    await NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}

export async function formatDesfireBracelet(aesKeyHex: string): Promise<string> {
  if (!NfcManager || !NfcTech) throw new Error("NFC_NOT_AVAILABLE");

  if (Platform.OS === "ios") {
    throw new Error("DESFIRE_NOT_SUPPORTED_ON_IOS");
  }

  try {
    await NfcManager.requestTechnology([NfcTech.IsoDep]);
    const tag = await NfcManager.getTag();
    if (!tag) throw new Error("NFC_NO_TAG");

    const uid = getUid(tag);
    const isoDepHandler = getIsoDepHandler(NfcManager as unknown as AnyRecord);
    if (!isoDepHandler) throw new Error("ISODEP_HANDLER_UNAVAILABLE");

    const masterKeyHex = aesKeyHex.padEnd(32, "0").slice(0, 32);
    const masterKeyBytes = Array.from(Buffer.from(masterKeyHex, "hex"));

    const createAppCmd = buildApdu(DESFIRE_CMD_CREATE_APPLICATION, [
      ...DESFIRE_AID,
      0x0F,
      0x83,
      0x02,
    ]);
    try {
      const createResp = await isoDepHandler.transceive(createAppCmd);
      checkStatus(createResp);
    } catch {
    }

    const selectAppCmd = buildApdu(DESFIRE_CMD_SELECT_APPLICATION, DESFIRE_AID);
    const selectResp = await isoDepHandler.transceive(selectAppCmd);
    checkStatus(selectResp);

    return uid;
  } finally {
    await NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}

export async function scanAndWriteDesfireBracelet(
  onRead: (payload: BraceletPayload & { transactionMac?: string }, tagInfo: DesfireTagInfo) => Promise<(BraceletPayload & { transactionMac?: string }) | null>,
  aesKeyHex: string
): Promise<{ payload: BraceletPayload & { transactionMac?: string }; tagInfo: DesfireTagInfo; written: boolean }> {
  if (!NfcManager || !NfcTech) throw new Error("NFC_NOT_AVAILABLE");

  if (Platform.OS === "ios") {
    throw new Error("DESFIRE_NOT_SUPPORTED_ON_IOS");
  }

  const tagInfo: DesfireTagInfo = { type: "DESFIRE_EV3", label: "DESFire EV3", memoryBytes: 8192 };

  try {
    await NfcManager.requestTechnology([NfcTech.IsoDep]);
    const tag = await NfcManager.getTag();
    if (!tag) throw new Error("NFC_NO_TAG");

    const uid = getUid(tag);
    const isoDepHandler = getIsoDepHandler(NfcManager as unknown as AnyRecord);
    if (!isoDepHandler) throw new Error("ISODEP_HANDLER_UNAVAILABLE");

    const selectAppCmd = buildApdu(DESFIRE_CMD_SELECT_APPLICATION, DESFIRE_AID);
    const selectResp = await isoDepHandler.transceive(selectAppCmd);
    checkStatus(selectResp);

    const getValueCmd = buildApdu(DESFIRE_CMD_GET_VALUE, [0x01]);
    const valueResp = await isoDepHandler.transceive(getValueCmd);
    checkStatus(valueResp);

    let balance = 0;
    if (valueResp.length >= 6) {
      balance = readInt32LE(valueResp, 0);
    }

    const readDataCmd = buildApdu(DESFIRE_CMD_READ_DATA, [0x02, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00]);
    const dataResp = await isoDepHandler.transceive(readDataCmd);
    checkStatus(dataResp);

    let counter = 0;
    if (dataResp.length >= 6) {
      counter = readInt32LE(dataResp, 0);
    }

    const mac = computeTransactionMac(uid, counter, balance, aesKeyHex);
    const payload: BraceletPayload & { transactionMac?: string } = {
      uid,
      balance,
      counter,
      hmac: mac,
      transactionMac: mac,
    };

    const newPayload = await onRead(payload, tagInfo);
    if (!newPayload) return { payload, tagInfo, written: false };

    const balanceBytes = writeInt32LE(newPayload.balance);
    const creditCmd = buildApdu(DESFIRE_CMD_CREDIT, [0x01, ...balanceBytes]);
    const creditResp = await isoDepHandler.transceive(creditCmd);
    checkStatus(creditResp);

    const counterBytes = writeInt32LE(newPayload.counter);
    const writeDataCmd = buildApdu(DESFIRE_CMD_WRITE_DATA, [0x02, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, ...counterBytes]);
    const writeResp = await isoDepHandler.transceive(writeDataCmd);
    checkStatus(writeResp);

    const commitCmd = buildApdu(DESFIRE_CMD_COMMIT, []);
    const commitResp = await isoDepHandler.transceive(commitCmd);
    checkStatus(commitResp);

    const newMac = computeTransactionMac(uid, newPayload.counter, newPayload.balance, aesKeyHex);
    const writtenPayload: BraceletPayload & { transactionMac?: string } = {
      ...newPayload,
      hmac: newMac,
      transactionMac: newMac,
    };

    return { payload: writtenPayload, tagInfo, written: true };
  } finally {
    await NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}
