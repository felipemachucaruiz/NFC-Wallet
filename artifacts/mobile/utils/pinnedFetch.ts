/**
 * pinnedFetch — TLS-secured fetch for Tapee API domains.
 *
 * Certificate pinning is PENDING a new native APK build.
 * The withSslPinning config plugin has been corrected to copy cert files to
 * res/raw/ (Android) instead of assets/ — but that fix only takes effect
 * in a fresh EAS build. Until that APK is deployed, this module is a plain
 * fetch passthrough with a 30-second timeout so the current APK keeps working.
 *
 * Once the new APK is live, restore the full pinnedFetch implementation
 * from git history (commit 03fd10c).
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
