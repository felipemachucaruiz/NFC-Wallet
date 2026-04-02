const { withDangerousMod } = require("@expo/config-plugins");
const path = require("path");
const fs = require("fs");

function copyAndroidCerts(config, certFiles) {
  return withDangerousMod(config, [
    "android",
    (cfg) => {
      const assetsDir = path.join(
        cfg.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "assets"
      );
      if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir, { recursive: true });
      }
      const srcDir = path.join(cfg.modRequest.projectRoot, "assets", "certs");
      for (const file of certFiles) {
        const src = path.join(srcDir, file);
        const dst = path.join(assetsDir, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dst);
          console.log(`[withSslPinning] Android: copied ${file}`);
        } else {
          console.warn(`[withSslPinning] Android: cert not found: ${src}`);
        }
      }
      return cfg;
    },
  ]);
}

function copyIosCerts(config, certFiles) {
  return withDangerousMod(config, [
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
        const dst = path.join(dstDir, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dst);
          console.log(`[withSslPinning] iOS: copied ${file} to ${dstDir}`);
        } else {
          console.warn(`[withSslPinning] iOS: cert not found: ${src}`);
        }
      }
      return cfg;
    },
  ]);
}

module.exports = function withSslPinning(config, options = {}) {
  const certFiles = options.certFiles ?? ["tapee_api.cer"];
  config = copyAndroidCerts(config, certFiles);
  config = copyIosCerts(config, certFiles);
  return config;
};
