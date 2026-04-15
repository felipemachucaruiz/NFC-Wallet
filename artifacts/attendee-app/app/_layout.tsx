import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider, MutationCache, QueryCache } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { Appearance, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AlertProvider } from "@/components/CustomAlert";
import { AnimatedSplash } from "@/components/AnimatedSplash";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { initI18n } from "@/i18n";
import { initNfc } from "@/utils/nfc";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n";
import * as Sentry from "@sentry/react-native";

const SENSITIVE_KEYS = /password|token|authorization|card.?number|cvv|secret/i;

Sentry.init({
  dsn: "https://c5d3633ad0e750cef208c52abbe581a2@o4511219507265536.ingest.us.sentry.io/4511219532627968",
  environment: __DEV__ ? "development" : "production",
  enabled: !__DEV__,
  tracesSampleRate: 0.2,
  profilesSampleRate: 0.2,
  attachStacktrace: true,
  beforeSend(event, hint) {
    if (event.request?.data && typeof event.request.data === "object") {
      const data = event.request.data as Record<string, unknown>;
      for (const key of Object.keys(data)) {
        if (SENSITIVE_KEYS.test(key)) data[key] = "[Filtered]";
      }
    }
    if (event.request?.headers) {
      for (const key of Object.keys(event.request.headers)) {
        if (SENSITIVE_KEYS.test(key)) event.request.headers[key] = "[Filtered]";
      }
    }
    if (Array.isArray(event.breadcrumbs)) {
      for (const crumb of event.breadcrumbs as Sentry.Breadcrumb[]) {
        if (crumb.data && typeof crumb.data === "object") {
          for (const key of Object.keys(crumb.data)) {
            if (SENSITIVE_KEYS.test(key)) crumb.data[key] = "[Filtered]";
          }
        }
      }
    }
    if (hint?.data && typeof hint.data === "object") {
      const hintData = hint.data as Record<string, unknown>;
      for (const key of Object.keys(hintData)) {
        if (SENSITIVE_KEYS.test(key)) hintData[key] = "[Filtered]";
      }
    }
    return event;
  },
});

// Safe import: if react-native-keyboard-controller is not in the native binary
// the app will still start without keyboard handling rather than crashing.
const KeyboardProvider: React.ComponentType<{ children: React.ReactNode }> = (() => {
  try {
    return require("react-native-keyboard-controller").KeyboardProvider;
  } catch {
    return ({ children }: { children: React.ReactNode }) => <>{children}</>;
  }
})();

if (Platform.OS !== "web") {
  Appearance.setColorScheme("dark");
}

SplashScreen.preventAutoHideAsync();

const EXPECTED_ERRORS = /NFC_CANCELLED|TAG_LOST|USER_CANCELLED|AbortError|NetworkError/;

function reportToSentry(error: unknown, context?: Record<string, unknown>) {
  if (!error) return;
  const msg = error instanceof Error ? error.message : String(error);
  if (EXPECTED_ERRORS.test(msg)) return;
  Sentry.captureException(error instanceof Error ? error : new Error(msg), {
    extra: context,
  });
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      reportToSentry(error, { queryKey: JSON.stringify(query.queryKey) });
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      reportToSentry(error, {
        mutationKey: mutation.options.mutationKey
          ? JSON.stringify(mutation.options.mutationKey)
          : undefined,
      });
    },
  }),
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
      <Stack.Screen name="select-event" />
      <Stack.Screen name="unlink-bracelet" />
      <Stack.Screen name="payment-status/[id]" />
      <Stack.Screen name="event-detail" />
      <Stack.Screen name="venue-map" />
      <Stack.Screen name="ticket-quantity" />
      <Stack.Screen name="attendee-form" />
      <Stack.Screen name="ticket-checkout" />
      <Stack.Screen name="ticket-payment-status/[id]" />
      <Stack.Screen name="my-tickets" />
      <Stack.Screen name="ticket-detail" />
    </Stack>
  );
}

function SessionExpiredOverlay() {
  const { sessionExpired, clearSessionExpired } = useAuth();
  if (!sessionExpired) return null;

  const handleGoToLogin = () => {
    clearSessionExpired();
    router.replace("/login");
  };

  return (
    <Modal visible transparent animationType="fade">
      <View style={sessionStyles.overlay}>
        <View style={sessionStyles.card}>
          <View style={sessionStyles.iconWrap}>
            <Feather name="clock" size={32} color="#00f1ff" />
          </View>
          <Text style={sessionStyles.title}>Sesión expirada</Text>
          <Text style={sessionStyles.body}>
            Tu sesión ha caducado. Por favor inicia sesión de nuevo para continuar.
          </Text>
          <Pressable onPress={handleGoToLogin} style={sessionStyles.btn}>
            <Text style={sessionStyles.btnText}>Ir al inicio de sesión</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const sessionStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#161b22",
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    width: "100%",
    maxWidth: 380,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "rgba(0,241,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#e6edf3",
    textAlign: "center",
  },
  body: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#8b949e",
    textAlign: "center",
    lineHeight: 22,
  },
  btn: {
    backgroundColor: "#00f1ff",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
    marginTop: 4,
  },
  btnText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#0d1117",
  },
});

function AppInner() {
  const { isAuthenticated, user } = useAuth();
  usePushNotifications(isAuthenticated, user?.id);
  return (
    <>
      <RootLayoutNav />
      <SessionExpiredOverlay />
    </>
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
  // On web, the reanimated worklet bridge doesn't fire completion callbacks
  // reliably, so the animated splash is skipped entirely on that platform.
  const [splashDone, setSplashDone] = useState(Platform.OS === "web");

  useEffect(() => {
    initI18n()
      .then(() => setI18nReady(true))
      .catch(() => setI18nReady(true));
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
                  <AlertProvider>
                    <AppInner />
                    {!splashDone && (
                      <AnimatedSplash onFinished={() => setSplashDone(true)} />
                    )}
                  </AlertProvider>
                </KeyboardProvider>
              </GestureHandlerRootView>
            </AuthProvider>
          </QueryClientProvider>
        </I18nextProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
