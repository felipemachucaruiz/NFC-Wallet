/**
 * Expo config plugin — Android Network Security Config for TLS certificate pinning.
 *
 * Pins the public keys (SPKI SHA-256) of Let's Encrypt intermediates R12 and R13,
 * which are the certs actually present in the TLS handshake chain from Railway.
 *
 * Why this approach instead of react-native-ssl-pinning?
 *  - Works at the OS level: covers ALL network calls including raw fetch() in AuthContext
 *  - No third-party library needed, no JS exceptions to handle
 *  - Android-native, well-maintained, supported on Android 7+ (API 24+)
 *  - Public key pinning (SPKI) is more stable than full-cert pinning
 *
 * Pins (SHA-256 of SubjectPublicKeyInfo, base64):
 *  - R12: kZwN96eHtZftBWrOZUsd6cA4es80n3NzSk/XtYz2EqQ=  (prod.tapee.app, valid to Mar 2027)
 *  - R13: AlSQhgtJirc8ahLyekmtX+Iw+v46yPYRLJt9Cq1GlB0=  (attendee.tapee.app, valid to Mar 2027)
 */

const { withAndroidManifest, withDangerousMod } = require("@expo/config-plugins");
const path = require("path");
const fs = require("fs");

const NSC_XML = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <domain-config cleartextTrafficPermitted="false">
    <domain includeSubdomains="false">prod.tapee.app</domain>
    <domain includeSubdomains="false">attendee.tapee.app</domain>
    <pin-set expiration="2027-03-12">
      <pin digest="SHA-256">kZwN96eHtZftBWrOZUsd6cA4es80n3NzSk/XtYz2EqQ=</pin>
      <pin digest="SHA-256">AlSQhgtJirc8ahLyekmtX+Iw+v46yPYRLJt9Cq1GlB0=</pin>
    </pin-set>
  </domain-config>
</network-security-config>
`;

function withNscXml(config) {
  return withDangerousMod(config, [
    "android",
    (cfg) => {
      const xmlDir = path.join(
        cfg.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res",
        "xml",
      );
      if (!fs.existsSync(xmlDir)) {
        fs.mkdirSync(xmlDir, { recursive: true });
      }
      const xmlPath = path.join(xmlDir, "network_security_config.xml");
      fs.writeFileSync(xmlPath, NSC_XML, "utf-8");
      console.log("[withNetworkSecurityConfig] Wrote network_security_config.xml");
      return cfg;
    },
  ]);
}

function withNscManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (app) {
      app.$["android:networkSecurityConfig"] = "@xml/network_security_config";
      console.log("[withNetworkSecurityConfig] Set android:networkSecurityConfig in AndroidManifest");
    }
    return cfg;
  });
}

module.exports = function withNetworkSecurityConfig(config) {
  config = withNscXml(config);
  config = withNscManifest(config);
  return config;
};
