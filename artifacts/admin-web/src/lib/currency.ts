const CURRENCY_CONFIGS: Record<string, { code: string; symbol: string; locale: string; decimals: number }> = {
  COP: { code: "COP", symbol: "$", locale: "es-CO", decimals: 0 },
  MXN: { code: "MXN", symbol: "$", locale: "es-MX", decimals: 2 },
  CLP: { code: "CLP", symbol: "$", locale: "es-CL", decimals: 0 },
  ARS: { code: "ARS", symbol: "$", locale: "es-AR", decimals: 2 },
  PEN: { code: "PEN", symbol: "S/", locale: "es-PE", decimals: 2 },
  UYU: { code: "UYU", symbol: "$U", locale: "es-UY", decimals: 2 },
  BOB: { code: "BOB", symbol: "Bs", locale: "es-BO", decimals: 2 },
  BRL: { code: "BRL", symbol: "R$", locale: "pt-BR", decimals: 2 },
  USD: { code: "USD", symbol: "$", locale: "en-US", decimals: 2 },
};

export function formatCurrency(amount: number | undefined | null, currencyCode: string = "COP"): string {
  if (amount == null) return formatCurrency(0, currencyCode);
  const config = CURRENCY_CONFIGS[currencyCode] || CURRENCY_CONFIGS.COP;
  try {
    return new Intl.NumberFormat(config.locale, {
      style: "currency",
      currency: config.code,
      minimumFractionDigits: config.decimals,
      maximumFractionDigits: config.decimals,
    }).format(amount);
  } catch {
    return `${config.symbol}${Math.round(amount).toLocaleString()}`;
  }
}
