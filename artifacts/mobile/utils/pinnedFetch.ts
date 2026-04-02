/**
 * pinnedFetch — Certificate-pinned fetch for Tapee API domains.
 *
 * Uses `react-native-ssl-pinning` (native module) when available.
 *
 * Fail-closed behavior:
 *  - RELEASE builds: throws if native module is absent for a pinned domain.
 *  - DEV builds: warns and falls back to standard fetch so the JS bundle
 *    can be tested without a native rebuild.
 *
 * The list of active cert names is read from the EXPO_PUBLIC_SSL_CERTS env
 * var (comma-separated filenames without extension, e.g. "tapee_api").
 * Updating this variable and pushing an OTA is sufficient to rotate the
 * active pin list (the cert files must already be compiled into the native
 * binary via the withSslPinning config plugin).
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

function resolveAttendeeHost(): string {
  try {
    return new URL(ATTENDEE_API_BASE_URL).hostname;
  } catch {
    return "";
  }
}

const ATTENDEE_API_HOST = resolveAttendeeHost();

function isNativeAvailable(): boolean {
  if (_nativeAvailable !== null) return _nativeAvailable;
  try {
    require("react-native-ssl-pinning");
    _nativeAvailable = true;
  } catch {
    _nativeAvailable = false;
  }
  return _nativeAvailable;
}

function getSslFetch(): typeof fetch {
  if (_sslFetch) return _sslFetch;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { fetch: pinnedFetchImpl } = require("react-native-ssl-pinning");
  _sslFetch = pinnedFetchImpl as typeof fetch;
  return _sslFetch!;
}

function isPinnedDomain(url: string): boolean {
  try {
    const reqHost = new URL(url).hostname;
    return (
      reqHost === API_DOMAIN ||
      reqHost.endsWith(`.${API_DOMAIN}`) ||
      (ATTENDEE_API_HOST !== "" && reqHost === ATTENDEE_API_HOST)
    );
  } catch {
    return false;
  }
}

/**
 * A drop-in replacement for `fetch` that adds TLS certificate pinning for all
 * Tapee API domains.  Non-API URLs are passed through to the standard `fetch`.
 *
 * Fail-closed: in release builds, throws a hard error if the native pinning
 * module is not compiled in.  In dev builds, degrades with a console warning.
 */
export const pinnedFetch: typeof fetch = (input, init) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : (input as Request).url;

  if (!isPinnedDomain(url)) {
    return fetch(input, init);
  }

  if (!isNativeAvailable()) {
    if (__DEV__) {
      console.warn(
        "[pinnedFetch] react-native-ssl-pinning is not compiled into this build. " +
          "Certificate pinning is INACTIVE. Run a new native EAS build to activate it."
      );
      return fetch(input, init);
    }
    throw new Error(
      "[pinnedFetch] Certificate pinning module is required in release builds " +
        "but react-native-ssl-pinning is not available. " +
        "The native build must include this module."
    );
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
