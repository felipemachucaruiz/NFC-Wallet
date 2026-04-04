/**
 * pinnedFetch — was the certificate-pinned fetch for Tapee API domains.
 *
 * SSL pinning has been removed. This is now a simple passthrough to the
 * standard fetch API so it can be swapped back in later if needed without
 * changing any call sites.
 */

const FETCH_TIMEOUT_MS = 30_000;

function withTimeout(promise: Promise<Response>): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("[fetch] Request timed out after 30s")),
      FETCH_TIMEOUT_MS,
    );
    promise.then(
      (result) => { clearTimeout(timer); resolve(result); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

export const pinnedFetch: typeof fetch = (input, init) => {
  return withTimeout(fetch(input, init));
};
