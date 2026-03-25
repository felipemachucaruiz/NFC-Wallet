import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
} from "react-native";
import Colors from "@/constants/colors";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "success";
type Size = "sm" | "md" | "lg";

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  testID?: string;
}

export function Button({
  title,
  onPress,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  fullWidth = false,
  testID,
}: ButtonProps) {
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;

  const bg: Record<Variant, string> = {
    primary: C.primary,
    secondary: C.border,
    danger: C.danger,
    ghost: "transparent",
    success: C.success,
  };

  const textColor: Record<Variant, string> = {
    primary: "#fff",
    secondary: C.text,
    danger: "#fff",
    ghost: C.primary,
    success: "#fff",
  };

  const padV: Record<Size, number> = { sm: 8, md: 14, lg: 18 };
  const fSize: Record<Size, number> = { sm: 13, md: 15, lg: 16 };

  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: bg[variant],
          paddingVertical: padV[size],
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
          alignSelf: fullWidth ? "stretch" : "auto",
          borderWidth: variant === "ghost" ? 0 : 0,
          borderColor: C.border,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor[variant]} size="small" />
      ) : (
        <Text
          style={[
            styles.text,
            { color: textColor[variant], fontSize: fSize[size] },
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 12,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    flexDirection: "row",
  },
  text: {
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
});
