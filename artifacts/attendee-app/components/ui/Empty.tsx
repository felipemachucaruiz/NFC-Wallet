import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Colors from "@/constants/colors";

interface EmptyProps {
  icon?: React.ComponentProps<typeof Feather>["name"];
  title: string;
  subtitle?: string;
}

export function Empty({ icon = "inbox", title, subtitle }: EmptyProps) {
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;

  return (
    <View style={styles.container}>
      <View style={[styles.iconBox, { backgroundColor: C.primaryLight }]}>
        <Feather name={icon} size={32} color={C.primary} />
      </View>
      <Text style={[styles.title, { color: C.text }]}>{title}</Text>
      {subtitle && (
        <Text style={[styles.subtitle, { color: C.textSecondary }]}>{subtitle}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    gap: 12,
  },
  iconBox: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    maxWidth: 260,
  },
});
