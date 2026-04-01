import { useColorScheme } from "@/hooks/useColorScheme";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Colors from "@/constants/colors";
import { Button } from "@/components/ui/Button";

interface DatePickerInputProps {
  label?: string;
  value: Date | null;
  onChange: (date: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  placeholder?: string;
}

function formatDisplay(date: Date | null): string {
  if (!date) return "";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function toInputValue(date: Date | null): string {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function DatePickerInput({
  label,
  value,
  onChange,
  minimumDate,
  maximumDate,
  placeholder = "Select date",
}: DatePickerInputProps) {
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const [showPicker, setShowPicker] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(value ?? new Date());

  if (Platform.OS === "web") {
    return (
      <View style={styles.wrapper}>
        {label ? <Text style={[styles.label, { color: C.textSecondary }]}>{label}</Text> : null}
        <View style={[styles.inputRow, { backgroundColor: C.inputBg, borderColor: C.border }]}>
          <Feather name="calendar" size={16} color={C.textMuted} style={{ marginRight: 8 }} />
          <input
            type="date"
            value={toInputValue(value)}
            min={toInputValue(minimumDate ?? null)}
            max={toInputValue(maximumDate ?? null)}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw) {
                const [y, m, d] = raw.split("-").map(Number);
                const parsed = new Date(y, m - 1, d);
                if (!isNaN(parsed.getTime())) onChange(parsed);
              }
            }}
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: 16,
              fontFamily: "Inter_400Regular",
              color: value ? C.text : C.textMuted,
              cursor: "pointer",
            } as React.CSSProperties}
          />
        </View>
      </View>
    );
  }

  if (Platform.OS === "android") {
    return (
      <View style={styles.wrapper}>
        {label ? <Text style={[styles.label, { color: C.textSecondary }]}>{label}</Text> : null}
        <Pressable
          onPress={() => setShowPicker(true)}
          style={[styles.inputRow, { backgroundColor: C.inputBg, borderColor: C.border }]}
        >
          <Feather name="calendar" size={16} color={C.textMuted} style={{ marginRight: 8 }} />
          <Text style={[styles.valueText, { color: value ? C.text : C.textMuted }]}>
            {value ? formatDisplay(value) : placeholder}
          </Text>
        </Pressable>
        {showPicker && (
          <DateTimePicker
            value={value ?? new Date()}
            mode="date"
            display="default"
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            onChange={(_: DateTimePickerEvent, selected?: Date) => {
              setShowPicker(false);
              if (selected) onChange(selected);
            }}
          />
        )}
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      {label ? <Text style={[styles.label, { color: C.textSecondary }]}>{label}</Text> : null}
      <Pressable
        onPress={() => {
          setTempDate(value ?? new Date());
          setShowPicker(true);
        }}
        style={[styles.inputRow, { backgroundColor: C.inputBg, borderColor: C.border }]}
      >
        <Feather name="calendar" size={16} color={C.textMuted} style={{ marginRight: 8 }} />
        <Text style={[styles.valueText, { color: value ? C.text : C.textMuted }]}>
          {value ? formatDisplay(value) : placeholder}
        </Text>
        <Feather name="chevron-down" size={14} color={C.textMuted} />
      </Pressable>

      <Modal visible={showPicker} transparent animationType="slide">
        <View style={[styles.modalOverlay, { backgroundColor: C.overlay }]}>
          <View style={[styles.modalSheet, { backgroundColor: C.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: C.text }]}>{label ?? "Select date"}</Text>
            </View>
            <DateTimePicker
              value={tempDate}
              mode="date"
              display="spinner"
              minimumDate={minimumDate}
              maximumDate={maximumDate}
              textColor={C.text}
              themeVariant={scheme === "dark" ? "dark" : "light"}
              onChange={(_: DateTimePickerEvent, selected?: Date) => {
                if (selected) setTempDate(selected);
              }}
              style={{ width: "100%" }}
            />
            <View style={styles.modalActions}>
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => setShowPicker(false)}
              />
              <Button
                title="Confirm"
                variant="primary"
                onPress={() => {
                  onChange(tempDate);
                  setShowPicker(false);
                }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 6 },
  label: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  valueText: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 32,
    paddingTop: 8,
  },
  modalHeader: {
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  modalTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
});
