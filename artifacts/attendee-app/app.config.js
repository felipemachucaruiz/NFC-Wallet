module.exports = {
  expo: {
    name: "Tapee Wallet",
    slug: "attendee-app",
    owner: "felipemachucadj",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "tapee-attendee",
    userInterfaceStyle: "dark",
    newArchEnabled: true,
    splash: {
      image: "./assets/images/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#0a0a0a",
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: "com.tapee.attendee",
      buildNumber: "1",
      infoPlist: {
        NFCReaderUsageDescription: "Used to read NFC wristbands for cashless payments.",
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      package: "com.tapee.attendee",
      adaptiveIcon: {
        foregroundImage: "./assets/images/icon.png",
        backgroundColor: "#0a0a0a",
      },
      permissions: [
        "android.permission.NFC",
        "android.permission.INTERNET",
        "android.permission.ACCESS_NETWORK_STATE",
        "android.permission.RECEIVE_BOOT_COMPLETED",
        "android.permission.VIBRATE",
      ],
    },
    web: {
      favicon: "./assets/images/icon.png",
    },
    updates: {
      url: "https://u.expo.dev/47da8b6a-72b7-4bc9-af31-c34ee51a0441",
      enabled: true,
      fallbackToCacheTimeout: 0,
      checkAutomatically: "ON_LOAD",
      requestHeaders: {
        "expo-channel-name": "production",
      },
    },
    runtimeVersion: {
      policy: "fingerprint",
    },
    plugins: [
      [
        "expo-router",
        {
          origin: "https://replit.com/",
        },
      ],
      "expo-font",
      "expo-web-browser",
      "react-native-nfc-manager",
      "expo-updates",
      [
        "expo-notifications",
        {
          icon: "./assets/images/icon.png",
          color: "#00f1ff",
          defaultChannel: "default",
          androidMode: "default",
        },
      ],
      [
        "./plugins/withSslPinning",
        {
          certFiles: ["tapee_api.cer", "attendee_api.cer"],
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      eas: {
        projectId: "47da8b6a-72b7-4bc9-af31-c34ee51a0441",
      },
    },
  },
};
