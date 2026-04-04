/**
 * pinnedFetch — TLS-secured fetch for Tapee API domains.
 *
 * Certificate pinning is DISABLED pending verification that res/raw/ certs
 * are correctly embedded in the native build. Currently a plain fetch
 * passthrough with a 30-second timeout. APIs are already secured via HTTPS
 * with valid Let's Encrypt certificates verified by the OS trust store.
 */

const FETCH_TIMEOUT_MS = 30_000;

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
  return withTimeout(fetch(input, init));
};
