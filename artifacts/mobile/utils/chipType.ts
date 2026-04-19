import type { NfcChipType } from "@/contexts/EventContext";
import type { TagType, NfcChipTypeHint } from "@/utils/nfc";

/** Returns the NFC scan hint for the configured allowed types. */
export function getChipHint(allowedNfcTypes: NfcChipType[]): NfcChipTypeHint {
  if (allowedNfcTypes.includes("mifare_classic") && allowedNfcTypes.length === 1) return "mifare_classic";
  if (allowedNfcTypes.includes("mifare_ultralight_c") && allowedNfcTypes.length === 1) return "mifare_ultralight_c";
  return "ntag_21x";
}

/** Returns true if the detected tag type is allowed for the event. */
export function isChipAllowed(tagType: TagType, allowedNfcTypes: NfcChipType[]): boolean {
  if (tagType === "DESFIRE_EV3") return allowedNfcTypes.includes("desfire_ev3");
  if (tagType === "MIFARE_CLASSIC") return allowedNfcTypes.includes("mifare_classic");
  if (tagType === "MIFARE_ULTRALIGHT_C") return allowedNfcTypes.includes("mifare_ultralight_c");
  return allowedNfcTypes.includes("ntag_21x");
}

/** Human-readable label for a chip type. */
export function chipTypeLabel(ct: NfcChipType): string {
  switch (ct) {
    case "mifare_classic": return "MIFARE Classic";
    case "desfire_ev3": return "DESFire EV3";
    case "mifare_ultralight_c": return "MIFARE Ultralight C";
    default: return "NTAG 21x";
  }
}
