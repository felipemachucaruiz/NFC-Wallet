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
  // useRef avoids stale-closure issues inside PasscodeScreen's setTimeout
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
    // Offer passcode setup if remember-me is on and no passcode set yet
    if (rememberMe && !hasPasscode && Platform.OS !== "web") {
      const shouldShow = await onLoginAttempted();
      if (shouldShow) {
        setSetupStep("prompt");
        return;
      }
    }
    // Otherwise the useEffect above will navigate to "/"
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
    <View style={[styles.container, { backgroundColor: C.background, paddingTop: isWeb ? 67 : insets.top }]}>
      <LinearGradient
        colors={scheme === "dark" ? ["#0A0F1E", "#0D1B3E", "#0A0F1E"] : ["#EFF6FF", "#DBEAFE", "#F0F4F8"]}
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
            <Text style={[styles.subtitle, { color: C.textSecondary }]}>{t("auth.subtitle")}</Text>
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
                <Text style={[styles.rememberLabel, { color: C.text }]}>{t("auth.rememberMe")}</Text>
                <Text style={[styles.rememberHint, { color: C.textMuted }]}>{t("auth.rememberMeHint")}</Text>
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
            <View style={[styles.promptBox, { backgroundColor: C.card, borderColor: C.border }]}>
              <View style={[styles.promptIcon, { backgroundColor: C.primaryLight }]}>
                <Feather name="shield" size={22} color={C.primary} />
              </View>
              <Text style={[styles.promptTitle, { color: C.text }]}>{t("passcode.promptTitle")}</Text>
              <Text style={[styles.promptHint, { color: C.textSecondary }]}>{t("passcode.promptHint")}</Text>
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

          <View style={styles.features}>
            {[
              { icon: "zap" as const, text: t("auth.featureNfc") },
              { icon: "shield" as const, text: t("auth.featureHmac") },
              { icon: "wifi-off" as const, text: t("auth.featureOffline") },
            ].map((f) => (
              <View key={f.icon} style={styles.featureRow}>
                <View style={[styles.featureIcon, { backgroundColor: C.primaryLight }]}>
                  <Feather name={f.icon} size={18} color={C.primary} />
                </View>
                <Text style={[styles.featureText, { color: C.textSecondary }]}>{f.text}</Text>
              </View>
            ))}
          </View>

          <Text style={[styles.disclaimer, { color: C.textMuted }]}>{t("auth.disclaimer")}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flexGrow: 1, paddingHorizontal: 28, paddingVertical: 40, gap: 28, justifyContent: "center" },
  logoSection: { alignItems: "center", gap: 12 },
  logoImage: { width: "72%", maxWidth: 280, aspectRatio: 1199 / 435 },
  subtitle: { fontSize: 16, fontFamily: "Inter_400Regular", textAlign: "center" },
  form: { gap: 14 },
  rememberRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 4 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#9CA3AF",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  rememberLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  rememberHint: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 10 },
  errorText: { fontSize: 14, fontFamily: "Inter_400Regular", flex: 1 },
  promptBox: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    gap: 10,
    alignItems: "center",
  },
  promptIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  promptTitle: { fontSize: 16, fontFamily: "Inter_700Bold", textAlign: "center" },
  promptHint: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  promptActions: { flexDirection: "row", gap: 12, marginTop: 4 },
  features: { gap: 12 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  featureIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  featureText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  disclaimer: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" },
});
