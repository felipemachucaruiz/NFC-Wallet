import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, ViewStyle } from "react-native";
import Colors from "@/constants/colors";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "success";
type Size = "sm" | "md" | "lg";

interface ButtonProps {
  title?: string;
  label?: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  icon?: React.ComponentProps<typeof Feather>["name"];
}

export function Button({
  title,
  label,
  onPress,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  fullWidth = false,
  testID,
  style,
  icon,
}: ButtonProps) {
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;

  const displayText = title ?? label ?? "";

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
  const iconSize: Record<Size, number> = { sm: 14, md: 16, lg: 18 };

  const isDisabled = disabled || loading;
  const isDark = scheme === "dark";
  const showCyanGlow = variant === "primary" && isDark && !isDisabled;

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
          shadowColor: showCyanGlow ? "#00f1ff" : "transparent",
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: showCyanGlow ? 0.45 : 0,
          shadowRadius: showCyanGlow ? 12 : 0,
          elevation: showCyanGlow ? 8 : 2,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor[variant]} size="small" />
      ) : (
        <>
          {icon && (
            <Feather
              name={icon}
              size={iconSize[size]}
              color={textColor[variant]}
              style={styles.icon}
            />
          )}
          <Text
            style={[
              styles.text,
              { color: textColor[variant], fontSize: fSize[size] },
            ]}
          >
            {displayText}
          </Text>
        </>
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
  icon: {
    marginRight: 6,
  },
});
