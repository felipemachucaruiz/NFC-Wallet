import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import Colors from "@/constants/colors";

export default function LoginScreen() {
  const { t } = useTranslation();
  const { login, isAuthenticated, isLoading } = useAuth();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const isWeb = Platform.OS === "web";

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace("/");
    }
  }, [isAuthenticated]);

  const handleLogin = async () => {
    if (!identifier.trim() || !password) {
      setError(t("auth.fillFields"));
      return;
    }
    setError(null);
    setSubmitting(true);
    const err = await login(identifier.trim(), password);
    setSubmitting(false);
    if (err) {
      setError(t("auth.invalidCredentials"));
    }
  };

  const busy = isLoading || submitting;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: C.background, paddingTop: isWeb ? 67 : insets.top },
      ]}
    >
      <LinearGradient
        colors={
          scheme === "dark"
            ? ["#0A0F1E", "#0D1B3E", "#0A0F1E"]
            : ["#EFF6FF", "#DBEAFE", "#F0F4F8"]
        }
        style={StyleSheet.absoluteFill}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.inner,
            { paddingBottom: isWeb ? 34 : insets.bottom + 20 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.logoSection}>
            <View style={[styles.iconBg, { backgroundColor: C.primary }]}>
              <Feather name="credit-card" size={40} color="#fff" />
            </View>
            <Text style={[styles.appName, { color: C.text }]}>
              {t("auth.title")}
            </Text>
            <Text style={[styles.subtitle, { color: C.textSecondary }]}>
              {t("auth.subtitle")}
            </Text>
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
                <Text style={[styles.featureText, { color: C.textSecondary }]}>
                  {f.text}
                </Text>
              </View>
            ))}
          </View>

          <Text style={[styles.disclaimer, { color: C.textMuted }]}>
            {t("auth.disclaimer")}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingVertical: 40,
    gap: 32,
    justifyContent: "center",
  },
  logoSection: { alignItems: "center", gap: 12 },
  iconBg: {
    width: 88,
    height: 88,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    shadowColor: "#1A56DB",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  appName: {
    fontSize: 32,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  form: { gap: 16 },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
  },
  errorText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  features: { gap: 12 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  disclaimer: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});
