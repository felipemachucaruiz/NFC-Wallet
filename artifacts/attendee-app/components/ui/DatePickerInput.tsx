import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Colors from "@/constants/colors";
import { useTranslation } from "react-i18next";

type CalendarView = "days" | "months" | "years";

const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const MONTHS_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_SHORT_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const MONTHS_SHORT_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS_ES = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];
const DAYS_EN = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const DAYS_LONG_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DAYS_LONG_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function formatDisplay(date: Date | null, lang: string): string {
  if (!date) return "";
  const day = date.getDate();
  const monthsShort = lang === "es" ? MONTHS_SHORT_ES : MONTHS_SHORT_EN;
  const month = monthsShort[date.getMonth()];
  const year = date.getFullYear();
  return lang === "es" ? `${day} de ${month} de ${year}` : `${month} ${day}, ${year}`;
}

function formatDisplayShort(date: Date, lang: string): string {
  const daysLong = lang === "es" ? DAYS_LONG_ES : DAYS_LONG_EN;
  const monthsShort = lang === "es" ? MONTHS_SHORT_ES : MONTHS_SHORT_EN;
  const dayName = daysLong[date.getDay()];
  const day = date.getDate();
  const month = monthsShort[date.getMonth()];
  return lang === "es" ? `${dayName}, ${day} de ${month}` : `${dayName}, ${month} ${day}`;
}

