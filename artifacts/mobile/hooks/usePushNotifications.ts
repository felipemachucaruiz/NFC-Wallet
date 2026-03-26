import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { useRegisterPushToken } from "@workspace/api-client-react";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export function usePushNotifications(isAuthenticated: boolean) {
  const registerToken = useRegisterPushToken();

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

      const tokenData = await Notifications.getExpoPushTokenAsync();
      if (!cancelled) {
        registerToken.mutate({ token: tokenData.data });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);
}
