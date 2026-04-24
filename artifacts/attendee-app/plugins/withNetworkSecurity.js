/**
 * Config plugin — blocks cleartext HTTP traffic for production builds.
 *
 * Injects a network_security_config.xml that sets cleartextTrafficPermitted="false"
 * for all domains, then registers it on the <application> node in the manifest.
 */

const { withAndroidManifest, withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const NETWORK_SECURITY_CONFIG_XML = `<?xml version="1.0" encoding="utf-8"?>
<!--
  Network Security Configuration
  Disables cleartext (HTTP) traffic for all domains in production.
  HTTPS is required for all network communication.
-->
<network-security-config>
  <base-config cleartextTrafficPermitted="false">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </base-config>
</network-security-config>
`;

function withNetworkSecurityManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    const application = manifest.manifest.application?.[0];

    if (!application) {
      console.warn("[withNetworkSecurity] No <application> node found in AndroidManifest.xml");
      return cfg;
    }

    application.$ = application.$ ?? {};
    application.$["android:networkSecurityConfig"] = "@xml/network_security_config";
    application.$["android:usesCleartextTraffic"] = "false";

    console.log("[withNetworkSecurity] Registered network_security_config.xml and disabled cleartext traffic in manifest");
    return cfg;
  });
}

function withNetworkSecurityFile(config) {
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

      console.log("[withNetworkSecurity] Wrote network_security_config.xml");
      return cfg;
    },
  ]);
}

module.exports = function withNetworkSecurity(config) {
  config = withNetworkSecurityManifest(config);
  config = withNetworkSecurityFile(config);
  return config;
};
