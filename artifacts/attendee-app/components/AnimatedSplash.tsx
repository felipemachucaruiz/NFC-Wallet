import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  Easing,
} from "react-native-reanimated";

interface Props {
  onFinished: () => void;
}

const logo = require("../assets/images/tapee-logo.png");

const LOGO_W = 260;
const LOGO_H = LOGO_W / (1199 / 435);

const GLOW_LAYERS = [
  { scaleMax: 1.10, opacityMax: 0.35, delay: 0 },
  { scaleMax: 1.20, opacityMax: 0.22, delay: 120 },
  { scaleMax: 1.32, opacityMax: 0.14, delay: 240 },
  { scaleMax: 1.46, opacityMax: 0.07, delay: 360 },
];

const PULSE_DURATION = 1400;
const GLOW_START_DELAY = 400;

function GlowLayer({
  scaleMax,
  opacityMax,
  delay,
}: {
  scaleMax: number;
  opacityMax: number;
  delay: number;
}) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.value = withDelay(
      GLOW_START_DELAY + delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 0 }),
          withTiming(scaleMax, { duration: PULSE_DURATION, easing: Easing.out(Easing.cubic) }),
        ),
        -1,
        false,
      ),
    );

    opacity.value = withDelay(
      GLOW_START_DELAY + delay,
      withRepeat(
        withSequence(
          withTiming(opacityMax, { duration: 80, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: PULSE_DURATION - 80, easing: Easing.in(Easing.cubic) }),
        ),
        -1,
        false,
      ),
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.Image
      source={logo}
      style={[styles.glowLayer, style]}
      resizeMode="contain"
    />
  );
}

export function AnimatedSplash({ onFinished }: Props) {
  const logoScale = useSharedValue(0.6);
  const logoOpacity = useSharedValue(0);

  const taglineOpacity = useSharedValue(0);
  const taglineY = useSharedValue(12);

  const screenOpacity = useSharedValue(1);

  useEffect(() => {
    logoOpacity.value = withTiming(1, { duration: 380 });
    logoScale.value = withSpring(1, { damping: 13, stiffness: 140 });

    taglineOpacity.value = withDelay(520, withTiming(1, { duration: 400 }));
    taglineY.value = withDelay(520, withSpring(0, { damping: 18, stiffness: 120 }));

    screenOpacity.value = withDelay(
      2900,
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
        <View style={styles.logoWrapper}>
          {GLOW_LAYERS.map((layer, i) => (
            <GlowLayer key={i} {...layer} />
          ))}
          <Animated.Image
            source={logo}
            style={[styles.logo, logoStyle]}
            resizeMode="contain"
          />
        </View>

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
    backgroundColor: "#0a0a0a",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },
  content: {
    alignItems: "center",
    gap: 28,
    paddingHorizontal: 40,
  },
  logoWrapper: {
    alignItems: "center",
    justifyContent: "center",
    width: LOGO_W * 1.5,
    height: LOGO_H * 1.5,
  },
  glowLayer: {
    position: "absolute",
    width: LOGO_W,
    height: LOGO_H,
    tintColor: "#00f1ff",
  },
  logo: {
    position: "absolute",
    width: LOGO_W,
    height: LOGO_H,
  },
  tagline: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#a1a1aa",
    letterSpacing: 0.2,
    textAlign: "center",
  },
  poweredBy: {
    position: "absolute",
    bottom: 48,
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "#52525b",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
});
