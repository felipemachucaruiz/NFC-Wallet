import React, { useRef } from "react";
import type { TextInput as RNTextInput } from "react-native";
import { Input } from "@/components/ui/Input";
import type { InputProps } from "@/components/ui/Input";

// Locale-aware thousand separator per currency
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

function stripFormatting(text: string): string {
  return text.replace(/[^0-9]/g, "");
}

type CurrencyInputProps = Omit<InputProps, "keyboardType" | "value" | "onChangeText"> & {
  /** Raw numeric string (no formatting), e.g. "30000" */
  value: string;
  /** Called with raw digits string, e.g. "30000" */
  onChangeValue: (raw: string) => void;
  currencyCode?: string;
};

export function CurrencyInput({
  value,
  onChangeValue,
  currencyCode = "COP",
  onFocus,
  ...rest
}: CurrencyInputProps) {
  const inputRef = useRef<RNTextInput>(null);

  const displayed = formatAmount(value, currencyCode);

  const handleChangeText = (text: string) => {
    const raw = stripFormatting(text);
    onChangeValue(raw);
  };

  const handleFocus = (e: Parameters<NonNullable<InputProps["onFocus"]>>[0]) => {
    // Clear "0" on focus so user doesn't need to delete it first
    if (value === "0" || value === "") {
      onChangeValue("");
    } else {
      // Select all so user can replace with a single keystroke
      inputRef.current?.setNativeProps?.({ selection: { start: 0, end: displayed.length } });
    }
    onFocus?.(e);
  };

  return (
    <Input
      ref={inputRef}
      {...rest}
      value={displayed}
      onChangeText={handleChangeText}
      onFocus={handleFocus}
      keyboardType="numeric"
    />
  );
}
