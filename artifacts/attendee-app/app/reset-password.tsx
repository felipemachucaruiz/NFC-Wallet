import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useColorScheme } from "@/hooks/useColorScheme";
import Colors from "@/constants/colors";
import { Button } from "@/components/ui/Button";
import { API_BASE_URL } from "@/constants/domain";

export default function ResetPasswordScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const { token } = useLocalSearchParams<{ token: string }>();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    if (!token) {
      setError(t("resetPassword.invalidToken"));
      return;
    }
    if (password.length < 6) {
      setError(t("resetPassword.minLength"));
      return;
    }
    if (password !== confirm) {
      setError(t("resetPassword.passwordsNoMatch"));
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((body as { error?: string }).error ?? t("resetPassword.resetFailed"));
      } else {
        setDone(true);
      }
    } catch {
      setError(t("resetPassword.networkError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <LinearGradient colors={["#050505", "#0d1117", "#111827"]} style={StyleSheet.absoluteFill} />

      <KeyboardAvoidingView
        style={styles.inner}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.iconWrap}>
          <Feather name="shield" size={32} color="#00f1ff" />
        </View>

        <Text style={styles.title}>{t("resetPassword.title")}</Text>
        <Text style={styles.subtitle}>{t("resetPassword.subtitle")}</Text>

        {done ? (
          <View style={[styles.successBox, { backgroundColor: "rgba(34,197,94,0.12)", borderColor: "#22c55e" }]}>
            <Feather name="check-circle" size={18} color="#22c55e" />
            <View style={{ flex: 1, gap: 8 }}>
              <Text style={styles.successTitle}>{t("resetPassword.successTitle")}</Text>
              <Text style={styles.successText}>{t("resetPassword.successMsg")}</Text>
              <Pressable onPress={() => router.replace("/login")} style={styles.goLoginBtn}>
                <Text style={styles.goLoginText}>{t("resetPassword.goToLogin")}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.form}>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, { flex: 1, backgroundColor: C.inputBg, borderColor: C.border, color: C.text }]}
                placeholder={t("resetPassword.newPasswordPlaceholder")}
                placeholderTextColor={C.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoComplete="new-password"
              />
              <Pressable
                onPress={() => setShowPassword((v) => !v)}
                style={[styles.eyeBtn, { backgroundColor: C.inputBg, borderColor: C.border }]}
              >
                <Feather name={showPassword ? "eye-off" : "eye"} size={18} color={C.textSecondary} />
              </Pressable>
            </View>

            <TextInput
              style={[styles.input, { backgroundColor: C.inputBg, borderColor: C.border, color: C.text }]}
              placeholder={t("resetPassword.confirmPasswordPlaceholder")}
              placeholderTextColor={C.textMuted}
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry={!showPassword}
              autoComplete="new-password"
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />

            {error && (
              <View style={[styles.errorBox, { backgroundColor: C.dangerLight }]}>
                <Feather name="alert-circle" size={13} color={C.danger} />
                <Text style={[styles.errorText, { color: C.danger }]}>{error}</Text>
              </View>
            )}

            <Button
              title={submitting ? t("resetPassword.saving") : t("resetPassword.saveBtn")}
              onPress={handleSubmit}
              loading={submitting}
              disabled={submitting}
              variant="primary"
              size="lg"
              fullWidth
            />
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050505" },
  inner: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 32,
    gap: 16,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: "rgba(0,241,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: "#e6edf3",
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.5)",
    lineHeight: 22,
  },
  form: { gap: 12 },
  passwordRow: { flexDirection: "row", gap: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 11,
    padding: 13,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  eyeBtn: {
    borderWidth: 1,
    borderRadius: 11,
    width: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 9,
  },
  errorText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  successBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  successTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#22c55e",
  },
  successText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#22c55e",
    lineHeight: 20,
  },
  goLoginBtn: {
    marginTop: 4,
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: "rgba(34,197,94,0.15)",
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  goLoginText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#22c55e",
  },
});
