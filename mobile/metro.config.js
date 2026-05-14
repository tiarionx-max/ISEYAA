const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [...(config.watchFolders ?? []), monorepoRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Packages that must have exactly ONE copy in the bundle.
// We intercept via resolveRequest and use require.resolve({ paths: [monorepoRoot] })
// to guarantee every require() of these names resolves to the root copy,
// regardless of which workspace's node_modules Metro would normally find first.
// This prevents "Tried to register two views with the same name" and
// "Invalid hook call / Cannot read property 'useState' of null" crashes.
const SINGLETONS = [
  'react',
  'react-dom',
  'react-native',
  'react-native-safe-area-context',
  'react-native-web',
  'expo',
  'expo-router',
  '@expo/metro-runtime',
];

// Web-only stubs for packages that have no web implementation.
const WEB_STUBS = {
  'react-native-maps': path.resolve(projectRoot, 'mocks/react-native-maps.js'),
  'expo-camera': path.resolve(projectRoot, 'mocks/expo-camera.js'),
  'expo-secure-store': path.resolve(projectRoot, 'mocks/expo-secure-store.js'),
};

const expoResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && WEB_STUBS[moduleName]) {
    return { type: 'sourceFile', filePath: WEB_STUBS[moduleName] };
  }

  // If moduleName is a singleton (or a sub-path of one, e.g. react/jsx-runtime),
  // resolve it from root node_modules using Node's own require.resolve so we
  // get the exact same file path every time, from every caller.
  // Also handle the ./node_modules/<pkg> form that Metro HMR uses for entry points.
  let lookupName = moduleName;
  if (moduleName.startsWith('./node_modules/')) {
    lookupName = moduleName.slice('./node_modules/'.length);
  }
  const matched = SINGLETONS.find(
    s => lookupName === s || lookupName.startsWith(s + '/')
  );
  if (matched) {
    try {
      const resolved = require.resolve(lookupName, { paths: [monorepoRoot] });
      return { type: 'sourceFile', filePath: resolved };
    } catch {
      // fall through — let normal resolution handle it
    }
  }

  if (expoResolveRequest) {
    return expoResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
