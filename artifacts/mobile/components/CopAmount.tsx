import { useColorScheme } from "@/hooks/useColorScheme";
import React from "react";
import { Text, type StyleProp, type TextStyle } from "react-native";
import Colors from "@/constants/colors";
import { formatCurrency } from "@/utils/format";
import { useEventContext } from "@/contexts/EventContext";

interface CopAmountProps {
  amount: number | undefined | null;
  currencyCode?: string;
  size?: number;
  bold?: boolean;
  color?: string;
  style?: StyleProp<TextStyle>;
  positive?: boolean;
}

export function CopAmount({
  amount,
  currencyCode,
  size = 16,
  bold = true,
  color,
  style,
  positive,
}: CopAmountProps) {
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;

  const { currencyCode: contextCurrency } = useEventContext();
  const resolvedCurrency = currencyCode ?? contextCurrency;

  const resolvedColor =
    color ??
    (positive === undefined
      ? C.text
      : positive
      ? C.success
      : C.danger);

  return (
    <Text
      style={[
        {
          fontSize: size,
          fontFamily: bold ? "Inter_700Bold" : "Inter_400Regular",
          color: resolvedColor,
        },
        style,
      ]}
    >
      {formatCurrency(amount, resolvedCurrency)}
    </Text>
  );
}

export { CopAmount as CurrencyAmount };
