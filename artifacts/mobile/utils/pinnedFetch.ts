/**
 * pinnedFetch — TLS certificate-pinned fetch for Tapee API domains.
 *
 * Uses react-native-ssl-pinning to validate the server certificate on every
 * request to pinned hostnames (prod.tapee.app / attendee.tapee.app).
 * All other URLs are passed through to the standard fetch API.
 *
 * Failure behaviour
 * -----------------
 * - Native module missing in DEV  → console.warn + falls back to plain fetch
 * - Native module missing in PROD → returns a rejected Promise (never throws
 *   synchronously — a synchronous throw would kill the JS thread on Android)
 * - sslFetch call throws sync     → caught, converted to rejected Promise
 * - Request takes > 30s           → Promise rejected with timeout error
 *
 * Certificate files
 * -----------------
 * tapee_api.cer     → prod.tapee.app        (DER format, res/raw/ on Android)
 * attendee_api.cer  → attendee.tapee.app    (DER format, res/raw/ on Android)
 *
 * The file stems without extension ("tapee_api", "attendee_api") are the names
 * that react-native-ssl-pinning uses to look up Android raw resources and iOS
 * bundle resources. They must match what the withSslPinning plugin installs.
 */

import { API_BASE_URL, ATTENDEE_API_BASE_URL } from "@/constants/domain";

// Cert stems — must match files installed by withSslPinning plugin
const SSL_CERTS = ["tapee_api", "attendee_api"] as const;

const FETCH_TIMEOUT_MS = 30_000;

// ── Pinned host set ────────────────────────────────────────────────────────────

function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

const PINNED_HOSTS: ReadonlySet<string> = new Set(
  [API_BASE_URL, ATTENDEE_API_BASE_URL]
    .map(hostnameFromUrl)
    .filter(Boolean),
);

function isPinnedDomain(url: string): boolean {
  const host = hostnameFromUrl(url);
  return host !== "" && PINNED_HOSTS.has(host);
}

// ── Native module loader ───────────────────────────────────────────────────────

type SslFetchFn = (
  url: string,
  options: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

let _cachedFn: SslFetchFn | null | undefined = undefined; // undefined = not yet tried

function getNativeSslFetch(): SslFetchFn | null {
  if (_cachedFn !== undefined) return _cachedFn;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-native-ssl-pinning") as {
      fetch?: SslFetchFn;
      default?: { fetch?: SslFetchFn };
    };
    _cachedFn = mod.fetch ?? mod.default?.fetch ?? null;
  } catch {
    _cachedFn = null;
  }
  return _cachedFn;
}

// ── Response adapter ───────────────────────────────────────────────────────────

function adaptResponse(raw: Record<string, unknown>): Response {
  const status = (raw.status as number | undefined) ?? 200;
  const rawHeaders = (raw.headers as Record<string, string> | undefined) ?? {};
  const body =
    typeof raw.bodyString === "string"
      ? raw.bodyString
      : JSON.stringify(raw.bodyString ?? null);

  return new Response(body, {
    status,
    headers: new Headers(rawHeaders),
  });
}

// ── Timeout wrapper ────────────────────────────────────────────────────────────

function withTimeout(promise: Promise<Response>): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`[pinnedFetch] Request timed out after ${FETCH_TIMEOUT_MS / 1000}s`)),
      FETCH_TIMEOUT_MS,
    );
    promise.then(
      (r) => { clearTimeout(timer); resolve(r); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Drop-in replacement for `fetch`. Automatically applies certificate pinning
 * for Tapee API hostnames; passes all other URLs to the standard fetch.
 */
export const pinnedFetch: typeof fetch = (input, init) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : (input as Request).url;

  // Non-pinned domain — plain fetch with timeout
  if (!isPinnedDomain(url)) {
    return withTimeout(fetch(input, init));
  }

  const sslFetch = getNativeSslFetch();

  // Native module unavailable
  if (!sslFetch) {
    if (__DEV__) {
      console.warn(
        "[pinnedFetch] react-native-ssl-pinning is not compiled into this build. " +
          "Certificate pinning is INACTIVE — run a new EAS native build to activate it.",
      );
      return withTimeout(fetch(input, init));
    }
    // Release: reject gracefully so React Query surfaces an error, never crash the thread
    return Promise.reject(
      new Error(
        "[pinnedFetch] SSL pinning module is missing from this release build.",
      ),
    );
  }

  // Pinned request
  try {
    const rawPromise = sslFetch(url, {
      ...(init ?? {}),
      sslPinning: {
        certs: SSL_CERTS as unknown as string[],
      },
    });

    return withTimeout(rawPromise.then(adaptResponse));
  } catch (e) {
    // A synchronous throw from the native module (e.g. resource not found in
    // res/raw/) is converted to a rejected Promise so it never kills the thread.
    return Promise.reject(e instanceof Error ? e : new Error(String(e)));
  }
};
