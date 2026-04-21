import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider, MutationCache, QueryCache } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { Appearance, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { setBaseUrl, setFetchImplementation } from "@workspace/api-client-react";
import { API_BASE_URL } from "@/constants/domain";
import { AnimatedSplash } from "@/components/AnimatedSplash";
import { PasscodeScreen } from "@/components/PasscodeScreen";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AttestationProvider, useAttestationContext } from "@/contexts/AttestationContext";
import { PasscodeProvider, usePasscode } from "@/contexts/PasscodeContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { CartProvider } from "@/contexts/CartContext";
import { OfflineQueueProvider } from "@/contexts/OfflineQueueContext";
import { ZoneCacheProvider } from "@/contexts/ZoneCacheContext";
import { BannedBraceletsProvider } from "@/contexts/BannedBraceletsContext";
import { AlertProvider, useAlert } from "@/components/CustomAlert";
import { initI18n } from "@/i18n";
import { initNfc } from "@/utils/nfc";
import { fetchWithTimeout } from "@/utils/fetchWithTimeout";
import { UpdateBanner } from "@/components/UpdateBanner";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n";
import { useTranslation } from "react-i18next";
import * as Sentry from "@sentry/react-native";

const SENSITIVE_KEYS = /password|token|authorization|card.?number|cvv|secret/i;

Sentry.init({
  dsn: "https://268ea43667b8ae4ce31e982fe22c870b@o4511219507265536.ingest.us.sentry.io/4511219527909376",
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

setBaseUrl(API_BASE_URL);
setFetchImplementation(fetchWithTimeout);

// Restore saved local server URL from previous session (async — resolves before first API call)
AsyncStorage.getItem("@tapee_local_server_url").then((saved) => {
  if (saved) setBaseUrl(saved);
}).catch(() => {});

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
        const entry = JSON.stringify({
          message: error?.message ?? "unknown error",
          stack: error?.stack?.split("\n").slice(0, 8).join("\n"),
          isFatal: !!isFatal,
          ts: new Date().toISOString(),
        });
        AsyncStorage.setItem(CRASH_LOG_KEY, entry).catch(() => {});
      } catch {}
      Sentry.captureException(error, { tags: { isFatal: String(!!isFatal), errorSource: "GlobalHandler" } });
      if (typeof prevHandler === "function") prevHandler(error, isFatal);
    });
  }
} catch {}


// Errors to ignore globally — expected business-logic rejections that are
// deliberately handled as specific UI states in individual screens.
const EXPECTED_ERRORS = /NFC_CANCELLED|TAG_LOST|USER_CANCELLED|SCAN_CANCELLED/;

function reportToSentry(error: unknown, context?: Record<string, unknown>) {
  if (!error) return;
  const msg = error instanceof Error ? error.message : String(error);
  if (EXPECTED_ERRORS.test(msg)) return;
  Sentry.captureException(error instanceof Error ? error : new Error(msg), {
    extra: context,
  });
}

// Module-level callback registered by AttestationErrorBridge so the QueryClient
// (created outside the React tree) can trigger re-attestation on 403 responses.
let _retryAttestation: (() => Promise<void>) | null = null;

function is403Attestation(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  const msg = error instanceof Error ? error.message : String(error ?? "");
  return status === 403 && /attestation/i.test(msg);
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (is403Attestation(error)) { _retryAttestation?.(); return; }
      reportToSentry(error, { queryKey: JSON.stringify(query.queryKey) });
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (is403Attestation(error)) { _retryAttestation?.(); return; }
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

function AttestationErrorBridge() {
  const { retryAttestation } = useAttestationContext();
  useEffect(() => {
    _retryAttestation = retryAttestation;
    return () => { _retryAttestation = null; };
  }, [retryAttestation]);
  return null;
}

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
      <Stack.Screen name="(box-office)" />
      <Stack.Screen name="(admin)" />
      <Stack.Screen name="device-test" />
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

  useEffect(() => {
    let sub: { remove: () => void } | undefined;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Notifications = require("expo-notifications");
      const { router } = require("expo-router");
      sub = Notifications.addNotificationResponseReceivedListener((response: {
        notification: { request: { content: { data: Record<string, unknown> } } };
      }) => {
        const data = response?.notification?.request?.content?.data;
        if (data?.type === "device_test") {
          router.push({
            pathname: "/device-test",
            params: {
              runId: String(data.runId ?? ""),
              eventId: String(data.eventId ?? ""),
              braceletUid: String(data.braceletUid ?? ""),
              numCharges: String(data.numCharges ?? 10),
              chargeAmountCents: String(data.chargeAmountCents ?? 5000),
            },
          });
        }
      });
    } catch {}
    return () => { sub?.remove(); };
  }, []);

  return (
    <PasscodeProvider isAuthenticated={isAuthenticated}>
      {children}
      <LockOverlay />
    </PasscodeProvider>
  );
}

function CrashLogReporter() {
  const { show } = useAlert();
  useEffect(() => {
    AsyncStorage.getItem(CRASH_LOG_KEY)
      .then((raw) => {
        if (!raw) return;
        AsyncStorage.removeItem(CRASH_LOG_KEY).catch(() => {});
        try {
          const log = JSON.parse(raw) as { message: string; stack?: string; isFatal?: boolean; ts?: string };
          show(
            log.isFatal ? "Fatal Crash Detected" : "Previous Crash Detected",
            `${log.ts ?? ""}\n\n${log.message}\n\n${log.stack ?? ""}`,
            [{ text: "OK", variant: "primary" }],
          );
        } catch {}
      })
      .catch(() => {});
  }, []);
  return null;
}

function OfflineQueueWithUser({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return <OfflineQueueProvider userId={user?.id}>{children}</OfflineQueueProvider>;
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
              <AttestationProvider>
                <AttestationErrorBridge />
                <AppWithPasscode>
                  <CartProvider>
                    <OfflineQueueWithUser>
                      <ZoneCacheProvider>
                      <BannedBraceletsProvider>
                      <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
                        <KeyboardProvider>
                          <AlertProvider>
                            <CrashLogReporter />
                            <RootLayoutNav />
                            <UpdateBanner />
                            {!splashDone && (
                              <AnimatedSplash onFinished={() => setSplashDone(true)} />
                            )}
                          </AlertProvider>
                        </KeyboardProvider>
                      </GestureHandlerRootView>
                      </BannedBraceletsProvider>
                      </ZoneCacheProvider>
                    </OfflineQueueWithUser>
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
