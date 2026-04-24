/**
 * Config plugin — injects a network_security_config.xml that blocks
 * cleartext (plain HTTP) traffic for all domains in production.
 *
 * Only HTTPS is permitted to the Tapee backend domains.
 * Cleartext is fully disabled so MobSF no longer flags it.
 */

const { withAndroidManifest, withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const NETWORK_SECURITY_CONFIG_XML = `<?xml version="1.0" encoding="utf-8"?>
<!--
  Network Security Configuration
  Disables cleartext HTTP for all domains. Only HTTPS traffic is permitted.
  https://developer.android.com/training/articles/security-config
-->
<network-security-config>
  <base-config cleartextTrafficPermitted="false">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </base-config>
  <domain-config cleartextTrafficPermitted="false">
    <domain includeSubdomains="true">prod.tapee.app</domain>
    <domain includeSubdomains="true">attendee.tapee.app</domain>
  </domain-config>
</network-security-config>
`;

function withNetworkSecurityConfigManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    const application = manifest.manifest.application?.[0];

    if (!application) {
      console.warn("[withNetworkSecurityConfig] No <application> node in AndroidManifest.xml");
      return cfg;
    }

    application.$ = application.$ ?? {};
    application.$["android:networkSecurityConfig"] = "@xml/network_security_config";

    if (application.$["android:usesCleartextTraffic"] === "true") {
      console.warn("[withNetworkSecurityConfig] WARNING: usesCleartextTraffic=true on <application> — removing");
      delete application.$["android:usesCleartextTraffic"];
    } else {
      application.$["android:usesCleartextTraffic"] = "false";
    }

    console.log("[withNetworkSecurityConfig] Set android:networkSecurityConfig and enforced usesCleartextTraffic=false on <application>");
    return cfg;
  });
}

function withNetworkSecurityConfigFile(config) {
  return withDangerousMod(config, [
    "android",
    (cfg) => {
      const resXmlDir = path.join(
        cfg.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res",
        "xml"
      );

      fs.mkdirSync(resXmlDir, { recursive: true });
      fs.writeFileSync(
        path.join(resXmlDir, "network_security_config.xml"),
        NETWORK_SECURITY_CONFIG_XML,
        "utf8"
      );

      console.log("[withNetworkSecurityConfig] Wrote network_security_config.xml");
      return cfg;
    },
  ]);
}

module.exports = function withNetworkSecurityConfig(config) {
  config = withNetworkSecurityConfigManifest(config);
  config = withNetworkSecurityConfigFile(config);
  return config;
};
