const { withDangerousMod, withXcodeProject } = require("@expo/config-plugins");
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

function copyAndAddIosCerts(config, certFiles) {
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

  config = withXcodeProject(config, (cfg) => {
    const xcodeProject = cfg.modResults;
    const appName = cfg.modRequest.projectName;
    const firstTarget = xcodeProject.getFirstTarget();
    const targetUuid = firstTarget && firstTarget.uuid;

    for (const file of certFiles) {
      const resourcePath = `${appName}/${file}`;

      if (xcodeProject.hasFile(resourcePath)) {
        console.log(`[withSslPinning] iOS Xcode: ${resourcePath} already exists, skipping`);
        continue;
      }

      const fileRefUuid = xcodeProject.generateUuid();
      const buildFileUuid = xcodeProject.generateUuid();

      xcodeProject.hash.project.objects["PBXFileReference"] =
        xcodeProject.hash.project.objects["PBXFileReference"] || {};
      xcodeProject.hash.project.objects["PBXFileReference"][fileRefUuid] = {
        isa: "PBXFileReference",
        lastKnownFileType: "file",
        name: `"${file}"`,
        path: `"${resourcePath}"`,
        sourceTree: '"<group>"',
      };
      xcodeProject.hash.project.objects["PBXFileReference"][
        fileRefUuid + "_comment"
      ] = file;

      xcodeProject.hash.project.objects["PBXBuildFile"] =
        xcodeProject.hash.project.objects["PBXBuildFile"] || {};
      xcodeProject.hash.project.objects["PBXBuildFile"][buildFileUuid] = {
        isa: "PBXBuildFile",
        fileRef: fileRefUuid,
        fileRef_comment: file,
      };
      xcodeProject.hash.project.objects["PBXBuildFile"][
        buildFileUuid + "_comment"
      ] = `${file} in Resources`;

      const resourcesBuildPhase = xcodeProject.buildPhaseObject(
        "PBXResourcesBuildPhase",
        "Resources",
        targetUuid
      );

      if (resourcesBuildPhase) {
        resourcesBuildPhase.files = resourcesBuildPhase.files || [];
        resourcesBuildPhase.files.push({
          value: buildFileUuid,
          comment: `${file} in Resources`,
        });
        console.log(
          `[withSslPinning] iOS Xcode: added ${resourcePath} to Copy Bundle Resources`
        );
      } else {
        console.warn(
          `[withSslPinning] iOS Xcode: could not find Copy Bundle Resources phase for target ${targetUuid}`
        );
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
