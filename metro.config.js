const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// This app is native-only. On web, expo-sqlite loads WebAssembly which doesn't
// ship with the package. Intercept the top-level 'expo-sqlite' import on web
// and replace it with a no-op stub so Metro serves the native bundle cleanly.
const sqliteWebStub = path.resolve(__dirname, 'src/stubs/expo-sqlite-web.js');

const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'expo-sqlite') {
    return { type: 'sourceFile', filePath: sqliteWebStub };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
