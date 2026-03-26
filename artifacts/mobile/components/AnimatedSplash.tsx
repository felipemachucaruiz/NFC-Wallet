import React, { useEffect } from "react";
import { StyleSheet, Text, View, useColorScheme } from "react-native";
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

const BRAND_BLUE = "#1A56DB";
const BRAND_LIGHT = "#EBF1FF";

export function AnimatedSplash({ onFinished }: Props) {
  const scheme = useColorScheme();

  // Logo circle scale + opacity
  const logoScale = useSharedValue(0.3);
  const logoOpacity = useSharedValue(0);

  // Inner icon scale (slight pop after circle appears)
  const iconScale = useSharedValue(0.5);

  // Text elements
  const titleOpacity = useSharedValue(0);
  const titleTranslateY = useSharedValue(16);
  const taglineOpacity = useSharedValue(0);

  // Entire screen fade out at end
  const screenOpacity = useSharedValue(1);

  useEffect(() => {
    // 1. Logo circle springs in
    logoScale.value = withSpring(1, { damping: 14, stiffness: 160 });
    logoOpacity.value = withTiming(1, { duration: 300 });

    // 2. Inner icon pops slightly after
    iconScale.value = withDelay(180, withSpring(1, { damping: 12, stiffness: 200 }));

    // 3. Title slides up and fades in
    titleOpacity.value = withDelay(380, withTiming(1, { duration: 350 }));
    titleTranslateY.value = withDelay(380, withSpring(0, { damping: 16, stiffness: 120 }));

    // 4. Tagline fades in
    taglineOpacity.value = withDelay(620, withTiming(1, { duration: 350 }));

    // 5. Hold for a beat, then fade the whole screen out and call onFinished
    screenOpacity.value = withDelay(
      2000,
      withTiming(0, { duration: 400 }, (finished) => {
        if (finished) runOnJS(onFinished)();
      }),
    );
  }, []);

  const logoCircleStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleTranslateY.value }],
  }));

  const taglineStyle = useAnimatedStyle(() => ({
    opacity: taglineOpacity.value,
  }));

  const screenStyle = useAnimatedStyle(() => ({
    opacity: screenOpacity.value,
  }));

  return (
    <Animated.View style={[styles.container, screenStyle]}>
      <View style={styles.content}>
        <Animated.View style={[styles.logoCircle, logoCircleStyle]}>
          <Animated.Text style={[styles.logoEmoji, iconStyle]}>💳</Animated.Text>
        </Animated.View>

        <Animated.Text style={[styles.appName, titleStyle]}>Tapee</Animated.Text>

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
    backgroundColor: BRAND_BLUE,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },
  content: {
    alignItems: "center",
    gap: 20,
  },
  logoCircle: {
    width: 110,
    height: 110,
    borderRadius: 32,
    backgroundColor: BRAND_LIGHT,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
  },
  logoEmoji: {
    fontSize: 52,
  },
  appName: {
    fontSize: 48,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.72)",
    letterSpacing: 0.2,
    textAlign: "center",
  },
  poweredBy: {
    position: "absolute",
    bottom: 48,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.4)",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
});
