import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState, useEffect } from "react";
import {
  ActivityIndicator,
  FlatList,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CopAmount } from "@/components/CopAmount";
import { useAuth } from "@/contexts/AuthContext";
import { useMyRefundRequests, useUpdateProfile, useDeleteAccount } from "@/hooks/useAttendeeApi";
import { setStoredLanguage } from "@/i18n";
import i18n from "@/i18n";
import { formatDate } from "@/utils/format";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { PhoneInput, COUNTRY_CODES, type CountryCode } from "@/components/PhoneInput";

function parseStoredPhone(full: string): { country: CountryCode; local: string } {
  for (const c of COUNTRY_CODES) {
    if (full.startsWith(c.code)) return { country: c, local: full.slice(c.code.length) };
  }
  return { country: COUNTRY_CODES[0], local: full };
}

function parseDDMMYYYY(s: string): Date | null {
  if (!s || s.length < 8) return null;
  const parts = s.split("/");
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts.map(Number);
  const d = new Date(yyyy, mm - 1, dd);
  return isNaN(d.getTime()) ? null : d;
}

function toDDMMYYYY(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

const ID_TYPES = [
  { code: "CC", label: "Cédula de ciudadanía" },
  { code: "CE", label: "Cédula de extranjería" },
  { code: "TI", label: "Tarjeta de identidad" },
  { code: "PP", label: "Pasaporte" },
  { code: "RC", label: "Registro civil" },
  { code: "NIT", label: "NIT" },
  { code: "VEN", label: "Doc. venezolano" },
  { code: "DIP", label: "Carnet diplomático" },
];

function parseIdDocument(stored: string): { idType: string; idNumber: string } {
  for (const t of ID_TYPES) {
    if (stored.startsWith(t.code + ": ")) {
      return { idType: t.code, idNumber: stored.slice(t.code.length + 2) };
    }
  }
  return { idType: "CC", idNumber: stored };
}

type RefundRequest = {
  id: string;
  braceletUid: string;
  eventId?: string | null;
  eventName?: string | null;
  refundMethod: string;
  amount: number;
  status: "pending" | "approved" | "rejected";
  chipZeroed?: boolean;
  createdAt: string;
};

export default function ProfileScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user, logout, refreshUser } = useAuth();

  const { data: refundsData } = useMyRefundRequests();
  const refunds = ((refundsData as { refundRequests?: RefundRequest[] } | undefined)?.refundRequests ?? []);

  const [currentLang, setCurrentLang] = useState(i18n.language);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>(() => parseStoredPhone(user?.phone ?? "").country);
  const [phoneLocal, setPhoneLocal] = useState(() => parseStoredPhone(user?.phone ?? "").local);
  const [dateOfBirthDate, setDateOfBirthDate] = useState<Date | null>(() => parseDDMMYYYY(user?.dateOfBirth ?? ""));
  const [sex, setSex] = useState<"male" | "female" | "non_binary" | "">(
    (user?.sex as "male" | "female" | "non_binary") ?? ""
  );
  const [idType, setIdType] = useState(() => parseIdDocument(user?.idDocument ?? "").idType);
  const [idNumber, setIdNumber] = useState(() => parseIdDocument(user?.idDocument ?? "").idNumber);
  const [showIdTypePicker, setShowIdTypePicker] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Sync fields when user data loads asynchronously (only when not editing)
  useEffect(() => {
    if (isEditing) return;
    setFirstName(user?.firstName ?? "");
    setLastName(user?.lastName ?? "");
    const parsedPhone = parseStoredPhone(user?.phone ?? "");
    setPhoneCountry(parsedPhone.country);
    setPhoneLocal(parsedPhone.local);
    setDateOfBirthDate(parseDDMMYYYY(user?.dateOfBirth ?? ""));
    setSex((user?.sex as "male" | "female" | "non_binary") ?? "");
    const parsedId = parseIdDocument(user?.idDocument ?? "");
    setIdType(parsedId.idType);
    setIdNumber(parsedId.idNumber);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const updateProfile = useUpdateProfile();
  const deleteAccount = useDeleteAccount();

  const handleLanguage = async (lang: string) => {
    await setStoredLanguage(lang);
    await i18n.changeLanguage(lang);
    setCurrentLang(lang);
  };

  const handleLogoutConfirm = async () => {
    setLoggingOut(true);
    await logout();
    router.replace("/login");
  };

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      await deleteAccount.mutateAsync();
      await logout();
      router.replace("/login");
    } catch {
      setDeletingAccount(false);
      setShowDeleteConfirm(false);
    }
  };

  const startEditing = () => {
    setFirstName(user?.firstName ?? "");
    setLastName(user?.lastName ?? "");
    const parsed = parseStoredPhone(user?.phone ?? "");
    setPhoneCountry(parsed.country);
    setPhoneLocal(parsed.local);
    setDateOfBirthDate(parseDDMMYYYY(user?.dateOfBirth ?? ""));
    setSex((user?.sex as "male" | "female" | "non_binary") ?? "");
    const parsedId = parseIdDocument(user?.idDocument ?? "");
    setIdType(parsedId.idType);
    setIdNumber(parsedId.idNumber);
    setSaveError(null);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setSaveError(null);
  };

  const handleSave = async () => {
    setSaveError(null);
    try {
      const fullPhone = phoneLocal.trim() ? phoneCountry.code + phoneLocal.trim() : null;
      const fullId = idNumber.trim() ? `${idType}: ${idNumber.trim()}` : null;
      await updateProfile.mutateAsync({
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        phone: fullPhone,
        dateOfBirth: dateOfBirthDate ? toDDMMYYYY(dateOfBirthDate) : null,
        sex: sex || null,
        idDocument: fullId,
      });
      setIsEditing(false);
      await refreshUser();
    } catch {
      setSaveError(t("profile.saveError") || "Error al guardar el perfil.");
    }
  };

  const statusVariant = (r: RefundRequest): "success" | "warning" | "danger" | "muted" => {
    if (r.status === "approved" && r.chipZeroed) return "success";
    if (r.status === "approved") return "muted";
    if (r.status === "rejected") return "danger";
    return "warning";
  };

  const statusLabel = (r: RefundRequest) => {
    if (r.status === "approved" && r.chipZeroed) return t("profile.refundPaid");
    if (r.status === "approved") return t("profile.refundProcessing");
    if (r.status === "rejected") return t("common.rejected");
    return t("common.pending");
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
    >
    <ScrollView
      style={{ flex: 1, backgroundColor: C.background }}
      contentContainerStyle={{
        paddingTop: isWeb ? 67 : insets.top + 16,
        paddingBottom: isWeb ? 34 : insets.bottom + 100,
        paddingHorizontal: 20,
        gap: 20,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.pageTitle, { color: C.text }]}>{t("profile.title")}</Text>

      <Card>
        {!isEditing ? (
          <>
            <View style={styles.avatarRow}>
              <View style={[styles.avatar, { backgroundColor: C.primaryLight }]}>
                <Feather name="user" size={28} color={C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.userName, { color: C.text }]}>
                  {[user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Asistente"}
                </Text>
                <Text style={[styles.userEmail, { color: C.textSecondary }]}>
                  {user?.email ?? ""}
                </Text>
              </View>
            </View>

            {(user?.phone || user?.dateOfBirth || user?.sex || user?.idDocument) ? (
              <View style={[styles.extraInfo, { borderTopColor: C.border }]}>
                {user?.phone ? (
                  <View style={styles.infoRow}>
                    <Feather name="phone" size={14} color={C.textMuted} />
                    <Text style={[styles.infoText, { color: C.textSecondary }]}>{user.phone}</Text>
                  </View>
                ) : null}
                {user?.dateOfBirth ? (
                  <View style={styles.infoRow}>
                    <Feather name="calendar" size={14} color={C.textMuted} />
                    <Text style={[styles.infoText, { color: C.textSecondary }]}>{user.dateOfBirth}</Text>
                  </View>
                ) : null}
                {user?.sex ? (
                  <View style={styles.infoRow}>
                    <Feather name="users" size={14} color={C.textMuted} />
                    <Text style={[styles.infoText, { color: C.textSecondary }]}>
                      {user.sex === "male" ? t("profile.male") : user.sex === "non_binary" ? t("profile.non_binary") : t("profile.female")}
                    </Text>
                  </View>
                ) : null}
                {user?.idDocument ? (
                  <View style={styles.infoRow}>
                    <Feather name="credit-card" size={14} color={C.textMuted} />
                    <Text style={[styles.infoText, { color: C.textSecondary }]}>{user.idDocument}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            <Pressable
              onPress={startEditing}
              style={[styles.editProfileBtn, { backgroundColor: C.primaryLight, borderColor: C.primary }]}
            >
              <Feather name="edit-2" size={15} color={C.primary} />
              <Text style={[styles.editProfileBtnText, { color: C.primary }]}>
                {t("profile.editProfile") || "Editar perfil"}
              </Text>
            </Pressable>
          </>
        ) : (
          <View style={{ gap: 14 }}>
            <View style={styles.editHeader}>
              <Text style={[styles.sectionTitle, { color: C.textSecondary, marginBottom: 0 }]}>
                {t("profile.editProfile") || "Editar perfil"}
              </Text>
              <Pressable onPress={cancelEditing}>
                <Feather name="x" size={20} color={C.textMuted} />
              </Pressable>
            </View>

            <View style={{ gap: 10 }}>
              <View style={{ gap: 4 }}>
                <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>{t("profile.firstName")}</Text>
                <TextInput
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder={t("profile.firstNamePlaceholder")}
                  placeholderTextColor={C.textMuted}
                  style={[styles.input, { backgroundColor: C.card, borderColor: C.border, color: C.text }]}
                />
              </View>

              <View style={{ gap: 4 }}>
                <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>{t("profile.lastName")}</Text>
                <TextInput
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder={t("profile.lastNamePlaceholder")}
                  placeholderTextColor={C.textMuted}
                  style={[styles.input, { backgroundColor: C.card, borderColor: C.border, color: C.text }]}
                />
              </View>

              <View style={{ gap: 4 }}>
                <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>{t("profile.phone")}</Text>
                <PhoneInput
                  number={phoneLocal}
                  country={phoneCountry}
                  onNumberChange={setPhoneLocal}
                  onCountryChange={setPhoneCountry}
                  inputStyle={{ borderColor: C.border, backgroundColor: C.card }}
                />
              </View>

              <DatePickerInput
                label={t("profile.dateOfBirth")}
                value={dateOfBirthDate}
                onChange={setDateOfBirthDate}
                maximumDate={new Date()}
              />

              <View style={{ gap: 4 }}>
                <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>{t("profile.sex")}</Text>
                <View style={styles.sexRow}>
                  {(["male", "female", "non_binary"] as const).map((s) => (
                    <Pressable
                      key={s}
                      onPress={() => setSex(sex === s ? "" : s)}
                      style={[
                        styles.sexBtn,
                        {
                          backgroundColor: sex === s ? C.primaryLight : C.card,
                          borderColor: sex === s ? C.primary : C.border,
                        },
                      ]}
                    >
                      <Text style={[styles.sexBtnText, { color: sex === s ? C.primary : C.textSecondary }]}>
                        {s === "male" ? t("profile.male") : s === "female" ? t("profile.female") : t("profile.non_binary")}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={{ gap: 4 }}>
                <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>{t("profile.idType")}</Text>
                <Pressable
                  onPress={() => setShowIdTypePicker(true)}
                  style={[styles.input, { backgroundColor: C.card, borderColor: C.border, flexDirection: "row", alignItems: "center" }]}
                >
                  <Text style={{ flex: 1, color: C.text, fontSize: 15, fontFamily: "Inter_400Regular" }}>
                    {ID_TYPES.find(t => t.code === idType)?.label ?? idType}
                  </Text>
                  <Feather name="chevron-down" size={16} color={C.textMuted} />
                </Pressable>
              </View>

              <View style={{ gap: 4 }}>
                <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>{t("profile.idDocument")}</Text>
                <TextInput
                  value={idNumber}
                  onChangeText={setIdNumber}
                  placeholder="123456789"
                  placeholderTextColor={C.textMuted}
                  keyboardType="numeric"
                  style={[styles.input, { backgroundColor: C.card, borderColor: C.border, color: C.text }]}
                />
              </View>

              <Modal visible={showIdTypePicker} transparent animationType="slide">
                <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }} onPress={() => setShowIdTypePicker(false)} />
                <View style={[styles.pickerSheet, { backgroundColor: C.card }]}>
                  <View style={[styles.pickerHandle, { backgroundColor: C.border }]} />
                  <Text style={[styles.pickerTitle, { color: C.text }]}>{t("profile.idType")}</Text>
                  <FlatList
                    data={ID_TYPES}
                    keyExtractor={item => item.code}
                    renderItem={({ item }) => (
                      <Pressable
                        onPress={() => { setIdType(item.code); setShowIdTypePicker(false); }}
                        style={[styles.pickerOption, { backgroundColor: item.code === idType ? C.primary + "18" : "transparent" }]}
                      >
                        <Text style={[styles.pickerOptionText, { color: C.text }]}>{item.label}</Text>
                        {item.code === idType && <Feather name="check" size={16} color={C.primary} />}
                      </Pressable>
                    )}
                  />
                </View>
              </Modal>
            </View>

            {saveError ? (
              <Text style={{ color: C.danger, fontSize: 13, fontFamily: "Inter_400Regular" }}>{saveError}</Text>
            ) : null}

            <Pressable
              onPress={handleSave}
              disabled={updateProfile.isPending}
              style={[styles.saveBtn, { backgroundColor: C.primary, opacity: updateProfile.isPending ? 0.7 : 1 }]}
            >
              {updateProfile.isPending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.saveBtnText}>{t("profile.save")}</Text>
              )}
            </Pressable>
          </View>
        )}
      </Card>

      <View>
        <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>
          {t("profile.language")}
        </Text>
        <View style={styles.langRow}>
          {[
            { code: "es", label: t("profile.spanish") },
            { code: "en", label: t("profile.english") },
          ].map((lang) => (
            <Pressable
              key={lang.code}
              onPress={() => handleLanguage(lang.code)}
              style={[
                styles.langBtn,
                {
                  backgroundColor: currentLang === lang.code ? C.primaryLight : C.card,
                  borderColor: currentLang === lang.code ? C.primary : C.border,
                },
              ]}
            >
              <Text style={[styles.langText, { color: currentLang === lang.code ? C.primary : C.textSecondary }]}>
                {lang.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View>
        <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>
          {t("profile.myRefunds")}
        </Text>
        {refunds.length === 0 ? (
          <View style={[styles.emptyRefunds, { backgroundColor: C.card, borderColor: C.border }]}>
            <Feather name="inbox" size={24} color={C.textMuted} />
            <Text style={[styles.emptyRefundText, { color: C.textMuted }]}>
              {t("profile.noRefunds")}
            </Text>
          </View>
        ) : (
          refunds.map((r) => (
            <Card key={r.id} style={{ marginBottom: 8 }}>
              <View style={styles.refundRow}>
                <View style={{ flex: 1 }}>
                  {r.eventName ? (
                    <Text style={[styles.refundEventName, { color: C.text }]}>{r.eventName}</Text>
                  ) : null}
                  <Text style={[styles.refundUid, { color: r.eventName ? C.textMuted : C.text }]}>{r.braceletUid}</Text>
                  <Text style={[styles.refundDate, { color: C.textMuted }]}>
                    {formatDate(r.createdAt)} · {r.refundMethod}
                  </Text>
                </View>
                <View style={styles.refundRight}>
                  {r.amount > 0 && (
                    <CopAmount amount={r.amount} positive size={14} />
                  )}
                  <Badge
                    label={statusLabel(r)}
                    variant={statusVariant(r)}
                  />
                </View>
              </View>
            </Card>
          ))
        )}
      </View>

      <Pressable
        onPress={() => router.push("/saved-cards" as never)}
        style={[styles.navLink, { backgroundColor: C.card, borderColor: C.border }]}
      >
        <Feather name="credit-card" size={18} color={C.primary} />
        <Text style={[styles.navLinkText, { color: C.text }]}>{t("profile.savedCards")}</Text>
        <Feather name="chevron-right" size={16} color={C.textMuted} />
      </Pressable>

      {!showLogoutConfirm ? (
        <Pressable
          onPress={() => setShowLogoutConfirm(true)}
          style={[styles.logoutBtn, { backgroundColor: C.dangerLight, borderColor: C.danger }]}
        >
          <Feather name="log-out" size={18} color={C.danger} />
          <Text style={[styles.logoutText, { color: C.danger }]}>{t("profile.logout")}</Text>
        </Pressable>
      ) : (
        <View style={[styles.logoutConfirm, { backgroundColor: C.dangerLight, borderColor: C.danger }]}>
          <Text style={[styles.logoutConfirmText, { color: C.danger }]}>
            {t("auth.logoutConfirm")}
          </Text>
          <View style={styles.logoutConfirmBtns}>
            <Pressable
              onPress={() => setShowLogoutConfirm(false)}
              style={[styles.logoutCancelBtn, { backgroundColor: C.card, borderColor: C.border }]}
            >
              <Text style={[styles.logoutCancelText, { color: C.textSecondary }]}>
                {t("common.cancel")}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleLogoutConfirm}
              disabled={loggingOut}
              style={[styles.logoutConfirmBtn, { backgroundColor: C.danger, opacity: loggingOut ? 0.6 : 1 }]}
            >
              <Feather name="log-out" size={15} color="#fff" />
              <Text style={styles.logoutConfirmBtnText}>
                {loggingOut ? "..." : t("common.logout")}
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {!showDeleteConfirm ? (
        <Pressable
          onPress={() => setShowDeleteConfirm(true)}
          style={[styles.deleteAccountBtn, { borderColor: C.border }]}
        >
          <Feather name="trash-2" size={16} color={C.textMuted} />
          <Text style={[styles.deleteAccountText, { color: C.textMuted }]}>{t("profile.deleteAccount")}</Text>
        </Pressable>
      ) : (
        <View style={[styles.logoutConfirm, { backgroundColor: C.dangerLight, borderColor: C.danger }]}>
          <Feather name="alert-triangle" size={22} color={C.danger} style={{ alignSelf: "center" }} />
          <Text style={[styles.logoutConfirmText, { color: C.danger }]}>
            {t("profile.deleteAccountConfirm")}
          </Text>
          <Text style={[styles.deleteAccountWarning, { color: C.textSecondary }]}>
            {t("profile.deleteAccountWarning")}
          </Text>
          <View style={styles.logoutConfirmBtns}>
            <Pressable
              onPress={() => setShowDeleteConfirm(false)}
              style={[styles.logoutCancelBtn, { backgroundColor: C.card, borderColor: C.border }]}
            >
              <Text style={[styles.logoutCancelText, { color: C.textSecondary }]}>
                {t("common.cancel")}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleDeleteAccount}
              disabled={deletingAccount}
              style={[styles.logoutConfirmBtn, { backgroundColor: C.danger, opacity: deletingAccount ? 0.6 : 1 }]}
            >
              <Feather name="trash-2" size={15} color="#fff" />
              <Text style={styles.logoutConfirmBtnText}>
                {deletingAccount ? "..." : t("profile.deleteAccountConfirmBtn")}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  pageTitle: { fontSize: 24, fontFamily: "Inter_700Bold" },
  avatarRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  userName: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  userEmail: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  editBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  navLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  navLinkText: { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  editProfileBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    marginTop: 12,
  },
  editProfileBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  extraInfo: { borderTopWidth: 1, marginTop: 14, paddingTop: 14, gap: 8 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  infoText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  editHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  input: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  sexRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  sexBtn: { flex: 1, minWidth: 90, paddingVertical: 12, alignItems: "center", borderRadius: 12, borderWidth: 1.5 },
  sexBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  pickerSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingBottom: 32,
    maxHeight: "60%",
  },
  pickerHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 10, marginBottom: 14 },
  pickerTitle: { fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 8 },
  pickerOption: { flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 8, borderRadius: 8 },
  pickerOptionText: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  saveBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  saveBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  langRow: { flexDirection: "row", gap: 10 },
  langBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1.5,
  },
  langText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  emptyRefunds: {
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
  },
  emptyRefundText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  refundRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  refundRight: { alignItems: "flex-end", gap: 4 },
  refundEventName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  refundUid: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  refundDate: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  logoutText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  logoutConfirm: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  logoutConfirmText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  logoutConfirmBtns: {
    flexDirection: "row",
    gap: 10,
  },
  logoutCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
  },
  logoutCancelText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  logoutConfirmBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
  },
  logoutConfirmBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  deleteAccountBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  deleteAccountText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  deleteAccountWarning: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
});
