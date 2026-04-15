import * as Sentry from "@sentry/node";

export function captureError(
  err: unknown,
  context?: { route?: string; tags?: Record<string, string>; extra?: Record<string, unknown> },
): void {
  const error = err instanceof Error ? err : new Error(String(err ?? "unknown error"));
  Sentry.captureException(error, {
    tags: context?.tags ?? (context?.route ? { route: context.route } : undefined),
    extra: context?.extra,
  });
}
