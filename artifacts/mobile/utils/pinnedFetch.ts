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
 * Cert SPKI (SHA-256):
 *   prod.tapee.app     → qZeuQmHlu+HfY+6kzKAG1DHDu01gEmkM5zM4UJh+CBU=
 *   attendee.tapee.app → t6a7uh5TulAD/pgVznCOpTdlAlH6vFGvYeWrrUrs96Y=
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

const FETCH_TIMEOUT_MS = 30_000;

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
 * react-native-ssl-pinning returns a custom response object that is NOT
 * compatible with the standard Fetch API Response interface.
 *
 * It has:
 *   - status: number
 *   - headers: plain object (NOT a Headers instance)
 *   - bodyString: string
 *   - text(): string  (synchronous — NOT Promise<string>)
 *   - json(): any     (synchronous — NOT Promise<any>)
 *
 * customFetch expects:
 *   - response.ok: boolean
 *   - response.headers.get(name): string | null  (Headers instance)
 *   - response.text(): Promise<string>
 *   - response.json(): Promise<any>
 *
 * This adapter wraps the library's response into a standard-compatible
 * object so customFetch works correctly.
 */
function adaptSslPinningResponse(raw: Record<string, unknown>): Response {
  const status = (raw.status as number) ?? 0;
  const bodyString = (raw.bodyString as string) ?? "";
  const rawHeaders = (raw.headers as Record<string, string | string[]>) ?? {};

  const headers = new Headers();
  for (const [key, value] of Object.entries(rawHeaders)) {
    if (Array.isArray(value)) {
      value.forEach((v) => headers.append(key, v));
    } else if (typeof value === "string") {
      headers.set(key, value);
    }
  }

  return {
    status,
    statusText: (raw.statusText as string) ?? "",
    ok: status >= 200 && status < 300,
    headers,
    url: (raw.url as string) ?? "",
    redirected: false,
    type: "basic" as ResponseType,
    body: undefined,
    bodyUsed: false,
    text: () => Promise.resolve(bodyString),
    json: () => {
      try {
        return Promise.resolve(JSON.parse(bodyString));
      } catch (e) {
        return Promise.reject(e);
      }
    },
    blob: () => Promise.resolve(new Blob([bodyString])),
    arrayBuffer: () =>
      Promise.resolve(new TextEncoder().encode(bodyString).buffer),
    formData: () =>
      Promise.reject(new Error("formData() not supported in pinnedFetch")),
    clone() {
      return adaptSslPinningResponse(raw);
    },
  } as unknown as Response;
}

/**
 * Wraps a fetch promise with a hard timeout.  If the request does not
 * settle within FETCH_TIMEOUT_MS the returned promise rejects with a
 * TimeoutError so TanStack Query can surface an error state instead of
 * leaving the UI in a permanent loading state.
 */
function withTimeout(promise: Promise<Response>): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            `[pinnedFetch] Request timed out after ${FETCH_TIMEOUT_MS / 1000}s`,
          ),
        ),
      FETCH_TIMEOUT_MS,
    );
    promise.then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * A drop-in replacement for `fetch` that adds TLS certificate pinning for all
 * Tapee API domains.  Non-API URLs are passed through to the standard `fetch`.
 *
 * Fail-closed: in release builds, throws a hard error if the native pinning
 * module is not compiled in.  In dev builds, degrades with a console warning.
 *
 * All pinned-domain requests are wrapped with a 30-second timeout so that
 * a stalled SSL handshake never leaves the app in a permanent loading state.
 *
 * The react-native-ssl-pinning response is adapted to the standard Fetch API
 * Response interface before being returned.
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
          "Certificate pinning is INACTIVE. Run a new native EAS build to activate it.",
      );
      return withTimeout(fetch(input, init));
    }
    // Fail gracefully — return rejected promise so React Query handles the error
    // rather than throwing synchronously (which can crash the JS thread on Android).
    return Promise.reject(
      new Error(
        "[pinnedFetch] Certificate pinning module is required in release builds " +
          "but react-native-ssl-pinning is not available.",
      ),
    );
  }

  try {
    const sslFetch = getSslFetch();
    const rawPromise = (
      sslFetch as (
        url: string,
        options: Record<string, unknown>,
      ) => Promise<Record<string, unknown>>
    )(url, {
      ...(init ?? {}),
      sslPinning: { certs: SSL_CERTS },
    });

    return withTimeout(rawPromise.then(adaptSslPinningResponse));
  } catch (e) {
    // Convert any synchronous throw from the native SSL module into a rejected
    // promise so the error is surfaced through React Query (isError) rather than
    // crashing the JavaScript thread.
    return Promise.reject(e instanceof Error ? e : new Error(String(e)));
  }
};
