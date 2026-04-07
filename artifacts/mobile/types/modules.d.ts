declare module "expo-play-integrity" {
  export function getPlayIntegrityToken(nonce: string): Promise<string>;
}

declare module "expo-app-attest" {
  export function attestKey(keyId: string, clientDataHash: string): Promise<string>;
  export function generateKey(): Promise<string>;
}
