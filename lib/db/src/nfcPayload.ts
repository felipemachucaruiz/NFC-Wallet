/**
 * NFC Payload Encoding — Access Zone Contract
 *
 * This module defines the byte-level encoding for access zone data written into
 * the bracelet's NDEF / custom NFC record alongside the cashless balance.
 *
 * FORMAT (compact byte list, up to 15 zones):
 * ┌──────────────────────────────────────────────────────────────┐
 * │ Byte 0   │ Count of granted zone ranks (0–15)                │
 * │ Bytes 1+ │ One byte per zone rank value (0–255)              │
 * └──────────────────────────────────────────────────────────────┘
 *
 * - Only the zone's `rank` is encoded (not the UUID). This makes the payload
 *   small and allows offline readers to verify access without API calls.
 * - A rank fits in 1 byte (0–255), supporting all practical tier structures.
 * - Maximum 15 zones are supported per bracelet (count byte cap).
 * - The mobile NFC write layer reads `accessZoneIds`, resolves each to its rank
 *   via the event's zone list, and encodes using encodeAccessZoneRanks().
 * - Offline readers decode the byte array and compare the requested zone's rank
 *   against the encoded list using decodeAccessZoneRanks().
 *
 * EXAMPLE:
 *   Bracelet with General (rank 1) and VIP (rank 3):
 *   Encoded → [0x02, 0x01, 0x03]
 *             count=2, ranks=[1, 3]
 */

export const NFC_ACCESS_ZONE_MAX_ZONES = 15;

/**
 * Encode an array of zone ranks into a compact byte buffer.
 * @param ranks - Array of integer rank values (0–255) for granted zones.
 * @returns Buffer: [count, rank0, rank1, ...rankN]
 * @throws If more than NFC_ACCESS_ZONE_MAX_ZONES ranks are provided, or any rank is out of 0–255 range.
 */
export function encodeAccessZoneRanks(ranks: number[]): Buffer {
  if (ranks.length > NFC_ACCESS_ZONE_MAX_ZONES) {
    throw new Error(`Cannot encode more than ${NFC_ACCESS_ZONE_MAX_ZONES} access zone ranks`);
  }
  for (const rank of ranks) {
    if (!Number.isInteger(rank) || rank < 0 || rank > 255) {
      throw new Error(`Zone rank ${rank} is out of valid range 0–255`);
    }
  }
  const buf = Buffer.alloc(1 + ranks.length);
  buf[0] = ranks.length;
  for (let i = 0; i < ranks.length; i++) {
    buf[i + 1] = ranks[i];
  }
  return buf;
}

/**
 * Decode a compact byte buffer back into an array of zone ranks.
 * @param buf - Buffer in the format produced by encodeAccessZoneRanks.
 * @returns Array of integer rank values.
 * @throws If the buffer is malformed.
 */
export function decodeAccessZoneRanks(buf: Buffer): number[] {
  if (buf.length < 1) {
    throw new Error("NFC access zone payload is empty");
  }
  const count = buf[0];
  if (count > NFC_ACCESS_ZONE_MAX_ZONES) {
    throw new Error(`NFC payload count ${count} exceeds maximum ${NFC_ACCESS_ZONE_MAX_ZONES}`);
  }
  if (buf.length < 1 + count) {
    throw new Error(`NFC payload too short: expected ${1 + count} bytes, got ${buf.length}`);
  }
  const ranks: number[] = [];
  for (let i = 0; i < count; i++) {
    ranks.push(buf[i + 1]);
  }
  return ranks;
}

/**
 * Check if a bracelet's encoded payload grants access to a zone with the given rank.
 * Used by offline readers to verify entry without hitting the API.
 * @param buf - Encoded payload buffer from the NFC chip.
 * @param targetRank - The rank of the zone the attendee wishes to enter.
 * @returns true if the payload contains the target rank.
 */
export function offlineCheckAccess(buf: Buffer, targetRank: number): boolean {
  const ranks = decodeAccessZoneRanks(buf);
  return ranks.includes(targetRank);
}
