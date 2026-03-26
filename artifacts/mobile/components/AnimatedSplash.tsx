import React, { useEffect } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

interface Props {
  onFinished: () => void;
}

const logo = require("../assets/images/tapee-logo.png");

export function AnimatedSplash({ onFinished }: Props) {
  const logoScale = useSharedValue(0.6);
  const logoOpacity = useSharedValue(0);

  const taglineOpacity = useSharedValue(0);
  const taglineY = useSharedValue(12);

  const screenOpacity = useSharedValue(1);

  useEffect(() => {
    logoOpacity.value = withTiming(1, { duration: 350 });
    logoScale.value = withSpring(1, { damping: 13, stiffness: 140 });

    taglineOpacity.value = withDelay(500, withTiming(1, { duration: 400 }));
    taglineY.value = withDelay(500, withSpring(0, { damping: 18, stiffness: 120 }));

    screenOpacity.value = withDelay(
      2200,
      withTiming(0, { duration: 400 }, (finished) => {
        if (finished) runOnJS(onFinished)();
      }),
    );
  }, []);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const taglineStyle = useAnimatedStyle(() => ({
    opacity: taglineOpacity.value,
    transform: [{ translateY: taglineY.value }],
  }));

  const screenStyle = useAnimatedStyle(() => ({
    opacity: screenOpacity.value,
  }));

  return (
    <Animated.View style={[styles.container, screenStyle]}>
      <View style={styles.content}>
        <Animated.Image
          source={logo}
          style={[styles.logo, logoStyle]}
          resizeMode="contain"
        />

        <Animated.Text style={[styles.tagline, taglineStyle]}>
          Pagos sin efectivo · Eventos sin límites
        </Animated.Text>
      </View>

      <Animated.Text style={[styles.poweredBy, taglineStyle]}>
        Cashless Event Payments
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },
  content: {
    alignItems: "center",
    gap: 28,
    paddingHorizontal: 40,
  },
  logo: {
    width: 280,
    height: 127,
    shadowColor: "#1A56DB",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
  },
  tagline: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#6B7280",
    letterSpacing: 0.2,
    textAlign: "center",
  },
  poweredBy: {
    position: "absolute",
    bottom: 48,
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "#D1D5DB",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
});
