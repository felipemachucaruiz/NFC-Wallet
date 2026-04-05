/**
 * Custom Expo config plugin — injects com.google.android.geo.API_KEY into
 * AndroidManifest.xml for react-native-maps@1.x provider="google".
 *
 * react-native-maps@1.x looks for the newer "geo.API_KEY" meta-data entry,
 * NOT the legacy "maps.v2.API_KEY" that Expo's android.config.googleMaps.apiKey
 * injects. Without this plugin, Maps SDK boots with an empty key → white tiles.
 *
 * react-native-maps@1.20.1 ships no app.plugin.js, so it cannot be added to
 * the plugins array directly — this manual plugin is the correct approach.
 */

const { withAndroidManifest } = require("@expo/config-plugins");

const GEO_API_KEY_NAME = "com.google.android.geo.API_KEY";

module.exports = function withGoogleMapsManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const apiKey =
      cfg.android?.config?.googleMaps?.apiKey ??
      process.env.GOOGLE_MAPS_API_KEY ??
      "";

    const manifest = cfg.modResults;
    const application = manifest.manifest.application?.[0];

    if (!application) {
      console.warn("[withGoogleMapsManifest] No <application> node found in AndroidManifest.xml");
      return cfg;
    }

    if (!application["meta-data"]) {
      application["meta-data"] = [];
    }

    const existing = application["meta-data"].find(
      (entry) => entry.$?.["android:name"] === GEO_API_KEY_NAME
    );

    if (existing) {
      existing.$["android:value"] = apiKey;
      console.log(`[withGoogleMapsManifest] Updated ${GEO_API_KEY_NAME}`);
    } else {
      application["meta-data"].push({
        $: {
          "android:name": GEO_API_KEY_NAME,
          "android:value": apiKey,
        },
      });
      console.log(`[withGoogleMapsManifest] Injected ${GEO_API_KEY_NAME}`);
    }

    return cfg;
  });
};
