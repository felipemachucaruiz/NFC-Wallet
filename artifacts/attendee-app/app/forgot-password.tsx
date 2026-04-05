import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
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
import { useColorScheme } from "@/hooks/useColorScheme";
import Colors from "@/constants/colors";
import { Button } from "@/components/ui/Button";
import { API_BASE_URL } from "@/constants/domain";

export default function ForgotPasswordScreen() {
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Por favor ingresa tu correo electrónico.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as { error?: string }).error ?? "Error al enviar. Intenta nuevamente.");
      } else {
        setSent(true);
      }
    } catch {
      setError("Error de red. Intenta nuevamente.");
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
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color="rgba(255,255,255,0.7)" />
        </Pressable>

        <View style={styles.iconWrap}>
          <Feather name="lock" size={32} color="#00f1ff" />
        </View>

        <Text style={styles.title}>Recuperar contraseña</Text>
        <Text style={styles.subtitle}>
          Ingresa tu correo electrónico y te enviaremos un enlace para restablecer tu contraseña.
        </Text>

        {sent ? (
          <View style={[styles.successBox, { backgroundColor: "rgba(34,197,94,0.12)", borderColor: "#22c55e" }]}>
            <Feather name="check-circle" size={18} color="#22c55e" />
            <Text style={styles.successText}>
              Si existe una cuenta con ese correo, recibirás un enlace en los próximos minutos. Revisa también tu carpeta de spam.
            </Text>
          </View>
        ) : (
          <View style={styles.form}>
            <TextInput
              style={[styles.input, { backgroundColor: C.inputBg, borderColor: C.border, color: C.text }]}
              placeholder="Correo electrónico"
              placeholderTextColor={C.textMuted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              returnKeyType="send"
              onSubmitEditing={handleSubmit}
            />

            {error && (
              <View style={[styles.errorBox, { backgroundColor: C.dangerLight }]}>
                <Feather name="alert-circle" size={13} color={C.danger} />
                <Text style={[styles.errorText, { color: C.danger }]}>{error}</Text>
              </View>
            )}

            <Button
              title={submitting ? "Enviando..." : "Enviar enlace"}
              onPress={handleSubmit}
              loading={submitting}
              disabled={submitting}
              variant="primary"
              size="lg"
              fullWidth
            />
          </View>
        )}

        <Pressable onPress={() => router.back()} style={styles.backLink}>
          <Text style={styles.backLinkText}>Volver al inicio de sesión</Text>
        </Pressable>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050505" },
  inner: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 16,
    gap: 16,
  },
  backBtn: {
    alignSelf: "flex-start",
    padding: 8,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.07)",
    marginBottom: 8,
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
  input: {
    borderWidth: 1,
    borderRadius: 11,
    padding: 13,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
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
  successText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#22c55e",
    flex: 1,
    lineHeight: 22,
  },
  backLink: {
    alignItems: "center",
    paddingVertical: 8,
  },
  backLinkText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#00f1ff",
  },
});
