import { useColorScheme } from "@/hooks/useColorScheme";
import React from "react";
import { StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";
import Colors from "@/constants/colors";

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  prefix?: string;
}

export function Input({ label, error, prefix, style, ...props }: InputProps) {
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;

  return (
    <View style={styles.wrapper}>
      {label ? (
        <Text style={[styles.label, { color: C.textSecondary }]}>{label}</Text>
      ) : null}
      <View
        style={[
          styles.inputRow,
          {
            backgroundColor: C.inputBg,
            borderColor: error ? C.danger : C.border,
          },
        ]}
      >
        {prefix ? (
          <Text style={[styles.prefix, { color: C.textMuted }]}>{prefix}</Text>
        ) : null}
        <TextInput
          style={[styles.input, { color: C.text }, style]}
          placeholderTextColor={C.textMuted}
          {...props}
        />
      </View>
      {error ? (
        <Text style={[styles.error, { color: C.danger }]}>{error}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 6 },
  label: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  prefix: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    marginRight: 6,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    paddingVertical: 12,
  },
  error: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
});
