import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState, useRef } from "react";
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatCOP } from "@/utils/format";
import { API_BASE_URL } from "@/constants/domain";

type Step = "lookup" | "payment" | "processing" | "done" | "failed";
type PayMethod = "nequi" | "pse";

const AMOUNTS = [10000, 20000, 50000, 100000, 200000];

const PSE_BANKS = [
  { code: "1007", name: "Bancolombia" },
  { code: "1001", name: "Banco De Bogotá" },
  { code: "1051", name: "Banco Davivienda" },
  { code: "1013", name: "BBVA Colombia" },
  { code: "1040", name: "Banco Agrario" },
  { code: "1052", name: "Banco AV Villas" },
  { code: "1032", name: "Banco Caja Social" },
  { code: "1023", name: "Banco De Occidente" },
  { code: "1062", name: "Banco Falabella" },
  { code: "1006", name: "Banco Itaú" },
  { code: "1002", name: "Banco Popular" },
  { code: "1009", name: "Citibank" },
  { code: "1370", name: "Colpatria" },
  { code: "1637", name: "Scotiabank Colpatria" },
];

interface BraceletInfo {
  uid: string;
  balanceCop: number;
  attendeeName: string | null;
  eventName: string | null;
  eventActive: boolean;
  pendingSync: boolean;
}

const POLL_INTERVAL = 3000;
const MAX_POLLS = 40;

