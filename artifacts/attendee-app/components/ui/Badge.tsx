import { useColorScheme } from "@/hooks/useColorScheme";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Colors from "@/constants/colors";

type BadgeVariant = "primary" | "success" | "warning" | "danger" | "neutral";

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
}

export function Badge({ label, variant = "primary" }: BadgeProps) {
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;

  const bgColor: Record<BadgeVariant, string> = {
    primary: C.primaryLight,
    success: C.successLight,
    warning: C.warningLight,
    danger: C.dangerLight,
    neutral: C.cardSecondary,
  };

  const textColor: Record<BadgeVariant, string> = {
    primary: C.primary,
    success: C.success,
    warning: C.warning,
    danger: C.danger,
    neutral: C.textSecondary,
  };

  return (
    <View style={[styles.badge, { backgroundColor: bgColor[variant] }]}>
      <Text style={[styles.text, { color: textColor[variant] }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 100,
  },
  text: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
});
