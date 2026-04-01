const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

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
