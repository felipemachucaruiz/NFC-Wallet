import { useColorScheme } from "@/hooks/useColorScheme";
import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import Colors from "@/constants/colors";

interface LoadingProps {
  label?: string;
  full?: boolean;
}

export function Loading({ label, full = true }: LoadingProps) {
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;

  return (
    <View style={[styles.container, full && styles.full]}>
      <ActivityIndicator size="large" color={C.primary} />
      {label ? (
        <Text style={[styles.label, { color: C.textSecondary }]}>{label}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
  },
  full: { flex: 1 },
  label: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
});
