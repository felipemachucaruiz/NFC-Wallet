/**
 * fetchWithTimeout — fetch wrapper with an 8-second timeout.
 *
 * React Native's built-in fetch has no default timeout, so this thin wrapper
 * enforces one via AbortController. All API calls in the app are routed
 * through this function.
 *
 * Kept short (8s) so that on congested event networks, failed requests
 * fall through to the offline queue quickly instead of hanging.
 */

const FETCH_TIMEOUT_MS = 8_000;

export const fetchWithTimeout: typeof fetch = (input, init) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(input, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
};
