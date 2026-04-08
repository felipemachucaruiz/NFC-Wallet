import { db } from "./index";
import { exchangeRatesTable } from "./schema/events";
import { eventsTable } from "./schema/events";
import { eq, and, ne } from "drizzle-orm";

export const SUPPORTED_CURRENCIES = ["COP", "MXN", "CLP", "ARS", "PEN", "UYU", "BOB", "BRL", "USD"] as const;
export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];

export interface CurrencyConfig {
  code: string;
  symbol: string;
  locale: string;
  decimals: number;
}

export const CURRENCY_CONFIGS: Record<string, CurrencyConfig> = {
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

export function getCurrencyConfig(currencyCode: string): CurrencyConfig {
  return CURRENCY_CONFIGS[currencyCode] || CURRENCY_CONFIGS.COP;
}

const CACHE_DURATION_MS = 12 * 60 * 60 * 1000;

export async function hasNonCopEvents(): Promise<boolean> {
  const [row] = await db
    .select({ id: eventsTable.id })
    .from(eventsTable)
    .where(and(eq(eventsTable.active, true), ne(eventsTable.currencyCode, "COP")))
    .limit(1);
  return !!row;
}

export async function getExchangeRate(fromCurrency: string, toCurrency: string): Promise<number | null> {
  if (fromCurrency === toCurrency) return 1;

  const [cached] = await db
    .select()
    .from(exchangeRatesTable)
    .where(
      and(
        eq(exchangeRatesTable.baseCurrency, fromCurrency),
        eq(exchangeRatesTable.targetCurrency, toCurrency),
      ),
    )
    .limit(1);

  if (cached) {
    const age = Date.now() - new Date(cached.fetchedAt).getTime();
    if (age < CACHE_DURATION_MS) {
      return parseFloat(cached.rate);
    }
  }

  return null;
}

export async function fetchAndCacheRates(baseCurrency: string): Promise<Record<string, number>> {
  const apiKey = process.env.EXCHANGE_RATE_API_KEY;
  if (!apiKey) {
    console.warn("[ExchangeRate] EXCHANGE_RATE_API_KEY not configured, using fallback rates");
    return {};
  }

  try {
    const response = await fetch(`https://v6.exchangerate-api.com/v6/${apiKey}/latest/${baseCurrency}`);
    if (!response.ok) {
      console.error(`[ExchangeRate] API error: ${response.status}`);
      return {};
    }

    const data = await response.json() as { result: string; conversion_rates: Record<string, number> };
    if (data.result !== "success") {
      console.error("[ExchangeRate] API returned non-success result");
      return {};
    }

    const rates = data.conversion_rates;
    const now = new Date();

    for (const [targetCurrency, rate] of Object.entries(rates)) {
      if (!SUPPORTED_CURRENCIES.includes(targetCurrency as SupportedCurrency)) continue;

      const [existing] = await db
        .select({ id: exchangeRatesTable.id })
        .from(exchangeRatesTable)
        .where(
          and(
            eq(exchangeRatesTable.baseCurrency, baseCurrency),
            eq(exchangeRatesTable.targetCurrency, targetCurrency),
          ),
        )
        .limit(1);

      if (existing) {
        await db
          .update(exchangeRatesTable)
          .set({ rate: String(rate), fetchedAt: now })
          .where(eq(exchangeRatesTable.id, existing.id));
      } else {
        await db
          .insert(exchangeRatesTable)
          .values({
            baseCurrency,
            targetCurrency,
            rate: String(rate),
            fetchedAt: now,
          });
      }
    }

    return rates;
  } catch (err) {
    console.error("[ExchangeRate] Failed to fetch rates:", err);
    return {};
  }
}

export async function convertToCOP(amount: number, fromCurrency: string): Promise<{ copAmount: number; rate: number } | null> {
  if (fromCurrency === "COP") return { copAmount: amount, rate: 1 };

  let rate = await getExchangeRate(fromCurrency, "COP");

  if (rate === null) {
    const needsFetch = await hasNonCopEvents();
    if (!needsFetch) return null;

    const rates = await fetchAndCacheRates(fromCurrency);
    rate = rates["COP"] ?? null;
  }

  if (rate === null) return null;

  return { copAmount: Math.round(amount * rate), rate };
}

export async function getExchangeRatesForDisplay(fromCurrency: string): Promise<{ rate: number; fetchedAt: Date } | null> {
  if (fromCurrency === "COP") return null;

  const [cached] = await db
    .select()
    .from(exchangeRatesTable)
    .where(
      and(
        eq(exchangeRatesTable.baseCurrency, fromCurrency),
        eq(exchangeRatesTable.targetCurrency, "COP"),
      ),
    )
    .limit(1);

  if (cached) {
    const age = Date.now() - new Date(cached.fetchedAt).getTime();
    if (age < CACHE_DURATION_MS) {
      return { rate: parseFloat(cached.rate), fetchedAt: new Date(cached.fetchedAt) };
    }

    const needsFetch = await hasNonCopEvents();
    if (needsFetch) {
      const rates = await fetchAndCacheRates(fromCurrency);
      if (rates["COP"]) {
        return { rate: rates["COP"], fetchedAt: new Date() };
      }
    }

    return { rate: parseFloat(cached.rate), fetchedAt: new Date(cached.fetchedAt) };
  }

  const needsFetch = await hasNonCopEvents();
  if (!needsFetch) return null;

  const rates = await fetchAndCacheRates(fromCurrency);
  if (rates["COP"]) {
    return { rate: rates["COP"], fetchedAt: new Date() };
  }

  return null;
}
