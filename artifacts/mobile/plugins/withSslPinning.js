/**
 * Expo config plugin — copies TLS cert files to the correct platform directories
 * so that react-native-ssl-pinning can load them at runtime.
 *
 * Android: files go to  android/app/src/main/res/raw/
 *          (react-native-ssl-pinning reads certs as Android raw resources via
 *           getResources().getIdentifier(name, "raw", packageName))
 *
 * iOS:     files go to  ios/<AppName>/
 *          and are added to the Xcode project's Copy Bundle Resources phase.
 *
 * Resource name rules for Android res/raw/:
 *  - Filename must be lowercase, no hyphens, only letters/digits/underscores.
 *  - Extension is stripped to form the resource name (tapee_api.cer → R.raw.tapee_api).
 *  - Hyphenated names are auto-converted to underscores here.
 */

const { withDangerousMod, withXcodeProject } = require("@expo/config-plugins");
const path = require("path");
const fs = require("fs");

// Convert a filename to a valid Android resource name (lowercase, underscores only)
function toAndroidResourceName(filename) {
  return path.basename(filename, path.extname(filename))
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_");
}

function copyAndroidCerts(config, certFiles) {
  return withDangerousMod(config, [
    "android",
    (cfg) => {
      // react-native-ssl-pinning on Android reads from res/raw/ — NOT assets/
      const rawDir = path.join(
        cfg.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res",
        "raw",
      );
      if (!fs.existsSync(rawDir)) {
        fs.mkdirSync(rawDir, { recursive: true });
      }

      const srcDir = path.join(cfg.modRequest.projectRoot, "assets", "certs");

      for (const file of certFiles) {
        const src = path.join(srcDir, file);
        if (!fs.existsSync(src)) {
          console.warn(`[withSslPinning] Android: cert not found — ${src}`);
          continue;
        }

        // Rename to a valid Android resource name (keep .cer extension so the
        // resource type is clear, but the ID is the stem without extension).
        const resourceName = toAndroidResourceName(file);
        const dst = path.join(rawDir, `${resourceName}.cer`);
        fs.copyFileSync(src, dst);
        console.log(`[withSslPinning] Android: ${file} → res/raw/${resourceName}.cer`);
      }

      return cfg;
    },
  ]);
}

function copyAndAddIosCerts(config, certFiles) {
  // Step 1 — copy files into the iOS app directory
  config = withDangerousMod(config, [
    "ios",
    (cfg) => {
      const iosProjDir = cfg.modRequest.platformProjectRoot;
      const appName = cfg.modRequest.projectName;
      const dstDir = path.join(iosProjDir, appName);

      if (!fs.existsSync(dstDir)) {
        fs.mkdirSync(dstDir, { recursive: true });
      }

      const srcDir = path.join(cfg.modRequest.projectRoot, "assets", "certs");

      for (const file of certFiles) {
        const src = path.join(srcDir, file);
        if (!fs.existsSync(src)) {
          console.warn(`[withSslPinning] iOS: cert not found — ${src}`);
          continue;
        }
        const dst = path.join(dstDir, file);
        fs.copyFileSync(src, dst);
        console.log(`[withSslPinning] iOS: ${file} → ${appName}/${file}`);
      }

      return cfg;
    },
  ]);

  // Step 2 — register each cert in the Xcode project (Copy Bundle Resources)
  config = withXcodeProject(config, (cfg) => {
    const xcodeProject = cfg.modResults;
    const appName = cfg.modRequest.projectName;
    const firstTarget = xcodeProject.getFirstTarget();
    const targetUuid = firstTarget?.uuid;

    for (const file of certFiles) {
      const resourcePath = `${appName}/${file}`;
      if (!xcodeProject.hasFile(resourcePath)) {
        xcodeProject.addResourceFile(resourcePath, { target: targetUuid });
        console.log(`[withSslPinning] iOS Xcode: added ${resourcePath} to Copy Bundle Resources`);
      }
    }

    return cfg;
  });

  return config;
}

module.exports = function withSslPinning(config, options = {}) {
  const certFiles = options.certFiles ?? ["tapee_api.cer"];
  config = copyAndroidCerts(config, certFiles);
  config = copyAndAddIosCerts(config, certFiles);
  return config;
};
