import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { usePasscode } from "@/contexts/PasscodeContext";
import { PasscodeScreen } from "@/components/PasscodeScreen";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import Colors from "@/constants/colors";

type SetupStep = "prompt" | "enter" | "confirm";

export default function LoginScreen() {
  const { t } = useTranslation();
  const { login, isAuthenticated, isLoading } = useAuth();
  const { hasPasscode, setPasscode, skipPinPrompt, onLoginAttempted } = usePasscode();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const isWeb = Platform.OS === "web";

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [setupStep, setSetupStep] = useState<SetupStep | null>(null);
  const firstCodeRef = useRef("");

  useEffect(() => {
    if (isAuthenticated && !setupStep) {
      router.replace("/");
    }
  }, [isAuthenticated, setupStep]);

  const handleLogin = async () => {
    if (!identifier.trim() || !password) {
      setError(t("auth.fillFields"));
      return;
    }
    setError(null);
    setSubmitting(true);
    const err = await login(identifier.trim(), password, rememberMe);
    setSubmitting(false);
    if (err) {
      if (err === "Network error") {
        setError(t("auth.networkError") ?? "No se puede conectar al servidor. Verifica tu conexión.");
      } else if (err === "Could not load user profile") {
        setError(t("auth.profileError") ?? "Error cargando perfil. Intenta de nuevo.");
      } else {
        setError(t("auth.invalidCredentials"));
      }
      return;
    }
    if (rememberMe && !hasPasscode && Platform.OS !== "web") {
      const shouldShow = await onLoginAttempted();
      if (shouldShow) {
        setSetupStep("prompt");
        return;
      }
    }
  };

  const busy = isLoading || submitting;

  // ── Passcode setup screens ─────────────────────────────────────────────────
  if (setupStep === "enter") {
    return (
      <PasscodeScreen
        key="pin-enter"
        mode="setup"
        title={t("passcode.createPin")}
        subtitle={t("passcode.createPinHint")}
        onSuccess={(code) => {
          firstCodeRef.current = code;
          setSetupStep("confirm");
        }}
        onCancel={() => { setSetupStep(null); router.replace("/"); }}
      />
    );
  }

  if (setupStep === "confirm") {
    return (
      <PasscodeScreen
        key="pin-confirm"
        mode="confirm"
        title={t("passcode.confirmPin")}
        onSuccess={async (code) => {
          if (code === firstCodeRef.current) {
            try {
              await setPasscode(code);
            } catch {
              // Storage failure — skip PIN, go home
            }
            router.replace("/");
          } else {
            firstCodeRef.current = "";
            setSetupStep("enter");
          }
        }}
        onCancel={() => { setSetupStep(null); router.replace("/"); }}
      />
    );
  }

  // ── Main login form ────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { paddingTop: isWeb ? 67 : insets.top }]}>
      {/* Background gradient */}
      <LinearGradient
        colors={["#0a0a0a", "#111111", "#0a0a0a"]}
        style={StyleSheet.absoluteFill}
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={[styles.inner, { paddingBottom: isWeb ? 34 : insets.bottom + 20 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.logoSection}>
            <Image source={require("@/assets/images/tapee-logo.png")} style={styles.logoImage} resizeMode="contain" />
            <Text style={[styles.subtitle, { color: "rgba(255,255,255,0.65)" }]}>{t("auth.subtitle")}</Text>
          </View>

          <View style={styles.form}>
            <Input
              label={t("auth.identifier")}
              value={identifier}
              onChangeText={(v) => { setIdentifier(v.toLowerCase()); setError(null); }}
              placeholder={t("auth.identifierPlaceholder")}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              editable={!busy}
              testID="identifier-input"
            />
            <Input
              label={t("auth.password")}
              value={password}
              onChangeText={(v) => { setPassword(v); setError(null); }}
              placeholder={t("auth.passwordPlaceholder")}
              secureTextEntry
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              editable={!busy}
              testID="password-input"
            />

            {/* Remember Me toggle */}
            <Pressable
              onPress={() => setRememberMe((v) => !v)}
              style={styles.rememberRow}
              testID="remember-me-toggle"
            >
              <View style={[styles.checkbox, rememberMe && { backgroundColor: C.primary, borderColor: C.primary }]}>
                {rememberMe && <Feather name="check" size={13} color="#fff" />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rememberLabel, { color: "#ffffff" }]}>{t("auth.rememberMe")}</Text>
                <Text style={[styles.rememberHint, { color: "rgba(255,255,255,0.5)" }]}>{t("auth.rememberMeHint")}</Text>
              </View>
            </Pressable>

            {error ? (
              <View style={[styles.errorBox, { backgroundColor: C.dangerLight }]}>
                <Feather name="alert-circle" size={16} color={C.danger} />
                <Text style={[styles.errorText, { color: C.danger }]}>{error}</Text>
              </View>
            ) : null}

            <Button
              title={busy ? t("auth.signingIn") : t("auth.signIn")}
              onPress={handleLogin}
              variant="primary"
              size="lg"
              loading={busy}
              fullWidth
              testID="login-button"
            />
          </View>

          {/* Passcode setup prompt */}
          {setupStep === "prompt" && (
            <View style={[styles.promptBox, { backgroundColor: "rgba(17,17,17,0.9)", borderColor: "rgba(255,255,255,0.1)" }]}>
              <View style={[styles.promptIcon, { backgroundColor: C.primaryLight }]}>
                <Feather name="shield" size={22} color={C.primary} />
              </View>
              <Text style={[styles.promptTitle, { color: "#ffffff" }]}>{t("passcode.promptTitle")}</Text>
              <Text style={[styles.promptHint, { color: "rgba(255,255,255,0.6)" }]}>{t("passcode.promptHint")}</Text>
              <View style={styles.promptActions}>
                <Button
                  title={t("passcode.skip")}
                  onPress={async () => {
                    await skipPinPrompt();
                    setSetupStep(null);
                    router.replace("/");
                  }}
                  variant="ghost"
                  size="md"
                />
                <Button
                  title={t("passcode.setupBtn")}
                  onPress={() => setSetupStep("enter")}
                  variant="primary"
                  size="md"
                />
              </View>
            </View>
          )}

          <Text style={[styles.disclaimer, { color: "rgba(255,255,255,0.35)" }]}>{t("auth.disclaimer")}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a" },
  inner: { flexGrow: 1, paddingHorizontal: 28, paddingVertical: 20, gap: 20, justifyContent: "center" },
  logoSection: { alignItems: "center", gap: 8 },
  logoImage: { width: "78%", maxWidth: 300, aspectRatio: 1199 / 435 },
  subtitle: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center" },
  form: { gap: 12 },
  rememberRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 2 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: "#9CA3AF",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  rememberLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  rememberHint: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 10 },
  errorText: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  promptBox: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 8,
    alignItems: "center",
  },
  promptIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  promptTitle: { fontSize: 15, fontFamily: "Inter_700Bold", textAlign: "center" },
  promptHint: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" },
  promptActions: { flexDirection: "row", gap: 10, marginTop: 2 },
  disclaimer: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center" },
});
