import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

export type AlertButtonVariant = "primary" | "danger" | "cancel";

export interface AlertButton {
  text: string;
  variant?: AlertButtonVariant;
  style?: "cancel" | "destructive" | "default";
  onPress?: () => void;
}

interface AlertConfig {
  title: string;
  message?: string;
  buttons?: AlertButton[];
  onDismiss?: () => void;
}

interface AlertContextValue {
  show: (config: AlertConfig) => void;
}

const AlertContext = createContext<AlertContextValue | null>(null);

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AlertConfig | null>(null);
  const [visible, setVisible] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.88)).current;

  const show = useCallback((cfg: AlertConfig) => {
    setConfig(cfg);
    setVisible(true);
    fadeAnim.setValue(0);
    scaleAnim.setValue(0.88);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 120, friction: 8 }),
    ]).start();
  }, [fadeAnim, scaleAnim]);

  const dismiss = useCallback((onPress?: () => void) => {
    const onDismiss = config?.onDismiss;
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 140, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 0.92, duration: 140, useNativeDriver: true }),
    ]).start(() => {
      setVisible(false);
      setConfig(null);
      onDismiss?.();
      onPress?.();
    });
  }, [fadeAnim, scaleAnim, config]);

  const buttons: AlertButton[] = config?.buttons?.length
    ? config.buttons
    : [{ text: "OK", variant: "primary" }];

  const contextValue = useMemo(() => ({ show }), [show]);

  return (
    <AlertContext.Provider value={contextValue}>
      {children}
      <Modal
        visible={visible}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => dismiss()}
      >
        <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => dismiss()} />
          <Animated.View
            style={[
              styles.card,
              { transform: [{ scale: scaleAnim }] },
            ]}
          >
            {config?.title ? (
              <Text style={styles.title}>{config.title}</Text>
            ) : null}
            {config?.message ? (
              <Text style={styles.message}>{config.message}</Text>
            ) : null}

            <View style={[styles.buttonRow, buttons.length === 1 && styles.singleButton]}>
              {buttons.map((btn, i) => {
                const styleToVariant = (s?: string): AlertButtonVariant => {
                  if (s === "cancel") return "cancel";
                  if (s === "destructive") return "danger";
                  return "primary";
                };
                const variant = btn.variant ?? (btn.style ? styleToVariant(btn.style) : "primary");
                return (
                  <Pressable
                    key={i}
                    style={({ pressed }) => [
                      styles.btn,
                      variant === "primary" && styles.btnPrimary,
                      variant === "danger" && styles.btnDanger,
                      variant === "cancel" && styles.btnCancel,
                      buttons.length === 1 && styles.btnFull,
                      pressed && styles.btnPressed,
                    ]}
                    onPress={() => dismiss(btn.onPress)}
                  >
                    <Text
                      style={[
                        styles.btnText,
                        variant === "primary" && styles.btnTextPrimary,
                        variant === "danger" && styles.btnTextDanger,
                        variant === "cancel" && styles.btnTextCancel,
                      ]}
                    >
                      {btn.text}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>
    </AlertContext.Provider>
  );
}

export function useAlert() {
  const ctx = useContext(AlertContext);
  if (!ctx) throw new Error("useAlert must be used within AlertProvider");

  const show = useCallback(
    (
      title: string,
      message?: string,
      buttons?: AlertButton[],
      onDismiss?: () => void,
    ) => {
      ctx.show({ title, message, buttons, onDismiss });
    },
    [ctx.show],
  );

  return { show };
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  card: {
    backgroundColor: "#111111",
    borderRadius: 18,
    padding: 24,
    width: "100%",
    maxWidth: 360,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 20,
    elevation: 16,
  },
  title: {
    color: "#ffffff",
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    marginBottom: 8,
    textAlign: "center",
  },
  message: {
    color: "#a1a1aa",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    marginBottom: 20,
    textAlign: "center",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
  },
  singleButton: {
    justifyContent: "center",
  },
  btn: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 80,
  },
  btnFull: {
    flex: 1,
  },
  btnPrimary: {
    backgroundColor: "#00f1ff",
  },
  btnDanger: {
    backgroundColor: "#ef4444",
  },
  btnCancel: {
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  btnPressed: {
    opacity: 0.8,
  },
  btnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  btnTextPrimary: {
    color: "#0a0a0a",
  },
  btnTextDanger: {
    color: "#ffffff",
  },
  btnTextCancel: {
    color: "#a1a1aa",
  },
});
