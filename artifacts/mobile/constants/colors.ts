const primary = "#1A56DB";
const primaryDark = "#3B82F6";
const success = "#16A34A";
const warning = "#D97706";
const danger = "#DC2626";

export default {
  light: {
    background: "#F0F4F8",
    card: "#FFFFFF",
    cardSecondary: "#F8FAFF",
    border: "#E2E8F0",
    text: "#0D1B2E",
    textSecondary: "#64748B",
    textMuted: "#94A3B8",
    primary,
    primaryLight: "#EFF6FF",
    success,
    successLight: "#F0FDF4",
    warning,
    warningLight: "#FFFBEB",
    danger,
    dangerLight: "#FEF2F2",
    tint: primary,
    tabIconDefault: "#94A3B8",
    tabIconSelected: primary,
    overlay: "rgba(0,0,0,0.4)",
    separator: "#E2E8F0",
    inputBg: "#F1F5F9",
    shimmer1: "#F1F5F9",
    shimmer2: "#E2E8F0",
  },
  dark: {
    background: "#0A0F1E",
    card: "#121E33",
    cardSecondary: "#1A2845",
    border: "#1E2D4A",
    text: "#E8EFF7",
    textSecondary: "#94A3B8",
    textMuted: "#64748B",
    primary: primaryDark,
    primaryLight: "#1E2D4A",
    success: "#22C55E",
    successLight: "#052E16",
    warning: "#F59E0B",
    warningLight: "#1C1208",
    danger: "#EF4444",
    dangerLight: "#1C0A0A",
    tint: primaryDark,
    tabIconDefault: "#64748B",
    tabIconSelected: primaryDark,
    overlay: "rgba(0,0,0,0.6)",
    separator: "#1E2D4A",
    inputBg: "#1A2845",
    shimmer1: "#1A2845",
    shimmer2: "#1E2D4A",
  },
};

export type ColorScheme = typeof import("./colors").default.light;
