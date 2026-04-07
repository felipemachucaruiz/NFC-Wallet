export function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    if (typeof e.message === "string" && e.message) return e.message;
    if (e.data && typeof e.data === "object") {
      const d = e.data as Record<string, unknown>;
      if (typeof d.error === "string" && d.error) return d.error;
      if (typeof d.message === "string" && d.message) return d.message;
    }
    if (typeof e.error === "string" && e.error) return e.error;
  }
  if (typeof err === "string" && err) return err;
  return fallback;
}
