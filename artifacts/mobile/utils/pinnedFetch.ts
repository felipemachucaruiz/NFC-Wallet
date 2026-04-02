/**
 * pinnedFetch — Certificate-pinned fetch for Tapee API domains.
 *
 * Uses `react-native-ssl-pinning` (native module) when available.
 * Falls back to standard `fetch` gracefully so development builds without
 * the module compiled in do not crash.
 *
 * The list of active cert names is read from the EXPO_PUBLIC_SSL_CERTS env
 * var (comma-separated filenames without extension, e.g. "tapee_api").
 * If not set, defaults to the shipped cert name.  Updating this variable
 * and pushing an OTA bundle is sufficient to rotate to a new certificate
 * (provided the new .cer file was included in the previous native build).
 *
 * Cert SPKI (SHA-256): 5f3mnJdIerf/0WlSLG07Xb0l52f48NEYZgrQRQk4FiA=
 */

import { API_DOMAIN, ATTENDEE_API_BASE_URL } from "@/constants/domain";

const DEFAULT_CERT_NAMES = ["tapee_api"];

const SSL_CERTS: string[] = (() => {
  const raw = process.env.EXPO_PUBLIC_SSL_CERTS ?? "";
  const parsed = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : DEFAULT_CERT_NAMES;
})();

let _sslFetch: typeof fetch | null = null;
let _nativeAvailable: boolean | null = null;

function isNativeAvailable(): boolean {
  if (_nativeAvailable !== null) return _nativeAvailable;
  try {
    require("react-native-ssl-pinning");
    _nativeAvailable = true;
  } catch {
    _nativeAvailable = false;
    console.warn(
      "[pinnedFetch] react-native-ssl-pinning is not available in this build. " +
        "Certificate pinning is INACTIVE. A new native build is required to activate it."
    );
  }
  return _nativeAvailable;
}

function getSslFetch(): typeof fetch {
  if (_sslFetch) return _sslFetch;
  if (!isNativeAvailable()) return fetch;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { fetch: pinnedFetchImpl } = require("react-native-ssl-pinning");
  _sslFetch = pinnedFetchImpl as typeof fetch;
  return _sslFetch!;
}

function isPinnedDomain(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return (
      host === API_DOMAIN ||
      host.endsWith(`.${API_DOMAIN}`) ||
      ATTENDEE_API_BASE_URL.includes(host)
    );
  } catch {
    return false;
  }
}

/**
 * A drop-in replacement for `fetch` that adds TLS certificate pinning for all
 * Tapee API domains.  Non-API URLs are passed through to the standard `fetch`.
 */
export const pinnedFetch: typeof fetch = (input, init) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : (input as Request).url;

  if (!isPinnedDomain(url) || !isNativeAvailable()) {
    return fetch(input, init);
  }

  const sslFetch = getSslFetch();
  return (sslFetch as (
    url: string,
    options: Record<string, unknown>
  ) => ReturnType<typeof fetch>)(url, {
    ...(init ?? {}),
    sslPinning: { certs: SSL_CERTS },
  });
};
