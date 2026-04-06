const ADMIN_API_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");
const ATTENDEE_API_URL = (import.meta.env.VITE_ATTENDEE_API_URL ?? ADMIN_API_URL).replace(/\/+$/, "");

export function adminApiUrl(path: string): string {
  return `${ADMIN_API_URL}${path}`;
}

export function attendeeApiUrl(path: string): string {
  return `${ATTENDEE_API_URL}${path}`;
}

export interface AuthUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string;
  merchantId?: string | null;
  eventId?: string | null;
  promoterCompanyId?: string | null;
}

export interface LoginResult {
  token?: string;
  requires_2fa?: boolean;
  partial_token?: string;
}

export async function apiLogin(identifier: string, password: string): Promise<LoginResult> {
  const res = await fetch(adminApiUrl("/api/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Login failed");
  return data as LoginResult;
}

export async function apiVerify2FA(partialToken: string, code: string): Promise<{ token: string }> {
  const res = await fetch(adminApiUrl("/api/2fa/verify"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ partial_token: partialToken, totp_code: code }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "2FA verification failed");
  return data as { token: string };
}

export async function apiGetCurrentUser(token: string): Promise<AuthUser | null> {
  const res = await fetch(adminApiUrl("/api/auth/user"), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return (data.user as AuthUser) ?? null;
}

export async function apiLogout(token: string): Promise<void> {
  await fetch(adminApiUrl("/api/auth/logout"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function apiForgotPassword(email: string, source: "admin" | "attendee"): Promise<void> {
  const url = source === "attendee"
    ? attendeeApiUrl("/api/auth/forgot-password")
    : adminApiUrl("/api/auth/forgot-password");

  const body: Record<string, string> = { email };
  if (source === "attendee") {
    // Tell the attendee-api to send the reset link back to this web-admin app
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

export async function apiResetPassword(token: string, password: string, source: "admin" | "attendee"): Promise<void> {
  const url = source === "attendee"
    ? attendeeApiUrl("/api/auth/reset-password")
    : adminApiUrl("/api/auth/reset-password");

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
