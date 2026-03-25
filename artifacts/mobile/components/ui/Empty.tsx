import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View, useColorScheme } from "react-native";
import Colors from "@/constants/colors";
import { Button } from "./Button";

interface EmptyProps {
  icon?: keyof typeof Feather.glyphMap;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function Empty({ icon = "inbox", title, subtitle, actionLabel, onAction }: EmptyProps) {
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;

  return (
    <View style={styles.container}>
      <View style={[styles.iconBox, { backgroundColor: C.inputBg }]}>
        <Feather name={icon} size={32} color={C.textMuted} />
      </View>
      <Text style={[styles.title, { color: C.text }]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: C.textSecondary }]}>{subtitle}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button title={actionLabel} onPress={onAction} variant="primary" size="sm" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 32,
  },
  iconBox: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
});
