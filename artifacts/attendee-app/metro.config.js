const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

config.resolver.blockList = [
  /\/\.local\/.*/,
  /\/\.git\/.*/,
];

// Required for Expo SDK 54 + New Architecture + Reanimated 4.x + react-native-worklets.
// Without this, OTA bundles produced by Metro will be missing the worklet transform
// and crash at runtime when any reanimated/worklets code is executed.
config.transformer = {
  ...config.transformer,
  unstable_allowRequireContext: true,
};

config.resolver.sourceExts = [...(config.resolver.sourceExts ?? []), "mjs"];

module.exports = config;
