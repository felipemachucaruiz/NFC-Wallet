import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";

type MenuItem = {
  icon: React.ComponentProps<typeof Feather>["name"];
  labelKey: string;
  route: string;
  condition?: boolean;
};

export default function MoreScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();

  const hasPromoterCompany = !!user?.promoterCompanyId;

  const menuItems: MenuItem[] = [
    { icon: "users", labelKey: "eventAdmin.users", route: "/(event-admin)/users" },
    { icon: "credit-card", labelKey: "wristbands.title", route: "/(event-admin)/wristbands" },
    { icon: "list", labelKey: "transactions.title", route: "/(event-admin)/transactions" },
    { icon: "package", labelKey: "inventory.tab", route: "/(event-admin)/inventory" },
    { icon: "activity", labelKey: "analytics.title", route: "/(event-admin)/analytics" },
    {
      icon: "briefcase",
      labelKey: "eventAdmin.promoterSummary",
      route: "/(event-admin)/promoter-summary",
      condition: hasPromoterCompany,
    },
    { icon: "shield", labelKey: "zones.title", route: "/(event-admin)/access-zones" },
    { icon: "sliders", labelKey: "eventAdmin.inventorySettings", route: "/(event-admin)/event-settings" },
    { icon: "user", labelKey: "common.settings", route: "/(event-admin)/profile" },
  ];

  const visible = menuItems.filter((m) => m.condition === undefined || m.condition);

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: isWeb ? 67 : insets.top + 16,
            paddingHorizontal: 20,
            backgroundColor: C.background,
          },
        ]}
      >
        <Text style={[styles.title, { color: C.text }]}>{t("eventAdmin.more")}</Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.list,
          { paddingBottom: isWeb ? 34 : insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.group, { backgroundColor: C.card, borderColor: C.border }]}>
          {visible.map((item, idx) => (
            <React.Fragment key={item.route}>
              <Pressable
                onPress={() => router.push(item.route as any)}
                style={({ pressed }) => [
                  styles.row,
                  pressed && { backgroundColor: C.inputBg },
                ]}
              >
                <View style={[styles.iconWrap, { backgroundColor: C.primaryLight }]}>
                  <Feather name={item.icon} size={18} color={C.primary} />
                </View>
                <Text style={[styles.label, { color: C.text }]}>
                  {t(item.labelKey)}
                </Text>
                <Feather name="chevron-right" size={18} color={C.textMuted} />
              </Pressable>
              {idx < visible.length - 1 && (
                <View style={[styles.divider, { backgroundColor: C.separator }]} />
              )}
            </React.Fragment>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingBottom: 16, gap: 4 },
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  list: { paddingHorizontal: 20, paddingTop: 8 },
  group: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 66,
  },
});
