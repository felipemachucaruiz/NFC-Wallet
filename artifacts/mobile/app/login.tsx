import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { setBaseUrl } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePasscode } from "@/contexts/PasscodeContext";
import { PasscodeScreen } from "@/components/PasscodeScreen";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import Colors from "@/constants/colors";
import { API_BASE_URL } from "@/constants/domain";

export const LOCAL_SERVER_URL_KEY = "@tapee_local_server_url";

const loginBgVideo = require("@/assets/login-bg.mp4");

// expo-video has native components that must be linked in the APK/IPA binary.
// A module-level try/catch prevents OTA updates from crashing on devices whose
// binary does not have expo-video linked (e.g. builds before expo-video was
// added to app.json plugins). The hook is always called at the top level of
// LoginVideoBackground (never conditionally), so React's Rules of Hooks hold.
let _expoVideo: typeof import("expo-video") | null = null;
try {
  _expoVideo = require("expo-video");
} catch {}

function LoginVideoBackground({ source }: { source: import("expo-video").VideoSource }) {
  const { useVideoPlayer: useVP, VideoView: VV } = _expoVideo!;
  const player = useVP(source, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return (
    <VV
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      nativeControls={false}
      allowsFullscreen={false}
      allowsPictureInPicture={false}
    />
  );
}

type SetupStep = "prompt" | "enter" | "confirm";

export default function LoginScreen() {
  const { t } = useTranslation();
  const { login, verify2fa, demoLogin, isAuthenticated, isLoading } = useAuth();
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

  // Server config state
  const [savedServerUrl, setSavedServerUrl] = useState<string | null>(null);
  const [serverConfigModal, setServerConfigModal] = useState(false);
  const [serverUrlInput, setServerUrlInput] = useState("");

  useEffect(() => {
    AsyncStorage.getItem(LOCAL_SERVER_URL_KEY).then((saved) => {
      setSavedServerUrl(saved);
    }).catch(() => {});
  }, []);

  const handleSaveServerUrl = async () => {
    const url = serverUrlInput.trim().replace(/\/$/, "");
    if (url) {
      await AsyncStorage.setItem(LOCAL_SERVER_URL_KEY, url).catch(() => {});
      setBaseUrl(url);
      setSavedServerUrl(url);
    } else {
      await AsyncStorage.removeItem(LOCAL_SERVER_URL_KEY).catch(() => {});
      setBaseUrl(API_BASE_URL);
      setSavedServerUrl(null);
    }
    setServerConfigModal(false);
  };

  const handleResetServerUrl = async () => {
    await AsyncStorage.removeItem(LOCAL_SERVER_URL_KEY).catch(() => {});
    setBaseUrl(API_BASE_URL);
    setSavedServerUrl(null);
    setServerUrlInput("");
  };

  // Forgot password state
  const [forgotModal, setForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotSent, setForgotSent] = useState(false);

  const handleForgotPassword = async () => {
    if (!forgotEmail.trim()) {
      setForgotError("Ingresa tu correo electrónico.");
      return;
    }
    setForgotError(null);
    setForgotSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail.trim().toLowerCase() }),
      });
      if (res.ok) {
        setForgotSent(true);
      } else {
        const data = await res.json().catch(() => ({}));
        setForgotError((data as { error?: string }).error ?? "Error enviando el correo. Intenta de nuevo.");
      }
    } catch {
      setForgotError("Error de red. Verifica tu conexión.");
    } finally {
      setForgotSubmitting(false);
    }
  };

  // Demo panel state
  const DEMO_SECRET = process.env.EXPO_PUBLIC_DEMO_SECRET ?? "";
  const demoEnabled = !!DEMO_SECRET && !isWeb;
  const logoTapCountRef = useRef(0);
  const lastLogoTapRef = useRef(0);
  const [demoModalVisible, setDemoModalVisible] = useState(false);
  const [demoSubmitting, setDemoSubmitting] = useState<string | null>(null);
  const [demoError, setDemoError] = useState<string | null>(null);

  const handleLogoPress = () => {
    if (!demoEnabled) return;
    const now = Date.now();
    if (now - lastLogoTapRef.current > 2000) logoTapCountRef.current = 1;
    else logoTapCountRef.current += 1;
    lastLogoTapRef.current = now;
    if (logoTapCountRef.current >= 5) {
      logoTapCountRef.current = 0;
      setDemoError(null);
      setDemoModalVisible(true);
    }
  };

  const DEMO_ROLES = [
    { role: "admin", label: "Admin", icon: "settings" as const },
    { role: "event_admin", label: "Event Admin", icon: "calendar" as const },
    { role: "bank", label: "Bank / Recarga", icon: "credit-card" as const },
    { role: "gate", label: "Gate / Acceso", icon: "log-in" as const },
    { role: "merchant_admin", label: "Merchant Admin", icon: "briefcase" as const },
    { role: "merchant_staff", label: "Merchant Staff", icon: "shopping-bag" as const },
    { role: "warehouse_admin", label: "Warehouse", icon: "package" as const },
    { role: "box_office", label: "Box Office", icon: "tag" as const },
  ];

  const handleDemoLogin = async (role: string) => {
    setDemoError(null);
    setDemoSubmitting(role);
    const err = await demoLogin(role, DEMO_SECRET);
    setDemoSubmitting(null);
    if (err) {
      setDemoError(err);
      return;
    }
    setDemoModalVisible(false);
    router.replace("/");
  };

  // 2FA state
  const [totpModal, setTotpModal] = useState(false);
  const [partialToken, setPartialToken] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [totpError, setTotpError] = useState<string | null>(null);
  const [totpSubmitting, setTotpSubmitting] = useState(false);


  // Guard: if the user is already authenticated when this screen mounts
  // (e.g. navigated back to /login while logged in), go home immediately.
  // We intentionally do NOT watch isAuthenticated as a runtime dependency —
  // that caused a race condition where the effect navigated to "/" before
  // handleLogin could set setupStep, swallowing the PIN prompt entirely.
  useEffect(() => {
    if (isAuthenticated) router.replace("/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const completeLogin = async () => {
    if (rememberMe && !hasPasscode && Platform.OS !== "web") {
      const shouldShow = await onLoginAttempted();
      if (shouldShow) {
        setSetupStep("prompt");
        return;
      }
    }
    router.replace("/");
  };

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
      if (err.startsWith("REQUIRES_2FA:")) {
        const pToken = err.slice("REQUIRES_2FA:".length);
        setPartialToken(pToken);
        setTotpCode("");
        setTotpError(null);
        setTotpModal(true);
        return;
      }
      if (err === "Network error") {
        setError(t("auth.networkError") ?? "No se puede conectar al servidor. Verifica tu conexión.");
      } else if (err === "Could not load user profile") {
        setError(t("auth.profileError") ?? "Error cargando perfil. Intenta de nuevo.");
      } else if (err === "AttendeeNotAllowed") {
        setError(t("auth.attendeeNotAllowed") ?? "Las cuentas de asistente deben iniciar sesión en la app de asistentes.");
      } else {
        setError(t("auth.invalidCredentials"));
      }
      return;
    }
    await completeLogin();
  };

  const handleVerify2fa = async () => {
    setTotpError(null);
    if (totpCode.length !== 6) {
      setTotpError("Ingresa el código de 6 dígitos de tu autenticador.");
      return;
    }
    setTotpSubmitting(true);
    const err = await verify2fa(partialToken, totpCode, rememberMe);
    setTotpSubmitting(false);
    if (err) {
      setTotpError(err === "Invalid 2FA code" ? "Código incorrecto. Intenta de nuevo." : err);
      return;
    }
    setTotpModal(false);
    await completeLogin();
  };

  const busy = isLoading || submitting;
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

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
      {/* Background — video on native (if expo-video is linked), gradient fallback */}
      {!isWeb && _expoVideo ? (
        <LoginVideoBackground source={loginBgVideo} />
      ) : (
        <LinearGradient
          colors={["#0a0a0a", "#111111", "#0a0a0a"]}
          style={StyleSheet.absoluteFill}
        />
      )}

      {/* Black overlay */}
      <View style={styles.overlay} />

      {/* Server config gear — long-press to configure local server */}
      {!isWeb && (
        <Pressable
          onLongPress={() => {
            setServerUrlInput(savedServerUrl ?? "");
            setServerConfigModal(true);
          }}
          delayLongPress={600}
          style={[styles.gearBtn, { top: insets.top + 8 }]}
          hitSlop={16}
        >
          <Feather name="settings" size={20} color="rgba(255,255,255,0.22)" />
          <View style={[styles.gearDot, { backgroundColor: savedServerUrl ? "#f59e0b" : "#22c55e" }]} />
        </Pressable>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={[
            styles.inner,
            { paddingBottom: isWeb ? 34 : insets.bottom + 20 },
            isLandscape && styles.innerLandscape,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.logoSection, isLandscape && styles.logoSectionLandscape]}>
            <Pressable onPress={handleLogoPress} hitSlop={12}>
              <Image
                source={require("@/assets/images/tapee-logo.png")}
                style={[styles.logoImage, isLandscape && styles.logoImageLandscape]}
                resizeMode="contain"
              />
            </Pressable>
            <Text style={[styles.subtitle, { color: "rgba(255,255,255,0.65)" }]}>{t("auth.subtitle")}</Text>
          </View>

          <View style={[styles.form, isLandscape && styles.formLandscape]}>
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
                {rememberMe && <Feather name="check" size={13} color="#0a0a0a" />}
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

            <Pressable
              onPress={() => { setForgotEmail(""); setForgotError(null); setForgotSent(false); setForgotModal(true); }}
              style={{ alignSelf: "center", paddingVertical: 4 }}
            >
              <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, fontFamily: "Inter_400Regular" }}>
                ¿Olvidaste tu contraseña?
              </Text>
            </Pressable>
          </View>

          {/* Passcode setup prompt — shown below form in portrait, hidden in landscape */}
          {setupStep === "prompt" && !isLandscape && (
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

          {!isLandscape && (
            <Text style={[styles.disclaimer, { color: "rgba(255,255,255,0.35)" }]}>{t("auth.disclaimer")}</Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Forgot password modal */}
      <Modal
        visible={forgotModal}
        transparent
        animationType="slide"
        onRequestClose={() => setForgotModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setForgotModal(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
            <View style={[styles.totpSheet, { backgroundColor: "#161b22", borderColor: "rgba(255,255,255,0.1)" }]}>
              <View style={[styles.totpIcon, { backgroundColor: "rgba(0,241,255,0.1)" }]}>
                <Feather name="mail" size={28} color="#00f1ff" />
              </View>
              <Text style={styles.totpTitle}>Recuperar contraseña</Text>

              {forgotSent ? (
                <>
                  <View style={[styles.totpIcon, { backgroundColor: "rgba(0,255,100,0.1)" }]}>
                    <Feather name="check-circle" size={28} color="#22c55e" />
                  </View>
                  <Text style={[styles.totpHint, { textAlign: "center" }]}>
                    Si existe una cuenta de personal con ese correo, recibirás un enlace para restablecer tu contraseña en breve.
                  </Text>
                  <Button
                    title="Cerrar"
                    onPress={() => setForgotModal(false)}
                    variant="primary"
                    size="lg"
                    fullWidth
                  />
                </>
              ) : (
                <>
                  <Text style={styles.totpHint}>
                    Ingresa tu correo de trabajo. Te enviaremos un enlace para restablecer tu contraseña.
                  </Text>
                  <TextInput
                    style={[styles.totpInput, { backgroundColor: "rgba(255,255,255,0.07)", borderColor: "rgba(255,255,255,0.15)", color: "#fff", fontSize: 16, letterSpacing: 0, fontFamily: "Inter_400Regular" }]}
                    value={forgotEmail}
                    onChangeText={(v) => { setForgotEmail(v); setForgotError(null); }}
                    placeholder="correo@empresa.com"
                    placeholderTextColor="rgba(255,255,255,0.25)"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="send"
                    onSubmitEditing={handleForgotPassword}
                  />
                  {forgotError && (
                    <View style={[styles.totpErrorBox, { backgroundColor: "rgba(239,68,68,0.15)" }]}>
                      <Feather name="alert-circle" size={13} color="#ef4444" />
                      <Text style={[styles.totpErrorText, { color: "#ef4444" }]}>{forgotError}</Text>
                    </View>
                  )}
                  <Button
                    title={forgotSubmitting ? "Enviando..." : "Enviar enlace"}
                    onPress={handleForgotPassword}
                    variant="primary"
                    size="lg"
                    loading={forgotSubmitting}
                    fullWidth
                  />
                  <Pressable onPress={() => setForgotModal(false)} style={styles.totpCancel}>
                    <Text style={styles.totpCancelText}>Cancelar</Text>
                  </Pressable>
                </>
              )}
            </View>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* Demo Quick-Switch panel */}
      <Modal
        visible={demoModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDemoModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setDemoModalVisible(false)}>
          <View style={[styles.totpSheet, { backgroundColor: "#161b22", borderColor: "rgba(255,255,255,0.1)" }]}>
            <View style={[styles.totpIcon, { backgroundColor: "rgba(255,180,0,0.12)" }]}>
              <Feather name="zap" size={28} color="#f59e0b" />
            </View>
            <Text style={styles.totpTitle}>Demo Quick-Switch</Text>
            <Text style={styles.totpHint}>Selecciona un rol para iniciar sesión de demo al instante.</Text>
            {demoError && (
              <View style={[styles.totpErrorBox, { backgroundColor: "rgba(239,68,68,0.15)" }]}>
                <Feather name="alert-circle" size={13} color="#ef4444" />
                <Text style={[styles.totpErrorText, { color: "#ef4444" }]}>{demoError}</Text>
              </View>
            )}
            <View style={{ width: "100%", gap: 8 }}>
              {DEMO_ROLES.map(({ role, label, icon }) => (
                <Pressable
                  key={role}
                  onPress={() => handleDemoLogin(role)}
                  disabled={!!demoSubmitting}
                  style={[styles.demoRoleBtn, { backgroundColor: demoSubmitting === role ? "rgba(0,241,255,0.15)" : "rgba(255,255,255,0.06)", opacity: demoSubmitting && demoSubmitting !== role ? 0.4 : 1 }]}
                >
                  <Feather name={icon} size={16} color={demoSubmitting === role ? "#00f1ff" : "rgba(255,255,255,0.7)"} />
                  <Text style={[styles.demoRoleBtnText, { color: demoSubmitting === role ? "#00f1ff" : "#e6edf3" }]}>
                    {demoSubmitting === role ? "Iniciando…" : label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={() => setDemoModalVisible(false)} style={styles.totpCancel}>
              <Text style={styles.totpCancelText}>Cancelar</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Server config modal */}
      <Modal
        visible={serverConfigModal}
        transparent
        animationType="slide"
        onRequestClose={() => setServerConfigModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setServerConfigModal(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
            <View style={[styles.totpSheet, { backgroundColor: "#161b22", borderColor: "rgba(255,255,255,0.1)" }]}>
              <View style={[styles.totpIcon, { backgroundColor: "rgba(255,255,255,0.06)" }]}>
                <Feather name="settings" size={28} color="rgba(255,255,255,0.7)" />
              </View>
              <Text style={styles.totpTitle}>Configuración de Servidor</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, width: "100%" }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: savedServerUrl ? "#f59e0b" : "#22c55e" }} />
                <Text style={[styles.totpHint, { margin: 0 }]}>
                  {savedServerUrl ? `Local: ${savedServerUrl}` : "Producción (prod.tapee.app)"}
                </Text>
              </View>
              <Text style={[styles.totpHint, { textAlign: "left", width: "100%" }]}>
                URL del servidor local. Vacío = producción.
              </Text>
              <TextInput
                style={[styles.totpInput, { backgroundColor: "rgba(255,255,255,0.07)", borderColor: "rgba(255,255,255,0.15)", color: "#fff", fontSize: 14, letterSpacing: 0, fontFamily: "Inter_400Regular", paddingHorizontal: 14, textAlign: "left" }]}
                value={serverUrlInput}
                onChangeText={setServerUrlInput}
                placeholder="http://192.168.1.100:3001"
                placeholderTextColor="rgba(255,255,255,0.25)"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="done"
                onSubmitEditing={handleSaveServerUrl}
              />
              <View style={{ flexDirection: "row", gap: 10, width: "100%" }}>
                {savedServerUrl ? (
                  <Pressable
                    onPress={handleResetServerUrl}
                    style={{ flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", alignItems: "center" }}
                  >
                    <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, fontFamily: "Inter_500Medium" }}>Producción</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={handleSaveServerUrl}
                  style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: "#00f1ff", alignItems: "center" }}
                >
                  <Text style={{ color: "#0a0a0a", fontSize: 14, fontFamily: "Inter_700Bold" }}>Guardar</Text>
                </Pressable>
              </View>
              <Pressable onPress={() => setServerConfigModal(false)} style={styles.totpCancel}>
                <Text style={styles.totpCancelText}>Cancelar</Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* 2FA verification modal */}
      <Modal
        visible={totpModal}
        transparent
        animationType="slide"
        onRequestClose={() => setTotpModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setTotpModal(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
            <View style={[styles.totpSheet, { backgroundColor: "#161b22", borderColor: "rgba(255,255,255,0.1)" }]}>
              <View style={[styles.totpIcon, { backgroundColor: "rgba(0,241,255,0.1)" }]}>
                <Feather name="shield" size={28} color="#00f1ff" />
              </View>
              <Text style={styles.totpTitle}>Verificación en dos pasos</Text>
              <Text style={styles.totpHint}>
                Ingresa el código de 6 dígitos de tu aplicación autenticadora.
              </Text>
              <TextInput
                style={[styles.totpInput, { backgroundColor: "rgba(255,255,255,0.07)", borderColor: "rgba(255,255,255,0.15)", color: "#fff" }]}
                value={totpCode}
                onChangeText={(v) => { setTotpCode(v.replace(/\D/g, "").slice(0, 6)); setTotpError(null); }}
                placeholder="000000"
                placeholderTextColor="rgba(255,255,255,0.25)"
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleVerify2fa}
              />
              {totpError && (
                <View style={[styles.totpErrorBox, { backgroundColor: "rgba(239,68,68,0.15)" }]}>
                  <Feather name="alert-circle" size={13} color="#ef4444" />
                  <Text style={[styles.totpErrorText, { color: "#ef4444" }]}>{totpError}</Text>
                </View>
              )}
              <Button
                title={totpSubmitting ? "Verificando..." : "Verificar"}
                onPress={handleVerify2fa}
                variant="primary"
                size="lg"
                loading={totpSubmitting}
                disabled={totpSubmitting || totpCode.length !== 6}
                fullWidth
              />
              <Pressable onPress={() => setTotpModal(false)} style={styles.totpCancel}>
                <Text style={styles.totpCancelText}>Cancelar</Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a" },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.82)",
  },
  inner: { flexGrow: 1, paddingHorizontal: 28, paddingVertical: 20, gap: 20, justifyContent: "center" },
  innerLandscape: { flexDirection: "row", alignItems: "center", gap: 24, paddingVertical: 12 },
  logoSection: { alignItems: "center", gap: 8 },
  logoSectionLandscape: { width: "38%", alignItems: "center", justifyContent: "center", gap: 6 },
  logoImage: { width: "78%", maxWidth: 300, aspectRatio: 1199 / 435 },
  logoImageLandscape: { width: "85%", maxWidth: 200 },
  formLandscape: { flex: 1 },
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
    alignItems: "stretch",
  },
  totpSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    padding: 28,
    gap: 14,
    alignItems: "center",
  },
  totpIcon: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  totpTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: "#e6edf3",
    textAlign: "center",
  },
  totpHint: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
    lineHeight: 20,
  },
  totpInput: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: 8,
    textAlign: "center",
  },
  totpErrorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 9,
    width: "100%",
  },
  totpErrorText: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  demoRoleBtn: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 13, paddingHorizontal: 16, borderRadius: 12 },
  demoRoleBtnText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  gearBtn: {
    position: "absolute",
    right: 16,
    zIndex: 100,
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  gearDot: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "rgba(0,0,0,0.5)",
  },
  totpCancel: { paddingVertical: 8 },
  totpCancelText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.4)",
  },
});
