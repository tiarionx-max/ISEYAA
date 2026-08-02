// Dynamic Expo config.
//
// app.json is static JSON, so a literal like "${GOOGLE_MAPS_API_KEY}" is baked into the
// native manifest verbatim — it is never interpolated from the environment. This dynamic
// config takes over (Expo prefers app.config.js when both exist), reads the static config
// from app.json, and injects the real key from process.env at build/prebuild time.
//
// The key is currently unused (no maps rendered in the app), so when the env var is absent
// we strip the placeholder entirely rather than shipping the literal string.
const appJson = require('./app.json');

module.exports = () => {
  // Deep-clone so we never mutate the required module's cached object.
  const expo = JSON.parse(JSON.stringify(appJson.expo));

  const mapsKey = process.env.GOOGLE_MAPS_API_KEY;

  if (mapsKey) {
    // Android: android.config.googleMaps.apiKey
    expo.android = expo.android || {};
    expo.android.config = expo.android.config || {};
    expo.android.config.googleMaps = {
      ...(expo.android.config.googleMaps || {}),
      apiKey: mapsKey,
    };

    // iOS: ios.config.googleMapsApiKey (only if an ios.config block is present)
    if (expo.ios && expo.ios.config) {
      expo.ios.config.googleMapsApiKey = mapsKey;
    }
  } else {
    // No key provided — remove the un-interpolated placeholder so the literal
    // "${GOOGLE_MAPS_API_KEY}" never ships into the native config.
    if (expo.android && expo.android.config && expo.android.config.googleMaps) {
      delete expo.android.config.googleMaps;
      if (Object.keys(expo.android.config).length === 0) {
        delete expo.android.config;
      }
    }
  }

  return expo;
};
