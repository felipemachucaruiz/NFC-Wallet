import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { Alert, Appearance, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { setBaseUrl, setFetchImplementation } from "@workspace/api-client-react";
import { API_BASE_URL } from "@/constants/domain";
import { AnimatedSplash } from "@/components/AnimatedSplash";
import { PasscodeScreen } from "@/components/PasscodeScreen";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AttestationProvider } from "@/contexts/AttestationContext";
import { PasscodeProvider, usePasscode } from "@/contexts/PasscodeContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { CartProvider } from "@/contexts/CartContext";
import { OfflineQueueProvider } from "@/contexts/OfflineQueueContext";
import { UpdateBanner } from "@/components/UpdateBanner";
import { initI18n } from "@/i18n";
import { initNfc } from "@/utils/nfc";
import { pinnedFetch } from "@/utils/pinnedFetch";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n";
import { useTranslation } from "react-i18next";

if (Platform.OS !== "web") {
  Appearance.setColorScheme("dark");
}

setBaseUrl(API_BASE_URL);
setFetchImplementation(pinnedFetch);

SplashScreen.preventAutoHideAsync();

const CRASH_LOG_KEY = "@tapee_crash_log";

try {
  if (typeof ErrorUtils !== "undefined" && typeof ErrorUtils.setGlobalHandler === "function") {
    const prevHandler =
      typeof ErrorUtils.getGlobalHandler === "function"
        ? ErrorUtils.getGlobalHandler()
        : null;
    ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
      try {
        const msg = error?.message ?? "unknown error";
        const stack = error?.stack?.split("\n").slice(0, 12).join("\n") ?? "";
        const entry = JSON.stringify({
          message: msg,
          stack,
          isFatal: !!isFatal,
          ts: new Date().toISOString(),
        });
        AsyncStorage.setItem(CRASH_LOG_KEY, entry).catch(() => {});
        Alert.alert(
          `💥 ${isFatal ? "FATAL" : "JS"} CRASH`,
          `${msg}\n\n${stack}`,
          [{ text: "OK" }],
        );
      } catch {}
      if (typeof prevHandler === "function") prevHandler(error, isFatal);
    });
  }
} catch {}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

function RootLayoutNav() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0a0a0a' },
        animation: 'fade_from_bottom',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="self-service" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="(attendee)" />
      <Stack.Screen name="(bank)" />
      <Stack.Screen name="(merchant-pos)" />
      <Stack.Screen name="(merchant-admin)" />
      <Stack.Screen name="(warehouse)" />
      <Stack.Screen name="(event-admin)" />
      <Stack.Screen name="(admin)" />
    </Stack>
  );
}

function LockOverlay() {
  const { isLocked, unlock } = usePasscode();
  const { logout } = useAuth();
  const { t } = useTranslation();
  const [wrongPin, setWrongPin] = useState(false);

  if (!isLocked) return null;

  const handleUnlock = async (code: string) => {
    setWrongPin(false);
    const ok = await unlock(code);
    if (!ok) setWrongPin(true);
  };

  return (
    <PasscodeScreen
      mode="unlock"
      title={t("passcode.enterPin")}
      subtitle={wrongPin ? t("passcode.wrongPin") : t("passcode.enterPinHint")}
      onSuccess={handleUnlock}
      onCancel={logout}
    />
  );
}

function AppWithPasscode({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  usePushNotifications(isAuthenticated);
  return (
    <PasscodeProvider isAuthenticated={isAuthenticated}>
      {children}
      <LockOverlay />
    </PasscodeProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const [i18nReady, setI18nReady] = useState(false);
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    initI18n().then(() => setI18nReady(true));
    initNfc();
    AsyncStorage.getItem(CRASH_LOG_KEY)
      .then((raw) => {
        if (!raw) return;
        AsyncStorage.removeItem(CRASH_LOG_KEY).catch(() => {});
        try {
          const log = JSON.parse(raw) as { message: string; stack?: string; isFatal?: boolean; ts?: string };
          Alert.alert(
            log.isFatal ? "Fatal Crash Detected" : "Previous Crash Detected",
            `${log.ts ?? ""}\n\n${log.message}\n\n${log.stack ?? ""}`,
            [{ text: "OK" }],
          );
        } catch {}
      })
      .catch(() => {});
  }, []);

  const appReady = (fontsLoaded || !!fontError) && i18nReady;

  useEffect(() => {
    if (appReady) {
      SplashScreen.hideAsync();
    }
  }, [appReady]);

  if (!appReady) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <I18nextProvider i18n={i18n}>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <AttestationProvider>
                <AppWithPasscode>
                  <CartProvider>
                    <OfflineQueueProvider>
                      <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
                        <KeyboardProvider>
                          <RootLayoutNav />
                          {!splashDone && (
                            <AnimatedSplash onFinished={() => setSplashDone(true)} />
                          )}
                          <UpdateBanner />
                        </KeyboardProvider>
                      </GestureHandlerRootView>
                    </OfflineQueueProvider>
                  </CartProvider>
                </AppWithPasscode>
              </AttestationProvider>
            </AuthProvider>
          </QueryClientProvider>
        </I18nextProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
