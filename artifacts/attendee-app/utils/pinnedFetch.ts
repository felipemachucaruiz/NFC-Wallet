/**
 * pinnedFetch — TLS certificate-pinned fetch for Tapee Attendee API.
 *
 * Pins to the ISRG Root X1 root CA certificate (valid until 2035).
 * All Let's Encrypt-issued leaf certs on attendee.tapee.app chain through
 * this root, so the pin survives automatic 90-day leaf cert renewals
 * without any app update.
 *
 * Uses react-native-ssl-pinning for Android certificate pinning.
 * The isrg_root_x1.cer DER file must be present in assets/certs/ at
 * build time so the Expo plugin copies it to android/app/src/main/res/raw/.
 */

import { fetch as sslFetch } from "react-native-ssl-pinning";
import { Platform } from "react-native";

const PINNED_CERTS = ["isrg_root_x1"];

const PINNED_DOMAINS = ["attendee.tapee.app", "prod.tapee.app"];

const FETCH_TIMEOUT_MS = 30_000;

function isPinnedDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return PINNED_DOMAINS.includes(hostname);
  } catch {
    return false;
  }
}

function resolveUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function resolveMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof input !== "string" && !(input instanceof URL)) {
    return input.method?.toUpperCase() ?? "GET";
  }
  return "GET";
}

function resolveHeaders(
  input: RequestInfo | URL,
  init?: RequestInit,
): Record<string, string> {
  const merged: Record<string, string> = {};

  const addHeaders = (source: HeadersInit | undefined) => {
    if (!source) return;
    if (source instanceof Headers) {
      source.forEach((v, k) => { merged[k] = v; });
    } else if (Array.isArray(source)) {
      for (const [k, v] of source) merged[k] = v;
    } else {
      Object.assign(merged, source);
    }
  };

  if (typeof input !== "string" && !(input instanceof URL)) {
    addHeaders(input.headers);
  }
  addHeaders(init?.headers);

  return merged;
}

function resolveBody(init?: RequestInit): string | undefined {
  if (init?.body == null) return undefined;
  if (typeof init.body === "string") return init.body;
  return String(init.body);
}

function buildStandardResponse(
  sslResponse: {
    status: number;
    headers: Record<string, string>;
    bodyString?: string;
    json: () => Promise<Record<string, unknown>>;
    text: () => Promise<string>;
    url: string;
  },
  url: string,
): Response {
  const status = sslResponse.status;
  const ok = status >= 200 && status < 300;
  const bodyString = sslResponse.bodyString ?? "";

  const headers = new Headers(sslResponse.headers ?? {});

  const response = {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    headers,
    url: sslResponse.url ?? url,
    redirected: false,
    type: "basic" as ResponseType,
    body: null,
    bodyUsed: false,
    json: () => Promise.resolve(JSON.parse(bodyString)),
    text: () => Promise.resolve(bodyString),
    arrayBuffer: () => Promise.reject(new Error("arrayBuffer not supported with SSL pinning")),
    blob: () => Promise.reject(new Error("blob not supported with SSL pinning")),
    formData: () => Promise.reject(new Error("formData not supported with SSL pinning")),
    clone: () => buildStandardResponse(sslResponse, url),
  };

  return response as unknown as Response;
}

async function pinnedDomainFetch(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: string | undefined,
): Promise<Response> {
  const sslResponse = await sslFetch(url, {
    method: method as "GET" | "POST" | "PUT" | "DELETE",
    headers,
    body,
    sslPinning: { certs: PINNED_CERTS },
    pkPinning: false,
    timeoutInterval: FETCH_TIMEOUT_MS,
  });

  return buildStandardResponse(sslResponse, url);
}

function withTimeout(promise: Promise<Response>): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("[fetch] Request timed out after 30s")),
      FETCH_TIMEOUT_MS,
    );
    promise.then(
      (r) => { clearTimeout(timer); resolve(r); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

export const pinnedFetch: typeof fetch = (input, init) => {
  const url = resolveUrl(input);

  if (Platform.OS === "android" && isPinnedDomain(url)) {
    const method = resolveMethod(input, init);
    const headers = resolveHeaders(input, init);
    const body = resolveBody(init);
    return pinnedDomainFetch(url, method, headers, body);
  }

  return withTimeout(fetch(input, init));
};
