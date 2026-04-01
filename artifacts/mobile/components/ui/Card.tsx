import { useColorScheme } from "@/hooks/useColorScheme";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Colors from "@/constants/colors";

interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: object;
  padding?: number;
}

export function Card({ children, onPress, style, padding = 16 }: CardProps) {
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;

  const content = (
    <View
      style={[
        styles.card,
        { backgroundColor: C.card, borderColor: C.border, padding },
        style,
      ]}
    >
      {children}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
      >
        {content}
      </Pressable>
    );
  }
  return content;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
});
