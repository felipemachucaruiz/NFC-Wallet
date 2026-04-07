const primary = "#1A56DB";
const cyan = "#00f1ff";
const amber = "#fbbf24";
const success = "#22c55e";
const warning = "#fbbf24";
const danger = "#ef4444";

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
    primaryText: "#ffffff",
    primaryLight: "#EFF6FF",
    success: "#16A34A",
    successLight: "#F0FDF4",
    warning: "#D97706",
    warningLight: "#FFFBEB",
    danger: "#DC2626",
    dangerLight: "#FEF2F2",
    tint: primary,
    tabIconDefault: "#94A3B8",
    tabIconSelected: primary,
    overlay: "rgba(0,0,0,0.4)",
    separator: "#E2E8F0",
    inputBg: "#F1F5F9",
    shimmer1: "#F1F5F9",
    shimmer2: "#E2E8F0",
    cyan,
    amber,
  },
  dark: {
    background: "#0a0a0a",
    card: "#111111",
    cardSecondary: "#1a1a1a",
    border: "#1a1a1a",
    text: "#ffffff",
    textSecondary: "#a1a1aa",
    textMuted: "#71717a",
    primary: cyan,
    primaryText: "#0a0a0a",
    primaryLight: "rgba(0,241,255,0.10)",
    success,
    successLight: "#052e16",
    warning: amber,
    warningLight: "#1c1208",
    danger,
    dangerLight: "#1c0a0a",
    tint: cyan,
    tabIconDefault: "#52525b",
    tabIconSelected: cyan,
    overlay: "rgba(0,0,0,0.7)",
    separator: "#1a1a1a",
    inputBg: "#1a1a1a",
    shimmer1: "#111111",
    shimmer2: "#1a1a1a",
    cyan,
    amber,
  },
};

export type ColorScheme = typeof import("./colors").default.light;
