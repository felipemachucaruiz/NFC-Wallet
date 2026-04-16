import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import React, { useState, useEffect, useCallback } from "react";
import { formatCurrency } from "@/utils/format";
import { useEventContext } from "@/contexts/EventContext";
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
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
import { Empty } from "@/components/ui/Empty";
import { Input } from "@/components/ui/Input";
import { Loading } from "@/components/ui/Loading";
import { useAuth } from "@/contexts/AuthContext";
import { useZoneCache, type AccessZone } from "@/contexts/ZoneCacheContext";
import { API_BASE_URL } from "@/constants/domain";

const PRESET_COLORS = [
  "#6366F1", "#8B5CF6", "#EC4899", "#EF4444",
  "#F97316", "#EAB308", "#22C55E", "#14B8A6",
  "#3B82F6", "#06B6D4", "#A855F7", "#F43F5E",
];

function ColorSwatch({ color, selected, onPress }: { color: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        swatchStyles.swatch,
        { backgroundColor: color },
        selected && swatchStyles.selected,
      ]}
    >
      {selected && <Feather name="check" size={14} color="#fff" />}
    </Pressable>
  );
}

const swatchStyles = StyleSheet.create({
  swatch: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  selected: {
    borderWidth: 2,
    borderColor: "#fff",
  },
});

type FormData = {
  name: string;
  colorHex: string;
  rank: string;
  upgradePrice: string;
};

const DEFAULT_FORM: FormData = {
  name: "",
  colorHex: "#6366F1",
  rank: "0",
  upgradePrice: "",
};

