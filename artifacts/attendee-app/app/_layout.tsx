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
import { Appearance, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AnimatedSplash } from "@/components/AnimatedSplash";
import { UpdateBanner } from "@/components/UpdateBanner";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { initI18n } from "@/i18n";
import { initNfc } from "@/utils/nfc";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n";

if (Platform.OS !== "web") {
  Appearance.setColorScheme("dark");
}

SplashScreen.preventAutoHideAsync();

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
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="top-up" />
      <Stack.Screen name="add-bracelet" />
      <Stack.Screen name="block-bracelet" />
      <Stack.Screen name="refund-request" />
      <Stack.Screen name="payment-status/[id]" />
    </Stack>
  );
}

function AppInner() {
  const { isAuthenticated } = useAuth();
  usePushNotifications(isAuthenticated);
  return <RootLayoutNav />;
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
              <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
                <KeyboardProvider>
                  <AppInner />
                  <UpdateBanner />
                  {!splashDone && (
                    <AnimatedSplash onFinished={() => setSplashDone(true)} />
                  )}
                </KeyboardProvider>
              </GestureHandlerRootView>
            </AuthProvider>
          </QueryClientProvider>
        </I18nextProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
