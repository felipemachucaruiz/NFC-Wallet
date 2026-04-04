import React, { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { API_BASE_URL, ATTENDEE_API_BASE_URL } from "@/constants/domain";

export default function DebugScreen() {
  const { user, isAuthenticated, logout } = useAuth();
  const [apiStatus, setApiStatus] = useState<string>("...");
  const [fetchTime, setFetchTime] = useState<number | null>(null);

  useEffect(() => {
    const t0 = Date.now();
    fetch(`${API_BASE_URL}/api/health`, { method: "GET" })
      .then((r) => {
        setApiStatus(`OK ${r.status}`);
        setFetchTime(Date.now() - t0);
      })
      .catch((e) => {
        setApiStatus(`ERR: ${e?.message ?? String(e)}`);
        setFetchTime(Date.now() - t0);
      });
  }, []);

  const goToRole = () => {
    const role = user?.role;
    if (role === "admin") router.replace("/(admin)/");
    else if (role === "bank") router.replace("/(bank)/");
    else if (role === "merchant_admin") router.replace("/(merchant-admin)/");
    else if (role === "merchant_staff") router.replace("/(merchant-pos)/");
    else if (role === "warehouse_admin") router.replace("/(warehouse)/");
    else if (role === "event_admin") router.replace("/(event-admin)/");
    else if (role === "attendee") router.replace("/(attendee)/home");
    else Alert.alert("Unknown role", role ?? "null");
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>🔍 DEBUG SCREEN</Text>
      <Text style={styles.subtitle}>If you see this, JS is running after login!</Text>

      <View style={styles.box}>
        <Text style={styles.label}>Authenticated:</Text>
        <Text style={styles.value}>{String(isAuthenticated)}</Text>
      </View>
      <View style={styles.box}>
        <Text style={styles.label}>User role:</Text>
        <Text style={styles.value}>{user?.role ?? "null"}</Text>
      </View>
      <View style={styles.box}>
        <Text style={styles.label}>User email:</Text>
        <Text style={styles.value}>{user?.email ?? "null"}</Text>
      </View>
      <View style={styles.box}>
        <Text style={styles.label}>API_BASE_URL:</Text>
        <Text style={styles.value}>{API_BASE_URL}</Text>
      </View>
      <View style={styles.box}>
        <Text style={styles.label}>ATTENDEE_API_BASE_URL:</Text>
        <Text style={styles.value}>{ATTENDEE_API_BASE_URL}</Text>
      </View>
      <View style={styles.box}>
        <Text style={styles.label}>API /health status:</Text>
        <Text style={styles.value}>{apiStatus}</Text>
        {fetchTime !== null && <Text style={styles.value}>{fetchTime}ms</Text>}
      </View>

      <Pressable style={styles.btn} onPress={goToRole}>
        <Text style={styles.btnText}>▶ Go to My Role Screen</Text>
      </Pressable>

      <Pressable style={[styles.btn, styles.btnRed]} onPress={logout}>
        <Text style={styles.btnText}>Logout</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1a1a1a" },
  content: { padding: 24, gap: 12 },
  title: { fontSize: 24, fontWeight: "bold", color: "#00f1ff", marginBottom: 4 },
  subtitle: { fontSize: 14, color: "#a1a1aa", marginBottom: 16 },
  box: { backgroundColor: "#111", borderRadius: 8, padding: 12, gap: 4 },
  label: { fontSize: 12, color: "#71717a" },
  value: { fontSize: 14, color: "#ffffff", fontWeight: "600" },
  btn: { backgroundColor: "#00f1ff", borderRadius: 10, padding: 16, alignItems: "center", marginTop: 8 },
  btnRed: { backgroundColor: "#ef4444" },
  btnText: { color: "#0a0a0a", fontWeight: "bold", fontSize: 16 },
});
