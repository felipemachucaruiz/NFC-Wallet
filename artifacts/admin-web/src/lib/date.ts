export const TZ = "America/Bogota";

const saved = typeof localStorage !== "undefined" ? localStorage.getItem("tapee_admin_lang") : null;
let _locale = saved === "en" ? "en-US" : "es-CO";

export function setDateLocale(lang: string) {
  _locale = lang === "en" ? "en-US" : "es-CO";
}

export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(_locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: TZ,
  });
}

export function fmtDateTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString(_locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  });
}

export function fmtTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleTimeString(_locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  });
}
