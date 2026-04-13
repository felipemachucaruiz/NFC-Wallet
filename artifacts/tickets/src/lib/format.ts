export function formatPrice(amount: number, currency: string = "COP"): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

const TZ = "America/Bogota";

export function formatDateRange(startsAt: string, endsAt: string, isMultiDay: boolean): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", timeZone: TZ };

  if (isMultiDay) {
    const year = new Intl.DateTimeFormat("es-CO", { year: "numeric", timeZone: TZ }).format(start);
    return `${start.toLocaleDateString("es-CO", opts)} - ${end.toLocaleDateString("es-CO", opts)}, ${year}`;
  }

  return start.toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: TZ,
  });
}

export function formatFullDate(dateStr: string, locale?: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(locale?.startsWith("en") ? "en-US" : "es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  });
}
