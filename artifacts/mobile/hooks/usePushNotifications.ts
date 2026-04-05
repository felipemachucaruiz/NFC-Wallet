import { useEffect } from "react";
import { Platform } from "react-native";
import { useRegisterPushToken } from "@workspace/api-client-react";
import Constants from "expo-constants";

let Notifications: typeof import("expo-notifications") | null = null;
try {
  Notifications = require("expo-notifications");
  Notifications!.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
} catch {}

export function usePushNotifications(isAuthenticated: boolean) {
  const registerToken = useRegisterPushToken();

  useEffect(() => {
    if (!isAuthenticated || Platform.OS === "web" || !Notifications) return;

    let cancelled = false;

    (async () => {
      try {
        const { status: existingStatus } = await Notifications!.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== "granted") {
          const { status } = await Notifications!.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus !== "granted" || cancelled) return;

        const projectId =
          Constants.expoConfig?.extra?.eas?.projectId ??
          Constants.easConfig?.projectId;

        if (!projectId) return;

        const tokenData = await Notifications!.getExpoPushTokenAsync({ projectId });
        if (!cancelled) {
          registerToken.mutate({ data: { token: tokenData.data } });
        }
      } catch {
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);
}