export default function SelfServiceScreen() {
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  // — Payment flow state —
  const [step, setStep] = useState<Step>("lookup");
  const [uid, setUid] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [bracelet, setBracelet] = useState<BraceletInfo | null>(null);

  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [method, setMethod] = useState<PayMethod>("nequi");
  const [phone, setPhone] = useState("");
  const [selectedBank, setSelectedBank] = useState<{ code: string; name: string } | null>(null);
  const [showBankPicker, setShowBankPicker] = useState(false);
  const [paying, setPaying] = useState(false);

  const [intentId, setIntentId] = useState<string | null>(null);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCount = useRef(0);

  // — Registration state —
  const [wantsAccount, setWantsAccount] = useState(false);
  const [regFirstName, setRegFirstName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [regSuccess, setRegSuccess] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);

  const effectiveAmount = selectedAmount ?? (customAmount ? parseInt(customAmount.replace(/\D/g, ""), 10) : 0);

  const canPay =
    effectiveAmount >= 1000 &&
    bracelet !== null &&
    (method === "nequi"
      ? phone.replace(/\D/g, "").length === 10
      : selectedBank !== null);

  const regFieldsValid =
    !wantsAccount ||
    (regFirstName.trim().length >= 1 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail.trim()) &&
      regPassword.length >= 6);

  // — Bracelet lookup —
  const handleLookup = async () => {
    const trimmedUid = uid.trim().toUpperCase();
    if (trimmedUid.length < 4) {
      setLookupError("Ingresa el número completo de tu pulsera.");
      return;
    }
    setLookingUp(true);
    setLookupError(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/public/bracelet-lookup?uid=${encodeURIComponent(trimmedUid)}`,
      );
      const data = (await res.json()) as BraceletInfo & { error?: string };
      if (!res.ok) {
        if (data.error === "BRACELET_NOT_FOUND") {
          setLookupError(
            "Número de pulsera no encontrado. Verifica el número impreso en tu pulsera.",
          );
        } else if (data.error === "BRACELET_FLAGGED") {
          setLookupError(
            "Esta pulsera ha sido bloqueada. Contacta al organizador del evento.",
          );
        } else {
          setLookupError("Error buscando la pulsera. Intenta de nuevo.");
        }
        return;
      }
      setBracelet(data);
      setStep("payment");
    } catch {
      setLookupError("Sin conexión. Verifica tu internet e intenta de nuevo.");
    } finally {
      setLookingUp(false);
    }
  };

  // — Polling —
  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const handleRegistration = async (braceletUid: string) => {
    if (!wantsAccount) return;
    setRegistering(true);
    setRegError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/public/register-attendee`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          braceletUid,
          email: regEmail.trim().toLowerCase(),
          password: regPassword,
          firstName: regFirstName.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string; message?: string };
      if (res.ok && data.success) {
        setRegSuccess(true);
      } else if (data.error === "EMAIL_TAKEN") {
        setRegError("Este correo ya está registrado. Inicia sesión en la app con esas credenciales.");
      } else {
        setRegError("No se pudo crear la cuenta. Puedes intentarlo más tarde desde la app.");
      }
    } catch {
      setRegError("Sin conexión al crear la cuenta. Inténtalo más tarde desde la app.");
    } finally {
      setRegistering(false);
    }
  };

  const startPolling = (id: string, braceletUid: string) => {
    pollCount.current = 0;
    pollRef.current = setInterval(async () => {
      pollCount.current += 1;
      if (pollCount.current > MAX_POLLS) {
        stopPolling();
        setStep("failed");
        return;
      }
      try {
        const res = await fetch(`${API_BASE_URL}/api/public/topup/status/${id}`);
        const data = (await res.json()) as { status: string };
        if (data.status === "success") {
          stopPolling();
          setStep("done");
          // Trigger account creation if the user opted in
          void handleRegistration(braceletUid);
        } else if (data.status === "failed") {
          stopPolling();
          setStep("failed");
        }
      } catch {}
    }, POLL_INTERVAL);
  };

  // — Payment initiation —
  const handlePay = async () => {
    if (!canPay || !bracelet) return;
    setPaying(true);
    try {
      const body: Record<string, unknown> = {
        braceletUid: bracelet.uid,
        amountCop: effectiveAmount,
        paymentMethod: method,
      };
      if (method === "nequi") body.phoneNumber = phone.replace(/\D/g, "");
      else body.bankCode = selectedBank!.code;

      const res = await fetch(`${API_BASE_URL}/api/public/topup/initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        intentId?: string;
        redirectUrl?: string | null;
        error?: string;
      };

      if (!res.ok || !data.intentId) {
        Alert.alert(
          "Error",
          data.error ?? "No se pudo iniciar el pago. Intenta de nuevo.",
        );
        return;
      }

      setIntentId(data.intentId);
      setRedirectUrl(data.redirectUrl ?? null);
      setStep("processing");

      if (method === "pse" && data.redirectUrl) {
        Linking.openURL(data.redirectUrl).catch(() => {});
      }

      startPolling(data.intentId, bracelet.uid);
    } catch {
      Alert.alert("Error", "Sin conexión. Verifica tu internet e intenta de nuevo.");
    } finally {
      setPaying(false);
    }
  };

  // — Reset —
  const handleReset = () => {
    stopPolling();
    setStep("lookup");
    setUid("");
    setBracelet(null);
    setSelectedAmount(null);
    setCustomAmount("");
    setMethod("nequi");
    setPhone("");
    setSelectedBank(null);
    setIntentId(null);
    setRedirectUrl(null);
    setWantsAccount(false);
    setRegFirstName("");
    setRegEmail("");
    setRegPassword("");
    setRegSuccess(false);
    setRegError(null);
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: C.background, paddingTop: isWeb ? 16 : insets.top },
      ]}
    >
      <View style={[styles.header, { borderBottomColor: C.border }]}>
        <Pressable
          onPress={() => {
            stopPolling();
            router.back();
          }}
          style={styles.backBtn}
        >
          <Feather name="arrow-left" size={22} color={C.text} />
        </Pressable>
        <Text style={[styles.title, { color: C.text }]}>Recargar pulsera</Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── STEP: LOOKUP ── */}
        {step === "lookup" && (
          <>
            <View
              style={[
                styles.infoBox,
                { backgroundColor: C.primaryLight, borderColor: C.primary },
              ]}
            >
              <Feather name="credit-card" size={18} color={C.primary} />
              <Text style={[styles.infoText, { color: C.primary }]}>
                Ingresa el número completo impreso en tu pulsera para recargarla
                sin necesidad de cuenta.
              </Text>
            </View>

            <Card style={{ gap: 14 }}>
              <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>
                NÚMERO DE PULSERA
              </Text>
              <Text style={[styles.hint, { color: C.textSecondary }]}>
                Escribe el número exacto que aparece impreso en la pulsera, como
                se ve en la etiqueta.
              </Text>
              <TextInput
                style={[
                  styles.uidInput,
                  {
                    backgroundColor: C.inputBg,
                    borderColor: lookupError ? C.danger : C.border,
                    color: C.text,
                  },
                ]}
                placeholder="Ej: A1B2C3D4E5F6"
                placeholderTextColor={C.textMuted}
                autoCapitalize="characters"
                autoCorrect={false}
                value={uid}
                onChangeText={(v) => {
                  setUid(v);
                  setLookupError(null);
                }}
                onSubmitEditing={handleLookup}
                returnKeyType="search"
              />
              {lookupError && (
                <View style={styles.errorRow}>
                  <Feather name="alert-circle" size={14} color={C.danger} />
                  <Text style={[styles.errorText, { color: C.danger }]}>
                    {lookupError}
                  </Text>
                </View>
              )}
              <Button
                title={lookingUp ? "Buscando..." : "Buscar pulsera"}
                onPress={handleLookup}
                loading={lookingUp}
                disabled={lookingUp || uid.trim().length < 4}
                variant="primary"
                fullWidth
              />
            </Card>
          </>
        )}

        {/* ── STEP: PAYMENT ── */}
        {step === "payment" && bracelet && (
          <>
            {/* Bracelet card */}
            <Card style={{ gap: 10 }}>
              <View style={styles.braceletRow}>
                <View
                  style={[
                    styles.braceletIcon,
                    { backgroundColor: C.primaryLight },
                  ]}
                >
                  <Feather name="credit-card" size={20} color={C.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.braceletUid, { color: C.text }]}>
                    {bracelet.uid}
                  </Text>
                  {bracelet.attendeeName && (
                    <Text
                      style={[
                        styles.braceletName,
                        { color: C.textSecondary },
                      ]}
                    >
                      {bracelet.attendeeName}
                    </Text>
                  )}
                  {bracelet.eventName && (
                    <Text
                      style={[styles.braceletEvent, { color: C.textMuted }]}
                    >
                      {bracelet.eventName}
                    </Text>
                  )}
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[styles.balanceLabel, { color: C.textMuted }]}>
                    Saldo
                  </Text>
                  <Text style={[styles.balanceValue, { color: C.primary }]}>
                    {formatCOP(bracelet.balanceCop)}
                  </Text>
                </View>
              </View>
              {bracelet.pendingSync && (
                <View
                  style={[
                    styles.syncBanner,
                    {
                      backgroundColor: C.warningLight,
                      borderColor: C.warning,
                    },
                  ]}
                >
                  <Feather name="clock" size={13} color={C.warning} />
                  <Text style={[styles.syncText, { color: C.warning }]}>
                    Tienes una recarga pendiente de sincronizar. Se aplicará al
                    tocar la siguiente terminal.
                  </Text>
                </View>
              )}
              <Pressable onPress={handleReset}>
                <Text style={[styles.changeLink, { color: C.primary }]}>
                  Cambiar pulsera
                </Text>
              </Pressable>
            </Card>

            {/* Amount */}
            <Card style={{ gap: 12 }}>
              <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>
                MONTO A RECARGAR
              </Text>
              <View style={styles.amountGrid}>
                {AMOUNTS.map((amt) => (
                  <Pressable
                    key={amt}
                    onPress={() => {
                      setSelectedAmount(amt);
                      setCustomAmount("");
                    }}
                    style={[
                      styles.amountChip,
                      {
                        backgroundColor:
                          selectedAmount === amt ? C.primary : C.inputBg,
                        borderColor:
                          selectedAmount === amt ? C.primary : C.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.amountChipText,
                        {
                          color:
                            selectedAmount === amt ? "#0a0a0a" : C.text,
                        },
                      ]}
                    >
                      {formatCOP(amt)}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: C.inputBg,
                    borderColor: C.border,
                    color: C.text,
                  },
                ]}
                placeholder="O ingresa un monto personalizado"
                placeholderTextColor={C.textMuted}
                keyboardType="numeric"
                value={customAmount}
                onChangeText={(v) => {
                  setCustomAmount(v);
                  setSelectedAmount(null);
                }}
              />
              {effectiveAmount >= 1000 && (
                <Text style={[styles.amountPreview, { color: C.primary }]}>
                  Total: {formatCOP(effectiveAmount)}
                </Text>
              )}
            </Card>

            {/* Payment method */}
            <Card style={{ gap: 12 }}>
              <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>
                MÉTODO DE PAGO
              </Text>
              <View style={styles.methodRow}>
                {(["nequi", "pse"] as PayMethod[]).map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => setMethod(m)}
                    style={[
                      styles.methodBtn,
                      {
                        backgroundColor:
                          method === m ? C.primaryLight : C.inputBg,
                        borderColor: method === m ? C.primary : C.border,
                        flex: 1,
                      },
                    ]}
                  >
                    <Feather
                      name={m === "nequi" ? "smartphone" : "globe"}
                      size={20}
                      color={method === m ? C.primary : C.textSecondary}
                    />
                    <Text
                      style={[
                        styles.methodLabel,
                        { color: method === m ? C.primary : C.text },
                      ]}
                    >
                      {m === "nequi" ? "Nequi" : "PSE"}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Card>

            {method === "nequi" && (
              <Card style={{ gap: 12 }}>
                <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>
                  NÚMERO NEQUI
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: C.inputBg,
                      borderColor: C.border,
                      color: C.text,
                    },
                  ]}
                  placeholder="300 123 4567"
                  placeholderTextColor={C.textMuted}
                  keyboardType="phone-pad"
                  maxLength={13}
                  value={phone}
                  onChangeText={setPhone}
                />
                <Text style={[styles.hint, { color: C.textSecondary }]}>
                  Recibirás una notificación en tu app Nequi para confirmar.
                </Text>
              </Card>
            )}

            {method === "pse" && (
              <Card style={{ gap: 12 }}>
                <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>
                  BANCO
                </Text>
                <Pressable
                  onPress={() => setShowBankPicker(!showBankPicker)}
                  style={[
                    styles.bankSelector,
                    { backgroundColor: C.inputBg, borderColor: C.border },
                  ]}
                >
                  <Text
                    style={{
                      color: selectedBank ? C.text : C.textMuted,
                      flex: 1,
                      fontFamily: "Inter_400Regular",
                    }}
                  >
                    {selectedBank ? selectedBank.name : "Selecciona tu banco"}
                  </Text>
                  <Feather
                    name={showBankPicker ? "chevron-up" : "chevron-down"}
                    size={18}
                    color={C.textSecondary}
                  />
                </Pressable>
                {showBankPicker && (
                  <View
                    style={[
                      styles.bankList,
                      { backgroundColor: C.card, borderColor: C.border },
                    ]}
                  >
                    <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled>
                      {PSE_BANKS.map((bank) => (
                        <Pressable
                          key={bank.code}
                          onPress={() => {
                            setSelectedBank(bank);
                            setShowBankPicker(false);
                          }}
                          style={[
                            styles.bankItem,
                            {
                              backgroundColor:
                                selectedBank?.code === bank.code
                                  ? C.primaryLight
                                  : "transparent",
                              borderBottomColor: C.separator,
                            },
                          ]}
                        >
                          <Text
                            style={{
                              color: C.text,
                              fontFamily: "Inter_400Regular",
                            }}
                          >
                            {bank.name}
                          </Text>
                          {selectedBank?.code === bank.code && (
                            <Feather name="check" size={14} color={C.primary} />
                          )}
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </Card>
            )}

            {/* ── Registration opt-in ── */}
            <Card style={{ gap: 12 }}>
              <Pressable
                onPress={() => setWantsAccount(!wantsAccount)}
                style={styles.checkboxRow}
              >
                <View
                  style={[
                    styles.checkbox,
                    {
                      backgroundColor: wantsAccount ? C.primary : "transparent",
                      borderColor: wantsAccount ? C.primary : C.border,
                    },
                  ]}
                >
                  {wantsAccount && (
                    <Feather name="check" size={14} color="#0a0a0a" />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.checkboxLabel, { color: C.text }]}>
                    Registrarme en Tapee como asistente
                  </Text>
                  <Text style={[styles.checkboxHint, { color: C.textMuted }]}>
                    Crea tu cuenta gratis para ver tu historial y saldo desde la app.
                  </Text>
                </View>
              </Pressable>

              {wantsAccount && (
                <View style={{ gap: 10 }}>
                  <View style={[styles.dividerLine, { backgroundColor: C.separator }]} />
                  <TextInput
                    style={[
                      styles.input,
                      { backgroundColor: C.inputBg, borderColor: C.border, color: C.text },
                    ]}
                    placeholder="Tu nombre"
                    placeholderTextColor={C.textMuted}
                    autoCapitalize="words"
                    autoCorrect={false}
                    value={regFirstName}
                    onChangeText={setRegFirstName}
                  />
                  <TextInput
                    style={[
                      styles.input,
                      { backgroundColor: C.inputBg, borderColor: C.border, color: C.text },
                    ]}
                    placeholder="Correo electrónico"
                    placeholderTextColor={C.textMuted}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoCorrect={false}
                    value={regEmail}
                    onChangeText={setRegEmail}
                  />
                  <View style={styles.passwordRow}>
                    <TextInput
                      style={[
                        styles.input,
                        {
                          backgroundColor: C.inputBg,
                          borderColor: C.border,
                          color: C.text,
                          flex: 1,
                          marginBottom: 0,
                        },
                      ]}
                      placeholder="Contraseña (mín. 6 caracteres)"
                      placeholderTextColor={C.textMuted}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      value={regPassword}
                      onChangeText={setRegPassword}
                    />
                    <Pressable
                      onPress={() => setShowPassword(!showPassword)}
                      style={[styles.eyeBtn, { backgroundColor: C.inputBg, borderColor: C.border }]}
                    >
                      <Feather
                        name={showPassword ? "eye-off" : "eye"}
                        size={18}
                        color={C.textSecondary}
                      />
                    </Pressable>
                  </View>
                  {!regFieldsValid && (
                    <Text style={[styles.regFieldsHint, { color: C.textMuted }]}>
                      Completa todos los campos para crear tu cuenta junto con el pago.
                    </Text>
                  )}
                </View>
              )}
            </Card>

            <Button
              title={
                paying
                  ? "Iniciando pago..."
                  : `Pagar${effectiveAmount >= 1000 ? ` ${formatCOP(effectiveAmount)}` : ""}`
              }
              onPress={handlePay}
              disabled={!canPay || paying || !regFieldsValid}
              loading={paying}
              variant="primary"
              fullWidth
            />
          </>
        )}

        {/* ── STEP: PROCESSING ── */}
        {step === "processing" && (
          <Card style={{ gap: 20, alignItems: "center", paddingVertical: 36 }}>
            <ActivityIndicator size="large" color={C.primary} />
            <Text style={[styles.processingTitle, { color: C.text }]}>
              Procesando pago
            </Text>
            {method === "nequi" ? (
              <Text style={[styles.processingHint, { color: C.textSecondary }]}>
                Revisa tu app Nequi y acepta la notificación de cobro. Estamos
                esperando confirmación...
              </Text>
            ) : (
              <>
                <Text style={[styles.processingHint, { color: C.textSecondary }]}>
                  Te redirigimos al portal de tu banco. Cuando completes el pago,
                  regresa aquí.
                </Text>
                {redirectUrl && (
                  <Button
                    title="Abrir portal del banco"
                    onPress={() => Linking.openURL(redirectUrl!).catch(() => {})}
                    variant="outline"
                  />
                )}
              </>
            )}
            <Text style={[styles.processingSmall, { color: C.textMuted }]}>
              Este proceso puede tomar hasta 2 minutos.
            </Text>
          </Card>
        )}

        {/* ── STEP: DONE ── */}
        {step === "done" && (
          <Card style={{ gap: 20, alignItems: "center", paddingVertical: 36 }}>
            <View style={[styles.successIcon, { backgroundColor: "#00C48C20" }]}>
              <Feather name="check-circle" size={48} color="#00C48C" />
            </View>
            <Text style={[styles.doneTitle, { color: C.text }]}>
              ¡Recarga exitosa!
            </Text>
            <Text style={[styles.doneAmount, { color: C.primary }]}>
              +{formatCOP(effectiveAmount)}
            </Text>
            <Text style={[styles.processingHint, { color: C.textSecondary }]}>
              Tu saldo se ha acreditado. La próxima vez que toques una terminal,
              tu pulsera se actualizará automáticamente.
            </Text>

            {/* Registration result */}
            {wantsAccount && (
              <View style={styles.regResultBox}>
                {registering ? (
                  <View style={styles.regResultRow}>
                    <ActivityIndicator size="small" color={C.primary} />
                    <Text style={[styles.regResultText, { color: C.textSecondary }]}>
                      Creando tu cuenta...
                    </Text>
                  </View>
                ) : regSuccess ? (
                  <View
                    style={[
                      styles.regSuccessBanner,
                      { backgroundColor: "#00C48C15", borderColor: "#00C48C" },
                    ]}
                  >
                    <Feather name="user-check" size={18} color="#00C48C" />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.regSuccessTitle, { color: "#00C48C" }]}>
                        ¡Cuenta creada!
                      </Text>
                      <Text style={[styles.regSuccessHint, { color: C.textSecondary }]}>
                        Inicia sesión en Tapee con {regEmail} para ver tu saldo e historial.
                      </Text>
                    </View>
                  </View>
                ) : regError ? (
                  <View
                    style={[
                      styles.regSuccessBanner,
                      { backgroundColor: C.warningLight, borderColor: C.warning },
                    ]}
                  >
                    <Feather name="alert-circle" size={18} color={C.warning} />
                    <Text style={[styles.regSuccessHint, { color: C.warning, flex: 1 }]}>
                      {regError}
                    </Text>
                  </View>
                ) : null}
              </View>
            )}

            <Button
              title="Recargar otra pulsera"
              onPress={handleReset}
              variant="outline"
            />
            <Button
              title="Volver"
              onPress={() => router.back()}
              variant="ghost"
            />
          </Card>
        )}

        {/* ── STEP: FAILED ── */}
        {step === "failed" && (
          <Card style={{ gap: 20, alignItems: "center", paddingVertical: 36 }}>
            <View
              style={[styles.failedIcon, { backgroundColor: C.dangerLight }]}
            >
              <Feather name="x-circle" size={48} color={C.danger} />
            </View>
            <Text style={[styles.doneTitle, { color: C.text }]}>
              Pago no completado
            </Text>
            <Text style={[styles.processingHint, { color: C.textSecondary }]}>
              El pago fue rechazado o venció el tiempo de espera. No se realizó
              ningún cobro.
            </Text>
            <Button
              title="Intentar de nuevo"
              onPress={() => setStep("payment")}
              variant="primary"
            />
            <Button
              title="Volver"
              onPress={() => router.back()}
              variant="ghost"
            />
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold" },
  scroll: { padding: 20, gap: 16 },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  infoText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  hint: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  uidInput: {
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 16,
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    letterSpacing: 2,
    textAlign: "center",
  },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  errorText: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  braceletRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  braceletIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  braceletUid: { fontSize: 15, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  braceletName: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  braceletEvent: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  balanceLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  balanceValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
  syncBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  syncText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 16 },
  changeLink: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    textDecorationLine: "underline",
  },
  amountGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  amountChip: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: "30%",
    alignItems: "center",
  },
  amountChipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    marginBottom: 0,
  },
  amountPreview: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  methodRow: { flexDirection: "row", gap: 12 },
  methodBtn: {
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    gap: 6,
  },
  methodLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  bankSelector: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  bankList: { borderWidth: 1, borderRadius: 12, overflow: "hidden" },
  bankItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderBottomWidth: 1,
  },
  // Registration
  checkboxRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  checkboxLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold", lineHeight: 20 },
  checkboxHint: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2, lineHeight: 16 },
  dividerLine: { height: 1, marginVertical: 2 },
  passwordRow: { flexDirection: "row", gap: 8, alignItems: "stretch" },
  eyeBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  regFieldsHint: { fontSize: 12, fontFamily: "Inter_400Regular" },
  // Done / registration result
  processingTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  processingHint: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    textAlign: "center",
  },
  processingSmall: { fontSize: 12, fontFamily: "Inter_400Regular" },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  failedIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  doneTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  doneAmount: { fontSize: 32, fontFamily: "Inter_700Bold" },
  regResultBox: { width: "100%", gap: 8 },
  regResultRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  regResultText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  regSuccessBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    width: "100%",
  },
  regSuccessTitle: { fontSize: 14, fontFamily: "Inter_700Bold" },
  regSuccessHint: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18, marginTop: 2 },
});
