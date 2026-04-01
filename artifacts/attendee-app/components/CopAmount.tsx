import { useColorScheme } from "@/hooks/useColorScheme";
import React from "react";
import { Text, TextStyle } from "react-native";
import Colors from "@/constants/colors";
import { formatCOP } from "@/utils/format";

interface CopAmountProps {
  amount: number | undefined | null;
  size?: number;
  bold?: boolean;
  color?: string;
  style?: TextStyle;
  positive?: boolean;
}

export function CopAmount({
  amount,
  size = 16,
  bold = true,
  color,
  style,
  positive,
}: CopAmountProps) {
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;

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
      {formatCOP(amount)}
    </Text>
  );
}
