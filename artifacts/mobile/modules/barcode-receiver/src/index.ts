import { Platform } from "react-native";
import { requireNativeModule, NativeModule } from "expo-modules-core";

type BarcodeReceiverEvents = {
  onBarcodeScanned: (event: { data: string }) => void;
};

type BarcodeReceiverModule = NativeModule<BarcodeReceiverEvents> & {
  startListening(): Promise<void>;
  stopListening(): Promise<void>;
  sendTestScan(barcode: string): Promise<void>;
};

let nativeModule: BarcodeReceiverModule | null = null;

if (Platform.OS === "android") {
  try {
    nativeModule = requireNativeModule<BarcodeReceiverModule>("BarcodeReceiver");
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
  const sub = nativeModule.addListener("onBarcodeScanned", (e) => listener(e.data));
  return { remove: () => sub.remove() };
}
