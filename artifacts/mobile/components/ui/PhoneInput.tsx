import Colors from "@/constants/colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

export const COUNTRY_CODES = [
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

export type CountryCode = (typeof COUNTRY_CODES)[number];

interface PhoneInputProps {
  label?: string;
  number: string;
  onNumberChange: (v: string) => void;
  country: CountryCode;
  onCountryChange: (c: CountryCode) => void;
  placeholder?: string;
  error?: string;
}

export function PhoneInput({
  label,
  number,
  onNumberChange,
  country,
  onCountryChange,
  placeholder = "300 123 4567",
  error,
}: PhoneInputProps) {
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const [showPicker, setShowPicker] = useState(false);

  return (
    <View style={styles.wrapper}>
      {label ? (
        <Text style={[styles.label, { color: C.textSecondary }]}>{label}</Text>
      ) : null}

      <View
        style={[
          styles.row,
          {
            backgroundColor: C.inputBg,
            borderColor: error ? C.danger : C.border,
          },
        ]}
      >
        <Pressable
          onPress={() => setShowPicker(true)}
          style={[styles.codeBtn, { borderRightColor: C.border }]}
        >
          <Text style={styles.flag}>{country.flag}</Text>
          <Text style={[styles.code, { color: C.text }]}>{country.code}</Text>
          <Feather name="chevron-down" size={12} color={C.textMuted} />
        </Pressable>

        <TextInput
          style={[styles.input, { color: C.text }]}
          value={number}
          onChangeText={onNumberChange}
          placeholder={placeholder}
          placeholderTextColor={C.textMuted}
          keyboardType="phone-pad"
          autoComplete="tel"
        />
      </View>

      {error ? (
        <Text style={[styles.errorText, { color: C.danger }]}>{error}</Text>
      ) : null}

      <Modal visible={showPicker} transparent animationType="slide">
        <Pressable
          style={[styles.overlay, { backgroundColor: C.overlay }]}
          onPress={() => setShowPicker(false)}
        />
        <View style={[styles.sheet, { backgroundColor: C.card }]}>
          <View style={[styles.sheetHandle, { backgroundColor: C.border }]} />
          <Text style={[styles.sheetTitle, { color: C.text }]}>
            Código de país
          </Text>
          <FlatList
            data={COUNTRY_CODES}
            keyExtractor={(item) => item.code}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  onCountryChange(item);
                  setShowPicker(false);
                }}
                style={[
                  styles.option,
                  {
                    backgroundColor:
                      item.code === country.code
                        ? C.primary + "18"
                        : "transparent",
                  },
                ]}
              >
                <Text style={styles.optionFlag}>{item.flag}</Text>
                <Text style={[styles.optionName, { color: C.text }]}>
                  {item.name}
                </Text>
                <Text style={[styles.optionCode, { color: C.textSecondary }]}>
                  {item.code}
                </Text>
                {item.code === country.code && (
                  <Feather name="check" size={16} color={C.primary} />
                )}
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 6 },
  label: { fontSize: 13, fontWeight: "500" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    overflow: "hidden",
    minHeight: 48,
  },
  codeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRightWidth: 1,
  },
  flag: { fontSize: 20 },
  code: { fontSize: 14, fontWeight: "600" },
  input: {
    flex: 1,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  errorText: { fontSize: 12 },
  overlay: { flex: 1 },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    maxHeight: "70%",
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  optionFlag: { fontSize: 22 },
  optionName: { flex: 1, fontSize: 15 },
  optionCode: { fontSize: 14, fontWeight: "600" },
});
