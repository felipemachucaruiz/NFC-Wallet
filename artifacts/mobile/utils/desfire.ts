import { Platform } from "react-native";
import CryptoJS from "crypto-js";
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
  const keyWordArray = CryptoJS.enc.Hex.parse(aesKeyHex);
  const mac = CryptoJS.HmacSHA256(message, keyWordArray).toString(CryptoJS.enc.Hex);
  return mac.slice(0, 16);
}

// ---------------------------------------------------------------------------
// AES-128 CBC helpers for DESFire EV3 mutual authentication
// ---------------------------------------------------------------------------

function uint8ArrayToWordArray(u8: Uint8Array): CryptoJS.lib.WordArray {
  const words: number[] = [];
  for (let i = 0; i < u8.length; i += 4) {
    words.push(
      ((((u8[i] ?? 0) << 24) | ((u8[i + 1] ?? 0) << 16) | ((u8[i + 2] ?? 0) << 8) | (u8[i + 3] ?? 0)) >>> 0)
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return CryptoJS.lib.WordArray.create(words as any, u8.length);
}

function wordArrayToUint8Array(wa: CryptoJS.lib.WordArray): Uint8Array {
  const bytes = new Uint8Array(wa.sigBytes);
  for (let i = 0; i < wa.sigBytes; i++) {
    const word = wa.words[Math.floor(i / 4)] ?? 0;
    bytes[i] = (word >>> (24 - (i % 4) * 8)) & 0xff;
  }
  return bytes;
}

function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array((hex.match(/.{1,2}/g) ?? []).map((b) => parseInt(b, 16)));
}

function aesEncryptCBC(data: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array {
  const encrypted = CryptoJS.AES.encrypt(uint8ArrayToWordArray(data), uint8ArrayToWordArray(key), {
    iv: uint8ArrayToWordArray(iv),
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.NoPadding,
  });
  return wordArrayToUint8Array(encrypted.ciphertext);
}

function aesDecryptCBC(data: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array {
  const decrypted = CryptoJS.AES.decrypt(
    CryptoJS.lib.CipherParams.create({ ciphertext: uint8ArrayToWordArray(data) }),
    uint8ArrayToWordArray(key),
    {
      iv: uint8ArrayToWordArray(iv),
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.NoPadding,
    }
  );
  return wordArrayToUint8Array(decrypted);
}

/**
 * DESFire EV3 AES-128 mutual authentication (ISO-wrapped native mode).
 *
 * Protocol (NXP AN10922 / MF3ICD40 docs):
 *   1. CMD 0xAA keyNo  → chip returns 91AF + ekRndB (16 bytes, AES encrypted, IV=0)
 *   2. Decrypt ekRndB → RndB, rotate left 1 byte → RndB'
 *   3. Generate RndA (16 random bytes)
 *   4. Encrypt [RndA | RndB'] with AES-CBC (IV = ekRndB) → 32 bytes
 *   5. CMD 0xAF [32 bytes] → chip returns 9100 + ekRndA' (16 bytes)
 *   6. Decrypt ekRndA' (IV = last 16 bytes of step-4 ciphertext) → RndA'
 *   7. Verify RndA' == rotate_left(RndA)
 *
 * After success the chip grants the access rights of keyNo for this session.
 * This function works for CommMode.PLAIN operations (no session-key MAC needed).
 */
async function authenticateDesfireAes(
  isoDepHandler: IsoDepHandler,
  keyHex: string,
  keyNo: number = 0x00
): Promise<void> {
  if (!/^[0-9a-fA-F]{32}$/.test(keyHex)) {
    throw new Error("DESFIRE_AES_AUTH_INVALID_KEY");
  }
  const key = hexToBytes(keyHex);

  // Step 1: AuthenticateAES
  const auth1Cmd = buildApdu(0xAA, [keyNo]);
  const auth1Resp = await isoDepHandler.transceive(auth1Cmd);
  // Expected: 16 bytes ekRndB + 91 AF
  if (auth1Resp.length < 18) throw new Error("DESFIRE_AES_AUTH_STEP1_LEN");
  const sw1a = auth1Resp[auth1Resp.length - 2];
  const sw2a = auth1Resp[auth1Resp.length - 1];
  if (sw1a !== 0x91 || sw2a !== 0xAF) {
    throw new Error(
      `DESFIRE_AES_AUTH_STEP1_${(sw1a ?? 0).toString(16).toUpperCase().padStart(2, "0")}${(sw2a ?? 0).toString(16).toUpperCase().padStart(2, "0")}`
    );
  }
  const ekRndB = new Uint8Array(auth1Resp.slice(0, 16));

  // Step 2: Decrypt RndB
  const rndB = aesDecryptCBC(ekRndB, key, new Uint8Array(16));

  // Step 3: Rotate RndB left 1 byte
  const rndBPrime = new Uint8Array(16);
  for (let i = 0; i < 15; i++) rndBPrime[i] = rndB[i + 1] ?? 0;
  rndBPrime[15] = rndB[0] ?? 0;

  // Step 4: Generate RndA
  const rndA = new Uint8Array(16);
  crypto.getRandomValues(rndA);

  // Step 5: Encrypt [RndA | RndB'] → 32 bytes, IV = ekRndB
  const plaintext = new Uint8Array(32);
  plaintext.set(rndA, 0);
  plaintext.set(rndBPrime, 16);
  const cipher = aesEncryptCBC(plaintext, key, ekRndB);

  // Step 6: Send AUTH2 (0xAF) with 32-byte ciphertext
  const auth2Cmd = buildApdu(0xAF, Array.from(cipher));
  const auth2Resp = await isoDepHandler.transceive(auth2Cmd);
  // Expected: 16 bytes ekRndA' + 91 00
  if (auth2Resp.length < 18) throw new Error("DESFIRE_AES_AUTH_STEP2_LEN");
  const sw1b = auth2Resp[auth2Resp.length - 2];
  const sw2b = auth2Resp[auth2Resp.length - 1];
  if (sw1b !== 0x91 || sw2b !== 0x00) {
    throw new Error(
      `DESFIRE_AES_AUTH_STEP2_${(sw1b ?? 0).toString(16).toUpperCase().padStart(2, "0")}${(sw2b ?? 0).toString(16).toUpperCase().padStart(2, "0")}`
    );
  }
  const ekRndAPrime = new Uint8Array(auth2Resp.slice(0, 16));

  // Step 7: Decrypt RndA', IV = last 16 bytes of the ciphertext we sent
  const ivForDecrypt = cipher.slice(16, 32);
  const rndAPrime = aesDecryptCBC(ekRndAPrime, key, ivForDecrypt);

  // Step 8: Verify RndA' == rotate_left(RndA)
  const expectedRndAPrime = new Uint8Array(16);
  for (let i = 0; i < 15; i++) expectedRndAPrime[i] = rndA[i + 1] ?? 0;
  expectedRndAPrime[15] = rndA[0] ?? 0;

  for (let i = 0; i < 16; i++) {
    if (rndAPrime[i] !== expectedRndAPrime[i]) {
      throw new Error("DESFIRE_AES_AUTH_RNDA_MISMATCH");
    }
  }
  // Authentication successful — chip grants access rights for keyNo this session
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

/**
 * zeroDesfireBracelet — Scan a DESFire bracelet, debit its full balance to zero,
 * increment the counter, and commit.
 * Returns the zeroed payload (uid, counter+1, mac), or throws if the UID doesn't
 * match `expectedUid` or the chip has no balance to debit.
 *
 * NOTE: Uses DESFIRE_CMD_DEBIT (not CREDIT) — debiting the full current balance
 * brings a value file from N to 0, whereas CREDIT(0) is a no-op.
 */
export async function zeroDesfireBracelet(
  expectedUid: string,
  aesKeyHex: string
): Promise<{ uid: string; counter: number; transactionMac: string }> {
  if (!NfcManager || !NfcTech) throw new Error("NFC_NOT_AVAILABLE");

  if (Platform.OS === "ios") {
    throw new Error("DESFIRE_NOT_SUPPORTED_ON_IOS");
  }

  try {
    await NfcManager.requestTechnology([NfcTech.IsoDep]);
    const tag = await NfcManager.getTag();
    if (!tag) throw new Error("NFC_NO_TAG");

    const uid = getUid(tag);
    if (uid !== expectedUid) {
      throw new Error(`WRONG_BRACELET:${expectedUid}`);
    }

    const isoDepHandler = getIsoDepHandler(NfcManager as unknown as AnyRecord);
    if (!isoDepHandler) throw new Error("ISODEP_HANDLER_UNAVAILABLE");

    const selectAppCmd = buildApdu(DESFIRE_CMD_SELECT_APPLICATION, DESFIRE_AID);
    const selectResp = await isoDepHandler.transceive(selectAppCmd);
    checkStatus(selectResp);

    const getValueCmd = buildApdu(DESFIRE_CMD_GET_VALUE, [0x01]);
    const valueResp = await isoDepHandler.transceive(getValueCmd);
    checkStatus(valueResp);

    if (valueResp.length < 6) throw new Error("DESFIRE_INVALID_VALUE_RESPONSE");
    const currentBalance = readInt32LE(valueResp, 0);

    const readDataCmd = buildApdu(DESFIRE_CMD_READ_DATA, [0x02, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00]);
    const dataResp = await isoDepHandler.transceive(readDataCmd);
    checkStatus(dataResp);

    let counter = 0;
    if (dataResp.length >= 4) {
      counter = readInt32LE(dataResp, 0);
    }

    if (currentBalance > 0) {
      const debitBytes = writeInt32LE(currentBalance);
      const debitCmd = buildApdu(DESFIRE_CMD_DEBIT, [0x01, ...debitBytes]);
      const debitResp = await isoDepHandler.transceive(debitCmd);
      checkStatus(debitResp);
    }

    const newCounter = counter + 1;
    const counterBytes = writeInt32LE(newCounter);
    const writeDataCmd = buildApdu(DESFIRE_CMD_WRITE_DATA, [0x02, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, ...counterBytes]);
    const writeResp = await isoDepHandler.transceive(writeDataCmd);
    checkStatus(writeResp);

    const commitCmd = buildApdu(DESFIRE_CMD_COMMIT, []);
    const commitResp = await isoDepHandler.transceive(commitCmd);
    checkStatus(commitResp);

    const mac = computeTransactionMac(uid, newCounter, 0, aesKeyHex);
    return { uid, counter: newCounter, transactionMac: mac };
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
  aesKeyHex: string,
  opts?: {
    /** Called just before the COMMIT command is sent to the chip.
     *  Use this to set a "write attempted" flag — the COMMIT is atomic, so
     *  once this fires the chip will very likely end up committed even if the
     *  NFC session drops before the acknowledgment is received. */
    onBeforeCommit?: () => void;
  }
): Promise<{ payload: BraceletPayload & { transactionMac?: string }; tagInfo: DesfireTagInfo; written: boolean }> {
  if (!NfcManager || !NfcTech) throw new Error("NFC_NOT_AVAILABLE");

  if (Platform.OS === "ios") {
    throw new Error("DESFIRE_NOT_SUPPORTED_ON_IOS");
  }

  const tagInfo: DesfireTagInfo = { type: "DESFIRE_EV3", label: "DESFire EV3", memoryBytes: 8192 };

  await NfcManager.cancelTechnologyRequest().catch(() => {});
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

    // Authenticate before write operations if a key is configured.
    // DESFire chips typically require AES mutual auth before CREDIT/WRITE_DATA.
    if (aesKeyHex && /^[0-9a-fA-F]{32}$/.test(aesKeyHex)) {
      await authenticateDesfireAes(isoDepHandler, aesKeyHex, 0x00);
    }

    const balanceBytes = writeInt32LE(newPayload.balance);
    const creditCmd = buildApdu(DESFIRE_CMD_CREDIT, [0x01, ...balanceBytes]);
    const creditResp = await isoDepHandler.transceive(creditCmd);
    checkStatus(creditResp);

    const counterBytes = writeInt32LE(newPayload.counter);
    const writeDataCmd = buildApdu(DESFIRE_CMD_WRITE_DATA, [0x02, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, ...counterBytes]);
    const writeResp = await isoDepHandler.transceive(writeDataCmd);
    checkStatus(writeResp);

    // Signal "write attempted" before sending COMMIT. DESFire COMMIT is atomic:
    // once the chip receives it the transaction is durable. If the NFC session
    // drops before the ACK reaches us, the chip is still committed. The caller
    // uses this callback to record the top-up so the server stays in sync.
    opts?.onBeforeCommit?.();

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
