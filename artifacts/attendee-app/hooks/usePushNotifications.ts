import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { router } from "expo-router";
import { useRegisterPushToken } from "@/hooks/useAttendeeApi";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export function usePushNotifications(isAuthenticated: boolean) {
  const { mutate: registerToken } = useRegisterPushToken();
  const responseListenerRef = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    if (!isAuthenticated || Platform.OS === "web") return;

    let cancelled = false;

    (async () => {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== "granted" || cancelled) return;

      try {
        const tokenData = await Notifications.getExpoPushTokenAsync();
        if (!cancelled) {
          registerToken(tokenData.data);
        }
      } catch {}
    })();

    responseListenerRef.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown> | null;
      // Only navigate if the notification explicitly requests it
      if (data?.navigate === "history") {
        router.push("/(tabs)/history");
      }
    });

    return () => {
      cancelled = true;
      if (responseListenerRef.current) {
        responseListenerRef.current.remove();
      }
    };
  }, [isAuthenticated]);
}
