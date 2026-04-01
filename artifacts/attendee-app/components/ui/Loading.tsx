import { useColorScheme } from "@/hooks/useColorScheme";
import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import Colors from "@/constants/colors";

interface LoadingProps {
  label?: string;
}

export function Loading({ label }: LoadingProps) {
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <ActivityIndicator size="large" color={C.primary} />
      {label && (
        <Text style={[styles.label, { color: C.textSecondary }]}>{label}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  label: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
});
