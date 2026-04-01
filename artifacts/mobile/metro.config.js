const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Stub native-only packages that have no npm release so Metro can resolve them
const NATIVE_STUBS = {
  "expo-app-attest": path.resolve(projectRoot, "stubs/expo-app-attest.js"),
  "expo-play-integrity": path.resolve(projectRoot, "stubs/expo-play-integrity.js"),
};

const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (NATIVE_STUBS[moduleName]) {
    return { filePath: NATIVE_STUBS[moduleName], type: "sourceFile" };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

// Watch all files in the monorepo
config.watchFolders = [workspaceRoot];

// Tell Metro where to resolve packages — local first, then workspace root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Exclude non-source directories from Metro's file watcher to prevent ENOENT crashes
// when temporary directories in .local/skills/ are created and deleted during testing
config.resolver.blockList = [
  /\/\.local\/.*/,
  /\/\.git\/.*/,
];

module.exports = config;
