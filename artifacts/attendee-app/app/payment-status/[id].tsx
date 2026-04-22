import { useColorScheme } from "@/hooks/useColorScheme";
import { Image } from 'expo-image';
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { Button } from "@/components/ui/Button";
import { usePaymentStatus } from "@/hooks/useAttendeeApi";

type PaymentStatus = "pending" | "success" | "failed";

type ThreeDsAuth = {
  current_step: string;
  current_step_status: string;
  three_ds_method_data?: string;
  iframe_content?: string;
};

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 150;

const MASTERCARD_LOGO = "https://brand.mastercard.com/content/dam/mccom/brandcenter/thumbnails/mastercard_circles_92px_2x.png";

function decodeHtmlEntities(html: string): string {
  return html
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

let WebView: React.ComponentType<{
  source: { html: string };
  style?: object;
  javaScriptEnabled?: boolean;
  originWhitelist?: string[];
  scalesPageToFit?: boolean;
  scrollEnabled?: boolean;
}> | null = null;

if (Platform.OS !== "web") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    WebView = require("react-native-webview").WebView;
  } catch {
    WebView = null;
  }
}

export default function PaymentStatusScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const params = useLocalSearchParams<{
    id: string;
    redirectUrl?: string;
    paymentMethod?: string;
  }>();

  const intentId = params.id;
  const redirectUrl = params.redirectUrl ?? "";
  const paymentMethod = params.paymentMethod ?? "nequi";

  const [pollCount, setPollCount] = useState(0);
  const [hasRedirected, setHasRedirected] = useState(false);
  const [threeDsAuth, setThreeDsAuth] = useState<ThreeDsAuth | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: statusData, refetch, isError } = usePaymentStatus(intentId);

  const status: PaymentStatus = ((statusData as { status?: string } | undefined)?.status as PaymentStatus) ?? "pending";

  useEffect(() => {
    const auth = (statusData as { threeDsAuth?: ThreeDsAuth } | undefined)?.threeDsAuth;
    if (auth) setThreeDsAuth(auth);
  }, [statusData]);

  useEffect(() => {
    if (redirectUrl && !hasRedirected && paymentMethod === "pse") {
      setHasRedirected(true);
      Linking.openURL(redirectUrl).catch(() => {});
    }
  }, [redirectUrl, hasRedirected, paymentMethod]);

  useEffect(() => {
    if (status === "success" || status === "failed") {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    pollRef.current = setInterval(() => {
      setPollCount((c) => {
        if (c >= MAX_POLLS) {
          if (pollRef.current) clearInterval(pollRef.current);
          return c;
        }
        void refetch();
        return c + 1;
      });
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [status, refetch]);

  const timedOut = pollCount >= MAX_POLLS && status === "pending";

  const is3DsFingerprint =
    paymentMethod === "card" &&
    status === "pending" &&
    threeDsAuth?.current_step === "FINGERPRINT" &&
    threeDsAuth?.current_step_status === "PENDING" &&
    !!threeDsAuth?.three_ds_method_data;

  const is3DsChallenge =
    paymentMethod === "card" &&
    status === "pending" &&
    threeDsAuth?.current_step === "CHALLENGE" &&
    threeDsAuth?.current_step_status === "PENDING" &&
    !!threeDsAuth?.iframe_content;

  const renderIcon = () => {
    if (status === "success") {
      return (
        <View style={[styles.iconCircle, { backgroundColor: C.successLight }]}>
          <Feather name="check-circle" size={56} color={C.success} />
        </View>
      );
    }
    if (status === "failed" || isError) {
      return (
        <View style={[styles.iconCircle, { backgroundColor: C.dangerLight }]}>
          <Feather name="x-circle" size={56} color={C.danger} />
        </View>
      );
    }
    return (
      <View style={[styles.iconCircle, { backgroundColor: C.primaryLight }]}>
        <Feather name="clock" size={56} color={C.primary} />
      </View>
    );
  };

  const renderTitle = () => {
    if (status === "success") return t("paymentStatus.success");
    if (status === "failed" || isError) return t("paymentStatus.failed");
    if (timedOut) return t("paymentStatus.timeout");
    if (is3DsChallenge) return "Autenticación bancaria";
    return t("paymentStatus.processing");
  };

  const renderSubtitle = () => {
    if (status === "success") return t("paymentStatus.successMsg");
    if (status === "failed" || isError) return t("paymentStatus.failedMsg");
    if (timedOut) return t("paymentStatus.timeoutMsg");
    if (is3DsChallenge) return "Tu banco requiere verificación adicional. Completa el proceso a continuación.";
    if (is3DsFingerprint) return "Verificando tu dispositivo con el banco...";
    if (paymentMethod === "nequi" || paymentMethod === "daviplata" || paymentMethod === "puntoscolombia") return t("paymentStatus.nequiPending");
    return t("paymentStatus.psePending");
  };

  if (is3DsChallenge && !isWeb && WebView) {
    const htmlContent = decodeHtmlEntities(threeDsAuth!.iframe_content!);
    return (
      <View style={[styles.container, { backgroundColor: C.background }]}>
        <LinearGradient colors={["#050505", "#0a0a0a", "#111111"]} style={StyleSheet.absoluteFill} />
        <View style={[styles.topBar, { paddingTop: isWeb ? 67 : insets.top + 8, paddingHorizontal: 20 }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={C.text} />
          </Pressable>
          <Text style={[styles.pageTitle, { color: C.text }]}>Verificación 3D Secure</Text>
          <View style={{ width: 30 }} />
        </View>

        <View style={{ paddingHorizontal: 20, paddingBottom: 8, alignItems: "center", gap: 8 }}>
          <Image
            source={{ uri: MASTERCARD_LOGO }}
            style={{ width: 60, height: 37 }}
            contentFit="contain"
          />
          <Text style={{ color: C.textSecondary, fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" }}>
            Autenticación segura 3D Secure
          </Text>
        </View>

        <View style={{ flex: 1, marginHorizontal: 16, marginBottom: insets.bottom + 16, borderRadius: 16, overflow: "hidden", backgroundColor: "#fff" }}>
          <WebView
            source={{ html: htmlContent }}
            javaScriptEnabled
            originWhitelist={["*"]}
            scalesPageToFit={false}
            scrollEnabled
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <LinearGradient
        colors={["#050505", "#0a0a0a", "#111111"]}
        style={StyleSheet.absoluteFill}
      />

      {is3DsFingerprint && !isWeb && WebView && (
        <View style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}>
          <WebView
            source={{ html: decodeHtmlEntities(threeDsAuth!.three_ds_method_data!) }}
            javaScriptEnabled
            originWhitelist={["*"]}
            style={{ width: 1, height: 1 }}
          />
        </View>
      )}

      <View style={[styles.topBar, { paddingTop: isWeb ? 67 : insets.top + 8, paddingHorizontal: 20 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={C.text} />
        </Pressable>
        <Text style={[styles.pageTitle, { color: C.text }]}>{t("paymentStatus.title")}</Text>
        <View style={{ width: 30 }} />
      </View>

      <View style={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        {renderIcon()}
        <Text style={[styles.title, { color: C.text }]}>{renderTitle()}</Text>
        <Text style={[styles.subtitle, { color: C.textSecondary }]}>{renderSubtitle()}</Text>

        {status === "pending" && !timedOut && (
          <View style={styles.pollRow}>
            {Array.from({ length: 3 }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  {
                    backgroundColor: C.primary,
                    opacity: (pollCount % 3) === i ? 1 : 0.3,
                  },
                ]}
              />
            ))}
          </View>
        )}

        {paymentMethod === "pse" && status === "pending" && redirectUrl && (
          <Pressable
            onPress={() => Linking.openURL(redirectUrl).catch(() => {})}
            style={[styles.openBankBtn, { borderColor: C.primary }]}
          >
            <Feather name="external-link" size={16} color={C.primary} />
            <Text style={[styles.openBankText, { color: C.primary }]}>
              {t("paymentStatus.openBank")}
            </Text>
          </Pressable>
        )}

        <View style={styles.actions}>
          {status === "success" && (
            <Button
              title={t("paymentStatus.viewBalance")}
              onPress={() => router.replace("/(tabs)/home")}
              variant="primary"
              fullWidth
            />
          )}
          {(status === "failed" || isError) && (
            <>
              <Button title={t("paymentStatus.retry")} onPress={() => router.back()} variant="primary" fullWidth />
              <Button title={t("paymentStatus.goHome")} onPress={() => router.replace("/(tabs)/home")} variant="secondary" fullWidth />
            </>
          )}
          {(timedOut || status === "pending") && (
            <Button
              title={t("paymentStatus.checkStatus")}
              onPress={() => { setPollCount(0); void refetch(); }}
              variant="secondary"
              fullWidth
            />
          )}
          {status !== "success" && (
            <Button
              title={t("paymentStatus.cancel")}
              onPress={() => router.replace("/(tabs)/home")}
              variant="ghost"
              fullWidth
            />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 8,
  },
  backBtn: { padding: 4 },
  pageTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 20,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 24, fontFamily: "Inter_700Bold", textAlign: "center" },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
  pollRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  dot: { width: 10, height: 10, borderRadius: 5 },
  openBankBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  openBankText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  actions: { width: "100%", gap: 12 },
});
