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
      buildNumber: "6",
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
    plugins: [
      [
        "expo-router",
        {
          origin: "https://replit.com/",
        },
      ],
      "expo-font",
      "expo-web-browser",
      ["react-native-nfc-manager", { includeNdefEntitlement: false }],
      [
        "expo-notifications",
        {
          icon: "./assets/images/icon.png",
          color: "#00f1ff",
          defaultChannel: "default",
          androidMode: "default",
        },
      ],
      "./plugins/withNetworkSecurityConfig",
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
