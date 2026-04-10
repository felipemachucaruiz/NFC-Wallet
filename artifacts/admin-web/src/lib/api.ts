const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_URL || "https://prod.tapee.app").replace(/\/+$/, "")
  : `${import.meta.env.BASE_URL}_srv`;
const ATTENDEE_API_URL = (import.meta.env.VITE_ATTENDEE_API_URL || "https://attendee.tapee.app").replace(/\/+$/, "");

function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

function attendeeApiUrl(path: string): string {
  return `${ATTENDEE_API_URL}${path}`;
}

export interface LoginResult {
  token?: string;
  requires_2fa?: boolean;
  partial_token?: string;
}

export async function apiLogin(identifier: string, password: string): Promise<LoginResult> {
  const res = await fetch(apiUrl("/api/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Login failed");
  return data as LoginResult;
}

export async function apiVerify2FA(partialToken: string, code: string): Promise<{ token: string }> {
  const res = await fetch(apiUrl("/api/2fa/verify"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ partial_token: partialToken, totp_code: code }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "2FA verification failed");
  return data as { token: string };
}

export async function apiForgotPassword(email: string, source: "admin" | "attendee"): Promise<void> {
  const url = source === "attendee"
    ? attendeeApiUrl("/api/auth/forgot-password")
    : apiUrl("/api/auth/forgot-password");

  const body: Record<string, string> = { email };
  if (source === "attendee") {
    const origin = window.location.origin;
    const base = import.meta.env.BASE_URL ?? "/";
    const resetPath = base.replace(/\/$/, "") + "/reset-password";
    body.redirectBaseUrl = `${origin}${resetPath}`;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as Record<string, string>).error ?? "Request failed");
  }
}

export async function apiUploadEventImage(
  eventId: string,
  imageType: "cover" | "flyer",
  file: File,
): Promise<{ imageUrl: string }> {
  const token = localStorage.getItem("tapee_admin_token");
  const formData = new FormData();
  formData.append("image", file);
  const res = await fetch(apiUrl(`/api/events/${eventId}/image/${imageType}`), {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Upload failed");
  return data as { imageUrl: string };
}

export async function apiResetPassword(token: string, password: string, source: "admin" | "attendee"): Promise<void> {
  const url = source === "attendee"
    ? attendeeApiUrl("/api/auth/reset-password")
    : apiUrl("/api/auth/reset-password");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as Record<string, string>).error ?? "Reset failed");
  }
}
