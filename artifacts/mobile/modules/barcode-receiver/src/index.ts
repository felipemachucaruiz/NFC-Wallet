import { Platform, DeviceEventEmitter } from "react-native";
import { requireNativeModule } from "expo-modules-core";

let nativeModule: {
  startListening(): Promise<void>;
  stopListening(): Promise<void>;
  sendTestScan(barcode: string): Promise<void>;
} | null = null;

if (Platform.OS === "android") {
  try {
    nativeModule = requireNativeModule("BarcodeReceiver");
  } catch {
    // Native module not available (dev client / pre-build #8)
  }
}

export const isAvailable = nativeModule !== null;

export function startListening(): Promise<void> {
  return nativeModule?.startListening() ?? Promise.resolve();
}

export function stopListening(): Promise<void> {
  return nativeModule?.stopListening() ?? Promise.resolve();
}

export function sendTestScan(barcode: string): Promise<void> {
  return nativeModule?.sendTestScan(barcode) ?? Promise.resolve();
}

export function addBarcodeListener(listener: (data: string) => void): { remove(): void } {
  if (!nativeModule) return { remove: () => {} };
  const sub = DeviceEventEmitter.addListener("TapeeBarcodeScanned", (e: { data: string }) => listener(e.data));
  return { remove: () => sub.remove() };
}
