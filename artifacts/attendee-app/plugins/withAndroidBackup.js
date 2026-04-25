/**
 * Config plugin — disables ADB backup and adds explicit backup exclusion rules.
 *
 * Sets android:allowBackup="false" on the <application> node and
 * wires up a backup_rules.xml (Android 12+ dataExtractionRules) that
 * explicitly excludes AsyncStorage databases, auth-token caches, and
 * the signing-key cache from cloud/adb backup.
 */

const { withAndroidManifest, withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const BACKUP_RULES_XML = `<?xml version="1.0" encoding="utf-8"?>
<!--
  Android 12+ data extraction rules (android:dataExtractionRules).
  Excludes all sensitive app data from cloud backup and ADB backup.
-->
<data-extraction-rules>
  <cloud-backup>
    <exclude domain="database" />
    <exclude domain="sharedpref" />
    <exclude domain="file" />
  </cloud-backup>
  <device-transfer>
    <exclude domain="database" />
    <exclude domain="sharedpref" />
    <exclude domain="file" />
  </device-transfer>
</data-extraction-rules>
`;

const FULL_BACKUP_CONTENT_XML = `<?xml version="1.0" encoding="utf-8"?>
<!--
  Legacy backup rules for Android < 12.
  Excludes all shared preferences and databases from ADB/cloud backup.
-->
<full-backup-content>
  <exclude domain="database" />
  <exclude domain="sharedpref" />
  <exclude domain="file" />
</full-backup-content>
`;

function withAndroidBackupManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    const application = manifest.manifest.application?.[0];

    if (!application) {
      console.warn("[withAndroidBackup] No <application> node found in AndroidManifest.xml");
      return cfg;
    }

    application.$ = application.$ ?? {};
    application.$["android:allowBackup"] = "false";
    application.$["android:dataExtractionRules"] = "@xml/backup_rules";
    application.$["android:fullBackupContent"] = "@xml/legacy_backup_rules";

    console.log("[withAndroidBackup] Set allowBackup=false and wired backup rule files");
    return cfg;
  });
}

function withAndroidBackupFiles(config) {
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

      fs.writeFileSync(path.join(resXmlDir, "backup_rules.xml"), BACKUP_RULES_XML, "utf8");
      fs.writeFileSync(path.join(resXmlDir, "legacy_backup_rules.xml"), FULL_BACKUP_CONTENT_XML, "utf8");

      console.log("[withAndroidBackup] Wrote backup_rules.xml and legacy_backup_rules.xml");
      return cfg;
    },
  ]);
}

module.exports = function withAndroidBackup(config) {
  config = withAndroidBackupManifest(config);
  config = withAndroidBackupFiles(config);
  return config;
};
