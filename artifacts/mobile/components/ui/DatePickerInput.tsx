import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import React, { useState, useMemo } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
} from "react-native";
import Colors from "@/constants/colors";

const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const MONTHS_SHORT_ES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];
const DAYS_ES = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sá"];
const DAYS_LONG_ES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function formatDisplay(date: Date | null): string {
  if (!date) return "";
  const day = date.getDate();
  const month = MONTHS_SHORT_ES[date.getMonth()];
  const year = date.getFullYear();
  return `${day} de ${month} de ${year}`;
}

function formatDisplayShort(date: Date): string {
  const dayName = DAYS_LONG_ES[date.getDay()].slice(0, 3);
  const day = date.getDate();
  const month = MONTHS_SHORT_ES[date.getMonth()];
  return `${dayName}, ${day} de ${month}`;
}

function toInputValue(date: Date | null): string {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getCalendarDays(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay();
  const days: Date[] = [];

  for (let i = startDow - 1; i >= 0; i--) {
    days.push(new Date(year, month, -i));
  }
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(year, month, d));
  }
  const remaining = 42 - days.length;
  for (let d = 1; d <= remaining; d++) {
    days.push(new Date(year, month + 1, d));
  }
  return days;
}

interface DatePickerInputProps {
  label?: string;
  value: Date | null;
  onChange: (date: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  placeholder?: string;
}

export function DatePickerInput({
  label,
  value,
  onChange,
  minimumDate,
  maximumDate,
  placeholder = "Seleccionar fecha",
}: DatePickerInputProps) {
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const [showPicker, setShowPicker] = useState(false);

  const initialDate = value ?? new Date();
  const [viewYear, setViewYear] = useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth());
  const [tempDate, setTempDate] = useState<Date>(initialDate);

  const openPicker = () => {
    const base = value ?? new Date();
    setViewYear(base.getFullYear());
    setViewMonth(base.getMonth());
    setTempDate(base);
    setShowPicker(true);
  };

  const today = new Date();

  const calDays = useMemo(
    () => getCalendarDays(viewYear, viewMonth),
    [viewYear, viewMonth]
  );

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const isDisabled = (d: Date) => {
    if (minimumDate && d < new Date(minimumDate.getFullYear(), minimumDate.getMonth(), minimumDate.getDate())) return true;
    if (maximumDate && d > new Date(maximumDate.getFullYear(), maximumDate.getMonth(), maximumDate.getDate())) return true;
    return false;
  };

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

  return (
    <View style={styles.wrapper}>
      {label ? <Text style={[styles.label, { color: C.textSecondary }]}>{label}</Text> : null}

      <Pressable
        onPress={openPicker}
        style={[styles.inputRow, { backgroundColor: C.inputBg, borderColor: C.border }]}
      >
        <Feather name="calendar" size={16} color={value ? C.primary : C.textMuted} style={{ marginRight: 8 }} />
        <Text style={[styles.valueText, { color: value ? C.text : C.textMuted }]}>
          {value ? formatDisplay(value) : placeholder}
        </Text>
        <Feather name="chevron-down" size={14} color={C.textMuted} />
      </Pressable>

      <Modal visible={showPicker} transparent animationType="slide" statusBarTranslucent>
        <Pressable style={[styles.overlay, { backgroundColor: C.overlay }]} onPress={() => setShowPicker(false)} />

        <View style={[styles.sheet, { backgroundColor: C.card }]}>
          <View style={[styles.handle, { backgroundColor: C.border }]} />

          <View style={[styles.headerBar, { backgroundColor: scheme === "dark" ? "#0a0a0a" : "#1A56DB" }]}>
            <Text style={styles.headerYear}>{tempDate.getFullYear()}</Text>
            <Text style={styles.headerDate}>{formatDisplayShort(tempDate)}</Text>
          </View>

          <View style={[styles.monthNav, { borderBottomColor: C.separator }]}>
            <TouchableOpacity onPress={prevMonth} style={styles.navBtn} hitSlop={12}>
              <Feather name="chevron-left" size={22} color={C.text} />
            </TouchableOpacity>

            <Text style={[styles.monthLabel, { color: C.text }]}>
              {MONTHS_ES[viewMonth]} de {viewYear}
            </Text>

            <TouchableOpacity onPress={nextMonth} style={styles.navBtn} hitSlop={12}>
              <Feather name="chevron-right" size={22} color={C.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.dayNamesRow}>
            {DAYS_ES.map((d) => (
              <Text key={d} style={[styles.dayName, { color: C.textMuted }]}>{d}</Text>
            ))}
          </View>

          <View style={styles.grid}>
            {calDays.map((d, i) => {
              const isCurrentMonth = d.getMonth() === viewMonth;
              const isSelected = sameDay(d, tempDate);
              const isToday = sameDay(d, today);
              const disabled = isDisabled(d);
              const isPrimary = C.primary;

              return (
                <TouchableOpacity
                  key={i}
                  onPress={() => {
                    if (disabled) return;
                    setTempDate(d);
                    if (!isCurrentMonth) {
                      setViewYear(d.getFullYear());
                      setViewMonth(d.getMonth());
                    }
                  }}
                  style={[
                    styles.dayCell,
                    isSelected && { backgroundColor: isPrimary },
                    !isSelected && isToday && {
                      borderWidth: 1.5,
                      borderColor: isPrimary,
                    },
                  ]}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.dayText,
                      isSelected && { color: scheme === "dark" ? "#0a0a0a" : "#ffffff", fontFamily: "Inter_700Bold" },
                      !isSelected && isCurrentMonth && !disabled && { color: C.text },
                      !isSelected && !isCurrentMonth && { color: C.textMuted },
                      !isSelected && disabled && { color: C.textMuted, opacity: 0.35 },
                      !isSelected && isToday && !disabled && { color: isPrimary, fontFamily: "Inter_600SemiBold" },
                    ]}
                  >
                    {d.getDate()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={[styles.actions, { borderTopColor: C.separator }]}>
            <Pressable onPress={() => setShowPicker(false)} style={styles.actionBtn}>
              <Text style={[styles.actionText, { color: C.textSecondary }]}>Cancelar</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                onChange(tempDate);
                setShowPicker(false);
              }}
              style={styles.actionBtn}
            >
              <Text style={[styles.actionText, { color: C.primary, fontFamily: "Inter_700Bold" }]}>
                Aceptar
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const CELL_SIZE = 40;

const styles = StyleSheet.create({
  wrapper: { gap: 6 },
  label: { fontSize: 13, fontFamily: "Inter_500Medium" },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  valueText: { flex: 1, fontSize: 16, fontFamily: "Inter_400Regular" },

  overlay: { flex: 1 },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
    paddingBottom: 32,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 2,
  },

  headerBar: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 2,
  },
  headerYear: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.5,
  },
  headerDate: {
    color: "#ffffff",
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },

  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  navBtn: {
    padding: 4,
    borderRadius: 8,
  },
  monthLabel: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },

  dayNamesRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: 8,
    paddingTop: 12,
    paddingBottom: 6,
  },
  dayName: {
    width: CELL_SIZE,
    textAlign: "center",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.3,
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-around",
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  dayCell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: CELL_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 2,
  },
  dayText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },

  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  actionText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
  },
});