export default function AccessZonesScreen() {
  const { t } = useTranslation();
  const { show: showAlert } = useAlert();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { token, user } = useAuth();
  const { currencyCode } = useEventContext();
  const { zones, isLoading: cacheLoading, refresh } = useZoneCache();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingZone, setEditingZone] = useState<AccessZone | null>(null);
  const [form, setForm] = useState<FormData>(DEFAULT_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refresh();
    setIsRefreshing(false);
  };

  const openCreate = () => {
    setEditingZone(null);
    setForm(DEFAULT_FORM);
    setShowForm(true);
  };

  const openEdit = (zone: AccessZone) => {
    setEditingZone(zone);
    setForm({
      name: zone.name,
      colorHex: zone.colorHex,
      rank: String(zone.rank),
      upgradePrice: zone.upgradePrice != null ? String(zone.upgradePrice) : "",
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      showAlert(t("common.error"), t("zones.nameRequired"));
      return;
    }
    const rankNum = parseInt(form.rank, 10);
    if (isNaN(rankNum) || rankNum < 0) {
      showAlert(t("common.error"), t("zones.rankInvalid"));
      return;
    }
    const upgradePrice = form.upgradePrice.trim()
      ? parseInt(form.upgradePrice, 10)
      : null;
    if (form.upgradePrice.trim() && (isNaN(upgradePrice as number) || (upgradePrice as number) < 0)) {
      showAlert(t("common.error"), t("zones.priceInvalid"));
      return;
    }

    setIsSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        colorHex: form.colorHex,
        rank: rankNum,
        upgradePrice: upgradePrice,
        eventId: user?.eventId,
      };

      const url = editingZone
        ? `${API_BASE_URL}/api/access-zones/${editingZone.id}`
        : `${API_BASE_URL}/api/access-zones`;
      const method = editingZone ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        showAlert(t("common.error"), err.error ?? t("common.unknownError"));
        return;
      }

      setShowForm(false);
      await refresh();
    } catch {
      showAlert(t("common.error"), t("common.unknownError"));
    }
    setIsSaving(false);
  };

  const handleDelete = async (zone: AccessZone) => {
    showAlert(
      t("common.warning"),
      t("zones.deleteConfirm", { name: zone.name }),
      [
        { text: t("common.cancel"), variant: "cancel" },
        {
          text: t("common.delete"),
          variant: "danger",
          onPress: async () => {
            setIsDeleting(zone.id);
            try {
              const res = await fetch(`${API_BASE_URL}/api/access-zones/${zone.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!res.ok) {
                const err = await res.json().catch(() => ({})) as { error?: string };
                showAlert(t("common.error"), err.error ?? t("common.unknownError"));
                return;
              }
              await refresh();
            } catch {
              showAlert(t("common.error"), t("common.unknownError"));
            }
            setIsDeleting(null);
          },
        },
      ],
    );
  };

  if (cacheLoading && zones.length === 0) return <Loading label={t("common.loading")} />;

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <FlatList
        data={zones}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingTop: isWeb ? 67 : insets.top + 16,
          paddingBottom: isWeb ? 34 : insets.bottom + 80,
          paddingHorizontal: 20,
          gap: 12,
        }}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={C.primary} />
        }
        ListHeaderComponent={() => (
          <View style={styles.header}>
            <Text style={[styles.title, { color: C.text }]}>{t("zones.title")}</Text>
            <Button
              title={`+ ${t("zones.addZone")}`}
              onPress={openCreate}
              variant="primary"
              size="sm"
            />
          </View>
        )}
        ListEmptyComponent={() => (
          <Empty
            icon="shield"
            title={t("zones.empty")}
            actionLabel={t("zones.addZone")}
            onAction={openCreate}
          />
        )}
        renderItem={({ item }) => (
          <Card>
            <View style={styles.zoneRow}>
              <View style={[styles.colorDot, { backgroundColor: item.colorHex }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.zoneName, { color: C.text }]}>{item.name}</Text>
                <View style={styles.zoneMeta}>
                  <Text style={[styles.zoneMetaText, { color: C.textMuted }]}>
                    {t("zones.rank")}: {item.rank}
                  </Text>
                  {item.upgradePrice != null && (
                    <Text style={[styles.zoneMetaText, { color: C.textMuted }]}>
                      {" · "}{t("zones.upgradePrice")}: {formatCurrency(item.upgradePrice, currencyCode)}
                    </Text>
                  )}
                </View>
              </View>
              <View style={styles.zoneActions}>
                <Pressable
                  onPress={() => openEdit(item)}
                  style={[styles.actionBtn, { backgroundColor: C.primaryLight }]}
                  hitSlop={6}
                >
                  <Feather name="edit-2" size={14} color={C.primary} />
                </Pressable>
                <Pressable
                  onPress={() => handleDelete(item)}
                  style={[styles.actionBtn, { backgroundColor: C.dangerLight }]}
                  disabled={isDeleting === item.id}
                  hitSlop={6}
                >
                  <Feather name="trash-2" size={14} color={C.danger} />
                </Pressable>
              </View>
            </View>
          </Card>
        )}
      />

      <Modal visible={showForm} transparent animationType="slide">
        <View style={[styles.overlay, { backgroundColor: C.overlay }]}>
          <ScrollView
            style={[styles.sheet, { backgroundColor: C.card }]}
            contentContainerStyle={{ gap: 16, padding: 24 }}
          >
            <Text style={[styles.sheetTitle, { color: C.text }]}>
              {editingZone ? t("zones.editZone") : t("zones.addZone")}
            </Text>

            <Input
              label={t("common.name")}
              value={form.name}
              onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
              placeholder={t("zones.namePlaceholder")}
              hint={t("zones.nameHint")}
            />

            <Input
              label={t("zones.rankLabel")}
              value={form.rank}
              onChangeText={(v) => setForm((f) => ({ ...f, rank: v.replace(/[^0-9]/g, "") }))}
              keyboardType="number-pad"
              placeholder="0"
              hint={t("zones.rankHint")}
            />

            <Input
              label={t("zones.upgradePriceLabel")}
              value={form.upgradePrice}
              onChangeText={(v) => setForm((f) => ({ ...f, upgradePrice: v.replace(/[^0-9]/g, "") }))}
              keyboardType="number-pad"
              placeholder="0"
              hint={t("zones.upgradePriceHint")}
            />

            <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>{t("zones.color")}</Text>
            <View style={styles.colorGrid}>
              {PRESET_COLORS.map((c) => (
                <ColorSwatch
                  key={c}
                  color={c}
                  selected={form.colorHex === c}
                  onPress={() => setForm((f) => ({ ...f, colorHex: c }))}
                />
              ))}
            </View>

            <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>{t("zones.customColor")}</Text>
            <View style={styles.colorInputRow}>
              <View style={[styles.colorPreview, { backgroundColor: form.colorHex }]} />
              <TextInput
                style={[
                  styles.colorInput,
                  { backgroundColor: C.inputBg, color: C.text, borderColor: C.border },
                ]}
                value={form.colorHex}
                onChangeText={(v) => setForm((f) => ({ ...f, colorHex: v }))}
                placeholder="#6366F1"
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={9}
              />
            </View>

            <View style={styles.sheetActions}>
              <Button
                title={t("common.cancel")}
                onPress={() => setShowForm(false)}
                variant="secondary"
              />
              <Button
                title={t("common.save")}
                onPress={handleSave}
                variant="primary"
                loading={isSaving}
              />
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  zoneRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  colorDot: { width: 20, height: 20, borderRadius: 10 },
  zoneName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  zoneMeta: { flexDirection: "row", marginTop: 2 },
  zoneMetaText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  zoneActions: { flexDirection: "row", gap: 8 },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  overlay: { flex: 1, justifyContent: "flex-end" },
  sheet: { maxHeight: "90%", borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  sheetTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  sectionLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  colorGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  colorInputRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  colorPreview: { width: 40, height: 40, borderRadius: 10 },
  colorInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  sheetActions: { flexDirection: "row", gap: 12, paddingBottom: 8 },
});
