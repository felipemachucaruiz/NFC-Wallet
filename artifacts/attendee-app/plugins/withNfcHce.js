const { withAndroidManifest } = require("@expo/config-plugins");

module.exports = function withNfcHce(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    // Ensure uses-permission for NFC
    if (!manifest["uses-permission"]) manifest["uses-permission"] = [];
    const perms = manifest["uses-permission"];
    if (!perms.some((p) => p.$?.["android:name"] === "android.permission.NFC")) {
      perms.push({ $: { "android:name": "android.permission.NFC" } });
    }

    // Ensure uses-feature for NFC HCE (optional so app installs on non-NFC devices too)
    if (!manifest["uses-feature"]) manifest["uses-feature"] = [];
    const features = manifest["uses-feature"];
    if (!features.some((f) => f.$?.["android:name"] === "android.hardware.nfc.hce")) {
      features.push({
        $: { "android:name": "android.hardware.nfc.hce", "android:required": "false" },
      });
    }

    // Add TicketApduService inside <application>
    const app = manifest.application?.[0];
    if (!app) return cfg;

    if (!app.service) app.service = [];
    const services = app.service;

    const serviceName = "expo.modules.nfchce.TicketApduService";
    if (!services.some((s) => s.$?.["android:name"] === serviceName)) {
      services.push({
        $: {
          "android:name": serviceName,
          "android:exported": "true",
          "android:permission": "android.permission.BIND_NFC_SERVICE",
        },
        "intent-filter": [
          {
            action: [
              { $: { "android:name": "android.nfc.cardemulation.action.HOST_APDU_SERVICE" } },
            ],
          },
        ],
        "meta-data": [
          {
            $: {
              "android:name": "android.nfc.cardemulation.host_apdu_service",
              "android:resource": "@xml/apduservice",
            },
          },
        ],
      });
    }

    return cfg;
  });
};
