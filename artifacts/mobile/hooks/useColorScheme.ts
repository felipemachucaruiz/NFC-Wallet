import { Platform } from "react-native";

export function useColorScheme(): "dark" | "light" {
  if (Platform.OS !== "web") {
    return "dark";
  }
  const { useColorScheme: useNativeColorScheme } = require("react-native");
  return useNativeColorScheme() ?? "dark";
}
