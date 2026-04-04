import React, { useState, useEffect, useCallback } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useColorScheme } from "@/hooks/useColorScheme";
import Colors from "@/constants/colors";

export type LocationResult = {
  address: string;
  latitude: number;
  longitude: number;
};

type Props = {
  visible: boolean;
  initialLatitude?: number | null;
  initialLongitude?: number | null;
  onConfirm: (result: LocationResult) => void;
  onClose: () => void;
};

const DEFAULT_LAT = 4.711;
const DEFAULT_LNG = -74.0721;

export function LocationMapPicker({ visible, initialLatitude, initialLongitude, onConfirm, onClose }: Props) {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();

  const [latText, setLatText] = useState("");
  const [lngText, setLngText] = useState("");
  const [address, setAddress] = useState("");
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (visible) {
      setLatText(initialLatitude != null ? String(initialLatitude) : "");
      setLngText(initialLongitude != null ? String(initialLongitude) : "");
      setAddress("");
      setError("");
    }
  }, [visible, initialLatitude, initialLongitude]);

  const handleUseCurrentLocation = useCallback(async () => {
    setLocating(true);
    setError("");
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setError(t("admin.locationPermissionDenied"));
        setLocating(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLatText(loc.coords.latitude.toFixed(6));
      setLngText(loc.coords.longitude.toFixed(6));
      setAddress("");
    } catch {
      setError(t("admin.locationError"));
    }
    setLocating(false);
  }, [t]);

  const handleOpenInMaps = useCallback(() => {
    const lat = parseFloat(latText);
    const lng = parseFloat(lngText);
    if (!isNaN(lat) && !isNaN(lng)) {
      const url = `https://www.google.com/maps?q=${lat},${lng}`;
      Linking.openURL(url);
    }
  }, [latText, lngText]);

  const handleConfirm = useCallback(() => {
    setError("");
    const lat = parseFloat(latText.trim());
    const lng = parseFloat(lngText.trim());
    if (isNaN(lat) || lat < -90 || lat > 90) {
      setError(t("admin.latInvalid") || "Latitude must be between -90 and 90");
      return;
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      setError(t("admin.lngInvalid") || "Longitude must be between -180 and 180");
      return;
    }
    Keyboard.dismiss();
    onConfirm({ address: address.trim() || `${lat.toFixed(6)}, ${lng.toFixed(6)}`, latitude: lat, longitude: lng });
  }, [latText, lngText, address, onConfirm, t]);

  const hasCoords = !isNaN(parseFloat(latText)) && !isNaN(parseFloat(lngText));

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.container, { backgroundColor: C.background }]}>

          {/* Header */}
          <View style={[styles.header, { backgroundColor: C.card, paddingTop: insets.top + 8, borderBottomColor: C.border }]}>
            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
              <Feather name="x" size={22} color={C.textSecondary} />
            </Pressable>
            <Text style={[styles.headerTitle, { color: C.text }]}>{t("admin.locationPickerTitle")}</Text>
            <View style={{ width: 34 }} />
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 20, gap: 16 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Use current location */}
            <TouchableOpacity
              style={[styles.gpsBtn, { backgroundColor: C.primaryLight, borderColor: C.primary }]}
              onPress={handleUseCurrentLocation}
              disabled={locating}
              activeOpacity={0.8}
            >
              {locating ? (
                <ActivityIndicator size="small" color={C.primary} />
              ) : (
                <Feather name="navigation" size={18} color={C.primary} />
              )}
              <Text style={[styles.gpsBtnText, { color: C.primary }]}>
                {locating ? t("common.loading") || "Detecting…" : t("admin.useMyLocation") || "Use my current location"}
              </Text>
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: C.border }]} />
              <Text style={[styles.dividerText, { color: C.textMuted }]}>{t("common.or") || "or enter manually"}</Text>
              <View style={[styles.dividerLine, { backgroundColor: C.border }]} />
            </View>

            {/* Address */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: C.textSecondary }]}>{t("admin.venue") || "Venue / Address (optional)"}</Text>
              <TextInput
                style={[styles.input, { backgroundColor: C.inputBg, color: C.text, borderColor: C.border }]}
                placeholderTextColor={C.textMuted}
                placeholder={t("admin.searchVenuePlaceholder") || "e.g. Parque Simón Bolívar, Bogotá"}
                value={address}
                onChangeText={setAddress}
                returnKeyType="next"
              />
            </View>

            {/* Latitude */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: C.textSecondary }]}>{t("admin.latitude") || "Latitude"}</Text>
              <TextInput
                style={[styles.input, { backgroundColor: C.inputBg, color: C.text, borderColor: C.border }]}
                placeholderTextColor={C.textMuted}
                placeholder="e.g. 4.711000"
                value={latText}
                onChangeText={setLatText}
                keyboardType="decimal-pad"
                returnKeyType="next"
              />
            </View>

            {/* Longitude */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: C.textSecondary }]}>{t("admin.longitude") || "Longitude"}</Text>
              <TextInput
                style={[styles.input, { backgroundColor: C.inputBg, color: C.text, borderColor: C.border }]}
                placeholderTextColor={C.textMuted}
                placeholder="e.g. -74.072100"
                value={lngText}
                onChangeText={setLngText}
                keyboardType="decimal-pad"
                returnKeyType="done"
                onSubmitEditing={handleConfirm}
              />
            </View>

            {/* Hint */}
            <View style={[styles.hintCard, { backgroundColor: C.card, borderColor: C.border }]}>
              <Feather name="info" size={14} color={C.textMuted} />
              <Text style={[styles.hintText, { color: C.textMuted }]}>
                {t("admin.coordsHint") || "Open Google Maps, long-press your venue, then copy the coordinates shown at the bottom."}
              </Text>
            </View>

            {/* Open in maps (if coords set) */}
            {hasCoords && (
              <TouchableOpacity
                style={[styles.mapsLink, { borderColor: C.border }]}
                onPress={handleOpenInMaps}
                activeOpacity={0.75}
              >
                <Feather name="map" size={15} color={C.primary} />
                <Text style={[styles.mapsLinkText, { color: C.primary }]}>
                  {t("admin.verifyOnMaps") || "Verify on Google Maps"}
                </Text>
                <Feather name="external-link" size={13} color={C.primary} />
              </TouchableOpacity>
            )}

            {/* Error */}
            {!!error && (
              <View style={[styles.errorCard, { backgroundColor: C.dangerLight, borderColor: C.danger }]}>
                <Feather name="alert-circle" size={14} color={C.danger} />
                <Text style={[styles.errorText, { color: C.danger }]}>{error}</Text>
              </View>
            )}
          </ScrollView>

          {/* Confirm footer */}
          <View style={[styles.footer, { backgroundColor: C.card, paddingBottom: insets.bottom + 16, borderTopColor: C.border }]}>
            <TouchableOpacity
              style={[styles.confirmBtn, { backgroundColor: C.primary, opacity: hasCoords ? 1 : 0.4 }]}
              onPress={handleConfirm}
              disabled={!hasCoords}
              activeOpacity={0.85}
            >
              <Feather name="check" size={18} color="#0a0a0a" />
              <Text style={styles.confirmText}>{t("admin.confirmLocation")}</Text>
            </TouchableOpacity>
          </View>

        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  closeBtn: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  gpsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  gpsBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  fieldGroup: { gap: 6 },
  label: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  input: {
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  hintCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  hintText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
  mapsLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  mapsLinkText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  errorText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  confirmText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#0a0a0a" },
});
