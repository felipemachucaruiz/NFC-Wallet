import { Platform } from "react-native";
import { EventEmitter, requireNativeModule } from "expo-modules-core";

let nativeModule: {
  startListening(): Promise<void>;
  stopListening(): Promise<void>;
  sendTestScan(barcode: string): Promise<void>;
} | null = null;
let emitter: EventEmitter | null = null;

if (Platform.OS === "android") {
  try {
    nativeModule = requireNativeModule("BarcodeReceiver");
    emitter = new EventEmitter(nativeModule as object);
  } catch {
    // Native module not available on this build (dev / pre-build #8)
  }
}

/** True when the native Android broadcast receiver is compiled into this build. */
export const isAvailable = nativeModule !== null;

export function startListening(): Promise<void> {
  return nativeModule?.startListening() ?? Promise.resolve();
}

export function stopListening(): Promise<void> {
  return nativeModule?.stopListening() ?? Promise.resolve();
}

/** Fires a fake scan event directly — bypasses broadcasts. Use to verify the JS event chain. */
export function sendTestScan(barcode: string): Promise<void> {
  return nativeModule?.sendTestScan(barcode) ?? Promise.resolve();
}

export function addBarcodeListener(listener: (data: string) => void): { remove(): void } {
  if (!emitter) return { remove: () => {} };
  const sub = emitter.addListener<{ data: string }>("onBarcodeScanned", (e) => listener(e.data));
  return sub;
}
