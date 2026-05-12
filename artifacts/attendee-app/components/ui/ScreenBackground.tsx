import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, View, type ViewStyle, type StyleProp } from "react-native";

interface ScreenBackgroundProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function ScreenBackground({ children, style }: ScreenBackgroundProps) {
  return (
    <View style={[styles.root, style]}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {/* Top-left cyan glow */}
        <LinearGradient
          colors={["rgba(0,241,255,0.13)", "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.65, y: 0.55 }}
          style={StyleSheet.absoluteFill}
        />
        {/* Bottom-right cyan glow */}
        <LinearGradient
          colors={["transparent", "rgba(0,241,255,0.07)"]}
          start={{ x: 0.4, y: 0.4 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
});
