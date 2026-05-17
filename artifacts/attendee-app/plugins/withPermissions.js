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

    // Ensure tools namespace is present so tools:replace is valid
    manifest.$ = {
      ...manifest.$,
      "xmlns:tools": "http://schemas.android.com/tools",
    };

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
        // tools:replace tells the manifest merger that our value (28) wins over
        // any library declaring a different maxSdkVersion (e.g. expo-file-system@55
        // declares 32, which conflicts without this override).
        perm.$ = {
          ...perm.$,
          "android:maxSdkVersion": "28",
          "tools:replace": "android:maxSdkVersion",
        };
        console.log("[withPermissions] Restricted WRITE_EXTERNAL_STORAGE with maxSdkVersion=28 (tools:replace)");
      }

      filtered.push(perm);
    }

    manifest["uses-permission"] = filtered;
    return cfg;
  });
};
