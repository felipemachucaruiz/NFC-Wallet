import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useEffect, useState } from "react";
import {
  Image,
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
import Colors from "@/constants/colors";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";

const loginBgVideo = require("@/assets/login-bg.mp4");

type AuthTab = "login" | "register";

export default function LoginScreen() {
  const { t } = useTranslation();
  const { login, register, isAuthenticated, isLoading } = useAuth();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const isWeb = Platform.OS === "web";

  const [tab, setTab] = useState<AuthTab>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const player = useVideoPlayer(!isWeb ? loginBgVideo : null, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/(tabs)/home");
    }
  }, [isAuthenticated, isLoading]);

  const handleSubmit = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError(t("auth.fillFields"));
      return;
    }
    if (password.length < 6) {
      setError(t("auth.passwordMinLength"));
      return;
    }
    if (tab === "register" && (!firstName.trim() || !lastName.trim())) {
      setError(t("auth.fillFields"));
      return;
    }

    setSubmitting(true);
    let err: string | null = null;
    if (tab === "login") {
      err = await login(email.trim(), password);
    } else {
      err = await register(email.trim(), password, firstName.trim(), lastName.trim());
    }
    setSubmitting(false);
    if (err) setError(err);
  };

  const inputStyle = [
    styles.input,
    { backgroundColor: C.inputBg, borderColor: C.border, color: C.text },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {!isWeb ? (
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          nativeControls={false}
          allowsPictureInPicture={false}
        />
      ) : (
        <LinearGradient
          colors={["#0a0a0a", "#111111", "#0a0a0a"]}
          style={StyleSheet.absoluteFill}
        />
      )}

      <View style={styles.overlay} />

      <KeyboardAvoidingView
        style={styles.inner}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.logoSection}>
          <Image
            source={require("@/assets/images/tapee-logo.png")}
            style={styles.wordmark}
            resizeMode="contain"
          />
          <Text style={styles.appSubtitle}>{t("auth.subtitle")}</Text>
        </View>

        <View style={[styles.card, { backgroundColor: "rgba(17,17,17,0.88)", borderColor: "rgba(255,255,255,0.1)" }]}>
          <View style={[styles.tabRow, { borderColor: "rgba(255,255,255,0.1)" }]}>
            {(["login", "register"] as AuthTab[]).map((t_) => (
              <Pressable
                key={t_}
                onPress={() => { setTab(t_); setError(null); }}
                style={[styles.tabBtn, tab === t_ && { backgroundColor: C.primaryLight }]}
              >
                <Text style={[styles.tabText, { color: tab === t_ ? C.primary : "rgba(255,255,255,0.5)" }]}>
                  {t_ === "login" ? t("auth.loginTab") : t("auth.registerTab")}
                </Text>
              </Pressable>
            ))}
          </View>

          {tab === "register" && (
            <>
              <TextInput
                style={inputStyle}
                placeholder={t("auth.firstNamePlaceholder")}
                placeholderTextColor={C.textMuted}
                value={firstName}
                onChangeText={setFirstName}
                autoCapitalize="words"
              />
              <TextInput
                style={inputStyle}
                placeholder={t("auth.lastNamePlaceholder")}
                placeholderTextColor={C.textMuted}
                value={lastName}
                onChangeText={setLastName}
                autoCapitalize="words"
              />
            </>
          )}

          <TextInput
            style={inputStyle}
            placeholder={t("auth.emailPlaceholder")}
            placeholderTextColor={C.textMuted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />

          <View style={styles.passwordRow}>
            <TextInput
              style={[inputStyle, { flex: 1 }]}
              placeholder={t("auth.passwordPlaceholder")}
              placeholderTextColor={C.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoComplete={tab === "login" ? "current-password" : "new-password"}
            />
            <Pressable
              onPress={() => setShowPassword((v) => !v)}
              style={[styles.eyeBtn, { backgroundColor: C.inputBg, borderColor: C.border }]}
            >
              <Feather name={showPassword ? "eye-off" : "eye"} size={18} color={C.textSecondary} />
            </Pressable>
          </View>

          {error && (
            <View style={[styles.errorBox, { backgroundColor: C.dangerLight }]}>
              <Feather name="alert-circle" size={13} color={C.danger} />
              <Text style={[styles.errorText, { color: C.danger }]}>{error}</Text>
            </View>
          )}

          <Button
            title={
              submitting
                ? (tab === "login" ? t("auth.signingIn") : t("auth.signingUp"))
                : (tab === "login" ? t("auth.signIn") : t("auth.signUp"))
            }
            onPress={handleSubmit}
            loading={submitting}
            disabled={submitting}
            variant="primary"
            size="lg"
            fullWidth
          />
        </View>

        <View style={styles.features}>
          {[
            { icon: "shield" as const, text: "Pagos NFC seguros" },
            { icon: "clock" as const, text: "Historial en tiempo real" },
            { icon: "refresh-cw" as const, text: "Devoluciones rápidas" },
          ].map((f) => (
            <View key={f.icon} style={styles.featureRow}>
              <View style={[styles.featureIcon, { backgroundColor: "rgba(0,241,255,0.08)" }]}>
                <Feather name={f.icon} size={12} color="#00f1ff" />
              </View>
              <Text style={styles.featureText}>{f.text}</Text>
            </View>
          ))}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a" },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.82)",
  },
  inner: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 16,
    justifyContent: "center",
    gap: 16,
  },
  logoSection: {
    alignItems: "center",
    gap: 4,
  },
  wordmark: {
    width: "48%",
    maxWidth: 190,
    aspectRatio: 864 / 326,
  },
  appSubtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    color: "rgba(255,255,255,0.55)",
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  tabRow: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 11,
    overflow: "hidden",
    marginBottom: 2,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 10,
  },
  tabText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  input: {
    borderWidth: 1,
    borderRadius: 11,
    padding: 11,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  passwordRow: {
    flexDirection: "row",
    gap: 8,
  },
  eyeBtn: {
    borderWidth: 1,
    borderRadius: 11,
    width: 46,
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
  features: {
    gap: 7,
    alignItems: "center",
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  featureIcon: {
    width: 24,
    height: 24,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.45)",
  },
});
