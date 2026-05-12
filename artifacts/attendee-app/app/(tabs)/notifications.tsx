import { useColorScheme } from "@/hooks/useColorScheme";
import { ScreenBackground } from "@/components/ui/ScreenBackground";
import { Feather } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { Empty } from "@/components/ui/Empty";
import { formatDateTime } from "@/utils/format";
import { loadStoredNotifications, StoredNotification } from "@/hooks/useNotificationStore";
import { useAuth } from "@/contexts/AuthContext";

export default function NotificationsScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();

  const [notifications, setNotifications] = useState<StoredNotification[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const stored = await loadStoredNotifications(user?.id);
    setNotifications(stored);
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <ScreenBackground style={styles.container}>
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          padding: 16,
          paddingTop: isWeb ? 67 : insets.top + 8,
          paddingBottom: isWeb ? 34 : insets.bottom + 100,
          gap: 10,
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.primary} />
        }
        ListHeaderComponent={() => (
          <Text style={[styles.pageTitle, { color: C.text }]}>{t("notifications.title")}</Text>
        )}
        ListEmptyComponent={() => (
          <Empty
            icon="bell"
            title={t("notifications.empty")}
            subtitle={t("notifications.emptySub")}
          />
        )}
        renderItem={({ item }) => <NotificationCard notification={item} C={C} t={t} />}
      />
    </ScreenBackground>
  );
}

function NotificationCard({
  notification,
  C,
  t,
}: {
  notification: StoredNotification;
  C: typeof Colors.dark;
  t: (k: string) => string;
}) {
  return (
    <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
      <View style={styles.cardRow}>
        <View style={[styles.iconBox, { backgroundColor: C.primaryLight }]}>
          <Feather name="bell" size={18} color={C.primary} />
        </View>
        <View style={{ flex: 1 }}>
          {notification.title ? (
            <Text style={[styles.cardTitle, { color: C.text }]}>{notification.title}</Text>
          ) : null}
          {notification.body ? (
            <Text style={[styles.cardBody, { color: C.textSecondary }]}>{notification.body}</Text>
          ) : null}
          <Text style={[styles.cardDate, { color: C.textMuted }]}>
            {formatDateTime(notification.receivedAt)}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pageTitle: { fontSize: 24, fontFamily: "Inter_700Bold", marginBottom: 8 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14 },
  cardRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  iconBox: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 2 },
  cardTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  cardBody: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2, lineHeight: 18 },
  cardDate: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4 },
});
