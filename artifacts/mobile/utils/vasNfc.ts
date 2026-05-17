/**
 * VAS NFC Reader — Tapee Staff POS
 *
 * Handles three sources of digital wallet tokens:
 *   1. Apple VAS  — iPhone/iPad with Apple Wallet pass (ISO/IEC 14443-4 / IsoDep)
 *   2. Android HCE — Android phone running Tapee Attendee app (already implemented)
 *   3. Google Smart Tap — Android phone with Google Wallet pass (future)
 *
 * Apple VAS APDU sequence (requires VAS-capable Android reader; standard per Apple spec):
 *   → SELECT AID:  00 A4 04 00 0A [AID 10 bytes] 00
 *   → GET DATA:    80 CA 01 00 [Lc] [TLV: merchantIdHash + version] 00
 *   ← 9000 + TLV: tag 71 = ECIES-encrypted VAS message
 *
 * ECIES decryption (P-256, X9.63 KDF, AES-128-CTR):
 *   The terminal private key (matching encryptionPublicKeyPoint in pass.json) must be
 *   stored in the Android Keystore. Decryption is done in native Kotlin — see
 *   modules/vas-ecies/android/ for the native module implementation stub.
 *
 * After decryption the result is a base64url string → decodeVASToken() → SignedVASToken.
 * Verify with verifyVASTokenEcdsa() using the cached ECDSA public key.
 *
 * Env / runtime deps:
 *   - react-native-nfc-manager (IsoDep technology)
 *   - VasEcies native module (see modules/vas-ecies/) for decryption
 *   - vasConfig downloaded at POS login (ecdsaPublicKeyPem, eciesPublicKeyHex)
 */

import NfcManager, { NfcTech, NfcError } from "react-native-nfc-manager";

// ─── Apple VAS AID ────────────────────────────────────────────────────────────
const APPLE_VAS_AID = [0xA0, 0x00, 0x00, 0x01, 0x97, 0x43, 0x43, 0x4D, 0x50, 0x01];

// ─── Tapee HCE AID (existing attendee-app HCE module) ────────────────────────
const TAPEE_HCE_AID = [0xF0, 0x54, 0x41, 0x50, 0x45, 0x45, 0x54, 0x01];

// ─── APDU helpers ─────────────────────────────────────────────────────────────

function selectAid(aid: number[]): number[] {
  return [
    0x00, 0xA4, 0x04, 0x00,  // CLA INS P1 P2
    aid.length,               // Lc
    ...aid,
    0x00,                     // Le
  ];
}

const GET_TAPEE_TOKEN_APDU = [0x00, 0xCA, 0x00, 0x00, 0x00];

function sw(resp: number[]): number {
  return (resp[resp.length - 2]! << 8) | resp[resp.length - 1]!;
}

function swOk(resp: number[]): boolean {
  return sw(resp) === 0x9000;
}

// ─── Apple VAS GET DATA command ───────────────────────────────────────────────
// TLV fields: 9F26 (merchant ID SHA-256, 32 bytes) + 9F22 (version 01)
// merchantIdHash = first 32 bytes of SHA-256(merchantId from pass.json)
// This must match the merchantId configured at pass generation time.

function buildVASGetData(merchantIdHashHex: string): number[] {
  const merchantIdHash = Array.from(Buffer.from(merchantIdHashHex, "hex")).slice(0, 32);
  const tlv9F26 = [0x9F, 0x26, merchantIdHash.length, ...merchantIdHash];
  const tlv9F22 = [0x9F, 0x22, 0x01, 0x01]; // version 1
  const data    = [...tlv9F26, ...tlv9F22];
  return [
    0x80, 0xCA, 0x01, 0x00,  // CLA INS P1 P2 (GET DATA, VAS)
    data.length,
    ...data,
    0x00,
  ];
}

// ─── TLV parser ───────────────────────────────────────────────────────────────

function parseTLV(bytes: number[]): Map<number, number[]> {
  const result = new Map<number, number[]>();
  let i = 0;
  while (i < bytes.length - 2) { // skip SW at end
    const tag = bytes[i++]!;
    const len = bytes[i++]!;
    const val = bytes.slice(i, i + len);
    result.set(tag, val);
    i += len;
  }
  return result;
}

// ─── Result types ─────────────────────────────────────────────────────────────

export type VASReadResult =
  | { source: "hce";       encodedToken: string }
  | { source: "apple_vas"; encryptedPayload: string; eciesEphemeralKey: string }
  | { source: "none" };

export type VASReadError = "TAG_LOST" | "NO_VAS" | "APDU_ERROR" | "CANCELLED" | "NFC_NOT_SUPPORTED";

// ─── Main reader ──────────────────────────────────────────────────────────────

/**
 * Scan an NFC tag and attempt to read a digital wallet token.
 *
 * Returns:
 *   { source: "hce",       encodedToken }          — Android HCE phone (already decoded)
 *   { source: "apple_vas", encryptedPayload, ... }  — Apple VAS (needs ECIES decryption natively)
 *   { source: "none" }                              — tag responded but no wallet found
 *
 * Throws VASReadError string on failure.
 */
