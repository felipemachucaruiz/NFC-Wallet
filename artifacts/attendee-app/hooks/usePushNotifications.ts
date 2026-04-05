import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { router } from "expo-router";
import { useRegisterPushToken } from "@/hooks/useAttendeeApi";
import Constants from "expo-constants";

type NotificationsModule = typeof import("expo-notifications");
type EventSubscription = import("expo-notifications").EventSubscription;

let Notifications: NotificationsModule | null = null;
try {
  Notifications = require("expo-notifications");
} catch {}

let handlerSet = false;

export function usePushNotifications(isAuthenticated: boolean) {
  const { mutate: registerToken } = useRegisterPushToken();
  const responseListenerRef = useRef<EventSubscription | null>(null);

  useEffect(() => {
    if (!isAuthenticated || Platform.OS === "web" || !Notifications) return;

    if (!handlerSet) {
      try {
        Notifications!.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
          }),
        });
        handlerSet = true;
      } catch {}
    }

    let cancelled = false;

    (async () => {
      const { status: existingStatus } = await Notifications!.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== "granted") {
        const { status } = await Notifications!.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== "granted" || cancelled) return;

      try {
        const projectId =
          Constants.expoConfig?.extra?.eas?.projectId ??
          Constants.easConfig?.projectId;
        if (!projectId) return;
        const tokenData = await Notifications!.getExpoPushTokenAsync({ projectId });
        if (!cancelled) {
          registerToken(tokenData.data);
        }
      } catch {}
    })();

    responseListenerRef.current = Notifications!.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown> | null;
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
