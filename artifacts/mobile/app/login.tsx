import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/Button";
import Colors from "@/constants/colors";

export default function LoginScreen() {
  const { t } = useTranslation();
  const { login, isAuthenticated, isLoading } = useAuth();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const isWeb = Platform.OS === "web";

  useEffect(() => {
    if (isAuthenticated) {
      router.replace("/");
    }
  }, [isAuthenticated]);

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
      <View style={styles.inner}>
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

        <View style={styles.features}>
          {[
            { icon: "zap" as const, text: "Pagos NFC instantáneos" },
            { icon: "shield" as const, text: "HMAC-SHA256 seguro" },
            { icon: "wifi-off" as const, text: "Funciona sin conexión" },
          ].map((f) => (
            <View key={f.icon} style={styles.featureRow}>
              <View
                style={[styles.featureIcon, { backgroundColor: C.primaryLight }]}
              >
                <Feather name={f.icon} size={18} color={C.primary} />
              </View>
              <Text style={[styles.featureText, { color: C.textSecondary }]}>
                {f.text}
              </Text>
            </View>
          ))}
        </View>

        <View style={[styles.bottom, { paddingBottom: isWeb ? 34 : insets.bottom + 20 }]}>
          <Button
            title={isLoading ? t("auth.loggingIn") : t("auth.loginButton")}
            onPress={login}
            variant="primary"
            size="lg"
            loading={isLoading}
            fullWidth
            testID="login-button"
          />
          <Text style={[styles.disclaimer, { color: C.textMuted }]}>
            Solo para personal autorizado del evento
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: "space-between",
    paddingVertical: 40,
  },
  logoSection: { alignItems: "center", gap: 16 },
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
  features: { gap: 16 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  bottom: { gap: 14 },
  disclaimer: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});
