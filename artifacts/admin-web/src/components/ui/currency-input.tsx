import * as React from "react";
import { cn } from "@/lib/utils";

// Locale per currency for thousand-separator formatting
const CURRENCY_LOCALE: Record<string, { locale: string; decimals: number }> = {
  COP: { locale: "es-CO", decimals: 0 },
  CLP: { locale: "es-CL", decimals: 0 },
  MXN: { locale: "es-MX", decimals: 2 },
  ARS: { locale: "es-AR", decimals: 2 },
  PEN: { locale: "es-PE", decimals: 2 },
  UYU: { locale: "es-UY", decimals: 2 },
  BOB: { locale: "es-BO", decimals: 2 },
  BRL: { locale: "pt-BR", decimals: 2 },
  USD: { locale: "en-US", decimals: 2 },
};

function formatAmount(raw: string, currencyCode: string): string {
  const cfg = CURRENCY_LOCALE[currencyCode] ?? CURRENCY_LOCALE.COP;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  const num = parseInt(digits, 10);
  if (isNaN(num)) return "";
  return num.toLocaleString(cfg.locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export interface CurrencyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  /** Raw numeric string, e.g. "30000" */
  value: string;
  /** Called with raw digit string, e.g. "30000" */
  onValueChange: (raw: string) => void;
  currencyCode?: string;
}

const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ className, value, onValueChange, currencyCode = "COP", onFocus, ...props }, ref) => {
    const displayed = formatAmount(value, currencyCode);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      // Strip everything that isn't a digit (removes dots, commas, spaces)
      const digits = e.target.value.replace(/\D/g, "");
      onValueChange(digits);
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      // Clear "0" or select all so user can overwrite immediately
      if (value === "0" || value === "") {
        onValueChange("");
      } else {
        e.target.select();
      }
      onFocus?.(e);
    };

    return (
      <input
        ref={ref}
        type="text"
        inputMode="numeric"
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        value={displayed}
        onChange={handleChange}
        onFocus={handleFocus}
        {...props}
      />
    );
  },
);

CurrencyInput.displayName = "CurrencyInput";

export { CurrencyInput };
