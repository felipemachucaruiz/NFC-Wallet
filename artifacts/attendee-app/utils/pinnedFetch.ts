/**
 * pinnedFetch — TLS-secured fetch for Tapee Attendee API.
 *
 * Certificate pinning is DISABLED — cert files are not embedded in the
 * preview APK's res/raw/ resources, causing CertPathValidatorException.
 * All requests use plain fetch; HTTPS + OS trust store provides security.
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
