import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useColorScheme } from "@/hooks/useColorScheme";
import Colors from "@/constants/colors";
import { COUNTRY_CODES, type CountryCode } from "@/constants/countryCodes";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  visible: boolean;
  onClose: () => void;
}

type Step = "phone" | "otp";

const OTP_LENGTH = 6;

export function WhatsAppOtpModal({ visible, onClose }: Props) {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const { sendWhatsAppOtp, verifyWhatsAppOtp } = useAuth();

  const [step, setStep] = useState<Step>("phone");
  const [countryCode, setCountryCode] = useState<CountryCode>(COUNTRY_CODES[0]);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);

  const otpInputRef = useRef<TextInput>(null);

  // Reset state when modal closes
  useEffect(() => {
    if (!visible) {
      setStep("phone");
      setPhoneNumber("");
      setOtp("");
      setError(null);
      setCountdown(0);
    }
  }, [visible]);

  // Countdown timer for resend
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  // Auto-focus OTP input when step changes
  useEffect(() => {
    if (step === "otp") {
      setTimeout(() => otpInputRef.current?.focus(), 300);
    }
  }, [step]);

  const fullPhone = `${countryCode.code}${phoneNumber.trim()}`;

  const handleSendOtp = async () => {
    Keyboard.dismiss();
    if (!phoneNumber.trim() || phoneNumber.trim().length < 5) {
      setError(t("auth.fillFields"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await sendWhatsAppOtp(fullPhone);
      setStep("otp");
      setCountdown(res.expiresIn > 0 ? Math.min(res.expiresIn, 60) : 30);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("auth.otpSendFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (code: string) => {
    if (code.length !== OTP_LENGTH) return;
    Keyboard.dismiss();
    setLoading(true);
    setError(null);
    try {
      const err = await verifyWhatsAppOtp(fullPhone, code);
      if (err) {
        if (err === "StaffNotAllowed") {
          setError(t("auth.staffNotAllowed") ?? "Las cuentas de staff deben iniciar sesión en la app de staff.");
        } else {
          setError(t("auth.otpFailed"));
        }
        setOtp("");
      }
      // On success AuthContext sets user → login screen auto-redirects
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await sendWhatsAppOtp(fullPhone);
      setOtp("");
      setCountdown(res.expiresIn > 0 ? Math.min(res.expiresIn, 60) : 30);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("auth.otpSendFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (text: string) => {
    const digits = text.replace(/\D/g, "").slice(0, OTP_LENGTH);
    setOtp(digits);
    if (digits.length === OTP_LENGTH) {
      handleVerifyOtp(digits);
    }
  };

  const inputStyle = [
    styles.input,
    { backgroundColor: C.inputBg, borderColor: C.border, color: C.text },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardAvoid}
      >
        <Pressable style={styles.overlayFlex} onPress={onClose} />
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end" }}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={false}
        >
        <Pressable style={[styles.sheet, { backgroundColor: "#1a1a1a", borderColor: "rgba(255,255,255,0.1)" }]} onPress={() => {}}>
          {/* Handle bar */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            {step === "otp" ? (
              <Pressable onPress={() => { setStep("phone"); setOtp(""); setError(null); }} style={styles.backBtn}>
                <Feather name="arrow-left" size={20} color="rgba(255,255,255,0.7)" />
              </Pressable>
            ) : (
              <View style={styles.backBtn} />
            )}
            <Text style={styles.headerTitle}>{t("auth.whatsappLoginTitle")}</Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Feather name="x" size={20} color="rgba(255,255,255,0.6)" />
            </Pressable>
          </View>

          {/* Icon */}
          <View style={styles.iconRow}>
            <View style={styles.iconBadge}>
              <Feather name="message-circle" size={28} color="#25D366" />
            </View>
          </View>

          {step === "phone" ? (
            <>
              <Text style={styles.desc}>{t("auth.whatsappLoginDesc")}</Text>

              {error && (
                <View style={[styles.errorBox, { backgroundColor: C.dangerLight }]}>
                  <Feather name="alert-circle" size={13} color={C.danger} />
                  <Text style={[styles.errorText, { color: C.danger }]}>{error}</Text>
                </View>
              )}

              {/* Phone row */}
              <View style={styles.phoneRow}>
                <Pressable
                  style={[styles.countryBtn, { backgroundColor: C.inputBg, borderColor: C.border }]}
                  onPress={() => setShowCountryPicker(true)}
                >
                  <Text style={styles.flagText}>{countryCode.flag}</Text>
                  <Text style={[styles.dialText, { color: C.text }]}>{countryCode.code}</Text>
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
                  onSubmitEditing={handleSendOtp}
                />
              </View>

              <Pressable
                onPress={handleSendOtp}
                disabled={loading || !phoneNumber.trim()}
                style={({ pressed }) => [
                  styles.sendBtn,
                  pressed && { opacity: 0.8 },
                  (loading || !phoneNumber.trim()) && { opacity: 0.5 },
                ]}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Feather name="send" size={16} color="#fff" />
                    <Text style={styles.sendBtnText}>{t("auth.sendCode")}</Text>
                  </>
                )}
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.desc}>
                {t("auth.otpSent")} {"\n"}
                <Text style={{ fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.9)" }}>
                  {fullPhone}
                </Text>
              </Text>

              {error && (
                <View style={[styles.errorBox, { backgroundColor: C.dangerLight }]}>
                  <Feather name="alert-circle" size={13} color={C.danger} />
                  <Text style={[styles.errorText, { color: C.danger }]}>{error}</Text>
                </View>
              )}

              {/* Hidden TextInput driving the OTP display */}
              <TextInput
                ref={otpInputRef}
                value={otp}
                onChangeText={handleOtpChange}
                keyboardType="number-pad"
                maxLength={OTP_LENGTH}
                style={styles.hiddenInput}
                caretHidden
              />

              {/* OTP boxes */}
              <Pressable onPress={() => otpInputRef.current?.focus()} style={styles.otpRow}>
                {Array.from({ length: OTP_LENGTH }).map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.otpCell,
                      {
                        borderColor: otp.length === i
                          ? "#00f1ff"
                          : otp[i]
                          ? "rgba(255,255,255,0.4)"
                          : "rgba(255,255,255,0.15)",
                        backgroundColor: otp[i] ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
                      },
                    ]}
                  >
                    {loading && otp.length === OTP_LENGTH ? (
                      i === 2 ? <ActivityIndicator color="#00f1ff" size="small" /> : null
                    ) : (
                      <Text style={styles.otpDigit}>{otp[i] ?? ""}</Text>
                    )}
                  </View>
                ))}
              </Pressable>

              <View style={styles.resendRow}>
                <Pressable
                  onPress={handleResend}
                  disabled={countdown > 0 || loading}
                >
                  <Text style={[
                    styles.resendText,
                    countdown > 0 && { color: "rgba(255,255,255,0.35)" },
                  ]}>
                    {countdown > 0
                      ? `${t("auth.resendCode")} (${countdown}s)`
                      : t("auth.resendCode")}
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Country picker sub-modal */}
      <Modal
        visible={showCountryPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCountryPicker(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setShowCountryPicker(false)}>
          <View style={[styles.pickerSheet, { backgroundColor: "#1a1a1a", borderColor: "rgba(255,255,255,0.1)" }]}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>{t("auth.selectCountry")}</Text>
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
                  <Text style={styles.itemFlag}>{item.flag}</Text>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemDial}>{item.code}</Text>
                  {item.code === countryCode.code && (
                    <Feather name="check" size={15} color="#00f1ff" />
                  )}
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  keyboardAvoid: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  overlayFlex: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    padding: 24,
    paddingBottom: 36,
    gap: 14,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "center",
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: { width: 32 },
  closeBtn: { width: 32, alignItems: "flex-end" },
  headerTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: "rgba(255,255,255,0.9)",
  },
  iconRow: { alignItems: "center" },
  iconBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(37,211,102,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  desc: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.55)",
    textAlign: "center",
    lineHeight: 20,
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
  phoneRow: {
    flexDirection: "row",
    gap: 8,
  },
  countryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 11,
    paddingHorizontal: 10,
    paddingVertical: 11,
  },
  flagText: { fontSize: 20 },
  dialText: {
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
  sendBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#25D366",
    borderRadius: 12,
    paddingVertical: 14,
    minHeight: 48,
  },
  sendBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  hiddenInput: {
    position: "absolute",
    opacity: 0,
    height: 0,
    width: 0,
  },
  otpRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  otpCell: {
    width: 44,
    height: 52,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  otpDigit: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  resendRow: {
    alignItems: "center",
  },
  resendText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#00f1ff",
  },
  // Country picker sub-modal
  pickerSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    maxHeight: "65%",
    paddingTop: 8,
  },
  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  pickerTitle: {
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
  itemFlag: { fontSize: 20 },
  itemName: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.8)",
  },
  itemDial: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "rgba(255,255,255,0.45)",
  },
});
