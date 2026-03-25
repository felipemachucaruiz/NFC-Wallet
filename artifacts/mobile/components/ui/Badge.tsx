import React from "react";
import { StyleSheet, Text, View, useColorScheme } from "react-native";
import Colors from "@/constants/colors";

type BadgeVariant = "success" | "warning" | "danger" | "info" | "muted";

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: "sm" | "md";
}

export function Badge({ label, variant = "info", size = "md" }: BadgeProps) {
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;

  const colorMap: Record<BadgeVariant, { bg: string; text: string }> = {
    success: { bg: C.successLight, text: C.success },
    warning: { bg: C.warningLight, text: C.warning },
    danger: { bg: C.dangerLight, text: C.danger },
    info: { bg: C.primaryLight, text: C.primary },
    muted: { bg: C.inputBg, text: C.textSecondary },
  };

  const { bg, text } = colorMap[variant];
  const fontSize = size === "sm" ? 11 : 13;
  const padH = size === "sm" ? 8 : 10;
  const padV = size === "sm" ? 2 : 4;

  return (
    <View
      style={[styles.badge, { backgroundColor: bg, paddingHorizontal: padH, paddingVertical: padV }]}
    >
      <Text style={[styles.text, { color: text, fontSize }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 100,
    alignSelf: "flex-start",
  },
  text: {
    fontFamily: "Inter_600SemiBold",
  },
});
