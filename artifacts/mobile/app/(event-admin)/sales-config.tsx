import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import React, { useState, useEffect, useCallback } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { useAlert } from "@/components/CustomAlert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { useAuth } from "@/contexts/AuthContext";
import { useEventContext } from "@/contexts/EventContext";
import { API_BASE_URL } from "@/constants/domain";

export default function SalesConfigScreen() {
  const { t } = useTranslation();
  const { show: showAlert } = useAlert();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { token } = useAuth();
  const { eventId } = useEventContext();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [onlineSales, setOnlineSales] = useState(true);
  const [doorSales, setDoorSales] = useState(true);
  const [saleStartsAt, setSaleStartsAt] = useState("");
  const [saleEndsAt, setSaleEndsAt] = useState("");

  const authHeader = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const load = useCallback(async () => {
    if (!eventId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/events/${eventId}`, { headers: authHeader });
      const data = await res.json();
      const ev = data.event ?? data;
      if (res.ok && ev) {
        const channel = (ev.salesChannel as string) ?? "both";
        setOnlineSales(channel === "online" || channel === "both");
        setDoorSales(channel === "door" || channel === "both");
        if (ev.saleStartsAt) setSaleStartsAt(new Date(ev.saleStartsAt as string).toISOString().slice(0, 16));
        if (ev.saleEndsAt) setSaleEndsAt(new Date(ev.saleEndsAt as string).toISOString().slice(0, 16));
      }
    } catch {}
    setLoading(false);
  }, [eventId, token]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!onlineSales && !doorSales) {
      showAlert(t("common.error"), t("salesConfig.atLeastOneChannel"));
      return;
    }
    const salesChannel = onlineSales && doorSales ? "both" : onlineSales ? "online" : "door";
    setSaving(true);
    try {
      const body: Record<string, unknown> = { salesChannel };
      if (saleStartsAt) body.saleStartsAt = new Date(saleStartsAt).toISOString();
      else body.saleStartsAt = null;
      if (saleEndsAt) body.saleEndsAt = new Date(saleEndsAt).toISOString();
      else body.saleEndsAt = null;
      const res = await fetch(`${API_BASE_URL}/api/events/${eventId}`, { method: "PATCH", headers: authHeader, body: JSON.stringify(body) });
      if (!res.ok) { const d = await res.json(); showAlert(t("common.error"), d.error ?? t("common.unknownError")); }
      else showAlert(t("common.success"), t("salesConfig.saved"));
    } catch { showAlert(t("common.error"), t("common.unknownError")); }
    setSaving(false);
  };

  if (loading) return <Loading />;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: C.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: isWeb ? 34 : insets.bottom + 80 }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.header, { paddingTop: isWeb ? 67 : insets.top + 16 }]}>
        <Text style={[styles.title, { color: C.text }]}>{t("salesConfig.title")}</Text>
        <Text style={[styles.subtitle, { color: C.textMuted }]}>{t("salesConfig.subtitle")}</Text>
      </View>

      {/* Sales Channels */}
      <Text style={[styles.sectionTitle, { color: C.text }]}>{t("salesConfig.channels")}</Text>
      <Card style={styles.card}>
        <View style={styles.channelRow}>
          <View style={[styles.channelIcon, { backgroundColor: C.primaryLight }]}>
            <Feather name="globe" size={18} color={C.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.channelName, { color: C.text }]}>{t("salesConfig.onlineSales")}</Text>
            <Text style={[styles.channelDesc, { color: C.textMuted }]}>{t("salesConfig.onlineSalesDesc")}</Text>
          </View>
          <Switch value={onlineSales} onValueChange={setOnlineSales} trackColor={{ true: C.primary }} />
        </View>
        <View style={[styles.divider, { backgroundColor: C.separator }]} />
        <View style={styles.channelRow}>
          <View style={[styles.channelIcon, { backgroundColor: "#22C55E20" }]}>
            <Feather name="shopping-cart" size={18} color="#22C55E" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.channelName, { color: C.text }]}>{t("salesConfig.doorSales")}</Text>
            <Text style={[styles.channelDesc, { color: C.textMuted }]}>{t("salesConfig.doorSalesDesc")}</Text>
          </View>
          <Switch value={doorSales} onValueChange={setDoorSales} trackColor={{ true: "#22C55E" }} />
        </View>
      </Card>

      {/* Sale Dates */}
      <Text style={[styles.sectionTitle, { color: C.text }]}>{t("salesConfig.saleDates")}</Text>
      <Card style={styles.card}>
        <Text style={[styles.label, { color: C.textMuted }]}>{t("salesConfig.saleStartsAt")}</Text>
        <TextInput
          style={[styles.input, { backgroundColor: C.inputBg, color: C.text, borderColor: C.border }]}
          value={saleStartsAt}
          onChangeText={setSaleStartsAt}
          placeholder="YYYY-MM-DDTHH:MM"
          placeholderTextColor={C.textMuted}
        />
        <Text style={[styles.label, { color: C.textMuted, marginTop: 12 }]}>{t("salesConfig.saleEndsAt")}</Text>
        <TextInput
          style={[styles.input, { backgroundColor: C.inputBg, color: C.text, borderColor: C.border }]}
          value={saleEndsAt}
          onChangeText={setSaleEndsAt}
          placeholder="YYYY-MM-DDTHH:MM"
          placeholderTextColor={C.textMuted}
        />
      </Card>

      <Button
        title={saving ? t("common.saving") : t("common.save")}
        onPress={handleSave}
        disabled={saving}
        style={{ marginTop: 8 }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 0 },
  header: { paddingBottom: 20, paddingHorizontal: 4 },
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 8, marginTop: 16, paddingHorizontal: 4 },
  card: { marginHorizontal: 0, marginBottom: 8 },
  channelRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  channelIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  channelName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  channelDesc: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 12 },
  label: { fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, fontFamily: "Inter_400Regular" },
});
