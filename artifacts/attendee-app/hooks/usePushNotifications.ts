import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { router } from "expo-router";
import { useRegisterPushToken } from "@/hooks/useAttendeeApi";
import { appendStoredNotification } from "@/hooks/useNotificationStore";
import Constants from "expo-constants";

type NotificationsModule = typeof import("expo-notifications");
type EventSubscription = import("expo-notifications").EventSubscription;

let Notifications: NotificationsModule | null = null;
try {
  Notifications = require("expo-notifications");
} catch {}

let handlerSet = false;

export function usePushNotifications(isAuthenticated: boolean, userId?: string | null) {
  const { mutate: registerToken } = useRegisterPushToken();
  const responseListenerRef = useRef<EventSubscription | null>(null);
  const receiveListenerRef = useRef<EventSubscription | null>(null);

  useEffect(() => {
    if (!isAuthenticated || Platform.OS === "web" || !Notifications) return;

    if (!handlerSet) {
      try {
        Notifications!.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
            shouldShowBanner: true,
            shouldShowList: true,
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

    receiveListenerRef.current = Notifications!.addNotificationReceivedListener((notification) => {
      const content = notification.request.content;
      void appendStoredNotification({
        id: notification.request.identifier,
        title: content.title ?? null,
        body: content.body ?? null,
        data: (content.data as Record<string, unknown>) ?? {},
        receivedAt: new Date().toISOString(),
      }, userId);
    });

    responseListenerRef.current = Notifications!.addNotificationResponseReceivedListener((response) => {
      const notification = response.notification;
      const content = notification.request.content;
      void appendStoredNotification({
        id: notification.request.identifier,
        title: content.title ?? null,
        body: content.body ?? null,
        data: (content.data as Record<string, unknown>) ?? {},
        receivedAt: new Date().toISOString(),
      }, userId);
      const data = content.data as Record<string, unknown> | null;
      if (data?.navigate === "history") {
        router.push("/(tabs)/history");
      }
    });

    return () => {
      cancelled = true;
      if (receiveListenerRef.current) {
        receiveListenerRef.current.remove();
      }
      if (responseListenerRef.current) {
        responseListenerRef.current.remove();
      }
    };
  }, [isAuthenticated, userId]);
}