export async function readWalletToken(merchantIdHashHex: string): Promise<VASReadResult> {
  const isSupported = await NfcManager.isSupported();
  if (!isSupported) throw "NFC_NOT_SUPPORTED" as VASReadError;

  try {
    await NfcManager.requestTechnology(NfcTech.IsoDep, {
      alertMessage: "Acerca el teléfono del asistente",
    });

    // ── Try Tapee HCE first (Android attendee phones) ──────────────────────
    const tapeeSelectResp = await NfcManager.isoDepHandlerAndroid.transceive(selectAid(TAPEE_HCE_AID));
    if (swOk(tapeeSelectResp)) {
      const tokenResp = await NfcManager.isoDepHandlerAndroid.transceive(GET_TAPEE_TOKEN_APDU);
      if (swOk(tokenResp) && tokenResp.length > 2) {
        const tokenBytes    = tokenResp.slice(0, tokenResp.length - 2);
        const encodedToken  = Buffer.from(tokenBytes).toString("utf8");
        return { source: "hce", encodedToken };
      }
    }

    // ── Try Apple VAS (iPhones with Apple Wallet pass) ─────────────────────
    const vasSelectResp = await NfcManager.isoDepHandlerAndroid.transceive(selectAid(APPLE_VAS_AID));
    if (!swOk(vasSelectResp)) {
      return { source: "none" };
    }

    const getDataApdu   = buildVASGetData(merchantIdHashHex);
    const getDataResp   = await NfcManager.isoDepHandlerAndroid.transceive(getDataApdu);

    if (!swOk(getDataResp)) {
      // VAS returned an error — e.g. 6A88 (referenced data not found) means
      // the pass merchantId does not match what's on the phone.
      return { source: "none" };
    }

    const tlv = parseTLV(getDataResp.slice(0, -2)); // strip SW

    // Tag 0x71 = Primitive Data Objects (encrypted VAS message per Apple spec)
    const payload71 = tlv.get(0x71);
    if (!payload71 || payload71.length < 33) {
      return { source: "none" };
    }

    // The first 33 bytes of tag 0x71 are the ephemeral ECDH public key (compressed X9.62).
    // The remainder is the AES-encrypted payload + MAC.
    const ephemeralKey      = Buffer.from(payload71.slice(0, 33)).toString("hex");
    const ciphertext        = Buffer.from(payload71.slice(33)).toString("base64");

    // Native ECIES decryption must be performed in Kotlin using the private key from Android Keystore.
    // Pass `encryptedPayload` and `eciesEphemeralKey` to the VasEcies native module.
    return { source: "apple_vas", encryptedPayload: ciphertext, eciesEphemeralKey: ephemeralKey };

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e ?? "");
    if (/TAG_LOST|IOException/i.test(msg))  throw "TAG_LOST"   as VASReadError;
    if (/cancel|USER_CANCELLED/i.test(msg)) throw "CANCELLED"  as VASReadError;
    throw "APDU_ERROR" as VASReadError;
  } finally {
    await NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}

// ─── ECIES decryption note ────────────────────────────────────────────────────
/**
 * Native Kotlin module stub (modules/vas-ecies/android/):
 *
 * The private key for ECIES decryption is generated on-device and stored in the
 * Android Keystore under alias "tapee_vas_ecies_key". The corresponding public key
 * is exported as compressed X9.62 and uploaded to the backend at device registration,
 * which embeds it in the pass.json `nfc.encryptionPublicKeyPoint` field.
 *
 * Algorithm: ECIES P-256 / X9.63-SHA256-KDF / AES-128-CTR / HMAC-SHA256-16
 * (Apple VAS 1.0 spec)
 *
 * ```kotlin
 * object VasEcies {
 *   private const val KEY_ALIAS = "tapee_vas_ecies_key"
 *
 *   fun decryptPayload(ephemeralKeyHex: String, ciphertextB64: String): String {
 *     val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
 *     val privKey  = keyStore.getKey(KEY_ALIAS, null) as ECPrivateKey
 *
 *     // ECDH: shared secret
 *     val ephPubKeyBytes = ephemeralKeyHex.hexToBytes() // 33-byte compressed
 *     val ephPubKey      = decompressPoint(ephPubKeyBytes)
 *     val ka             = KeyAgreement.getInstance("ECDH")
 *     ka.init(privKey); ka.doPhase(ephPubKey, true)
 *     val sharedSecret   = ka.generateSecret()
 *
 *     // X9.63-SHA256-KDF (counter=1, shared info = compressed ephemeral key)
 *     val kdfInput = byteArrayOf(0,0,0,1) + sharedSecret + ephPubKeyBytes
 *     val keyMaterial = MessageDigest.getInstance("SHA-256").digest(kdfInput)
 *     val encKey = keyMaterial.copyOfRange(0, 16)
 *     val macKey = keyMaterial.copyOfRange(16, 32)
 *
 *     // AES-128-CTR decrypt
 *     val ct      = Base64.decode(ciphertextB64, Base64.DEFAULT)
 *     val iv      = ct.copyOfRange(0, 16)
 *     val payload = ct.copyOfRange(16, ct.size - 16)
 *     val mac     = ct.copyOfRange(ct.size - 16, ct.size)
 *
 *     // Verify HMAC-SHA256-16 over IV + ciphertext
 *     val hmac = Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(macKey, "HmacSHA256")) }
 *     val expectedMac = hmac.doFinal(ct.copyOfRange(0, ct.size - 16)).copyOfRange(0, 16)
 *     check(MessageDigest.isEqual(mac, expectedMac)) { "MAC verification failed" }
 *
 *     val cipher = Cipher.getInstance("AES/CTR/NoPadding")
 *     cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(encKey, "AES"), IvParameterSpec(iv))
 *     return String(cipher.doFinal(payload), Charsets.UTF_8)
 *   }
 * }
 * ```
 */

export {}; // ensure module treatment
