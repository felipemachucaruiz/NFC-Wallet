import React, { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
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

export function LocationMapPicker({ visible, initialLatitude, initialLongitude, onConfirm, onClose }: Props) {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();

  const [lat, setLat] = useState(initialLatitude != null ? String(initialLatitude) : "");
  const [lng, setLng] = useState(initialLongitude != null ? String(initialLongitude) : "");
  const [address, setAddress] = useState("");

  useEffect(() => {
    if (visible) {
      setLat(initialLatitude != null ? String(initialLatitude) : "");
      setLng(initialLongitude != null ? String(initialLongitude) : "");
      setAddress("");
    }
  }, [visible, initialLatitude, initialLongitude]);

  const handleConfirm = () => {
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    if (isNaN(latitude) || isNaN(longitude)) return;
    onConfirm({ address, latitude, longitude });
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: C.background, paddingTop: insets.top + 16 }]}>
        <View style={[styles.header, { borderBottomColor: C.border }]}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Feather name="x" size={22} color={C.textSecondary} />
          </Pressable>
          <Text style={[styles.title, { color: C.text }]}>{t("admin.locationPickerTitle")}</Text>
          <View style={{ width: 22 }} />
        </View>

        <View style={styles.content}>
          <Text style={[styles.hint, { color: C.textMuted }]}>
            {t("admin.pickLocationPrompt")}
          </Text>
          <Text style={[styles.label, { color: C.textSecondary }]}>{t("admin.venue")}</Text>
          <TextInput
            value={address}
            onChangeText={setAddress}
            placeholder={t("admin.venuePlaceholder")}
            placeholderTextColor={C.textMuted}
            style={[styles.input, { backgroundColor: C.inputBg, borderColor: C.border, color: C.text }]}
          />
          <Text style={[styles.label, { color: C.textSecondary }]}>{t("admin.latitude")} *</Text>
          <TextInput
            value={lat}
            onChangeText={setLat}
            placeholder="4.7110"
            placeholderTextColor={C.textMuted}
            keyboardType="decimal-pad"
            style={[styles.input, { backgroundColor: C.inputBg, borderColor: C.border, color: C.text }]}
          />
          <Text style={[styles.label, { color: C.textSecondary }]}>{t("admin.longitude")} *</Text>
          <TextInput
            value={lng}
            onChangeText={setLng}
            placeholder="-74.0721"
            placeholderTextColor={C.textMuted}
            keyboardType="decimal-pad"
            style={[styles.input, { backgroundColor: C.inputBg, borderColor: C.border, color: C.text }]}
          />
          <Pressable
            style={[styles.confirmBtn, { backgroundColor: C.primary }]}
            onPress={handleConfirm}
          >
            <Text style={styles.confirmText}>{t("admin.confirmLocation")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  content: { padding: 20, gap: 10 },
  hint: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 8 },
  label: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.6 },
  input: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  confirmBtn: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  confirmText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#0a0a0a" },
});