function toInputValue(date: Date | null): string {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Monday-first: Mon=0, Tue=1, ..., Sun=6
function getCalendarDays(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7;
  const days: Date[] = [];
  for (let i = startDow; i > 0; i--) {
    days.push(new Date(year, month, 1 - i));
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
  error?: boolean;
}

export function DatePickerInput({
  label,
  value,
  onChange,
  minimumDate,
  maximumDate,
  placeholder,
  error,
}: DatePickerInputProps) {
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const [showPicker, setShowPicker] = useState(false);
  const { t, i18n } = useTranslation();
  const lang = i18n.language === "es" ? "es" : "en";

  const months = lang === "es" ? MONTHS_ES : MONTHS_EN;
  const monthsShort = lang === "es" ? MONTHS_SHORT_ES : MONTHS_SHORT_EN;
  const days = lang === "es" ? DAYS_ES : DAYS_EN;
  const resolvedPlaceholder = placeholder || t("common.selectDate");

  const initialBase = value ?? new Date(2000, 0, 1);
  const [viewYear, setViewYear] = useState(initialBase.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialBase.getMonth());
  const [viewType, setViewType] = useState<CalendarView>("days");

  const today = new Date();
  const currentYear = today.getFullYear();
  const years = useMemo(
    () => Array.from({ length: currentYear - 1930 + 1 }, (_, i) => currentYear - i),
    [currentYear],
  );

  const yearScrollRef = useRef<ScrollView>(null);

  // Keep view position in sync with value whenever picker is closed
  useEffect(() => {
    if (!showPicker && value) {
      setViewYear(value.getFullYear());
      setViewMonth(value.getMonth());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (viewType !== "years") return;
    const idx = years.indexOf(viewYear);
    if (idx === -1) return;
    const rowIdx = Math.floor(idx / 3);
    const rowHeight = 46;
    const offset = Math.max(0, rowIdx * rowHeight - 110);
    const timer = setTimeout(() => {
      yearScrollRef.current?.scrollTo({ y: offset, animated: false });
    }, 50);
    return () => clearTimeout(timer);
  }, [viewType, viewYear, years]);

  const openPicker = () => {
    const base = value ?? new Date(2000, 0, 1);
    setViewYear(base.getFullYear());
    setViewMonth(base.getMonth());
    setViewType("days");
    setShowPicker(true);
  };

  const calDays = useMemo(
    () => getCalendarDays(viewYear, viewMonth),
    [viewYear, viewMonth],
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

  const headerDate = value ?? new Date(2000, 0, 1);

  // Month rows for the months grid (4 rows × 3 cols)
  const monthRows = useMemo(
    () => Array.from({ length: 4 }, (_, i) => monthsShort.slice(i * 3, i * 3 + 3)),
    [monthsShort],
  );

  // Year rows for the years grid (ceil(n/3) rows × 3 cols)
  const yearRows = useMemo(() => {
    const rows: number[][] = [];
    for (let i = 0; i < years.length; i += 3) {
      rows.push(years.slice(i, i + 3));
    }
    return rows;
  }, [years]);

  if (Platform.OS === "web") {
    return (
      <View style={styles.wrapper}>
        {label ? <Text style={[styles.label, { color: C.textSecondary }]}>{label}</Text> : null}
        <View style={[styles.inputRow, { backgroundColor: C.inputBg, borderColor: error ? C.danger : C.border }]}>
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
        style={[styles.inputRow, { backgroundColor: C.inputBg, borderColor: error ? C.danger : C.border }]}
      >
        <Feather name="calendar" size={16} color={value ? C.primary : C.textMuted} style={{ marginRight: 8 }} />
        <Text style={[styles.valueText, { color: value ? C.text : C.textMuted }]}>
          {value ? formatDisplay(value, lang) : resolvedPlaceholder}
        </Text>
        <Feather name="chevron-down" size={14} color={C.textMuted} />
      </Pressable>

      <Modal visible={showPicker} transparent animationType="slide" statusBarTranslucent>
        <Pressable style={[styles.overlay, { backgroundColor: C.overlay }]} onPress={() => setShowPicker(false)} />

        <View style={[styles.sheet, { backgroundColor: C.card }]}>
          <View style={[styles.handle, { backgroundColor: C.border }]} />

          <View style={[styles.headerBar, { backgroundColor: scheme === "dark" ? "#0a0a0a" : "#1A56DB" }]}>
            <Text style={styles.headerYear}>{headerDate.getFullYear()}</Text>
            <Text style={styles.headerDate}>{formatDisplayShort(headerDate, lang)}</Text>
          </View>

          {/* Caption: clickable month/year + prev/next arrows */}
          <View style={[styles.monthNav, { borderBottomColor: C.separator }]}>
            <TouchableOpacity
              onPress={prevMonth}
              style={[styles.navBtn, viewType !== "days" && styles.navBtnHidden]}
              disabled={viewType !== "days"}
              hitSlop={12}
            >
              <Feather name="chevron-left" size={22} color={C.text} />
            </TouchableOpacity>

            <View style={styles.captionCenter}>
              <TouchableOpacity onPress={() => setViewType(v => v === "months" ? "days" : "months")}>
                <Text style={[styles.captionBtn, { color: viewType === "months" ? C.primary : C.text }]}>
                  {months[viewMonth]}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setViewType(v => v === "years" ? "days" : "years")}>
                <Text style={[styles.captionBtn, styles.captionBtnYear, { color: viewType === "years" ? C.primary : C.text }]}>
                  {viewYear}
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={nextMonth}
              style={[styles.navBtn, viewType !== "days" && styles.navBtnHidden]}
              disabled={viewType !== "days"}
              hitSlop={12}
            >
              <Feather name="chevron-right" size={22} color={C.text} />
            </TouchableOpacity>
          </View>

          {/* Days view */}
          {viewType === "days" && (
            <>
              <View style={styles.dayNamesRow}>
                {days.map((d) => (
                  <Text key={d} style={[styles.dayName, { color: C.textMuted }]}>{d}</Text>
                ))}
              </View>
              <View style={styles.grid}>
                {calDays.map((d, i) => {
                  const isCurrentMonth = d.getMonth() === viewMonth;
                  const isSelected = !!value && sameDay(d, value);
                  const isToday = sameDay(d, today);
                  const disabled = isDisabled(d);

                  return (
                    <TouchableOpacity
                      key={i}
                      onPress={() => {
                        if (disabled) return;
                        if (!isCurrentMonth) {
                          setViewYear(d.getFullYear());
                          setViewMonth(d.getMonth());
                        }
                        onChange(d);
                        setShowPicker(false);
                      }}
                      style={[
                        styles.dayCell,
                        isSelected && { backgroundColor: C.primary },
                        !isSelected && isToday && { borderWidth: 1.5, borderColor: C.primary },
                      ]}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          isSelected && { color: scheme === "dark" ? "#0a0a0a" : "#ffffff", fontFamily: "Inter_700Bold" },
                          !isSelected && isCurrentMonth && !disabled && { color: C.text },
                          !isSelected && !isCurrentMonth && { color: C.textMuted, opacity: 0.3 },
                          !isSelected && disabled && { color: C.textMuted, opacity: 0.3 },
                          !isSelected && isToday && !disabled && { color: C.primary, fontFamily: "Inter_600SemiBold" },
                        ]}
                      >
                        {d.getDate()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {/* Months view */}
          {viewType === "months" && (
            <View style={styles.pickerGrid}>
              {monthRows.map((row, rowIdx) => (
                <View key={rowIdx} style={styles.pickerRow}>
                  {row.map((m, colIdx) => {
                    const idx = rowIdx * 3 + colIdx;
                    const selected = viewMonth === idx;
                    return (
                      <TouchableOpacity
                        key={idx}
                        onPress={() => { setViewMonth(idx); setViewType("days"); }}
                        style={[styles.pickerCell, selected && { backgroundColor: C.primary }]}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.pickerCellText, { color: selected ? (scheme === "dark" ? "#0a0a0a" : "#fff") : C.text }]}>
                          {m}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>
          )}

          {/* Years view */}
          {viewType === "years" && (
            <ScrollView
              ref={yearScrollRef}
              style={styles.yearScrollView}
              contentContainerStyle={styles.pickerGrid}
              showsVerticalScrollIndicator={false}
            >
              {yearRows.map((row, rowIdx) => (
                <View key={rowIdx} style={styles.pickerRow}>
                  {row.map((y) => {
                    const selected = viewYear === y;
                    return (
                      <TouchableOpacity
                        key={y}
                        onPress={() => { setViewYear(y); setViewType("months"); }}
                        style={[styles.pickerCell, selected && { backgroundColor: C.primary }]}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.pickerCellText, { color: selected ? (scheme === "dark" ? "#0a0a0a" : "#fff") : C.text }]}>
                          {y}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  {/* Fill empty slots in the last row */}
                  {row.length < 3 && Array.from({ length: 3 - row.length }).map((_, i) => (
                    <View key={`e${i}`} style={styles.pickerCell} />
                  ))}
                </View>
              ))}
            </ScrollView>
          )}

          <View style={[styles.actions, { borderTopColor: C.separator }]}>
            <Pressable onPress={() => setShowPicker(false)} style={styles.actionBtn}>
              <Text style={[styles.actionText, { color: C.textSecondary }]}>{t("common.cancel")}</Text>
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
  navBtn: { padding: 4, borderRadius: 8 },
  navBtnHidden: { opacity: 0 },
  captionCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  captionBtn: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  captionBtnYear: {
    marginLeft: 2,
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

  // Shared grid layout for months and years views
  pickerGrid: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 6,
  },
  pickerRow: {
    flexDirection: "row",
    gap: 6,
  },
  pickerCell: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerCellText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  yearScrollView: {
    height: 220,
  },

  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
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
