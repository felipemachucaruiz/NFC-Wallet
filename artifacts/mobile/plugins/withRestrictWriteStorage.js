/**
 * Config plugin — restricts WRITE_EXTERNAL_STORAGE to SDK < 29.
 *
 * On Android 10+ (API 29+) apps use scoped storage and do not need
 * WRITE_EXTERNAL_STORAGE. Adding maxSdkVersion="28" ensures the permission
 * is not granted on modern devices and clears the MobSF finding.
 *
 * If no WRITE_EXTERNAL_STORAGE <uses-permission> entry exists (because Expo
 * or a library adds it at prebuild time), this plugin inserts one with
 * the maxSdkVersion guard so it is present in the final manifest only for
 * older Android versions.
 */

const { withAndroidManifest } = require("@expo/config-plugins");

const PERMISSION_NAME = "android.permission.WRITE_EXTERNAL_STORAGE";

module.exports = function withRestrictWriteStorage(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;

    if (!manifest.manifest["uses-permission"]) {
      manifest.manifest["uses-permission"] = [];
    }

    const permissions = manifest.manifest["uses-permission"];

    const existing = permissions.find(
      (p) => p.$?.["android:name"] === PERMISSION_NAME
    );

    if (existing) {
      existing.$["android:maxSdkVersion"] = "28";
      console.log("[withRestrictWriteStorage] Added maxSdkVersion=28 to WRITE_EXTERNAL_STORAGE");
    } else {
      permissions.push({
        $: {
          "android:name": PERMISSION_NAME,
          "android:maxSdkVersion": "28",
        },
      });
      console.log("[withRestrictWriteStorage] Inserted WRITE_EXTERNAL_STORAGE with maxSdkVersion=28");
    }

    const fingerprintEntry = permissions.find(
      (p) => p.$?.["android:name"] === "android.permission.USE_FINGERPRINT"
    );
    if (fingerprintEntry) {
      manifest.manifest["uses-permission"] = permissions.filter(
        (p) => p.$?.["android:name"] !== "android.permission.USE_FINGERPRINT"
      );
      console.log("[withRestrictWriteStorage] Removed deprecated USE_FINGERPRINT permission");
    }

    const alertWindowEntry = permissions.find(
      (p) => p.$?.["android:name"] === "android.permission.SYSTEM_ALERT_WINDOW"
    );
    if (alertWindowEntry) {
      manifest.manifest["uses-permission"] = manifest.manifest["uses-permission"].filter(
        (p) => p.$?.["android:name"] !== "android.permission.SYSTEM_ALERT_WINDOW"
      );
      console.log("[withRestrictWriteStorage] Removed SYSTEM_ALERT_WINDOW permission");
    }

    return cfg;
  });
};
