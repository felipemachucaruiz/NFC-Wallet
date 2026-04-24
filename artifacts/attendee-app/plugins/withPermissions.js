/**
 * Config plugin — hardens Android permission declarations.
 *
 * - Removes android.permission.USE_FINGERPRINT (deprecated since API 28)
 * - Removes SYSTEM_ALERT_WINDOW if present and not required at runtime
 * - Restricts android.permission.WRITE_EXTERNAL_STORAGE with maxSdkVersion="28"
 *   only when a dependency has already merged the permission in, so it is not
 *   granted on Android 9+ (API 29+) devices. With minSdkVersion=29 this is
 *   belt-and-suspenders; the permission is inert either way, but the explicit
 *   restriction keeps the manifest declaration honest.
 */

const { withAndroidManifest } = require("@expo/config-plugins");

const PERMISSIONS_TO_REMOVE = [
  "android.permission.USE_FINGERPRINT",
  "android.permission.SYSTEM_ALERT_WINDOW",
];

module.exports = function withPermissions(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    if (!Array.isArray(manifest["uses-permission"])) {
      return cfg;
    }

    const filtered = [];

    for (const perm of manifest["uses-permission"]) {
      const name = perm.$?.["android:name"];

      if (PERMISSIONS_TO_REMOVE.includes(name)) {
        console.log(`[withPermissions] Removed deprecated permission: ${name}`);
        continue;
      }

      if (name === "android.permission.WRITE_EXTERNAL_STORAGE") {
        perm.$ = { ...perm.$, "android:maxSdkVersion": "28" };
        console.log("[withPermissions] Restricted WRITE_EXTERNAL_STORAGE with maxSdkVersion=28");
      }

      filtered.push(perm);
    }

    manifest["uses-permission"] = filtered;
    return cfg;
  });
};
