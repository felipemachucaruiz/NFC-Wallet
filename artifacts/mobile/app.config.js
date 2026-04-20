const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY ?? "";

module.exports = {
  expo: {
    name: "Tapee Staff",
    slug: "mobile",
    owner: "felipemachucadj",
    version: "1.0.19",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "tapee",
    userInterfaceStyle: "dark",
    newArchEnabled: true,
    splash: {
      image: "./assets/images/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#0a0a0a",
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: "com.tapee.staff",
      buildNumber: "19",
      infoPlist: {
        NSPhotoLibraryUsageDescription: "Used to select product photos.",
        NFCReaderUsageDescription: "Used to read NFC wristbands for cashless payments.",
        NSLocationWhenInUseUsageDescription: "Used to set the event location on the map.",
      },
      config: {
        googleMapsApiKey,
      },
    },
    android: {
      package: "com.tapee.app",
      versionCode: 19,
      adaptiveIcon: {
        foregroundImage: "./assets/images/adaptive-icon.png",
        backgroundColor: "#0a0a0a",
      },
      permissions: [
        "android.permission.NFC",
        "android.permission.INTERNET",
        "android.permission.ACCESS_NETWORK_STATE",
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.READ_MEDIA_IMAGES",
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.ACCESS_COARSE_LOCATION",
      ],
      config: {
        googleMaps: {
          apiKey: googleMapsApiKey,
        },
      },
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
      "@react-native-community/datetimepicker",
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
      [
        "expo-image-picker",
        {
          photosPermission: "The app needs access to your photos to upload product images.",
        },
      ],
      [
        "expo-location",
        {
          locationWhenInUsePermission: "Allow Tapee to access your location to set the event pin on the map.",
        },
      ],
      "./plugins/withGoogleMapsManifest",
      "expo-updates",
    ],
    runtimeVersion: {
      policy: "appVersion",
    },
    updates: {
      url: "https://u.expo.dev/26d76893-d65f-457a-b2eb-7fa177110638",
    },
    experiments: {
      typedRoutes: true,
    },
    extra: {
      eas: {
        projectId: "26d76893-d65f-457a-b2eb-7fa177110638",
      },
      googleMapsApiKey,
    },
  },
};
