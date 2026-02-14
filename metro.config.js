const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// On web, expo-sqlite imports a .wasm file that doesn't ship with the package.
// This app is native-only; stub the import so the web bundle compiles cleanly
// and Metro keeps serving the native bundle without errors.
const stubPath = path.resolve(__dirname, 'src/stubs/empty-module.js');

const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName.endsWith('.wasm')) {
    return { type: 'sourceFile', filePath: stubPath };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
