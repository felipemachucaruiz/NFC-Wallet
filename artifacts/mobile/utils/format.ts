export function formatCOP(amount: number | undefined | null): string {
  if (amount == null) return "$0";
  const rounded = Math.round(amount);
  return (
    "$" +
    rounded.toLocaleString("es-CO", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
  );
}

export function formatPercent(value: number | undefined | null): string {
  if (value == null) return "0%";
  return `${Math.round(value * 10) / 10}%`;
}

export function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("es-CO", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export function formatDateTime(dateStr: string | undefined | null): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleString("es-CO", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

export function parseCOPInput(text: string): number {
  const cleaned = text.replace(/[^0-9]/g, "");
  return parseInt(cleaned, 10) || 0;
}
