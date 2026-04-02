import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useEffect, useState } from "react";
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
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

const COUNTRY_CODES = [
  { code: "+57", flag: "🇨🇴", name: "Colombia" },
  { code: "+1", flag: "🇺🇸", name: "Estados Unidos" },
  { code: "+52", flag: "🇲🇽", name: "México" },
  { code: "+54", flag: "🇦🇷", name: "Argentina" },
  { code: "+55", flag: "🇧🇷", name: "Brasil" },
  { code: "+56", flag: "🇨🇱", name: "Chile" },
  { code: "+51", flag: "🇵🇪", name: "Perú" },
  { code: "+58", flag: "🇻🇪", name: "Venezuela" },
  { code: "+593", flag: "🇪🇨", name: "Ecuador" },
  { code: "+595", flag: "🇵🇾", name: "Paraguay" },
  { code: "+598", flag: "🇺🇾", name: "Uruguay" },
  { code: "+591", flag: "🇧🇴", name: "Bolivia" },
  { code: "+34", flag: "🇪🇸", name: "España" },
  { code: "+44", flag: "🇬🇧", name: "Reino Unido" },
  { code: "+49", flag: "🇩🇪", name: "Alemania" },
  { code: "+33", flag: "🇫🇷", name: "Francia" },
  { code: "+39", flag: "🇮🇹", name: "Italia" },
  { code: "+81", flag: "🇯🇵", name: "Japón" },
  { code: "+86", flag: "🇨🇳", name: "China" },
];

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
  const [countryCode, setCountryCode] = useState(COUNTRY_CODES[0]);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keepLoggedIn, setKeepLoggedIn] = useState(true);

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
      err = await login(email.trim(), password, keepLoggedIn);
    } else {
      const fullPhone = phoneNumber.trim() ? `${countryCode.code}${phoneNumber.trim()}` : undefined;
      err = await register(email.trim(), password, firstName.trim(), lastName.trim(), fullPhone);
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
              <View style={styles.phoneRow}>
                <Pressable
                  style={[styles.countryCodeBtn, { backgroundColor: C.inputBg, borderColor: C.border }]}
                  onPress={() => setShowCountryPicker(true)}
                >
                  <Text style={styles.flagText}>{countryCode.flag}</Text>
                  <Feather name="chevron-down" size={12} color={C.textMuted} />
                </Pressable>
                <TextInput
                  style={[inputStyle, { flex: 1 }]}
                  placeholder={t("auth.phonePlaceholder")}
                  placeholderTextColor={C.textMuted}
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                />
              </View>
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

          {tab === "login" && (
            <Pressable
              onPress={() => setKeepLoggedIn((v) => !v)}
              style={styles.keepRow}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: keepLoggedIn }}
            >
              <View style={[
                styles.checkbox,
                {
                  backgroundColor: keepLoggedIn ? "#00f1ff" : "rgba(255,255,255,0.07)",
                  borderColor: keepLoggedIn ? "#00f1ff" : "rgba(255,255,255,0.18)",
                },
              ]}>
                {keepLoggedIn && <Feather name="check" size={11} color="#000" />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.keepLabel}>{t("auth.keepMeLoggedIn")}</Text>
                <Text style={styles.keepHint}>{t("auth.keepMeLoggedInHint")}</Text>
              </View>
            </Pressable>
          )}

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

      {/* Country code picker modal */}
      <Modal
        visible={showCountryPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCountryPicker(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowCountryPicker(false)}>
          <View style={[styles.modalSheet, { backgroundColor: "#1a1a1a", borderColor: "rgba(255,255,255,0.1)" }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t("auth.selectCountry")}</Text>
              <Pressable onPress={() => setShowCountryPicker(false)}>
                <Feather name="x" size={20} color="rgba(255,255,255,0.6)" />
              </Pressable>
            </View>
            <FlatList
              data={COUNTRY_CODES}
              keyExtractor={(item) => item.code + item.name}
              renderItem={({ item }) => (
                <Pressable
                  style={[
                    styles.countryItem,
                    item.code === countryCode.code && { backgroundColor: "rgba(0,241,255,0.08)" },
                  ]}
                  onPress={() => { setCountryCode(item); setShowCountryPicker(false); }}
                >
                  <Text style={styles.countryFlag}>{item.flag}</Text>
                  <Text style={styles.countryName}>{item.name}</Text>
                  <Text style={styles.countryDial}>{item.code}</Text>
                  {item.code === countryCode.code && (
                    <Feather name="check" size={15} color="#00f1ff" />
                  )}
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a" },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.88)",
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
    width: "55%",
    maxWidth: 200,
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
  keepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 2,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
    flexShrink: 0,
  },
  keepLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "rgba(255,255,255,0.85)",
  },
  keepHint: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.4)",
    marginTop: 1,
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
  phoneRow: {
    flexDirection: "row",
    gap: 8,
  },
  countryCodeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 11,
    minWidth: 62,
  },
  flagText: {
    fontSize: 22,
  },
  dialCodeText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    maxHeight: "65%",
    paddingTop: 8,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  modalTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "rgba(255,255,255,0.85)",
  },
  countryItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 13,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  countryFlag: {
    fontSize: 20,
  },
  countryName: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.8)",
  },
  countryDial: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "rgba(255,255,255,0.45)",
  },
});
