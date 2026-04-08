const CURRENCY_CONFIGS: Record<string, { symbol: string; locale: string; decimals: number }> = {
  COP: { symbol: "$", locale: "es-CO", decimals: 0 },
  MXN: { symbol: "$", locale: "es-MX", decimals: 2 },
  CLP: { symbol: "$", locale: "es-CL", decimals: 0 },
  ARS: { symbol: "$", locale: "es-AR", decimals: 2 },
  PEN: { symbol: "S/", locale: "es-PE", decimals: 2 },
  UYU: { symbol: "$U", locale: "es-UY", decimals: 2 },
  BOB: { symbol: "Bs", locale: "es-BO", decimals: 2 },
  BRL: { symbol: "R$", locale: "pt-BR", decimals: 2 },
  USD: { symbol: "$", locale: "en-US", decimals: 2 },
};

export function formatCurrency(amount: number | undefined | null, currencyCode: string = "COP"): string {
  if (amount == null) return formatCurrency(0, currencyCode);
  const config = CURRENCY_CONFIGS[currencyCode] || CURRENCY_CONFIGS.COP;
  const rounded = config.decimals === 0 ? Math.round(amount) : amount;
  return config.symbol + rounded.toLocaleString(config.locale, {
    minimumFractionDigits: config.decimals,
    maximumFractionDigits: config.decimals,
  });
}

export function formatCOP(amount: number | undefined | null): string {
  return formatCurrency(amount, "COP");
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
